#!/usr/bin/env node
// src/cli.js
// CLI entry point for CLI_Runner (cliorch / cli-orch)

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { validatePlan, ALLOWED_CLIS, GATE_TYPES } = require("./router/planSchema.js");
const { loadRouterConfig, routeTask } = require("./router/routerConfig.js");
const { orchestratePlan } = require("./router/orchestratePlan.js");
const Executor = require("./executor.js");
const CLIRegistry = require("./cli-registry.js");
const {
  DEFAULT_FLOW,
  STAGE_DEFS,
  listSupportedStages,
  parseFlow,
  parseLlmMap,
  parseManager,
  buildDefaultAssignmentsFromStrategy,
  buildRuntimePlan
} = require("./strategy/runtimeStrategy.js");

const BASE_DIR = path.join(__dirname, "..");
const args = process.argv.slice(2);
const command = args[0];

const registry = new CLIRegistry(path.join(BASE_DIR, "config", "cli-registry.json"));
const executor = new Executor(registry);

function usage() {
  console.log(`
CLI_Runner (cliorch) — A2 Single-Operator AI Dev OS
`);
  console.log("Commands:");
  console.log("  cliorch do --task \"<text>\" [--strategy <name>] [--interactive]");
  console.log("           [--flow \"ideation,converge,execution,review\"]");
  console.log("           [--llm-map \"ideation=gemini:gemini-3.1-pro,execution=codex:gpt-5.2,review=codex:gpt-5.2\"]");
  console.log("           [--manager \"claude:claude-opus-4-6\"] [--dry-run]");
  console.log("  cliorch plan --task \"<text>\"                  Generate a manual draft plan JSON");
  console.log("  cliorch run --plan \"<path>\" [--dry-run]       Execute a plan (--dry-run to simulate)");
  console.log("  cliorch options                               Show strategy / stage / LLM selection options");
  console.log("  cliorch redteam --print                       Print red-team checklist summary");
  console.log("  cliorch status                                Show CLI registry status");
  console.log("  cliorch config                                Show loaded router config");
  console.log("  cliorch models                                Fetch and display available dynamic model lists");
  console.log(`
Allowed CLIs: ${ALLOWED_CLIS.join(", ")}
`);
}

function getArgValue(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  return args[idx + 1] || null;
}

function loadStrategiesDoc() {
  const yaml = require("js-yaml");
  const strategyPath = path.join(BASE_DIR, "config", "strategies.yaml");
  return yaml.load(fs.readFileSync(strategyPath, "utf-8"));
}

function loadModelCatalog() {
  const fallback = {
    claude: [
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-haiku-3-5"
    ],
    gemini: [
      "gemini-3.1-pro-preview",
      "gemini-3.1-flash",
      "gemini-2.5-flash"
    ],
    codex: [
      "gpt-5.3",
      "gpt-5.2",
      "gpt-5 mini"
    ],
    copilot: [
      "copilot-default",
      "gpt-4"
    ]
  };

  const catalogPath = path.join(BASE_DIR, "config", "model-catalog.json");
  if (!fs.existsSync(catalogPath)) return fallback;

  try {
    const loaded = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
    return { ...fallback, ...loaded };
  } catch {
    return fallback;
  }
}

function optionsCommand() {
  const strategiesDoc = loadStrategiesDoc();
  const modelCatalog = loadModelCatalog();

  console.log("\n=== Strategy Options ===");
  Object.entries(strategiesDoc.strategies || {}).forEach(([name, s]) => {
    const flow = Array.isArray(s.flow) && s.flow.length > 0 ? s.flow.join(" -> ") : DEFAULT_FLOW.join(" -> ");
    console.log(`- ${name}`);
    console.log(`  desc: ${s.description || "-"}`);
    console.log(`  manager: ${s.manager?.cli || "claude"}:${s.manager?.model || "-"}`);
    console.log(`  flow: ${flow}`);
  });

  console.log("\n=== Stage Options ===");
  listSupportedStages().forEach(stage => {
    const kind = STAGE_DEFS[stage].kind;
    console.log(`- ${stage} (${kind})`);
  });

  console.log("\n=== LLM Options ===");
  Object.entries(modelCatalog).forEach(([provider, models]) => {
    console.log(`- ${provider}:`);
    models.forEach(m => console.log(`  - ${m}`));
  });

  console.log("\nExample:");
  console.log("cliorch do --task \"Refactor auth module\" --flow \"ideation,converge,execution,review\" --llm-map \"ideation=gemini:gemini-3.1-pro-preview,execution=copilot:copilot-default,review=codex:gpt-5.2\" --manager \"claude:claude-opus-4-6\"");
}

function askLine(rl, question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer)));
}

