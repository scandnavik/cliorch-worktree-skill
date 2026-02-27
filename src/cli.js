#!/usr/bin/env node
// src/cli.js
// CLI entry point for cli-orchestrator (cliorch / cli-orch)

const fs = require("fs");
const path = require("path");
const { validatePlan, ALLOWED_CLIS, GATE_TYPES, isDeniedCommand, isProtectedPath, redactOutput } = require("./router/planSchema.js");
const { loadRouterConfig, loadChainsConfig, routeTask } = require("./router/routerConfig.js");
const { orchestratePlan } = require("./router/orchestratePlan.js");

const BASE_DIR = path.join(__dirname, "..");
const args = process.argv.slice(2);
const command = args[0];

function usage() {
  console.log(`
cli-orchestrator (cliorch) — A2 Single-Operator AI Dev OS

Commands:
  cliorch plan --task "<text>"     Generate a plan JSON
  cliorch run --plan "<path>"      Execute a plan
  cliorch redteam --print          Print red-team checklist summary
  cliorch status                   Show CLI registry status
  cliorch config                   Show loaded router config

Allowed CLIs: ${ALLOWED_CLIS.join(", ")}
Claude = Driver ONLY (never a worker CLI)
`);
}

/** Generate a plan from task text */
function planCommand() {
  const taskIdx = args.indexOf("--task");
  if (taskIdx === -1 || !args[taskIdx + 1]) {
    console.error("Usage: cliorch plan --task \"<task description>\"");
    process.exit(1);
  }
  const task = args[taskIdx + 1];
  const config = loadRouterConfig(path.join(BASE_DIR, "config"));

  // Classify task → route
  const taskLower = task.toLowerCase();
  let taskType = "code"; // default
  if (taskLower.includes("research") || taskLower.includes("search") || taskLower.includes("find")) {
    taskType = "research";
  } else if (taskLower.includes("debug") || taskLower.includes("fix") || taskLower.includes("error")) {
    taskType = "debug";
  } else if (taskLower.includes("commit") || taskLower.includes("pr") || taskLower.includes("repo")) {
    taskType = "repo";
  }

  const cli = routeTask(taskType, config);
  const planId = `plan-${Date.now()}`;

  const plan = {
    id: planId,
    task,
    created_at: new Date().toISOString(),
    status: "draft",
    attributes: {
      task_type: taskType,
      complexity: "medium",
      estimated_steps: 3
    },
    steps: [
      {
        id: "step-plan",
        role: "claude_driver",
        cli: null,
        action: `Decompose task: ${task}`,
        gate: null,
        status: "pending",
        attempt: 0,
        max_attempts: 1
      },
      {
        id: "step-execute",
        role: "worker",
        cli: cli,
        action: task,
        gate: "secrets",
        status: "pending",
        attempt: 0,
        max_attempts: config.policies.max_attempts_per_step,
        ...(cli === "copilot" ? { requires_patch: true } : {})
      },
      {
        id: "step-integrate",
        role: "claude_driver",
        cli: null,
        action: "Integrate and validate results",
        gate: null,
        status: "pending",
        attempt: 0,
        max_attempts: 1
      }
    ],
    gates: [...GATE_TYPES],
    fallbacks: [
      { step_id: "step-execute", on_failure: "retry", max_retries: 2 }
    ],
    state_paths: {
      plan_path: `plans/${planId}.json`,
      log_dir: `logs/${planId}/`,
      output_dir: `outputs/${planId}/`
    },
    constraints: {
      max_steps: config.policies.max_steps,
      max_files_changed: config.policies.max_files_changed,
      max_attempts_per_step: config.policies.max_attempts_per_step,
      max_wall_time_sec: config.policies.max_wall_time_sec,
      max_budget_usd: config.policies.max_budget_usd,
      deny_commands: config.policies.deny_commands,
      protected_paths: config.policies.protected_paths,
      output_redaction_patterns: config.policies.output_redaction_patterns,
      non_bypassable_gates: config.policies.non_bypassable_gates,
      copilot_requires_patch: config.policies.copilot_requires_patch,
      copilot_freeform: false
    }
  };

  // Validate
  const errors = validatePlan(plan);
  if (errors.length > 0) {
    console.error("Plan validation errors:", errors);
    process.exit(1);
  }

  // Write plan
  const planDir = path.join(BASE_DIR, "plans");
  fs.mkdirSync(planDir, { recursive: true });
  const planPath = path.join(planDir, `${planId}.json`);
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));

  // Also write as latest
  fs.writeFileSync(path.join(planDir, "latest.json"), JSON.stringify(plan, null, 2));

  console.log(`Plan created: ${planPath}`);
  console.log(`Task type: ${taskType} → CLI: ${cli}`);
  console.log(`Steps: ${plan.steps.length}`);
}

