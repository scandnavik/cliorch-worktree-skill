# CLI_Runner (cliorch) v3

Thin dispatcher that delegates coding tasks to local CLI agents — **codex**, **gemini**, **copilot**.

Designed to be called by Claude Code (or any AI orchestrator) to save tokens by offloading execution work to free/cheaper CLIs.

## Architecture

```
Claude Code (brain)  →  CLI_Runner (dispatcher)  →  codex / gemini / copilot (hands)
                              ↕
                     .cliorch/tasks/*.json (status tracking)
```

Claude Code handles planning, decomposition, and quality control.
CLI_Runner routes the task to the right CLI and tracks completion.

## Prerequisites

- Node.js 18+
- At least one of: `codex`, `gemini`, `copilot` installed globally

## Usage

### Single Task

```bash
node src/cli.js run --task "Implement auth module" --cli codex --dir /projects/myapp
```

### Check Available CLIs

```bash
node src/cli.js status
```

### Multi-Worktree (Parallel)

```bash
# Dispatch sub-tasks into isolated worktrees
bash dispatch.sh /projects/myapp feat-auth "Implement auth" codex
bash dispatch.sh /projects/myapp feat-tests "Write tests" gemini

# Monitor progress
node wt-status.js /projects/myapp

# Merge completed branches
bash wt-merge.sh /projects/myapp
```

## Files

| File | Purpose |
|------|---------|
| `src/cli.js` | Entry point: `run`, `status`, `models` |
| `src/executor.js` | Shell out to CLI tools |
| `src/registry.js` | CLI detection |
| `config/cli-registry.json` | CLI command templates |
| `dispatch.sh` | Worktree task dispatcher |
| `wt-status.js` | Status polling |
| `wt-merge.sh` | Merge with HITL conflict resolution |
| `SKILL.md` | Claude Code skill definition |

## Install as Claude Code Skill

```bash
cp SKILL.md ~/.claude/skills/cli-runner/SKILL.md
```

## License

MIT
