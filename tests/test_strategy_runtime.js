// tests/test_strategy_runtime.js
// Unit tests for runtime strategy planner

const assert = require("assert");
const path = require("path");
const { loadRouterConfig } = require("../src/router/routerConfig.js");
const {
  parseFlow,
  parseLlmMap,
  parseManager,
  buildDefaultAssignmentsFromStrategy,
  buildRuntimePlan
} = require("../src/strategy/runtimeStrategy.js");

const BASE_DIR = path.join(__dirname, "..");
const routerConfig = loadRouterConfig(path.join(BASE_DIR, "config"));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
  }
}

console.log("\n=== Runtime Strategy ===");

test("parseFlow parses comma flow", () => {
  const flow = parseFlow("ideation,converge,execution,review");
  assert.deepStrictEqual(flow, ["ideation", "converge", "execution", "review"]);
});

test("parseFlow rejects unknown stage", () => {
  let threw = false;
  try {
    parseFlow("ideation,unknown,execution");
  } catch {
    threw = true;
  }
  assert.strictEqual(threw, true);
});

test("parseLlmMap parses stage mapping", () => {
  const map = parseLlmMap("ideation=gemini:gemini-3.1-pro-preview,execution=codex:gpt-5.2");
  assert.strictEqual(map.ideation.cli, "gemini");
  assert.strictEqual(map.execution.model, "gpt-5.2");
});

test("parseManager parses manager cli:model", () => {
  const manager = parseManager("claude:claude-opus-4-6");
  assert.strictEqual(manager.cli, "claude");
  assert.strictEqual(manager.model, "claude-opus-4-6");
});

test("buildDefaultAssignmentsFromStrategy resolves defaults", () => {
  const profile = {
    roles: {
      ideation: { cli: "gemini", model: "gemini-3.1-pro-preview" },
      execution: { cli: "copilot", model: "copilot-default" },
      review: { cli: "codex", model: "gpt-5.2" }
    }
  };
  const assignments = buildDefaultAssignmentsFromStrategy(profile);
  assert.strictEqual(assignments.ideation.cli, "gemini");
  assert.strictEqual(assignments.execution.cli, "copilot");
  assert.strictEqual(assignments.review.cli, "codex");
});

test("buildRuntimePlan creates ordered steps and worker models", () => {
  const plan = buildRuntimePlan({
    task: "Implement auth and review code",
    routerConfig,
    manager: { cli: "claude", model: "claude-opus-4-6" },
    flow: ["ideation", "converge", "execution", "review"],
    stageAssignments: {
      ideation: { cli: "gemini", model: "gemini-3.1-pro-preview" },
      execution: { cli: "copilot", model: "copilot-default" },
      review: { cli: "codex", model: "gpt-5.2" }
    }
  });

  const ideation = plan.steps.find(s => s.id.includes("ideation"));
  const execution = plan.steps.find(s => s.id.includes("execution"));
  const review = plan.steps.find(s => s.id.includes("review"));

  assert.ok(ideation, "missing ideation step");
  assert.ok(execution, "missing execution step");
  assert.ok(review, "missing review step");
  assert.strictEqual(ideation.model, "gemini-3.1-pro-preview");
  assert.strictEqual(execution.cli, "copilot");
  assert.strictEqual(execution.requires_patch, true);
  assert.strictEqual(review.cli, "codex");
});

console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(40)}`);
process.exit(failed > 0 ? 1 : 0);
