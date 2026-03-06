#!/bin/bash
# wt-merge.sh — Sequentially merge all done worktree branches with HITL on conflict
#
# Usage:
#   bash wt-merge.sh <project-dir> [--skip-failed]
#
# Arguments:
#   project-dir    Absolute path to the target project root
#   --skip-failed  Skip tasks not in 'done' status
#
# Example:
#   bash wt-merge.sh /projects/myapp --skip-failed

set -uo pipefail

PROJECT_DIR="$1"
SKIP_FAILED=false
[[ "${2:-}" == "--skip-failed" ]] && SKIP_FAILED=true

TASK_DIR="$PROJECT_DIR/.cliorch/tasks"

if [ ! -d "$TASK_DIR" ]; then
  echo "[wt-merge] No task manifests found at $TASK_DIR"
  exit 1
fi

# Read tasks, topological sort by dependsOn, filter to done only
BRANCHES=$(node -e "
  const fs=require('fs'), path=require('path');
  const tasks=fs.readdirSync('$TASK_DIR')
    .filter(f=>f.endsWith('.json'))
    .map(f=>JSON.parse(fs.readFileSync(path.join('$TASK_DIR',f),'utf8')));
  const done=tasks.filter(t=>t.status==='done');
  const sorted=[];
  const visited=new Set();
  function visit(t){
    if(visited.has(t.id)) return;
    (t.dependsOn||[]).forEach(dep=>{
      const d=done.find(x=>x.id===dep);
      if(d) visit(d);
    });
    visited.add(t.id);
    sorted.push(t.branch);
  }
  done.forEach(t=>visit(t));
  console.log(sorted.join('\\n'));
")

if [ -z "$BRANCHES" ]; then
  echo "[wt-merge] No 'done' tasks to merge."
  exit 0
fi

echo "[wt-merge] Merge order:"
echo "$BRANCHES" | while read -r b; do echo "  - $b"; done
echo ""

cd "$PROJECT_DIR"

echo "$BRANCHES" | while IFS= read -r BRANCH; do
  [ -z "$BRANCH" ] && continue
  echo "[wt-merge] Merging $BRANCH..."
  git merge --no-ff "$BRANCH" -m "merge: integrate $BRANCH"

  if [ $? -ne 0 ]; then
    echo ""
    echo "[wt-merge] CONFLICT in $BRANCH"
    echo "  [1] Open mergetool"
    echo "  [2] Skip this branch"
    echo "  [3] Accept ours"
    echo "  [4] Accept theirs"
    read -p "> " choice
    case $choice in
      1) git mergetool; git merge --continue --no-edit ;;
      2) git merge --abort; echo "[wt-merge] Skipped $BRANCH" ;;
      3) git checkout --ours . && git add . && git merge --continue --no-edit ;;
      4) git checkout --theirs . && git add . && git merge --continue --no-edit ;;
      *) echo "[wt-merge] Invalid. Aborting."; git merge --abort ;;
    esac
  else
    echo "[wt-merge] Merged $BRANCH OK."
  fi
  echo ""
done

echo "[wt-merge] Done. Run tests, then clean up:"
echo "  git worktree remove .wt/<slug>"
echo "  rm -rf .cliorch/tasks/"
