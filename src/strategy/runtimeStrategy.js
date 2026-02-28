// src/strategy/runtimeStrategy.js
// Runtime strategy planner for flexible stage ordering and per-stage LLM mapping.

const { GATE_TYPES } = require("../router/planSchema.js");

const DEFAULT_FLOW = ["ideation", "converge", "execution", "review"];

const STAGE_DEFS = {
  ideation: {
    kind: "worker",
    gate: "secrets",
    action: (task) => `Stage: Ideation\nTask: ${task}\nGenerate diverse solution ideas and tradeoffs.`
  },
  research: {
    kind: "worker",
    gate: "secrets",
    action: (task) => `Stage: Research\nTask: ${task}\nResearch prior art, constraints, and implementation options.`
  },
  converge: {
    kind: "driver",
    gate: null,
    action: (task) => `Stage: Converge\nTask: ${task}\nConverge findings into an executable implementation plan.`
  },
  execution: {
    kind: "worker",
    gate: "secrets",
    action: (task) => `Stage: Execution\nTask: ${task}\nImplement the selected approach with concrete code changes.`
  },
  debug: {
    kind: "worker",
    gate: "secrets",
    action: (task) => `Stage: Debug\nTask: ${task}\nDebug regressions and stabilize behavior.`
  },
  review: {
    kind: "worker",
    gate: "secrets",
    action: (task) => `Stage: Review\nTask: ${task}\nPerform strict code review and report risks/fixes.`
  },
  repo: {
    kind: "worker",
    gate: "ci",
    action: (task) => `Stage: Repo\nTask: ${task}\nPrepare patch-oriented repo operations.`
  },
  integrate: {
    kind: "driver",
    gate: null,
    action: (task) => `Stage: Integrate\nTask: ${task}\nIntegrate and summarize final outcome.`
  }
};

function listSupportedStages() {
  return Object.keys(STAGE_DEFS);
}

function parseFlow(flowText, fallback = DEFAULT_FLOW) {
  if (!flowText || typeof flowText !== "string") return [...fallback];
  const stages = flowText
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  if (stages.length === 0) return [...fallback];
  const invalid = stages.filter(s => !STAGE_DEFS[s]);
  if (invalid.length > 0) {
    throw new Error(`Invalid flow stages: ${invalid.join(", ")}. Supported: ${listSupportedStages().join(", ")}`);
  }
  return stages;
}

// Format: "ideation=gemini:gemini-3.1-pro,execution=copilot:copilot-default"
function parseLlmMap(llmMapText) {
  if (!llmMapText || typeof llmMapText !== "string") return {};

  const out = {};
  const parts = llmMapText.split(",").map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) throw new Error(`Invalid llm-map item "${part}". Expected stage=cli:model`);

    const stage = part.slice(0, eq).trim().toLowerCase();
    const rhs = part.slice(eq + 1).trim();
    const colon = rhs.indexOf(":");
    if (colon === -1) throw new Error(`Invalid llm-map item "${part}". Expected cli:model`);

    const cli = rhs.slice(0, colon).trim().toLowerCase();
    const model = rhs.slice(colon + 1).trim();
    if (!STAGE_DEFS[stage]) throw new Error(`Invalid stage in llm-map: ${stage}`);
    if (!cli || !model) throw new Error(`Invalid llm-map item "${part}". Missing cli or model`);

    out[stage] = { cli, model };
  }
  return out;
}

// Format: "claude:claude-opus-4-6" (manager can be claude/gemini/codex/copilot)
function parseManager(managerText, fallback = { cli: "claude", model: "claude-opus-4-6" }) {
  if (!managerText || typeof managerText !== "string") return { ...fallback };
  const idx = managerText.indexOf(":");
  if (idx === -1) throw new Error(`Invalid manager "${managerText}". Expected cli:model`);
  const cli = managerText.slice(0, idx).trim().toLowerCase();
  const model = managerText.slice(idx + 1).trim();
  if (!cli || !model) throw new Error(`Invalid manager "${managerText}". Missing cli or model`);
  return { cli, model };
}

