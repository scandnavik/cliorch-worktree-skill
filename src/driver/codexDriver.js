// src/driver/codexDriver.js
const { validatePlan } = require("../router/planSchema.js");
const ContextManager = require("../memory/contextManager.js");
const AuthManager = require("../auth/authManager.js");

class CodexDriver {
    constructor(options = {}) {
        this.model = options.model || "codex-advanced"; // Mock model name
        this.strategyProfile = options.strategyProfile || null;
        this.contextManager = new ContextManager(process.cwd());
        this.authManager = new AuthManager();
    }

    getSystemPrompt() {
        return `You are the Brain/Driver for CLI_Runner powered by Codex. Your job is to take a user's natural language request and output a valid JSON Plan.
The JSON must strictly conform to this schema and ONLY contain the JSON output. Do not include markdown formatting or backticks around the JSON.

Expected JSON Structure:
{
  "id": "session-<timestamp>",
  "task": "<Summarize the user's request>",
  "status": "draft",
  "attributes": {
    "task_type": "coding|setup|system|other",
    "complexity": "low|medium|high",
    "estimated_steps": 1
  },
  "constraints": {
    "max_steps": 10,
    "max_files_changed": 5,
    "max_attempts_per_step": 2,
    "max_wall_time_sec": 60,
    "max_budget_usd": 0,
    "deny_commands": ["rm -rf", "mkfs"],
    "protected_paths": ["/etc/*"],
    "output_redaction_patterns": ["password", "secret"],
    "non_bypassable_gates": ["network", "auth", "secrets", "ci"],
    "copilot_requires_patch": true,
    "copilot_freeform": false
  },
  "steps": [
    {
      "id": "step-<index>",
      "role": "worker",
      "cli": "codex", 
      "model": "gpt-5.2",
      "action": "<The command to execute, e.g. node -e 'console.log(1)'>",
      "gate": null,
      "status": "pending",
      "attempt": 0,
      "max_attempts": 2
    }
  ],
  "gates": [],
  "fallbacks": []
}

Rules:
1. Steps execute sequentially. Break tasks into logical CLI commands.
2. If given a Strategy Profile, carefully assign the correct "cli" (worker) and "model" properties for each step based on the defined roles. Default to "codex" if unspecified.
3. If the user asks for dangerous operations, still generate the step but assign it a gate (e.g., "network"). The router will block it safely.

${this.strategyProfile ? `[Strategy Profile - Role Mapping]\nPlease follow these role assignments when creating steps:\n${JSON.stringify(this.strategyProfile.roles, null, 2)}\n` : ""}
${this.contextManager.getKnowledgeContextString()}
`;
    }

    /**
     * Dynamically fetch available models from the provider's API.
     * Uses the AuthManager to authenticate prior to querying.
     */
    async getAvailableModels() {
        console.log("[CodexDriver] Fetching available models for OpenAI / Codex...");
        try {
            const credential = await this.authManager.getCredential();

            // To be implemented: Real Axios request to https://api.openai.com/v1/models 
            // using Bearer `${credential.value}`.
            // For now, we return our latest known realistic models for testing.

            // MOCKING REAL API RESPONSE
            return {
                provider: "codex",
                models: [
                    { id: "gpt-5.3", tier: "High", best_for: ["Advanced Coding", "Refactoring", "Debugging"], description: "OpenAI 最新旗艦模型，專精複雜架構與重構。" },
                    { id: "gpt-5.2", tier: "Balanced", best_for: ["General Coding", "Scripting"], description: "主流全能模型，適合日常除錯與多數任務。" },
                    { id: "gpt-5 mini", tier: "Fast", best_for: ["Simple Fixes", "Syntax Checking"], description: "極速回應且成本極低，適合微小修正。" }
                ]
            };
        } catch (error) {
            console.error("[CodexDriver] Failed to fetch models:", error.message);
            return { provider: "codex", models: [] };
        }
    }

    async generatePlan(userPrompt) {
        console.log(`[CodexDriver] Generating plan for task: "${userPrompt}"`);

        // Ensure we are authenticated (Env variable or OAuth Device Flow)
        const credential = await this.authManager.getCredential();
        console.log(`[CodexDriver] Authenticated via: ${credential.type}`);

        let generatedPlan;

        // MOCKING the actual Axios/SDK call to Codex API to keep it runnable without real tokens.
        // In reality, we would inject `Bearer ${credential.value}` into an Axios headers configuration.
        console.log("[CodexDriver] Calling Codex API Endpoint (Mocked via Structure)...");
        generatedPlan = this._fallbackMockGenerate(userPrompt);

        // Validate the generated plan using our schema
        const validationErrors = validatePlan(generatedPlan);
        if (validationErrors.length > 0) {
            throw new Error(`LLM generated an invalid plan: ${validationErrors.join(", ")}`);
        }

        return generatedPlan;
    }

    _createTemplatePlan(taskDesc) {
        return {
            id: `session-codex-${Date.now()}`,
            task: taskDesc,
            status: "draft",
            attributes: {
                task_type: "generated",
                complexity: "low",
                estimated_steps: 1
            },
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
            steps: [],
            gates: [],
            fallbacks: []
        };
    }

    _fallbackMockGenerate(userPrompt) {
        let generatedPlan = this._createTemplatePlan(userPrompt);

        // Map roles based on strategy
        const executionRole = this.strategyProfile && this.strategyProfile.roles && this.strategyProfile.roles.execution ? this.strategyProfile.roles.execution : { cli: "codex", model: "codex-advanced" };

        if (userPrompt.toLowerCase().includes("hello") || userPrompt.toLowerCase().includes("echo")) {
            generatedPlan.steps.push({ id: "step-1", role: "worker", cli: executionRole.cli, model: executionRole.model, action: "console.log('Hello from Codex')", gate: null, status: "pending", attempt: 0, max_attempts: 2 });
        } else if (userPrompt.toLowerCase().includes("dangerous") || userPrompt.toLowerCase().includes("evil")) {
            generatedPlan.steps.push({ id: "step-1", role: "worker", cli: executionRole.cli, model: executionRole.model, action: "rm -rf /test", gate: "network", status: "pending", attempt: 0, max_attempts: 2 });
        } else {
            generatedPlan.steps.push({ id: "step-1", role: "worker", cli: executionRole.cli, model: executionRole.model, action: "console.log('Codex Action for: " + userPrompt.replace(/'/g, "") + "')", gate: null, status: "pending", attempt: 0, max_attempts: 2 });
        }
        return generatedPlan;
    }
}

module.exports = CodexDriver;
