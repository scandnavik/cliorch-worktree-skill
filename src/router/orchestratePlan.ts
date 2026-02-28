// src/router/orchestratePlan.ts
// Execute a plan with step-level gating, guards, and policy enforcement

const fs = require("fs");
const path = require("path");
const {
  validatePlan,
  isDeniedCommand,
  isProtectedPath,
  redactOutput,
  ALLOWED_CLIS
} = require("./planSchema.ts");
const { loadRouterConfig } = require("./routerConfig.ts");

/** Session paths */
function sessionPaths(sessionId: string, baseDir: string) {
  return {
    logDir: path.join(baseDir, "logs", sessionId),
    outputDir: path.join(baseDir, "outputs", sessionId),
    planDir: path.join(baseDir, "plans")
  };
}

/** Write log entry */
function writeLog(logDir: string, stepId: string, entry: any) {
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `${stepId}.json`);
  fs.writeFileSync(logPath, JSON.stringify(entry, null, 2));
}

/** Write output */
function writeOutput(outputDir: string, stepId: string, content: string) {
  fs.mkdirSync(outputDir, { recursive: true });
  const outPath = path.join(outputDir, `${stepId}.txt`);
  fs.writeFileSync(outPath, content);
}

/** Gate check: returns true if gate passes */
function checkGate(gate: string | null, step: any, config: any): { pass: boolean; reason: string } {
  if (!gate) return { pass: true, reason: "no gate" };

  const nonBypassable = config.policies.non_bypassable_gates || [];
  if (!nonBypassable.includes(gate)) {
    return { pass: true, reason: `gate "${gate}" is not in non_bypassable list` };
  }

  // Secrets gate: check for deny_commands and protected paths
  if (gate === "secrets") {
    if (step.action && isDeniedCommand(step.action, config.policies.deny_commands)) {
      return { pass: false, reason: `Denied command in action: ${step.action}` };
    }
  }

  // CI gate: ensure copilot has patch
  if (gate === "ci") {
    if (step.cli === "copilot" && !step.requires_patch) {
      return { pass: false, reason: "Copilot step must have requires_patch=true" };
    }
  }

  // Auth gate
  if (gate === "auth") {
    if (step.action && isDeniedCommand(step.action, config.policies.deny_commands)) {
      return { pass: false, reason: "Auth gate: denied command detected" };
    }
  }

  // Network gate
  if (gate === "network") {
    const networkDeny = ["curl|bash", "wget|bash"];
    if (step.action && networkDeny.some((d: string) => step.action.toLowerCase().includes(d))) {
      return { pass: false, reason: "Network gate: dangerous network command" };
    }
  }

  return { pass: true, reason: `gate "${gate}" passed` };
}

/** Check wall-time guard */
function isWallTimeExceeded(startTime: number, maxSec: number): boolean {
  return (Date.now() - startTime) / 1000 > maxSec;
}

/**
 * Orchestrate a plan.
 * This is the main execution engine.
 * In real mode, it would shell out to CLIs.
 * In paper/dry-run mode, it validates structure only.
 */
