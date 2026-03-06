# cliorch-worktree-skill

A [Claude Code](https://claude.ai/claude-code) skill that enables **multi-agent worktree workflow** on top of [CLI_Runner (cliorch)](https://github.com/scandnavik/claude-skills).

Solves two core problems when dispatching parallel AI tasks:
1. **Session Sync** — how does the main session know when sub-tasks are done?
2. **Result Coupling** — how do outputs from different worktrees (different CLI instances) get merged back?

---

## Overview

```
Main Orchestrator (Claude Code Session)
|
+-- Dispatch Task A --> git worktree .wt/feat-a --> cliorch instance A
+-- Dispatch Task B --> git worktree .wt/feat-b --> cliorch instance B
+-- Dispatch Task C --> git worktree .wt/feat-c --> cliorch instance C

Sync Layer (file-based)
.cliorch/tasks/
  task-a.json  { id, branch, worktree, status, startedAt, completedAt }
  task-b.json
  task-c.json

Merge Phase
  sequential git merge + HITL conflict resolution + integration tests
```

---

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | Claude Code skill definition (install this) |
| `dispatch-task.sh` | Shell wrapper to dispatch one sub-task into a worktree |
| `wt-status.js` | Node.js script to poll all task manifest statuses |
| `wt-merge.sh` | Shell script for sequential merge with HITL conflict resolution |

---

## Installation

Copy `SKILL.md` into your Claude Code skills directory:

```bash
# Option A: direct copy
cp SKILL.md ~/.claude/skills/cli-runner/SKILL.md

# Option B: clone and symlink
git clone https://github.com/scandnavik/cliorch-worktree-skill
ln -s $(pwd)/cliorch-worktree-skill/SKILL.md ~/.claude/skills/cli-runner/SKILL.md
```

Requires [CLI_Runner (cliorch)](https://github.com/scandnavik/claude-skills) to be installed.

---

## Workflow Phases

| Phase | Description |
|-------|-------------|
| 1. Plan | Decompose top-level task into independent sub-tasks (no file overlap) |
| 2. Dispatch | Create git worktrees + write task manifests + launch cliorch per sub-task |
| 3. Sync | Poll `.cliorch/tasks/*.json` until all sub-tasks are `done` or `failed` |
| 4. Merge | Sequential `git merge --no-ff` with HITL conflict resolution |
| 5. Verify | Run integration tests, clean up worktrees and manifests |

See [SKILL.md](./SKILL.md) for full protocol details including:
- `dispatch-task.sh` wrapper script
- Session sync polling script
- Merge loop with 4-option HITL
- `dependsOn` field for merge dependency ordering

---

## Key Design Decisions

- **File-based sync** (no Redis, no extra deps) — manifests live in the target project's `.cliorch/tasks/`
- **dispatch-task.sh wrapper** — updates manifest on entry/exit without modifying cliorch internals
- **HITL on merge conflict** — consistent with cliorch's `askApproval.js` pattern
- **dependsOn in manifest** — controls merge order for dependent sub-tasks

---

## Relationship to CLI_Runner

This skill extends [CLI_Runner](https://github.com/scandnavik/claude-skills) without modifying it. Future `cliorch wt-status` and `cliorch wt-merge` subcommands can be added to `src/cli.js` to replace the standalone scripts in this repo.

---

## License

MIT
