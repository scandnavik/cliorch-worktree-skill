// src/router/planSchema.ts
// Plan schema definition and validation for CLI_Runner A2 OS

/** Allowed worker CLIs — Claude is DRIVER ONLY, never a worker */
const ALLOWED_CLIS = ["gemini", "codex", "copilot"] as const;
type AllowedCLI = typeof ALLOWED_CLIS[number];

/** Non-bypassable gate types */
const GATE_TYPES = ["secrets", "ci", "auth", "network"] as const;
type GateType = typeof GATE_TYPES[number];

/** Step status */
type StepStatus = "pending" | "running" | "passed" | "failed" | "skipped" | "blocked";

/** A single step in a plan */
interface PlanStep {
  id: string;
  role: "claude_driver" | "worker";
  cli: AllowedCLI | null;   // null = Claude driver step (placeholder only)
  action: string;
  gate: GateType | null;
  requires_patch?: boolean;  // copilot steps must have this = true
  status: StepStatus;
  attempt: number;
  max_attempts: number;
  output_path?: string;
  error?: string;
}

/** Fallback definition */
interface Fallback {
  step_id: string;
  on_failure: "skip" | "retry" | "abort" | "degrade";
  degrade_to?: AllowedCLI;
  max_retries: number;
}

/** Constraint block */
interface Constraints {
  max_steps: number;
  max_files_changed: number;
  max_attempts_per_step: number;
  max_wall_time_sec: number;
  max_budget_usd: number;
  deny_commands: string[];
  protected_paths: string[];
  output_redaction_patterns: string[];
  non_bypassable_gates: GateType[];
  copilot_requires_patch: boolean;
  copilot_freeform: boolean;
}

/** Full plan schema */
interface Plan {
  id: string;
  task: string;
  created_at: string;
  status: "draft" | "running" | "completed" | "failed" | "aborted";
  attributes: {
    task_type: string;
    complexity: "low" | "medium" | "high";
    estimated_steps: number;
  };
  steps: PlanStep[];
  gates: GateType[];
  fallbacks: Fallback[];
  state_paths: {
    plan_path: string;
    log_dir: string;
    output_dir: string;
  };
  constraints: Constraints;
}

/** Validate a plan object. Returns list of errors (empty = valid). */
function validatePlan(plan: any): string[] {
  const errors: string[] = [];

  if (!plan || typeof plan !== "object") {
    return ["Plan must be a non-null object"];
  }
  if (!plan.id) errors.push("Missing plan.id");
  if (!plan.task) errors.push("Missing plan.task");
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    errors.push("Plan must have at least one step");
  }

  // Validate constraints
  const c = plan.constraints;
  if (!c) {
    errors.push("Missing plan.constraints");
  } else {
    if (c.max_steps < 1) errors.push("max_steps must be >= 1");
    if (c.copilot_freeform === true) errors.push("copilot_freeform must be false");
    if (c.copilot_requires_patch !== true) errors.push("copilot_requires_patch must be true");
  }

  // Validate steps
  if (Array.isArray(plan.steps)) {
    if (plan.steps.length > (c?.max_steps || 8)) {
      errors.push(`Too many steps: ${plan.steps.length} > max ${c?.max_steps || 8}`);
    }
    for (const step of plan.steps) {
      // Worker steps must use allowed CLIs
      if (step.role === "worker") {
        if (!step.cli || !ALLOWED_CLIS.includes(step.cli)) {
          errors.push(`Step ${step.id}: invalid CLI "${step.cli}". Allowed: ${ALLOWED_CLIS.join(", ")}`);
        }
        // Copilot steps must require patch
        if (step.cli === "copilot" && !step.requires_patch) {
          errors.push(`Step ${step.id}: copilot steps must have requires_patch=true`);
        }
      }
      // Claude driver steps must have cli=null
      if (step.role === "claude_driver" && step.cli !== null) {
        errors.push(`Step ${step.id}: claude_driver steps must have cli=null`);
      }
      // Gate must be valid if present
      if (step.gate && !GATE_TYPES.includes(step.gate)) {
        errors.push(`Step ${step.id}: invalid gate "${step.gate}"`);
      }
    }
  }

  // Validate gates
  if (Array.isArray(plan.gates)) {
    for (const g of plan.gates) {
      if (!GATE_TYPES.includes(g)) {
        errors.push(`Invalid gate: ${g}`);
      }
    }
  }

  // Validate fallbacks
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

/** Check if a command is in the deny list */
function isDeniedCommand(command: string, denyList: string[]): boolean {
  const normalized = command.trim().toLowerCase().replace(/\s*\|\s*/g, "|");
  return denyList.some(denied => {
    const d = denied.toLowerCase();
    if (d.includes("|")) {
      const [prog, target] = d.split("|");
      const parts = normalized.split("|");
      return parts.some((p, i) => p.trim().includes(prog) && parts[i + 1] && parts[i + 1].trim().includes(target));
    }
    return normalized.includes(d);
  });
}

/** Check if a path matches any protected pattern */
function isProtectedPath(filePath: string, protectedPatterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return protectedPatterns.some(pattern => {
    let regex = pattern
      .replace(/\./g, "\\.")
      .replace(/\*\*/g, "§GLOBSTAR§")
      .replace(/\*/g, "[^/]*")
      .replace(/§GLOBSTAR§/g, ".*");
    return new RegExp(`^${regex}$`).test(normalized);
  });
}

/** Redact sensitive values from output */
function redactOutput(output: string, patterns: string[]): string {
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
