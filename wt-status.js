#!/usr/bin/env node
// wt-status.js — Print status of all dispatched worktree sub-tasks
//
// Usage:
//   node wt-status.js <project-dir>

const fs = require('fs');
const path = require('path');

const projectDir = process.argv[2];
if (!projectDir) {
  console.error('Usage: node wt-status.js <project-dir>');
  process.exit(1);
}

const taskDir = path.join(projectDir, '.cliorch', 'tasks');

if (!fs.existsSync(taskDir)) {
  console.log('No tasks dispatched yet (no .cliorch/tasks directory found).');
  process.exit(0);
}

const tasks = fs.readdirSync(taskDir)
  .filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(fs.readFileSync(path.join(taskDir, f), 'utf8')));

if (tasks.length === 0) {
  console.log('No task manifests found.');
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n);
const STATUS_ICON = { pending: '...', running: '[~]', done: '[+]', failed: '[x]' };

console.log('');
console.log(pad('TASK', 16) + pad('BRANCH', 30) + pad('STATUS', 12) + 'STARTED');
console.log('-'.repeat(72));

tasks.forEach(t => {
  const icon = STATUS_ICON[t.status] || '?';
  const started = t.startedAt ? t.startedAt.replace('T', ' ').slice(0, 19) : '-';
  console.log(pad(t.id, 16) + pad(t.branch, 30) + pad(icon + ' ' + t.status, 12) + started);
});

const done = tasks.filter(t => t.status === 'done').length;
const failed = tasks.filter(t => t.status === 'failed').length;
const running = tasks.filter(t => t.status === 'running').length;
const pending = tasks.filter(t => t.status === 'pending').length;

console.log('');
console.log(`Summary: ${done} done, ${running} running, ${failed} failed, ${pending} pending / ${tasks.length} total`);

if (failed > 0) {
  console.log('');
  console.log('Failed tasks:');
  tasks.filter(t => t.status === 'failed').forEach(t => {
    console.log(`  - ${t.id} (${t.branch})`);
    if (t.errors && t.errors.length > 0) {
      t.errors.forEach(e => console.log(`    Error: ${e}`));
    }
  });
}

process.exit(failed > 0 ? 1 : 0);
