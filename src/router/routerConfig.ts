// src/router/routerConfig.ts
// Load and parse YAML configuration for CLI_Runner

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

interface RouterPolicy {
  protected_paths: string[];
  deny_commands: string[];
  output_redaction_patterns: string[];
  non_bypassable_gates: string[];
  copilot_requires_patch: boolean;
  copilot_freeform: boolean;
  max_steps: number;
  max_files_changed: number;
  max_attempts_per_step: number;
  max_wall_time_sec: number;
  max_budget_usd: number;
}

interface RouterConfig {
  routing: Record<string, string>;
  allowed_clis: string[];
  policies: RouterPolicy;
}

interface ChainStep {
  id: string;
  role: string;
  action: string;
  cli: string | null;
  gate?: string;
  requires_patch?: boolean;
}

interface Chain {
  description: string;
  steps: ChainStep[];
}

interface ChainsConfig {
  chains: Record<string, Chain>;
}

/** Load router.yaml */
function loadRouterConfig(configDir?: string): RouterConfig {
  const dir = configDir || path.join(__dirname, "..", "..", "config");
  const filePath = path.join(dir, "router.yaml");
  const content = fs.readFileSync(filePath, "utf-8");
  const config = yaml.load(content) as RouterConfig;

  // Validate: only allowed CLIs in routing
  const allowed = new Set(config.allowed_clis || []);
  for (const [task, cli] of Object.entries(config.routing)) {
    if (!allowed.has(cli)) {
      throw new Error(`router.yaml: routing.${task} references disallowed CLI "${cli}"`);
    }
  }

  // Enforce non-negotiables
  if (config.policies.copilot_freeform !== false) {
    throw new Error("router.yaml: copilot_freeform must be false");
  }
  if (config.policies.copilot_requires_patch !== true) {
    throw new Error("router.yaml: copilot_requires_patch must be true");
  }

  return config;
}

/** Load chains.yaml */
function loadChainsConfig(configDir?: string): ChainsConfig {
  const dir = configDir || path.join(__dirname, "..", "..", "config");
  const filePath = path.join(dir, "chains.yaml");
  const content = fs.readFileSync(filePath, "utf-8");
  const config = yaml.load(content) as ChainsConfig;

  // Validate: worker steps must use allowed CLIs
  const allowed = new Set(["gemini", "codex", "copilot"]);
  for (const [name, chain] of Object.entries(config.chains)) {
    for (const step of chain.steps) {
      if (step.role === "worker" && step.cli && !allowed.has(step.cli)) {
        throw new Error(`chains.yaml: chain "${name}" step "${step.id}" uses disallowed CLI "${step.cli}"`);
      }
    }
  }

  return config;
}

/** Route a task type to a CLI name */
function routeTask(taskType: string, config: RouterConfig): string | null {
  return config.routing[taskType] || null;
}

module.exports = { loadRouterConfig, loadChainsConfig, routeTask };
