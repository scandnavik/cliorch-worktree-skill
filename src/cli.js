#!/usr/bin/env node
// src/cli.js — cliorch v3: thin dispatcher for codex / gemini / copilot

const path = require('path');
const CLIRegistry = require('./registry');
const Executor = require('./executor');

const args = process.argv.slice(2);
const command = args[0];

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

function usage() {
  console.log(`
cliorch v3 — Delegate tasks to codex / gemini / copilot

Commands:
  cliorch run    --task "..." --cli <name> [--dir <path>] [--timeout <ms>]
  cliorch status                           Show installed CLIs
  cliorch models                           List CLI capabilities
`);
}

async function runCommand() {
  const task = getArg('--task');
  const cli = getArg('--cli');
  const dir = getArg('--dir');
  const timeout = parseInt(getArg('--timeout') || '300000', 10);

  if (!task || !cli) {
    console.error('Usage: cliorch run --task "..." --cli <codex|gemini|copilot>');
    process.exit(1);
  }

  const registry = new CLIRegistry();
  const executor = new Executor(registry);

  if (dir) process.chdir(path.resolve(dir));

  console.log(`\n[cliorch] CLI:  ${cli}`);
  console.log(`[cliorch] Dir:  ${process.cwd()}`);
  console.log(`[cliorch] Task: ${task.substring(0, 100)}${task.length > 100 ? '...' : ''}`);
  console.log('');

  const result = await executor.execute(cli, task, { timeout });

  if (result.success) {
    console.log(`\n[cliorch] Done.`);
    if (result.output) process.stdout.write(result.output);
  } else {
    console.error(`\n[cliorch] Failed: ${result.error}`);
    if (result.output) process.stdout.write(result.output);
    process.exit(1);
  }
}

function statusCommand() {
  const registry = new CLIRegistry();
  registry.printStatus();
}

function modelsCommand() {
  const registry = new CLIRegistry();
  const clis = registry.getAllClis();
  console.log('\n=== Available CLIs ===');
  for (const [name, info] of Object.entries(clis)) {
    const icon = info.installed ? '✅' : '❌';
    console.log(`${icon} ${name}: ${info.capabilities.join(', ')}`);
  }
  console.log('');
}

switch (command) {
  case 'run':
    runCommand().catch(e => { console.error(e.message); process.exit(1); });
    break;
  case 'status':
    statusCommand();
    break;
  case 'models':
    modelsCommand();
    break;
  default:
    usage();
}