async function runInteractiveSelection(strategiesDoc, modelCatalog, defaultStrategyName) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log("\n=== Interactive Strategy Selection ===");
    const modeRaw = await askLine(
      rl,
      "Mode? [1] strategy preset  [2] custom flow (default 1): "
    );
    const mode = (modeRaw || "1").trim() === "2" ? "custom" : "preset";

    if (mode === "preset") {
      const names = Object.keys(strategiesDoc.strategies || {});
      names.forEach((n, i) => {
        const s = strategiesDoc.strategies[n];
        console.log(`  [${i + 1}] ${n} - ${s.description || ""}`);
      });
      const presetRaw = await askLine(
        rl,
        `Choose strategy index (default ${defaultStrategyName}): `
      );

      let strategyName = defaultStrategyName;
      const idx = parseInt((presetRaw || "").trim(), 10);
      if (!Number.isNaN(idx) && idx >= 1 && idx <= names.length) {
        strategyName = names[idx - 1];
      }

      const managerRaw = await askLine(
        rl,
        `Optional manager override cli:model (Enter to keep strategy manager): `
      );
      const flowRaw = await askLine(
        rl,
        `Optional flow override (comma stages, Enter to keep strategy flow): `
      );
      const llmMapRaw = await askLine(
        rl,
        `Optional llm-map override stage=cli:model,... (Enter to keep strategy roles): `
      );
      return {
        mode,
        strategyName,
        managerOverride: managerRaw && managerRaw.trim() ? managerRaw.trim() : null,
        flowOverride: flowRaw && flowRaw.trim() ? flowRaw.trim() : null,
        llmMapOverride: llmMapRaw && llmMapRaw.trim() ? llmMapRaw.trim() : null
      };
    }

    const managerCliChoices = ["claude", "gemini", "codex", "copilot"];
    managerCliChoices.forEach((c, i) => console.log(`  [${i + 1}] ${c}`));
    const managerCliRaw = await askLine(rl, "Choose manager CLI (default claude): ");
    let managerCli = "claude";
    const managerCliIdx = parseInt((managerCliRaw || "").trim(), 10);
    if (!Number.isNaN(managerCliIdx) && managerCliIdx >= 1 && managerCliIdx <= managerCliChoices.length) {
      managerCli = managerCliChoices[managerCliIdx - 1];
    }

    const managerModels = modelCatalog[managerCli] || [];
    managerModels.forEach((m, i) => console.log(`  [${i + 1}] ${m}`));
    const managerModelRaw = await askLine(
      rl,
      `Choose manager model index or input model name (default ${managerModels[0] || "n/a"}): `
    );
    let managerModel = managerModels[0] || "default-model";
    const mIdx = parseInt((managerModelRaw || "").trim(), 10);
    if (!Number.isNaN(mIdx) && mIdx >= 1 && mIdx <= managerModels.length) {
      managerModel = managerModels[mIdx - 1];
    } else if (managerModelRaw && managerModelRaw.trim()) {
      managerModel = managerModelRaw.trim();
    }

    const flowRaw = await askLine(
      rl,
      `Flow order (comma-separated, supported: ${listSupportedStages().join(", ")}; default ${DEFAULT_FLOW.join(",")}): `
    );
    const flow = parseFlow(flowRaw || DEFAULT_FLOW.join(","));

    const llmMapEntries = [];
    for (const stage of flow) {
      const def = STAGE_DEFS[stage];
      if (def.kind !== "worker") continue;

      const input = await askLine(
        rl,
        `Stage "${stage}" LLM mapping cli:model (e.g. codex:gpt-5.2, Enter to skip): `
      );
      if (input && input.trim()) {
        llmMapEntries.push(`${stage}=${input.trim()}`);
      }
    }

    return {
      mode,
      manager: `${managerCli}:${managerModel}`,
      flow: flow.join(","),
      llmMap: llmMapEntries.join(",")
    };
  } finally {
    rl.close();
  }
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
  const dryRun = args.includes("--dry-run");
  const result = await orchestratePlan(plan, { dryRun, baseDir: BASE_DIR, executor: dryRun ? undefined : executor });
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

  console.log("\n=== Red-Team Checklist (CLI_Runner A2) ===\n");
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

