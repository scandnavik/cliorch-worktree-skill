#!/bin/bash
# dispatch-task.sh — Wrapper to dispatch a cliorch sub-task into a git worktree
#
# Usage:
#   bash dispatch-task.sh <project-dir> <slug> <task> <strategy> <cliorch-path>
#
# Arguments:
#   project-dir   Absolute path to the target project root
#   slug          Short identifier for this sub-task (e.g. feat-auth)
#   task          Full task description string (quote it)
#   strategy      cliorch strategy name (e.g. default, fast_code)
#   cliorch-path  Absolute path to CLI_Runner root
#
# Example:
#   bash dispatch-task.sh /projects/myapp feat-auth "Rewrite auth module" default /tools/CLI_Runner

set -euo pipefail

PROJECT_DIR="$1"
SLUG="$2"
TASK="$3"
STRATEGY="$4"
CLIORCH="$5"

TASK_DIR="$PROJECT_DIR/.cliorch/tasks"
MANIFEST="$TASK_DIR/$SLUG.json"
WORKTREE="$PROJECT_DIR/.wt/$SLUG"
BRANCH="feat/$SLUG"

# Ensure manifest directory exists
mkdir -p "$TASK_DIR"

# Write initial manifest if not already present
if [ ! -f "$MANIFEST" ]; then
  node -e "
    const fs=require('fs');
    fs.writeFileSync('$MANIFEST', JSON.stringify({
      id: '$SLUG',
      branch: '$BRANCH',
      worktree: '.wt/$SLUG',
      status: 'pending',
      startedAt: null,
      completedAt: null,
      output: null,
      errors: []
    }, null, 2));
  "
fi

# Create worktree and branch
git -C "$PROJECT_DIR" worktree add "$WORKTREE" -b "$BRANCH" 2>/dev/null || {
  echo "[dispatch] Worktree .wt/$SLUG already exists, reusing."
}

# Mark as running
node -e "
  const fs=require('fs');
  const m=JSON.parse(fs.readFileSync('$MANIFEST','utf8'));
  m.status='running';
  m.startedAt=new Date().toISOString();
  fs.writeFileSync('$MANIFEST',JSON.stringify(m,null,2));
"

echo "[dispatch] Starting sub-task: $SLUG"
echo "[dispatch] Branch:   $BRANCH"
echo "[dispatch] Task:     $TASK"
echo "[dispatch] Strategy: $STRATEGY"

# Execute cliorch in the worktree
cd "$WORKTREE" && node "$CLIORCH/src/cli.js" do \
  --task "$TASK" \
  --strategy "$STRATEGY"
EXIT=$?

# Update manifest with final status
node -e "
  const fs=require('fs');
  const m=JSON.parse(fs.readFileSync('$MANIFEST','utf8'));
  m.status=$EXIT===0?'done':'failed';
  m.completedAt=new Date().toISOString();
  fs.writeFileSync('$MANIFEST',JSON.stringify(m,null,2));
"

if [ $EXIT -eq 0 ]; then
  echo "[dispatch] DONE: $SLUG"
else
  echo "[dispatch] FAILED: $SLUG (exit $EXIT)"
fi

exit $EXIT