/** Execute a plan */
async function runCommand() {
  const planIdx = args.indexOf("--plan");
  if (planIdx === -1 || !args[planIdx + 1]) {
    console.error("Usage: cliorch run --plan \"<path>\"");
    process.exit(1);
  }
  const planPath = path.resolve(args[planIdx + 1]);
  const plan = JSON.parse(fs.readFileSync(planPath, "utf-8"));
  const result = await orchestratePlan(plan, { dryRun: true, baseDir: BASE_DIR });
  console.log(JSON.stringify(result, null, 2));
}

/** Red-team checklist */
function redteamCommand() {
  const config = loadRouterConfig(path.join(BASE_DIR, "config"));
  const p = config.policies;

  const cases = [
    { id: "A1", name: "Policy bypass", check: "non_bypassable_gates enforced", pass: p.non_bypassable_gates.length >= 4 },
    { id: "A2", name: "Self-modification", check: "protected_paths includes config/**", pass: p.protected_paths.includes("config/**") },
    { id: "B1", name: "Secret exfil", check: "deny_commands blocks printenv/env", pass: p.deny_commands.includes("printenv") && p.deny_commands.includes("env") },
    { id: "B2", name: "Injection", check: "deny_commands blocks set", pass: p.deny_commands.includes("set") },
    { id: "C1", name: "curl|bash RCE", check: "deny_commands blocks curl|bash", pass: p.deny_commands.includes("curl|bash") },
    { id: "C2", name: "Dependency risk", check: "max_steps bounded", pass: p.max_steps <= 8 },
    { id: "D1", name: "Backdoor injection", check: "protected_paths includes .github/**", pass: p.protected_paths.includes(".github/**") },
    { id: "D2", name: "Data exfil", check: "output_redaction_patterns present", pass: p.output_redaction_patterns.length > 0 },
    { id: "E1", name: "Scope explosion", check: "max_files_changed bounded", pass: p.max_files_changed <= 50 },
    { id: "E2", name: "Infinite retry", check: "max_attempts_per_step bounded", pass: p.max_attempts_per_step <= 2 },
    { id: "F1", name: "Copilot freeform PR", check: "copilot_requires_patch=true, copilot_freeform=false", pass: p.copilot_requires_patch === true && p.copilot_freeform === false },
    { id: "F2", name: "Large PR risk", check: "max_files_changed + max_steps bounded", pass: p.max_files_changed <= 50 && p.max_steps <= 8 }
  ];

  console.log("\n=== Red-Team Checklist (cli-orchestrator A2) ===\n");
  console.log("CaseID | Result | Check");
  console.log("-------|--------|------");
  for (const c of cases) {
    console.log(`${c.id}     | ${c.pass ? "PASS" : "FAIL"} | ${c.name}: ${c.check}`);
  }

  const allPass = cases.every(c => c.pass);
  console.log(`\nFinal: ${allPass ? "ALL_PASS" : "PARTIAL_FAIL"}`);
  console.log(`Passed: ${cases.filter(c => c.pass).length}/${cases.length}`);
}

/** Status */
function statusCommand() {
  const config = loadRouterConfig(path.join(BASE_DIR, "config"));
  console.log("Allowed CLIs:", config.allowed_clis);
  console.log("Routing table:", config.routing);
  console.log("Max steps:", config.policies.max_steps);
  console.log("Max files:", config.policies.max_files_changed);
  console.log("Wall time:", config.policies.max_wall_time_sec, "sec");
}

/** Config dump */
function configCommand() {
  const config = loadRouterConfig(path.join(BASE_DIR, "config"));
  console.log(JSON.stringify(config, null, 2));
}

// Main dispatch
switch (command) {
  case "plan": planCommand(); break;
  case "run": runCommand().catch(e => { console.error(e); process.exit(1); }); break;
  case "redteam": redteamCommand(); break;
  case "status": statusCommand(); break;
  case "config": configCommand(); break;
  default: usage();
}
