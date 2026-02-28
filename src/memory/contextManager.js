// src/memory/contextManager.js
// Responsible for writing and reading historical knowledge (issues and resolutions)
// so the Driver can learn from past mistakes.

const fs = require('fs');
const path = require('path');

class ContextManager {
    constructor(projectDir) {
        this.memoryFile = path.join(projectDir, 'memory', 'project.json');
        this._ensureDir();
    }

    _ensureDir() {
        const dir = path.dirname(this.memoryFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(this.memoryFile)) {
            // Initialize an empty knowledge base
            fs.writeFileSync(this.memoryFile, JSON.stringify({
                project_name: "CLI_Runner",
                learned_context: []
            }, null, 2));
        }
    }

    /**
     * Save a new lesson learned.
     */
    saveKnowledge(issue, resolution) {
        try {
            const data = JSON.parse(fs.readFileSync(this.memoryFile, 'utf8'));

            if (!data.learned_context) {
                data.learned_context = [];
            }
            // Avoid exact duplicates
            const exists = data.learned_context.some(item => item.issue === issue);
            if (!exists) {
                data.learned_context.push({
                    timestamp: new Date().toISOString(),
                    issue,
                    resolution
                });
                fs.writeFileSync(this.memoryFile, JSON.stringify(data, null, 2));
                console.log(`[Memory] Saved new knowledge: ${issue.substring(0, 30)}...`);
            }
        } catch (err) {
            console.error("[Memory] Failed to save knowledge:", err.message);
        }
    }

    /**
     * Format all learned context into a usable string for the LLM prompt.
     */
    getKnowledgeContextString() {
        try {
            const data = JSON.parse(fs.readFileSync(this.memoryFile, 'utf8'));
            if (!data.learned_context || data.learned_context.length === 0) {
                return "No specific past context recorded yet.";
            }

            let ctxStr = "PAST ISSUES AND RESOLUTIONS TO AVOID:\n";
            data.learned_context.forEach((item, idx) => {
                ctxStr += `[${idx + 1}] Issue: ${item.issue}\n    Resolution: ${item.resolution}\n`;
            });
            return ctxStr;

        } catch (err) {
            return "No specific past context recorded yet.";
        }
    }
}

module.exports = ContextManager;
