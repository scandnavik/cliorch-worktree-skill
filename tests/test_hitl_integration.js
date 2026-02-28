const path = require("path");
const { orchestratePlan } = require("../src/router/orchestratePlan.js");
const CLIRegistry = require("../src/cli-registry.js");
const Executor = require("../src/executor.js");

const registry = new CLIRegistry(path.join(__dirname, "..", "config", "cli-registry.json"));
const executor = new Executor(registry);

const mockPlan = {
    id: `test-session-hitl-${Date.now()}`,
    task: "Run dangerous steps to trigger HITL",
    status: "draft",
    attributes: { task_type: "security_test" },
    constraints: {
        max_steps: 3,
        max_wall_time_sec: 10,
        deny_commands: ["rm -rf"],
        protected_paths: ["/etc/hosts"],
        non_bypassable_gates: ["network"],
        copilot_freeform: false,
        copilot_requires_patch: true
    },
    steps: [
        {
            id: "step-1",
            role: "worker",
            cli: "gemini",
            // Dangerous action to trigger HITL check
            action: "rm -rf /test",
            gate: null,
            status: "pending",
            max_attempts: 1
        }
    ]
};

async function main() {
    console.log(`Starting orchestrator HITL test with session: ${mockPlan.id}`);

    const result = await orchestratePlan(mockPlan, {
        baseDir: path.join(__dirname, ".."),
        executor: executor,
        dryRun: false
    });

    console.log("\n--- RESULT ---");
    console.log(`Success: ${result.success}`);
    console.log(`Session State: ${result.state}`);
    result.steps.forEach(s => {
        console.log(`\nStep ${s.step} Status: ${s.status}`);
        if (s.reason) console.log(`Step ${s.step} Reason: ${s.reason}`);
        if (s.output) console.log(`Step ${s.step} Output: ${s.output}`);
    });

    process.exit(0);
}

main().catch(console.error);
