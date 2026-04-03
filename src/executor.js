// src/executor.js — Shell out to CLI tools

const { spawn } = require('child_process');

const IS_WINDOWS = process.platform === 'win32';

// On Windows with shell:true, spawn joins args with spaces.
// Args containing spaces must be explicitly quoted.
function quoteForShell(arg) {
  if (!IS_WINDOWS) return arg;
  if (!arg.includes(' ') && !arg.includes('"')) return arg;
  // Escape inner double quotes and wrap
  return `"${arg.replace(/"/g, '\\"')}"`;
}

class Executor {
  constructor(registry) {
    this.registry = registry;
  }

  execute(cliName, task, options = {}) {
    const info = this.registry.getCliInfo(cliName);
    if (!info) {
      return Promise.resolve({ success: false, error: `CLI '${cliName}' not registered` });
    }
    if (!info.installed) {
      return Promise.resolve({ success: false, error: `CLI '${cliName}' not installed` });
    }

    const safeTask = IS_WINDOWS ? task.replace(/\r?\n/g, ' ') : task;
    const timeout = options.timeout || 300000; // 5 min default

    // Build args: replace {task} placeholder, quote for Windows shell
    const cmdArgs = info.args
      .map(a => a === '{task}' ? safeTask : a)
      .map(quoteForShell);

    // Display preview
    const taskPreview = safeTask.length > 60 ? `"${safeTask.substring(0, 60)}..."` : `"${safeTask}"`;
    const displayArgs = info.args.map(a => a === '{task}' ? taskPreview : a).join(' ');
    console.log(`[${cliName}] ${info.command} ${displayArgs}`);

    return new Promise((resolve) => {
      const child = spawn(info.command, cmdArgs, {
        cwd: process.cwd(),
        timeout,
        shell: IS_WINDOWS,
        stdio: ['ignore', 'pipe', 'pipe'] // close stdin to prevent codex hang
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });

      child.on('close', (code, signal) => {
        if (signal) {
          resolve({
            success: false, cliName,
            error: `Killed by signal ${signal}`,
            output: stdout || stderr, exitCode: -1
          });
        } else if (code === 0) {
          resolve({
            success: true, cliName,
            output: stdout || stderr, exitCode: 0
          });
        } else {
          resolve({
            success: false, cliName,
            error: `Exited with code ${code}`,
            output: stdout || stderr, exitCode: code
          });
        }
      });

      child.on('error', (err) => {
        resolve({
          success: false, cliName,
          error: err.message, output: stdout, exitCode: -1
        });
      });
    });
  }
}

module.exports = Executor;
