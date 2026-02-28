// src/driver/claudeDriver.js
// Responsible for taking natural language prompts, querying an LLM, 
// and producing a structured JSON plan compliant with planSchema.js

const { validatePlan } = require("../router/planSchema.js");
const ContextManager = require("../memory/contextManager.js");

class ClaudeDriver {
    constructor(options = {}) {
        this.model = options.model || "gemini-2.5-flash";
        this.apiKey = options.apiKey || process.env.GEMINI_API_KEY;
        this.strategyProfile = options.strategyProfile || null;
        this.contextManager = new ContextManager(process.cwd());
    }

    /**
     * The System Prompt defines the strict rules the LLM must follow to generate valid JSON.
     */
    getSystemPrompt() {
        return `You are the Brain/Driver for CLI_Runner. Your job is to take a user's natural language request and output a valid JSON Plan.
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
      "cli": "gemini",
      "model": "gemini-3.1-pro-preview", 
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
2. If given a Strategy Profile, carefully assign the correct "cli" (worker) and "model" properties for each step based on the defined roles. Default to "gemini" if unspecified.
3. If the user asks for dangerous operations, still generate the step but assign it a gate (e.g., "network"). The router will block it safely.

${this.strategyProfile ? `[Strategy Profile - Role Mapping]\nPlease follow these role assignments when creating steps:\n${JSON.stringify(this.strategyProfile.roles, null, 2)}\n` : ""}
${this.contextManager.getKnowledgeContextString()}
`;
    }

    /**
     * Dynamically fetch available models from the provider's API.
     */
    async getAvailableModels() {
        console.log("[ClaudeDriver] Fetching available models for Anthropic/Claude...");
        try {
            // To be implemented: Real Anthropic SDK or Axios request to its API 
            // using Bearer `${this.apiKey}`.

            // MOCKING REAL API RESPONSE
            return {
                provider: "claude",
                models: [
                    { id: "claude-opus-4-6", tier: "High", best_for: ["Orchestration", "System Design", "Complex Logic"], description: "最強大腦，極致的指令遵循與複雜邏輯拆分。" },
                    { id: "claude-sonnet-4-6", tier: "Balanced", best_for: ["Code Generation", "General Tasks"], description: "速度與效能均衡的主力型號。" },
                    { id: "claude-haiku-3-5", tier: "Fast", best_for: ["Fast Processing", "Simple Parsing"], description: "低延遲輕量作業首選。" }
                ]
            };
        } catch (error) {
            console.error("[ClaudeDriver] Failed to fetch models:", error.message);
            return { provider: "claude", models: [] };
        }
    }

    /**
     * Translates a user prompt into a well-formed JSON plan.
     */
    async generatePlan(userPrompt) {
        console.log(`[ClaudeDriver] Generating plan for task: "${userPrompt}"`);
        let generatedPlan;

        // Check if we have an API key to do real generation
        if (this.apiKey) {
            console.log("[ClaudeDriver] Calling Real Gemini API...");
            try {
                // Assuming @google/genai SDK is installed in real environment
                const { GoogleGenAI } = require('@google/genai');
                const ai = new GoogleGenAI({ apiKey: this.apiKey });
                const response = await ai.models.generateContent({
                    model: this.model,
                    contents: userPrompt,
                    config: {
                        systemInstruction: this.getSystemPrompt(),
                        temperature: 0.1,
                    }
                });

                let text = response.text;
                // Strip markdown backticks if returned
                text = text.replace(/^```json/g, '').replace(/^```/g, '').replace(/```$/g, '').trim();
                generatedPlan = JSON.parse(text);
            } catch (err) {
                console.error("[ClaudeDriver] True LLM call failed or not configured correctly:", err.message);
                console.log("[ClaudeDriver] Falling back to structured mock generation...");
                generatedPlan = this._fallbackMockGenerate(userPrompt);
            }
        } else {
            console.log("[ClaudeDriver] No API key found. Using structured mock generation...");
            generatedPlan = this._fallbackMockGenerate(userPrompt);
        }

        // Validate the generated plan using our schema
        const validationErrors = validatePlan(generatedPlan);
        if (validationErrors.length > 0) {
            throw new Error(`LLM generated an invalid plan: ${validationErrors.join(", ")}`);
        }

        return generatedPlan;
    }

    _createTemplatePlan(taskDesc) {
        return {
            id: `session-gen-${Date.now()}`,
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
        const executionRole = this.strategyProfile && this.strategyProfile.roles && this.strategyProfile.roles.execution ? this.strategyProfile.roles.execution : { cli: "gemini", model: "gemini-2.5-flash" };

        if (userPrompt.toLowerCase().includes("hello") || userPrompt.toLowerCase().includes("echo")) {
            generatedPlan.steps.push({ id: "step-1", role: "worker", cli: executionRole.cli, model: executionRole.model, action: "console.log('Hello')", gate: null, status: "pending", attempt: 0, max_attempts: 2 });
        } else if (userPrompt.toLowerCase().includes("dangerous") || userPrompt.toLowerCase().includes("evil")) {
            generatedPlan.steps.push({ id: "step-1", role: "worker", cli: executionRole.cli, model: executionRole.model, action: "rm -rf /test", gate: "network", status: "pending", attempt: 0, max_attempts: 2 });
        } else {
            generatedPlan.steps.push({ id: "step-1", role: "worker", cli: executionRole.cli, model: executionRole.model, action: "console.log('Action for: " + userPrompt.replace(/'/g, "") + "')", gate: null, status: "pending", attempt: 0, max_attempts: 2 });
        }
        return generatedPlan;
    }
}

module.exports = ClaudeDriver;
