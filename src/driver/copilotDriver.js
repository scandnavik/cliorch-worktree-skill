// src/driver/copilotDriver.js
// Responsible for taking natural language prompts, querying GitHub Copilot CLI, 
// and producing a structured JSON plan compliant with planSchema.js

const { validatePlan } = require("../router/planSchema.js");
const ContextManager = require("../memory/contextManager.js");

class CopilotDriver {
    constructor(options = {}) {
        this.model = options.model || "copilot-default";
        this.strategyProfile = options.strategyProfile || null;
        this.contextManager = new ContextManager(process.cwd());
    }

    getSystemPrompt() {
        return `You are the Brain/Driver for CLI_Runner powered by Copilot. Your job is to take a user's natural language request and output a valid JSON Plan.
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
      "cli": "copilot",
      "model": "copilot-default", 
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
2. If given a Strategy Profile, carefully assign the correct "cli" (worker) and "model" properties for each step based on the defined roles. Default to "copilot" if unspecified.
3. If the user asks for dangerous operations, still generate the step but assign it a gate (e.g., "network"). The router will block it safely.

${this.strategyProfile ? `[Strategy Profile - Role Mapping]\nPlease follow these role assignments when creating steps:\n${JSON.stringify(this.strategyProfile.roles, null, 2)}\n` : ""}
${this.contextManager.getKnowledgeContextString()}
`;
    }

    async getAvailableModels() {
        console.log("[CopilotDriver] Fetching available models for GitHub Copilot...");
        try {
            // MOCKING REAL API RESPONSE
            return {
                provider: "copilot",
                models: [
                    { id: "copilot-default", tier: "Balanced", best_for: ["Code Suggestions", "Git Ops"], description: "Copilot 預設後端模型，提供流暢的程式碼與測試建議。" },
                    { id: "gpt-4", tier: "High", best_for: ["Refactoring", "Logic Design"], description: "使用 GPT-4 作為底層，處理更複雜的邏輯問題。" }
                ]
            };
        } catch (error) {
            console.error("[CopilotDriver] Failed to fetch models:", error.message);
            return { provider: "copilot", models: [] };
        }
    }

    async generatePlan(userPrompt) {
        console.log(`[CopilotDriver] Generating plan for task: "${userPrompt}"`);
        let generatedPlan;

        console.log("[CopilotDriver] Using structured mock generation...");
        generatedPlan = this._fallbackMockGenerate(userPrompt);

        const validationErrors = validatePlan(generatedPlan);
        if (validationErrors.length > 0) {
            throw new Error(`LLM generated an invalid plan: ${validationErrors.join(", ")}`);
        }

        return generatedPlan;
    }

    _createTemplatePlan(taskDesc) {
        return {
            id: `session-copilot-${Date.now()}`,
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

        const executionRole = this.strategyProfile && this.strategyProfile.roles && this.strategyProfile.roles.execution ? this.strategyProfile.roles.execution : { cli: "copilot", model: "copilot-default" };

        if (userPrompt.toLowerCase().includes("hello") || userPrompt.toLowerCase().includes("echo")) {
            generatedPlan.steps.push({ id: "step-1", role: "worker", cli: executionRole.cli, model: executionRole.model, action: "console.log('Hello from Copilot')", gate: null, status: "pending", attempt: 0, max_attempts: 2 });
        } else if (userPrompt.toLowerCase().includes("dangerous") || userPrompt.toLowerCase().includes("evil")) {
            generatedPlan.steps.push({ id: "step-1", role: "worker", cli: executionRole.cli, model: executionRole.model, action: "rm -rf /test", gate: "network", status: "pending", attempt: 0, max_attempts: 2 });
        } else {
            generatedPlan.steps.push({ id: "step-1", role: "worker", cli: executionRole.cli, model: executionRole.model, action: "console.log('Copilot Action for: " + userPrompt.replace(/'/g, "") + "')", gate: null, status: "pending", attempt: 0, max_attempts: 2 });
        }
        return generatedPlan;
    }
}

module.exports = CopilotDriver;
