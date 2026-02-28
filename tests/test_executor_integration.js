const path = require("path");
const { orchestratePlan } = require("../src/router/orchestratePlan.js");
const CLIRegistry = require("../src/cli-registry.js");
const Executor = require("../src/executor.js");

const registry = new CLIRegistry(path.join(__dirname, "..", "config", "cli-registry.json"));
const executor = new Executor(registry);

const mockPlan = {
    id: `test-session-${Date.now()}`,
    task: "Run a simple command to verify executor integration",
    status: "draft",
    attributes: { task_type: "test", complexity: "low", estimated_steps: 1 },
    constraints: {
        max_steps: 5,
        max_files_changed: 0,
        max_attempts_per_step: 2,
        max_wall_time_sec: 10,
        max_budget_usd: 0,
        deny_commands: ["rm -rf", "mkfs"],
        protected_paths: ["/etc/*"],
        output_redaction_patterns: ["password"],
        non_bypassable_gates: ["network"],
        copilot_requires_patch: true,
        copilot_freeform: false
    },
    steps: [
        {
            id: "step-1",
            role: "worker",
            cli: "gemini", // Assuming gemini is registered in registry.yaml as a valid CLI
            action: "console.log('Executor Test Successful')",
            status: "pending",
            attempt: 0,
            max_attempts: 2
        }
    ],
    gates: [],
    fallbacks: []
};

async function runTest() {
    console.log(`Starting orchestrator test with session: ${mockPlan.id}`);
    const result = await orchestratePlan(mockPlan, {
        baseDir: path.join(__dirname, ".."),
        executor: executor,
        dryRun: false
    });

    console.log("\n--- RESULT ---");
    console.log(`Success: ${result.success}`);
    console.log(`Session State: ${result.state}`);
    console.log(`Duration: ${result.wall_time_sec}s`);
    console.log(`Log Dir: ${result.log_dir}`);

    if (result.steps && result.steps.length > 0) {
        console.log(`\nStep 1 Status: ${result.steps[0].status}`);
        console.log(`Step 1 Output: ${result.steps[0].output}`);
        if (result.steps[0].error_formatted) {
            console.log(`Step 1 Error: ${result.steps[0].error_formatted}`);
        }
    }
}

runTest().catch(console.error);
