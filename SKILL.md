---
name: cli-runner
description: A built-in skill to trigger CLI_Runner (cliorch) for complex, multi-model, and agentic code interventions with HITL protection.
---

# CLI_Runner Operator Skill

This skill teaches Claude how to offload complex, multi-step, or risky coding tasks to the local `CLI_Runner` framework (`cliorch`).

## When to use this skill

Whenever the user asks you to:

1. "Generate a complex codebase"
2. "Refactor an entire directory"
3. "Execute tasks that require dynamic capabilities from multiple models (like mixing Gemini's speed with Claude's reasoning)"
4. "Run terminal commands that might be dangerous and need Human-In-The-Loop (HITL) protection"
5. "Run multiple independent sub-tasks in parallel across worktrees"

Do NOT manually generate large boilerplate or use raw `bash` for complex operations. Delegate it to `cliorch` instead!

---

## Part 1: Single-Task Usage (Standard Mode)

Execute the following Node.js command in the terminal to invoke the CLI_Runner's task orchestration engine:

```bash
node src/cli.js do --task "<describe the task context completely>" --strategy <strategy_name>
```

### Strategy Selection Guidelines

- If the user explicitly asks to use a specific strategy, pass `--strategy <name>`.
- If the user doesn't specify but the task is just for simple generation or scripting, use `--strategy fast_code`.
- For standard processing, you can omit the flag or use `--strategy default`.

### How it works behind the scenes

Once you execute `node src/cli.js do`, the CLI_Runner OS will:

1. Dynamically discover local and remote models (via `node src/cli.js models`).
2. Load past "memories" of previous errors.
3. Automatically determine an execution plan (JSON Schema).
4. Prompt the user visually in the terminal (HITL) if a dangerous command is attempting to run.
5. Provide a safe and orchestrated modification of the codebase.

### Example Usage

**User:** "Can you rewrite the entire logging module and ensure tests pass? Use the fast code strategy."
**Claude:**
(Action: run command)
`node src/cli.js do --task "Rewrite the entire logging module in src/logger/ and ensure the test suite passes" --strategy fast_code`

Let `CLI_Runner` handle the orchestration and just relay the output back to the user!

---

## Part 2: Multi-Agent Worktree Workflow

Use this mode when tasks are large enough to be split into **independent sub-tasks** that can be executed in parallel, each in its own git worktree by a dedicated CLI instance.

### Architecture Overview

```
Main Orchestrator (Claude Code Session)
|
+-- Dispatch Task A --> git worktree .wt/feat-a (branch: feat/task-a) --> cliorch instance A
+-- Dispatch Task B --> git worktree .wt/feat-b (branch: feat/task-b) --> cliorch instance B
+-- Dispatch Task C --> git worktree .wt/feat-c (branch: feat/task-c) --> cliorch instance C

Sync Layer (file-based, in TARGET project root)
.cliorch/tasks/
  task-a.json  { id, branch, worktree, status, startedAt, completedAt, output, errors }
  task-b.json
  task-c.json

Merge Phase (main Session, sequential or parallel)
  git merge feat/task-a --> conflict HITL --> test --> git merge feat/task-b --> ...
```

### When to Use Multi-Agent Worktree Mode

- Tasks are logically independent (no shared files between sub-tasks)
- Each sub-task is substantial enough to warrant its own branch
- Final result requires integration of all sub-task outputs

### Phase 1: Plan & Decompose

Break the top-level task into independent sub-tasks. Each sub-task must:
- Operate on a distinct set of files (no overlap)
- Have a clear acceptance condition
- Be named with a short slug (e.g., `feat-auth`, `feat-tests`, `feat-docs`)

### Phase 2: Dispatch

For each sub-task, run the following sequence:

```bash
# 1. Create the worktree and branch in the TARGET project directory
git -C <project-dir> worktree add .wt/<slug> -b feat/<slug>

# 2. Write the task manifest so the main session can track it
# File: <project-dir>/.cliorch/tasks/<slug>.json
# Content:
{
  "id": "<slug>",
  "branch": "feat/<slug>",
  "worktree": ".wt/<slug>",
  "status": "pending",
  "startedAt": null,
  "completedAt": null,
  "output": null,
  "errors": []
}

# 3. Launch cliorch in the worktree directory (background or new terminal)
cd <project-dir>/.wt/<slug> && node <cliorch-path>/src/cli.js do \
  --task "<sub-task description>" \
  --strategy <strategy_name>
```

**Use `dispatch-task.sh` to automate the above:**

```bash
bash dispatch-task.sh <project-dir> <slug> "<task>" <strategy> <cliorch-path>
```

### Phase 3: Session Sync (Polling)

The main Session polls the manifest directory to track all sub-task statuses:

```bash
node wt-status.js <project-dir>
```

Output:
```
TASK            BRANCH                        STATUS      STARTED
------------------------------------------------------------------------
feat-auth       feat/feat-auth                done        2026-03-06 10:00:00
feat-tests      feat/feat-tests               running     2026-03-06 10:01:00
feat-docs       feat/feat-docs                pending     -

Summary: 1 done, 1 running, 0 failed, 1 pending / 3 total
```

Repeat until all tasks are `done` or `failed` before proceeding to merge.

### Phase 4: Result Coupling (Merge)

```bash
bash wt-merge.sh <project-dir> [--skip-failed]
```

Merges all `done` branches in dependency order (respecting `dependsOn`). On conflict, presents 4-option HITL:
```
[1] Open mergetool (resolve manually)
[2] Abort this branch (skip)
[3] Accept ours (keep main)
[4] Accept theirs (use branch)
```

**Dependency ordering:** Declare dependencies in the manifest:
```json
{
  "id": "feat-tests",
  "dependsOn": ["feat-auth"],
  "...": "..."
}
```

### Phase 5: Verify & Cleanup

```bash
# Run integration tests after all merges
npm test  # or your project's test command

# Clean up worktrees after successful merge
git worktree list
git worktree remove .wt/feat-auth
git worktree remove .wt/feat-tests

# Clean up manifests
rm -rf .cliorch/tasks/
```

---

## Existing cliorch Capabilities Reference

| Command | Purpose |
|---------|----------|
| `cliorch do --task "..." --strategy <name>` | Execute a task end-to-end |
| `cliorch plan --task "..."` | Generate a plan JSON without executing |
| `cliorch run --plan <path>` | Execute a pre-generated plan |
| `cliorch options` | Show strategy / stage / LLM options |
| `cliorch models` | List available models from all providers |
| `cliorch status` | Show CLI registry status |
| `cliorch redteam` | Print security red-team checklist |

## Known Architecture Notes

- cliorch stores session artifacts in its own `plans/`, `logs/`, `outputs/` directories (relative to CLI_Runner root).
- Cross-session worktree manifests live in the **target project's** `.cliorch/tasks/` directory to be accessible to all CLI instances.
- The `ContextManager` (`src/memory/contextManager.js`) persists failure knowledge across sessions — each sub-CLI instance benefits from shared memory if CLI_Runner root is the same.
- HITL gating (`askApproval.js`) blocks dangerous commands; worktree merge conflicts follow the same HITL pattern.
- All drivers support `api_mode: 'anthropic'` for direct API calls without subprocess overhead.
