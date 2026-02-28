// src/driver/geminiDriver.js
// Responsible for taking natural language prompts, querying Gemini API, 
// and producing a structured JSON plan compliant with planSchema.js

const { validatePlan } = require("../router/planSchema.js");
const ContextManager = require("../memory/contextManager.js");

class GeminiDriver {
    constructor(options = {}) {
        this.model = options.model || "gemini-3.1-flash";
        this.apiKey = options.apiKey || process.env.GEMINI_API_KEY;
        this.strategyProfile = options.strategyProfile || null;
        this.contextManager = new ContextManager(process.cwd());
    }

    getSystemPrompt() {
        return `You are the Brain/Driver for CLI_Runner powered by Gemini. Your job is to take a user's natural language request and output a valid JSON Plan.
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
      "model": "gemini-3.1-flash", 
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

    async getAvailableModels() {
        console.log("[GeminiDriver] Fetching available models for Google Gemini...");
        try {
            // MOCKING REAL API RESPONSE (Would use @google/genai in real life)
            return {
                provider: "gemini",
                models: [
                    { id: "gemini-3.1-pro", tier: "High", best_for: ["Complex Reasoning", "Deep Learning Code", "Architecture"], description: "最新一代最強模型，具備最寬的上下文關聯能力與複雜問題拆解能力。" },
                    { id: "gemini-3.1-flash", tier: "Fast", best_for: ["Rapid Ideation", "Quick Scripting"], description: "極速響應，多模態處理速度最快，適合日常輔助。" }
                ]
            };
        } catch (error) {
            console.error("[GeminiDriver] Failed to fetch models:", error.message);
            return { provider: "gemini", models: [] };
        }
    }

    async generatePlan(userPrompt) {
        console.log(`[GeminiDriver] Generating plan for task: "${userPrompt}"`);
        let generatedPlan;

        if (this.apiKey) {
            console.log("[GeminiDriver] Calling Real Gemini API...");
            try {
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
                text = text.replace(/^```json/g, '').replace(/^```/g, '').replace(/```$/g, '').trim();
                generatedPlan = JSON.parse(text);
            } catch (err) {
                console.error("[GeminiDriver] True LLM call failed or not configured correctly:", err.message);
                console.log("[GeminiDriver] Falling back to structured mock generation...");
                generatedPlan = this._fallbackMockGenerate(userPrompt);
            }
        } else {
            console.log("[GeminiDriver] No API key found. Using structured mock generation...");
            generatedPlan = this._fallbackMockGenerate(userPrompt);
        }

        const validationErrors = validatePlan(generatedPlan);
        if (validationErrors.length > 0) {
            throw new Error(`LLM generated an invalid plan: ${validationErrors.join(", ")}`);
        }

        return generatedPlan;
    }

    _createTemplatePlan(taskDesc) {
        return {
            id: `session-gemini-${Date.now()}`,
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

        const executionRole = this.strategyProfile && this.strategyProfile.roles && this.strategyProfile.roles.execution ? this.strategyProfile.roles.execution : { cli: "gemini", model: "gemini-3.1-flash" };

        if (userPrompt.toLowerCase().includes("hello") || userPrompt.toLowerCase().includes("echo")) {
            generatedPlan.steps.push({ id: "step-1", role: "worker", cli: executionRole.cli, model: executionRole.model, action: "console.log('Hello from Gemini')", gate: null, status: "pending", attempt: 0, max_attempts: 2 });
        } else if (userPrompt.toLowerCase().includes("dangerous") || userPrompt.toLowerCase().includes("evil")) {
            generatedPlan.steps.push({ id: "step-1", role: "worker", cli: executionRole.cli, model: executionRole.model, action: "rm -rf /test", gate: "network", status: "pending", attempt: 0, max_attempts: 2 });
        } else {
            generatedPlan.steps.push({ id: "step-1", role: "worker", cli: executionRole.cli, model: executionRole.model, action: "console.log('Gemini Action for: " + userPrompt.replace(/'/g, "") + "')", gate: null, status: "pending", attempt: 0, max_attempts: 2 });
        }
        return generatedPlan;
    }
}

module.exports = GeminiDriver;
