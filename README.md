# CLI_Runner

> A2-level Single-Operator AI Dev OS — Claude as driver, routing tasks to Gemini / Codex / Copilot CLIs.

```
Task ──→ Plan ──→ Router ──→ Gate ──→ CLI Exec ──→ Integrate ──→ Output
         Claude    YAML      policy   gemini/      Claude        result
         decomposes config   check    codex/copilot merges
```

**CLI_Runner** is a hardened orchestration layer where Claude acts as the planning/judging brain and delegates work to worker CLIs (Gemini, Codex, Copilot). All steps are gated by security policies, stop conditions, and redaction rules.

## Quick Start

```bash
# 1. Install
cd CLI_Runner && npm install

# 2. Plan a task
npx cliorch plan --task "Build a REST API for user auth"

# 3. Execute a plan
npx cliorch run --plan plans/latest.json

# 4. Red-team validation
npx cliorch redteam --print

# 5. Check CLI status
npm run status
```

## Architecture

| Module | Responsibility | Code |
|--------|---------------|------|
| **Router Config** | Load YAML routing + policies | `src/router/routerConfig.ts` |
| **Plan Schema** | Validate plan structure + gates | `src/router/planSchema.ts` |
| **Orchestrate Plan** | Execute steps with gating + guards | `src/router/orchestratePlan.ts` |
| **CLI Registry** | Detect installed CLIs, capability match | `src/cli-registry.js` |
| **Executor** | Subprocess calls, timeout, error capture | `src/executor.js` |

### Allowed Worker CLIs

| CLI | Role |
|-----|------|
| Gemini | Research, multimodal, large context |
| Codex | Precision coding, debugging |
| Copilot | Repo operations, PR (patch-only) |

**Claude = Driver only** (planner / judge / integrator). Never routed as worker.

## Security Policies

- Protected paths enforced (config/, memory/, .env*, etc.)
- Deny-listed commands blocked (printenv, curl\|bash, etc.)
- Output redaction for secrets
- Non-bypassable gates: secrets, ci, auth, network
- Copilot requires patch reference (no freeform)
- Max steps: 8, Max files changed: 50, Wall time: 900s

## Development

```bash
npm run demo      # Simulated demo (no CLI needed)
npm run status    # Check CLI availability
npm test          # Run tests
```

## License

ISC
