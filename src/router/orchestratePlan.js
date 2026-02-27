// src/router/orchestratePlan.js
// Execute a plan with step-level gating, guards, and policy enforcement
// Runtime JS version

const fs = require("fs");
const path = require("path");
const { validatePlan, isDeniedCommand, isProtectedPath, redactOutput } = require("./planSchema.js");
const { loadRouterConfig } = require("./routerConfig.js");

function sessionPaths(sessionId, baseDir) {
  return {
    logDir: path.join(baseDir, "logs", sessionId),
    outputDir: path.join(baseDir, "outputs", sessionId),
    planDir: path.join(baseDir, "plans")
  };
}

function writeLog(logDir, stepId, entry) {
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, `${stepId}.json`), JSON.stringify(entry, null, 2));
}

function writeOutput(outputDir, stepId, content) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, `${stepId}.txt`), content);
}

function checkGate(gate, step, config) {
  if (!gate) return { pass: true, reason: "no gate" };

  const nonBypassable = config.policies.non_bypassable_gates || [];
  if (!nonBypassable.includes(gate)) {
    return { pass: true, reason: `gate "${gate}" not in non_bypassable list` };
  }

  if (gate === "secrets") {
    if (step.action && isDeniedCommand(step.action, config.policies.deny_commands)) {
      return { pass: false, reason: `Denied command in action: ${step.action}` };
    }
  }
  if (gate === "ci") {
    if (step.cli === "copilot" && !step.requires_patch) {
      return { pass: false, reason: "Copilot step must have requires_patch=true" };
    }
  }
  if (gate === "auth") {
    if (step.action && isDeniedCommand(step.action, config.policies.deny_commands)) {
      return { pass: false, reason: "Auth gate: denied command detected" };
    }
  }
  if (gate === "network") {
    const networkDeny = ["curl|bash", "wget|bash"];
    if (step.action && networkDeny.some(d => step.action.toLowerCase().includes(d))) {
      return { pass: false, reason: "Network gate: dangerous network command" };
    }
  }

  return { pass: true, reason: `gate "${gate}" passed` };
}

function isWallTimeExceeded(startTime, maxSec) {
  return (Date.now() - startTime) / 1000 > maxSec;
}

async function orchestratePlan(plan, options = {}) {
  const baseDir = options.baseDir || process.cwd();
  const config = loadRouterConfig(path.join(baseDir, "config"));

  const errors = validatePlan(plan);
  if (errors.length > 0) {
    return { success: false, error: "Plan validation failed", details: errors };
  }

  const sessionId = plan.id || `session-${Date.now()}`;
  const paths = sessionPaths(sessionId, baseDir);
  const startTime = Date.now();
  const results = [];
  let aborted = false;

  for (const step of plan.steps) {
    if (isWallTimeExceeded(startTime, plan.constraints.max_wall_time_sec)) {
      writeLog(paths.logDir, step.id, { status: "aborted", reason: "wall_time_exceeded" });
      aborted = true;
      break;
    }

    const gateResult = checkGate(step.gate, step, config);
    if (!gateResult.pass) {
      writeLog(paths.logDir, step.id, { status: "blocked", reason: gateResult.reason });
      results.push({ step: step.id, status: "blocked", reason: gateResult.reason });
      const fb = (plan.fallbacks || []).find(f => f.step_id === step.id);
      if (fb && fb.on_failure === "abort") { aborted = true; break; }
      continue;
    }

    if (step.action && isDeniedCommand(step.action, config.policies.deny_commands)) {
      writeLog(paths.logDir, step.id, { status: "denied", reason: "denied_command" });
      results.push({ step: step.id, status: "denied", reason: "Action contains denied command" });
      continue;
    }

    if (step.target_files) {
      const blocked = step.target_files.filter(f => isProtectedPath(f, config.policies.protected_paths));
      if (blocked.length > 0) {
        writeLog(paths.logDir, step.id, { status: "blocked", reason: "protected_path", paths: blocked });
        results.push({ step: step.id, status: "blocked", reason: `Protected paths: ${blocked.join(", ")}` });
        continue;
      }
    }

    if (step.cli === "copilot" && !step.requires_patch && config.policies.copilot_requires_patch) {
      writeLog(paths.logDir, step.id, { status: "blocked", reason: "copilot_requires_patch" });
      results.push({ step: step.id, status: "blocked", reason: "Copilot requires patch reference" });
      continue;
    }

    let attempt = 0;
    const maxAttempts = step.max_attempts || plan.constraints.max_attempts_per_step || 2;
    let stepResult = null;

    while (attempt < maxAttempts) {
      attempt++;
      if (options.dryRun) {
        stepResult = { step: step.id, status: "pass", cli: step.cli, attempt, dry_run: true };
        break;
      }
      stepResult = { step: step.id, status: "pending_execution", cli: step.cli, attempt, message: `Would execute via ${step.cli || "claude_driver"}` };
      break;
    }

    if (stepResult && stepResult.output) {
      stepResult.output = redactOutput(stepResult.output, config.policies.output_redaction_patterns);
    }

    writeLog(paths.logDir, step.id, stepResult);
    if (stepResult?.output) writeOutput(paths.outputDir, step.id, stepResult.output);
    results.push(stepResult);
  }

  fs.mkdirSync(paths.planDir, { recursive: true });
  const planPath = path.join(paths.planDir, `${sessionId}.json`);
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));

  return {
    success: !aborted && results.every(r => r.status !== "blocked" && r.status !== "denied"),
    session_id: sessionId,
    plan_path: planPath,
    log_dir: paths.logDir,
    output_dir: paths.outputDir,
    wall_time_sec: (Date.now() - startTime) / 1000,
    steps: results,
    aborted
  };
}

module.exports = { orchestratePlan, checkGate, isWallTimeExceeded, sessionPaths };
