// src/router/planSchema.js
// Plan schema definition and validation for CLI_Runner A2 OS
// Runtime JS version (compiled from planSchema.ts conceptual spec)

const ALLOWED_CLIS = ["gemini", "codex", "copilot"];
const GATE_TYPES = ["secrets", "ci", "auth", "network"];

/** Validate a plan object. Returns list of errors (empty = valid). */
function validatePlan(plan) {
  const errors = [];

  if (!plan || typeof plan !== "object") {
    return ["Plan must be a non-null object"];
  }
  if (!plan.id) errors.push("Missing plan.id");
  if (!plan.task) errors.push("Missing plan.task");
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    errors.push("Plan must have at least one step");
  }

  const c = plan.constraints;
  if (!c) {
    errors.push("Missing plan.constraints");
  } else {
    if (c.max_steps < 1) errors.push("max_steps must be >= 1");
    if (c.copilot_freeform === true) errors.push("copilot_freeform must be false");
    if (c.copilot_requires_patch !== true) errors.push("copilot_requires_patch must be true");
  }

  if (Array.isArray(plan.steps)) {
    if (plan.steps.length > (c?.max_steps || 8)) {
      errors.push(`Too many steps: ${plan.steps.length} > max ${c?.max_steps || 8}`);
    }
    for (const step of plan.steps) {
      // General step validation
      if (!step.id || typeof step.id !== "string") {
        errors.push(`Step is missing a valid 'id'.`); // Removed index 'i' as it's not available in 'for...of'
      }
      if (!step.role || typeof step.role !== "string") {
        errors.push(`Step ${step.id} is missing a valid 'role'.`);
      }
      if (step.cli && typeof step.cli !== "string") {
        errors.push(`Step ${step.id} has invalid 'cli'.`);
      }
      if (step.cli && !ALLOWED_CLIS.includes(step.cli)) {
        errors.push(`Step ${step.id} references disallowed CLI: ${step.cli}`);
      }
      if (step.model && typeof step.model !== "string") {
        errors.push(`Step ${step.id} has invalid 'model'.`);
      }
      if (!step.action || typeof step.action !== "string") {
        errors.push(`Step ${step.id} is missing a valid 'action'.`);
      }

      // Role-specific validation
      if (step.role === "worker") {
        // The previous `if (!step.cli || !ALLOWED_CLIS.includes(step.cli))` is now covered by the general validation above.
        if (step.cli === "copilot" && !step.requires_patch) {
          errors.push(`Step ${step.id}: copilot steps must have requires_patch=true`);
        }
      }
      if (step.role === "claude_driver" && step.cli !== null && step.cli !== undefined) {
        errors.push(`Step ${step.id}: claude_driver steps must have cli=null`);
      }
      if (step.gate && !GATE_TYPES.includes(step.gate)) {
        errors.push(`Step ${step.id}: invalid gate "${step.gate}"`);
      }
    }
  }

  if (Array.isArray(plan.fallbacks)) {
    for (const fb of plan.fallbacks) {
      if (fb.degrade_to && !ALLOWED_CLIS.includes(fb.degrade_to)) {
        errors.push(`Fallback for ${fb.step_id}: invalid degrade_to "${fb.degrade_to}"`);
      }
      if (fb.max_retries > (c?.max_attempts_per_step || 2)) {
        errors.push(`Fallback for ${fb.step_id}: max_retries exceeds max_attempts_per_step`);
      }
    }
  }

  return errors;
}

function isDeniedCommand(command, denyList) {
  const normalized = command.trim().toLowerCase().replace(/\s*\|\s*/g, "|");
  return denyList.some(denied => {
    const d = denied.toLowerCase();
    // For pipe-based denials like "curl|bash", check if command pipes program to target
    if (d.includes("|")) {
      const [prog, target] = d.split("|");
      const parts = normalized.split("|");
      return parts.some((p, i) => {
        const trimmed = p.trim();
        const nextTrimmed = parts[i + 1] ? parts[i + 1].trim() : "";
        // Match program at start of pipe segment (word boundary)
        const progMatch = trimmed === prog || trimmed.startsWith(prog + " ");
        const targetMatch = nextTrimmed === target || nextTrimmed.startsWith(target + " ");
        return progMatch && targetMatch;
      });
    }
    // Word-boundary match: denied token must appear as a standalone command/token.
    // Check each pipe segment individually so "printenv | grep X" still matches "printenv".
    const escaped = d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wordBoundary = new RegExp(`(^|\\s)${escaped}(\\s|$)`);
    const segments = normalized.split("|").map(s => s.trim());
    return segments.some(seg => wordBoundary.test(seg));
  });
}

function isProtectedPath(filePath, protectedPatterns) {
  const normalized = filePath.replace(/\\/g, "/");
  return protectedPatterns.some(pattern => {
    // Convert glob to regex: first handle **, then *, then escape dots
    let regex = pattern
      .replace(/\./g, "\\.")
      .replace(/\*\*/g, "§GLOBSTAR§")
      .replace(/\*/g, "[^/]*")
      .replace(/§GLOBSTAR§/g, ".*");
    return new RegExp(`^${regex}$`).test(normalized);
  });
}

function redactOutput(output, patterns) {
  let redacted = output;
  for (const pat of patterns) {
    const regex = new RegExp(pat, "gi");
    redacted = redacted.replace(regex, "[REDACTED]");
  }
  return redacted;
}

module.exports = {
  ALLOWED_CLIS,
  GATE_TYPES,
  validatePlan,
  isDeniedCommand,
  isProtectedPath,
  redactOutput
};