function buildDefaultAssignmentsFromStrategy(profile = {}) {
  const roles = profile.roles || {};
  const execution = roles.execution || { cli: "codex", model: "gpt-5.2" };
  const ideation = roles.ideation || { cli: "gemini", model: "gemini-3.1-pro-preview" };
  const review = roles.review || execution;
  const versionControl = roles.version_control || { cli: "copilot", model: "copilot-default" };

  return {
    ideation,
    research: ideation,
    execution,
    debug: execution,
    review,
    repo: versionControl
  };
}

function buildRuntimePlan({
  task,
  routerConfig,
  manager,
  flow,
  stageAssignments
}) {
  const planId = `plan-runtime-${Date.now()}`;
  const cfg = routerConfig.policies;
  const steps = [];
  const fallbacks = [];
  let idx = 1;

  steps.push({
    id: `step-${idx++}-kickoff`,
    role: "claude_driver",
    cli: null,
    action: `Kickoff by manager ${manager.cli}:${manager.model}. Task: ${task}`,
    gate: null,
    status: "pending",
    attempt: 0,
    max_attempts: 1
  });

  for (const stage of flow) {
    const def = STAGE_DEFS[stage];
    if (!def) continue;

    if (def.kind === "driver") {
      steps.push({
        id: `step-${idx++}-${stage}`,
        role: "claude_driver",
        cli: null,
        action: def.action(task),
        gate: null,
        status: "pending",
        attempt: 0,
        max_attempts: 1
      });
      continue;
    }

    const assign = stageAssignments[stage];
    if (!assign || !assign.cli) {
      throw new Error(`Missing LLM assignment for stage "${stage}"`);
    }

    const step = {
      id: `step-${idx++}-${stage}`,
      role: "worker",
      cli: assign.cli,
      model: assign.model,
      action: def.action(task),
      gate: def.gate || "secrets",
      status: "pending",
      attempt: 0,
      max_attempts: cfg.max_attempts_per_step
    };

    if (step.cli === "copilot") {
      step.requires_patch = true;
    }

    steps.push(step);
    fallbacks.push({
      step_id: step.id,
      on_failure: "retry",
      max_retries: Math.min(2, cfg.max_attempts_per_step)
    });
  }

  steps.push({
    id: `step-${idx++}-integrate`,
    role: "claude_driver",
    cli: null,
    action: STAGE_DEFS.integrate.action(task),
    gate: null,
    status: "pending",
    attempt: 0,
    max_attempts: 1
  });

  return {
    id: planId,
    task,
    created_at: new Date().toISOString(),
    status: "draft",
    attributes: {
      task_type: "runtime_strategy",
      complexity: "medium",
      estimated_steps: steps.length,
      manager_cli: manager.cli,
      manager_model: manager.model,
      flow
    },
    steps,
    gates: [...GATE_TYPES],
    fallbacks,
    state_paths: {
      plan_path: `plans/${planId}.json`,
      log_dir: `logs/${planId}/`,
      output_dir: `outputs/${planId}/`
    },
    constraints: {
      max_steps: cfg.max_steps,
      max_files_changed: cfg.max_files_changed,
      max_attempts_per_step: cfg.max_attempts_per_step,
      max_wall_time_sec: cfg.max_wall_time_sec,
      max_budget_usd: cfg.max_budget_usd,
      deny_commands: cfg.deny_commands,
      protected_paths: cfg.protected_paths,
      output_redaction_patterns: cfg.output_redaction_patterns,
      non_bypassable_gates: cfg.non_bypassable_gates,
      copilot_requires_patch: cfg.copilot_requires_patch,
      copilot_freeform: false
    }
  };
}

module.exports = {
  DEFAULT_FLOW,
  STAGE_DEFS,
  listSupportedStages,
  parseFlow,
  parseLlmMap,
  parseManager,
  buildDefaultAssignmentsFromStrategy,
  buildRuntimePlan
};
