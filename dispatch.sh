#!/bin/bash
# dispatch.sh — Dispatch a task to a CLI in a git worktree
#
# Usage: bash dispatch.sh <project-dir> <slug> <task> <cli>
#
# Example:
#   bash dispatch.sh /projects/myapp feat-auth "Implement auth module" codex

set -euo pipefail

PROJECT_DIR="$1"
SLUG="$2"
TASK="$3"
CLI="$4"
CLIORCH_DIR="$(cd "$(dirname "$0")" && pwd)"

TASK_DIR="$PROJECT_DIR/.cliorch/tasks"
MANIFEST="$TASK_DIR/$SLUG.json"
WORKTREE="$PROJECT_DIR/.wt/$SLUG"
BRANCH="feat/$SLUG"

mkdir -p "$TASK_DIR"

# Write initial manifest
node -e "
  const fs = require('fs');
  fs.writeFileSync('$MANIFEST', JSON.stringify({
    id: '$SLUG',
    branch: '$BRANCH',
    worktree: '.wt/$SLUG',
    cli: '$CLI',
    status: 'pending',
    startedAt: null,
    completedAt: null,
    errors: []
  }, null, 2));
"

# Create worktree and branch
git -C "$PROJECT_DIR" worktree add "$WORKTREE" -b "$BRANCH" 2>/dev/null || {
  echo "[dispatch] Worktree .wt/$SLUG already exists, reusing."
}

# Mark as running
node -e "
  const fs = require('fs');
  const m = JSON.parse(fs.readFileSync('$MANIFEST', 'utf8'));
  m.status = 'running';
  m.startedAt = new Date().toISOString();
  fs.writeFileSync('$MANIFEST', JSON.stringify(m, null, 2));
"

echo "[dispatch] $SLUG → $CLI"
echo "[dispatch] Branch: $BRANCH"

# Execute via cliorch
cd "$WORKTREE" && node "$CLIORCH_DIR/src/cli.js" run --task "$TASK" --cli "$CLI"
EXIT=$?

# Update manifest with result
node -e "
  const fs = require('fs');
  const m = JSON.parse(fs.readFileSync('$MANIFEST', 'utf8'));
  m.status = $EXIT === 0 ? 'done' : 'failed';
  m.completedAt = new Date().toISOString();
  fs.writeFileSync('$MANIFEST', JSON.stringify(m, null, 2));
"

[ $EXIT -eq 0 ] && echo "[dispatch] DONE: $SLUG" || echo "[dispatch] FAILED: $SLUG (exit $EXIT)"
exit $EXIT