async function orchestratePlan(plan: any, options: { dryRun?: boolean; baseDir?: string; executor?: any } = {}) {
  const baseDir = options.baseDir || process.cwd();
  const config = loadRouterConfig(path.join(baseDir, "config"));

  // Validate plan
  const errors = validatePlan(plan);
  if (errors.length > 0) {
    return { success: false, error: "Plan validation failed", details: errors };
  }

  const sessionId = plan.id || `session-${Date.now()}`;
  const paths = sessionPaths(sessionId, baseDir);
  const startTime = Date.now();
  const results: any[] = [];
  let aborted = false;
  plan.status = "running";

  for (const step of plan.steps) {
    // Wall-time guard
    if (isWallTimeExceeded(startTime, plan.constraints.max_wall_time_sec)) {
      writeLog(paths.logDir, step.id, { status: "aborted", reason: "wall_time_exceeded" });
      aborted = true;
      break;
    }

    // Gate check
    const gateResult = checkGate(step.gate, step, config);
    if (!gateResult.pass) {
      writeLog(paths.logDir, step.id, { status: "blocked", reason: gateResult.reason });
      results.push({ step: step.id, status: "blocked", reason: gateResult.reason });

      // Check fallback
      const fb = (plan.fallbacks || []).find((f: any) => f.step_id === step.id);
      if (fb && fb.on_failure === "abort") {
        aborted = true;
        break;
      }
      continue;
    }

    // Command deny check
    if (step.action && isDeniedCommand(step.action, config.policies.deny_commands)) {
      writeLog(paths.logDir, step.id, { status: "denied", reason: "denied_command" });
      results.push({ step: step.id, status: "denied", reason: "Action contains denied command" });
      continue;
    }

    // Protected path check (if step has file targets)
    if (step.target_files) {
      const blocked = step.target_files.filter((f: string) =>
        isProtectedPath(f, config.policies.protected_paths)
      );
      if (blocked.length > 0) {
        writeLog(paths.logDir, step.id, { status: "blocked", reason: "protected_path", paths: blocked });
        results.push({ step: step.id, status: "blocked", reason: `Protected paths: ${blocked.join(", ")}` });
        continue;
      }
    }

    // Copilot freeform check
    if (step.cli === "copilot" && !step.requires_patch && config.policies.copilot_requires_patch) {
      writeLog(paths.logDir, step.id, { status: "blocked", reason: "copilot_requires_patch" });
      results.push({ step: step.id, status: "blocked", reason: "Copilot requires patch reference" });
      continue;
    }

    // Attempt execution (with retry)
    let attempt = 0;
    const maxAttempts = step.max_attempts || plan.constraints.max_attempts_per_step || 2;
    let stepResult: any = null;

    while (attempt < maxAttempts) {
      attempt++;

      if (options.dryRun || !step.cli || !options.executor) {
        // Dry-run mode or no executor provided: simulate pending/pass
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

      // Real execution via Executor
      try {
        const timeout = plan.constraints.max_wall_time_sec * 1000;
        const execResult = await options.executor.execute(step.cli, step.action, { timeout });
        
        if (execResult.success) {
          stepResult = {
            step: step.id,
            status: "pass",
            cli: step.cli,
            attempt,
            output: execResult.output,
            exitCode: execResult.exitCode
          };
          break; // Success, break retry loop
        } else {
          // Execution failed but didn't throw exceptions
          stepResult = {
            step: step.id,
            status: attempt < maxAttempts ? "pending_execution" : "failed",
            cli: step.cli,
            attempt,
            error: execResult.error,
            exitCode: execResult.exitCode,
            output: execResult.output
          };
          // Continue loop for retry
        }
      } catch (err: any) {
        stepResult = {
          step: step.id,
          status: attempt < maxAttempts ? "pending_execution" : "failed",
          cli: step.cli,
          attempt,
          error: err.message
        };
      }
    }

    // Redact output and format error message (Error Shaping concept)
    if (stepResult) {
      if (stepResult.output) {
        stepResult.output = redactOutput(stepResult.output, config.policies.output_redaction_patterns);
      }
      if (stepResult.error && stepResult.status === "failed") {
        // Basic Error Shaping logic
        stepResult.error_formatted = `Command execution failed on attempt ${stepResult.attempt}: ${stepResult.error}. Output: ${stepResult.output || "None"}. Check CLI tool configuration or prompt syntax.`;
      }
    }

    writeLog(paths.logDir, step.id, stepResult);
    if (stepResult?.output) {
      writeOutput(paths.outputDir, step.id, stepResult.output);
    }
    results.push(stepResult);
  }

  // Save plan session state
  const isSetupSuccess = !aborted && results.every((r: any) => r.status !== "blocked" && r.status !== "denied");
  const isExecutionSuccess = isSetupSuccess && results.every((r: any) => r.status === "pass" || r.status === "pending_execution" || r.status === "skipped");
  
  plan.status = aborted ? "aborted" : (isExecutionSuccess ? "completed" : "failed");

  fs.mkdirSync(paths.planDir, { recursive: true });
  const planPath = path.join(paths.planDir, `${sessionId}.json`);
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));

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
