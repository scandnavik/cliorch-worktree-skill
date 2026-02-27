// src/router/routerConfig.js
// Load and parse YAML configuration for cli-orchestrator
// Runtime JS version

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

function loadRouterConfig(configDir) {
  const dir = configDir || path.join(__dirname, "..", "..", "config");
  const filePath = path.join(dir, "router.yaml");
  const content = fs.readFileSync(filePath, "utf-8");
  const config = yaml.load(content);

  const allowed = new Set(config.allowed_clis || []);
  for (const [task, cli] of Object.entries(config.routing)) {
    if (!allowed.has(cli)) {
      throw new Error(`router.yaml: routing.${task} references disallowed CLI "${cli}"`);
    }
  }

  if (config.policies.copilot_freeform !== false) {
    throw new Error("router.yaml: copilot_freeform must be false");
  }
  if (config.policies.copilot_requires_patch !== true) {
    throw new Error("router.yaml: copilot_requires_patch must be true");
  }

  return config;
}

function loadChainsConfig(configDir) {
  const dir = configDir || path.join(__dirname, "..", "..", "config");
  const filePath = path.join(dir, "chains.yaml");
  const content = fs.readFileSync(filePath, "utf-8");
  const config = yaml.load(content);

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

function routeTask(taskType, config) {
  return config.routing[taskType] || null;
}

module.exports = { loadRouterConfig, loadChainsConfig, routeTask };
