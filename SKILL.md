# CLI_Runner Operator Skill

Delegate coding tasks to local CLI agents (codex, gemini, copilot) to save Claude Code tokens.

**Claude Code = brain (plan, decompose, QA). Sub-CLIs = hands (execute).**

## CLI_Runner Path

`C:\Users\User\CLI_Runner`

## When to Use

- File-level code generation, refactoring, bug fixes that don't need Claude's judgment
- Repetitive modifications across multiple files
- Tasks where speed matters more than precision
- Parallel independent sub-tasks across git worktrees

## When NOT to Use

- Tasks requiring deep codebase understanding or cross-file reasoning
- Security-sensitive changes
- Architecture decisions

---

## Single Task Mode

```bash
node C:/Users/User/CLI_Runner/src/cli.js run --task "<description>" --cli <name> [--dir <path>] [--timeout <ms>]
```

### CLI Selection Guide

| CLI | Best For | Notes |
|-----|----------|-------|
| **codex** | Code generation, refactoring | `codex exec --yolo` — 跳過 sandbox 避免 [hang bug](https://github.com/openai/codex/issues/7852) |
| **gemini** | Analysis, review, broad generation | `gemini -p` — fast, free |
| **copilot** | Code suggestions | Standalone CLI |

### Example

```bash
# Generate a utility module with codex
node C:/Users/User/CLI_Runner/src/cli.js run \
  --task "Create a date formatting utility in src/utils/date.js with ISO, relative, and locale-aware formats" \
  --cli codex \
  --dir /projects/myapp
```

---

## Multi-Worktree Mode (Parallel Tasks)

Use when a large task can be split into independent sub-tasks with no file overlap.

### Phase 1: Plan (Claude Code does this)

Break the task into independent sub-tasks. Each must:
- Operate on distinct files (no overlap)
- Have a clear acceptance condition
- Be named with a short slug

### Phase 2: Dispatch

```bash
bash C:/Users/User/CLI_Runner/dispatch.sh <project-dir> <slug> "<task>" <cli>
```

Example:
```bash
# Launch in parallel (background each one)
bash C:/Users/User/CLI_Runner/dispatch.sh /projects/app feat-auth "Implement JWT auth middleware" codex &
bash C:/Users/User/CLI_Runner/dispatch.sh /projects/app feat-logger "Add structured logging with pino" gemini &
wait
```

### Phase 3: Monitor

```bash
node C:/Users/User/CLI_Runner/wt-status.js <project-dir>
```

Output:
```
TASK            CLI       BRANCH                      STATUS      STARTED
------------------------------------------------------------------------------
feat-auth       codex     feat/feat-auth              [+] done    2026-04-03 14:00:00
feat-logger     gemini    feat/feat-logger             [~] running 2026-04-03 14:00:01
```

### Phase 4: Merge

```bash
bash C:/Users/User/CLI_Runner/wt-merge.sh <project-dir> [--skip-failed]
```

Merges done branches sequentially. On conflict: prompts HITL (mergetool / skip / ours / theirs).

### Phase 5: Cleanup

```bash
git -C <project-dir> worktree remove .wt/<slug>
rm -rf <project-dir>/.cliorch/tasks/
```

---

## Check Available CLIs

```bash
node C:/Users/User/CLI_Runner/src/cli.js status
```
