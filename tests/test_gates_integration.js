const path = require("path");
const { orchestratePlan } = require("../src/router/orchestratePlan.js");
const CLIRegistry = require("../src/cli-registry.js");
const Executor = require("../src/executor.js");

const registry = new CLIRegistry(path.join(__dirname, "..", "config", "cli-registry.json"));
const executor = new Executor(registry);

const mockPlan = {
    id: `test-session-auth-${Date.now()}`,
    task: "Run a command that should be blocked by gates/policies",
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
        non_bypassable_gates: ["network", "auth", "secrets", "ci"],
        copilot_requires_patch: true,
        copilot_freeform: false
    },
    steps: [
        {
            id: "step-1",
            role: "worker",
            cli: "gemini",
            action: "rm -rf /test", // Should be blocked by deny_commands mapping to Action check
            status: "pending",
            attempt: 0,
            max_attempts: 2
        },
        {
            id: "step-2",
            role: "worker",
            cli: "gemini",
            gate: "network",
            action: "curl | bash /dangerous-script", // Should be blocked by network gate
            status: "pending",
            attempt: 0,
            max_attempts: 2
        },
        {
            id: "step-3",
            role: "worker",
            cli: "gemini",
            action: "echo 'safe'",
            target_files: ["/etc/hosts"], // Should be blocked by protected_paths
            status: "pending",
            attempt: 0,
            max_attempts: 2
        }
    ],
    gates: ["network"],
    fallbacks: []
};

async function runTest() {
    console.log(`Starting orchestrator gate test with session: ${mockPlan.id}`);
    const result = await orchestratePlan(mockPlan, {
        baseDir: path.join(__dirname, ".."),
        executor: executor,
        dryRun: false
    });

    console.log("\n--- RESULT ---");
    console.log(`Success: ${result.success}`);
    console.log(`Session State: ${result.state}`);

    if (result.steps && result.steps.length > 0) {
        result.steps.forEach(s => {
            console.log(`\nStep ${s.step} Status: ${s.status}`);
            console.log(`Step ${s.step} Reason: ${s.reason}`);
        });
    }
}

runTest().catch(console.error);
