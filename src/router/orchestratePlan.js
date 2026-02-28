// src/router/orchestratePlan.js
// Execute a plan with step-level gating, guards, and policy enforcement
// Runtime JS version

const fs = require("fs");
const path = require("path");
const { validatePlan, isDeniedCommand, isProtectedPath, redactOutput } = require("./planSchema.js");
const { loadRouterConfig } = require("./routerConfig.js");
const ContextManager = require("../memory/contextManager.js");

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

  // SECURITY: Always use router policy as the authoritative source — never trust plan.constraints
  const denyCommands = config.policies.deny_commands || [];

  if (gate === "secrets") {
    if (step.action && isDeniedCommand(step.action, denyCommands)) {
      return { pass: false, reason: `Denied command in action: ${step.action}` };
    }
  }
  if (gate === "ci") {
    if (step.cli === "copilot" && !step.requires_patch) {
      return { pass: false, reason: "Copilot step must have requires_patch=true" };
    }
  }
  if (gate === "auth") {
    if (step.action && isDeniedCommand(step.action, denyCommands)) {
      return { pass: false, reason: "Auth gate: denied command detected" };
    }
  }
  if (gate === "network") {
    const networkDeny = ["curl|bash", "wget|bash"];
    const normalizedAction = (step.action || "").trim().toLowerCase().replace(/\s*\|\s*/g, "|");
    if (step.action && networkDeny.some(d => normalizedAction.includes(d))) {
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
  plan.status = "running";

  for (const step of plan.steps) {
    if (isWallTimeExceeded(startTime, plan.constraints.max_wall_time_sec)) {
      writeLog(paths.logDir, step.id, { status: "aborted", reason: "wall_time_exceeded" });
      aborted = true;
      break;
    }

    // SECURITY: Always use router policy as the authoritative source — never trust plan.constraints
    const denyCommands = config.policies.deny_commands || [];
    const protectedPaths = config.policies.protected_paths || [];

    let gateTriggered = null;
    let gateReason = null;
    let gateStatus = "blocked";

    const gateResult = checkGate(step.gate, step, config);
    if (!gateResult.pass) {
      gateTriggered = `Gate '${step.gate}'`;
      gateReason = gateResult.reason;
    } else if (step.action && isDeniedCommand(step.action, denyCommands)) {
      gateTriggered = `Denied Command`;
      gateReason = "Action contains denied command";
      gateStatus = "denied";
    } else if (step.target_files) {
      const blocked = step.target_files.filter(f => isProtectedPath(f, protectedPaths));
      if (blocked.length > 0) {
        gateTriggered = `Protected Path`;
        gateReason = `Protected paths: ${blocked.join(", ")}`;
      }
    } else if (step.cli === "copilot" && !step.requires_patch && config.policies.copilot_requires_patch) {
      gateTriggered = `Policy Violation`;
      gateReason = "Copilot requires patch reference";
    }

    if (gateTriggered) {
      console.log(`\n⚠️  [HITL PROTECT] Step ${step.id} tripped protection: ${gateTriggered}`);
      console.log(`Reason: ${gateReason}`);
      console.log(`Target: ${step.action || JSON.stringify(step.target_files)}`);

      const { askApproval } = require("./askApproval.js");
      const approved = await askApproval("⚠️  Do you want to override and approve this action?");

      if (!approved) {
        console.log(`❌ [HITL REJECTED] Action blocked.`);
        writeLog(paths.logDir, step.id, { status: gateStatus, reason: gateReason });
        results.push({ step: step.id, status: gateStatus, reason: gateReason });
        const fb = (plan.fallbacks || []).find(f => f.step_id === step.id);
        if (fb && fb.on_failure === "abort") { aborted = true; break; }
        continue;
      } else {
        console.log(`✅ [HITL APPROVED] Action bypassed protection constraints.`);
      }
    }

    let attempt = 0;
    const maxAttempts = step.max_attempts || plan.constraints.max_attempts_per_step || 2;
    let stepResult = null;

    while (attempt < maxAttempts) {
      attempt++;
      if (options.dryRun || !step.cli || !options.executor) {
        stepResult = {
          step: step.id,
          status: options.dryRun ? "pass" : "pending_execution",
          cli: step.cli,
          attempt,
          dry_run: options.dryRun || false,
          message: `Would execute via ${step.cli || "claude_driver"}`
        };
        break;
      }

      try {
        const timeout = plan.constraints.max_wall_time_sec * 1000;
        const execOptions = { timeout, model: step.model };
        const execResult = await options.executor.execute(step.cli, step.action, execOptions);

        if (execResult.success) {
          stepResult = {
            step: step.id,
            status: "pass",
            cli: step.cli,
            attempt,
            output: execResult.output,
            exitCode: execResult.exitCode
          };
          break;
        } else {
          stepResult = {
            step: step.id,
            status: attempt < maxAttempts ? "pending_execution" : "failed",
            cli: step.cli,
            attempt,
            error: execResult.error,
            exitCode: execResult.exitCode,
            output: execResult.output
          };
        }
      } catch (err) {
        stepResult = {
          step: step.id,
          status: attempt < maxAttempts ? "pending_execution" : "failed",
          cli: step.cli,
          attempt,
          error: err.message
        };
      }
    }

    if (stepResult) {
      if (stepResult.output) {
        stepResult.output = redactOutput(stepResult.output, config.policies.output_redaction_patterns);
      }
      if (stepResult.error && stepResult.status === "failed") {
        stepResult.error_formatted = `Command execution failed on attempt ${stepResult.attempt}: ${stepResult.error}. Output: ${stepResult.output || "None"}. Check CLI tool configuration or prompt syntax.`;
      }
    }

    writeLog(paths.logDir, step.id, stepResult);
    if (stepResult?.output) writeOutput(paths.outputDir, step.id, stepResult.output);
    results.push(stepResult);
  }

  const isSetupSuccess = !aborted && results.every(r => r.status !== "blocked" && r.status !== "denied");
  const isExecutionSuccess = isSetupSuccess && results.every(r => r.status === "pass" || r.status === "pending_execution" || r.status === "skipped");

  plan.status = aborted ? "aborted" : (isExecutionSuccess ? "completed" : "failed");

  fs.mkdirSync(paths.planDir, { recursive: true });
  const planPath = path.join(paths.planDir, `${sessionId}.json`);
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));

  // Save failure knowledge to avoid repeating mistakes
  if (!isExecutionSuccess && plan.status === "failed") {
    const contextManager = new ContextManager(baseDir);
    const failedSteps = results.filter(r => r.status === "failed" || r.status === "blocked" || r.status === "denied");
    failedSteps.forEach(fs => {
      const issue = `Step ${fs.cli} execution failed: ${fs.error || fs.reason || "Unknown error"} (Target Action: ${plan.steps.find(s => s.id === fs.step)?.action || "Unknown"})`;
      const resolution = fs.status === "denied" || fs.status === "blocked"
        ? "DO NOT use this exact command/path again. Use a safe alternative."
        : "Command syntax/logic error. Need to rewrite action.";
      contextManager.saveKnowledge(issue, resolution);
    });
  }

  return {
    success: isExecutionSuccess,
    session_id: sessionId,
    plan_path: planPath,
    log_dir: paths.logDir,
    output_dir: paths.outputDir,
    wall_time_sec: (Date.now() - startTime) / 1000,
    steps: results,
    state: plan.status,
    aborted
  };
}

module.exports = { orchestratePlan, checkGate, isWallTimeExceeded, sessionPaths };