/** End-to-end AI execution command */
async function doCommand() {
  const task = getArgValue("--task");
  if (!task) {
    console.error(`Usage: cliorch do --task "<task description>" [--strategy <name>]`);
    process.exit(1);
  }

  let strategyName = getArgValue("--strategy") || "default";
  let flowArg = getArgValue("--flow");
  let llmMapArg = getArgValue("--llm-map");
  let managerArg = getArgValue("--manager");
  const managerCliArg = getArgValue("--manager-cli");
  const managerModelArg = getArgValue("--manager-model");
  const interactive = args.includes("--interactive");
  const dryRun = args.includes("--dry-run");

  console.log(`\n========================================`);
  console.log(`🧠 [CLI_Runner] Task: "${task}"`);
  console.log(`========================================`);

  try {
    const strategyDoc = loadStrategiesDoc();
    const modelCatalog = loadModelCatalog();

    if (interactive) {
      const selected = await runInteractiveSelection(strategyDoc, modelCatalog, strategyName);
      if (selected.mode === "preset") {
        strategyName = selected.strategyName;
        if (selected.managerOverride) managerArg = selected.managerOverride;
        if (selected.flowOverride) flowArg = selected.flowOverride;
        if (selected.llmMapOverride) llmMapArg = selected.llmMapOverride;
      } else {
        flowArg = selected.flow;
        llmMapArg = selected.llmMap;
        managerArg = selected.manager;
      }
    }

    if (!strategyDoc.strategies[strategyName]) {
      throw new Error(`Strategy '${strategyName}' not found in config/strategies.yaml`);
    }
    const profile = strategyDoc.strategies[strategyName];
    const routerConfig = loadRouterConfig(path.join(BASE_DIR, "config"));

    if (managerCliArg || managerModelArg) {
      const mCli = managerCliArg || profile.manager?.cli || "claude";
      const mModel = managerModelArg || profile.manager?.model || "claude-opus-4-6";
      managerArg = `${mCli}:${mModel}`;
    }

    const profileFlow = Array.isArray(profile.flow) && profile.flow.length > 0
      ? profile.flow
      : DEFAULT_FLOW;
    const flow = parseFlow(flowArg || profileFlow.join(","), profileFlow);

    const defaultManager = {
      cli: profile.manager?.cli || "claude",
      model: profile.manager?.model || "claude-opus-4-6"
    };
    const manager = parseManager(managerArg, defaultManager);

    const defaultAssignments = buildDefaultAssignmentsFromStrategy(profile);
    const overrideAssignments = parseLlmMap(llmMapArg);
    const stageAssignments = { ...defaultAssignments, ...overrideAssignments };

    console.log(`🧩 [Strategy] ${strategyName}`);
    console.log(`🧭 [Flow] ${flow.join(" -> ")}`);
    console.log(`🎛️  [Manager] ${manager.cli}:${manager.model}`);

    const plan = buildRuntimePlan({
      task,
      routerConfig,
      manager,
      flow,
      stageAssignments
    });

    console.log(`\n🚦 [Router Executing Plan] Session: ${plan.id}...`);
    const result = await orchestratePlan(plan, {
      baseDir: BASE_DIR,
      executor: executor,
      dryRun
    });

    console.log("\n--- RESULT ---");
    console.log(`Success: ${result.success}`);
    console.log(`Session State: ${result.state}`);
  } catch (error) {
    console.error("❌ Execution Failed:", error.message);
  }
}

/** Fetch available models from multiple drivers */
async function modelsCommand() {
  console.log(`\n========================================`);
  console.log(`🔍 [CLI_Runner] Fetching Available LLMs...`);
  console.log(`========================================\n`);

  try {
    const GeminiDriver = require("./driver/geminiDriver.js");
    const CodexDriver = require("./driver/codexDriver.js");
    const ClaudeDriver = require("./driver/claudeDriver.js");
    const CopilotDriver = require("./driver/copilotDriver.js");

    const drivers = [
      new GeminiDriver(),
      new CodexDriver(),
      new ClaudeDriver(),
      new CopilotDriver()
    ];

    const results = await Promise.allSettled(drivers.map(d => d.getAvailableModels()));

    results.forEach(res => {
      if (res.status === "fulfilled" && res.value && res.value.models) {
        console.log(`\nProvider: [${res.value.provider.toUpperCase()}]`);
        if (res.value.models.length === 0) {
          console.log(`  (No models found or empty response)`);
          return;
        }
        res.value.models.forEach(m => {
          console.log(`  - \x1b[36m${m.id}\x1b[0m [Tier: ${m.tier}]`);
          console.log(`    Best target: ${m.best_for.join(", ")}`);
          if (m.description) {
            console.log(`    Desc: ${m.description}`);
          }
        });
      } else {
        console.warn(`\n[Warning] Failed to fetch models for a provider:`, res.reason);
      }
    });
    console.log("\n(Tip: Run 'cliorch do --task \"...\" --strategy <name>' to dispatch tasks)\n");
  } catch (err) {
    console.error("❌ Failed to compile models:", err.message);
  }
}

// Main dispatch
switch (command) {
  case "do": doCommand().catch(e => { console.error(e); process.exit(1); }); break;
  case "plan": planCommand(); break;
  case "run": runCommand().catch(e => { console.error(e); process.exit(1); }); break;
  case "options": optionsCommand(); break;
  case "redteam": redteamCommand(); break;
  case "models": modelsCommand().catch(e => { console.error(e); process.exit(1); }); break;
  case "status": statusCommand(); break;
  case "config": configCommand(); break;
  default: usage();
}
