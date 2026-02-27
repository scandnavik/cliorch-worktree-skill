// src/executor.js
// Executor Module - Safely executes CLI commands

const { execFile, exec } = require('child_process');
const util = require('util');
const execFilePromise = util.promisify(execFile);
const execPromise = util.promisify(exec);

class Executor {
  constructor(registry) {
    this.registry = registry;
  }

  /**
   * Execute a CLI command with a prompt
   * @param {string} cliName - Name of the CLI to execute
   * @param {string} prompt - The prompt/input for the CLI
   * @param {object} options - Additional options
   * @returns {Promise<object>} Execution result
   */
  async execute(cliName, prompt, options = {}) {
    const cliInfo = this.registry.getCliInfo(cliName);

    if (!cliInfo) {
      return {
        success: false,
        error: `CLI '${cliName}' not found in registry`
      };
    }

    if (!cliInfo.installed) {
      return {
        success: false,
        error: `CLI '${cliName}' is not installed`
      };
    }

    const command = cliInfo.command;
    const timeout = options.timeout || 30000; // 30 seconds default

    try {
      // Build command args based on CLI's args_format
      const argsFormat = cliInfo.args_format || '-p';
      let cmdArgs;
      if (argsFormat === 'subcommand' && cliInfo.args_template) {
        // e.g. "exec {prompt}" → ['exec', prompt]
        const parts = cliInfo.args_template.split(' ');
        cmdArgs = parts.map(p => p === '{prompt}' ? prompt : p);
      } else {
        // Default: -p "prompt"
        cmdArgs = [argsFormat, prompt];
      }

      const cmdDisplay = `${command} ${cmdArgs.map(a => a === prompt ? `"${prompt}"` : a).join(' ')}`;
      console.log(`[${cliName}] Executing: ${cmdDisplay}`);

      const isWindows = process.platform === 'win32';
      let stdout, stderr;

      if (isWindows) {
        // Windows: npm packages are .cmd/.ps1, need shell with proper quoting
        const escaped = prompt.replace(/"/g, '\\"');
        let shellCmd;
        if (argsFormat === 'subcommand' && cliInfo.args_template) {
          const tmpl = cliInfo.args_template.replace('{prompt}', `"${escaped}"`);
          shellCmd = `${command} ${tmpl}`;
        } else {
          shellCmd = `${command} ${argsFormat} "${escaped}"`;
        }
        const result = await execPromise(
          shellCmd,
          {
            timeout,
            maxBuffer: 10 * 1024 * 1024,
            encoding: 'utf-8'
          }
        );
        stdout = result.stdout;
        stderr = result.stderr;
      } else {
        const result = await execFilePromise(
          command,
          cmdArgs,
          {
            timeout,
            maxBuffer: 10 * 1024 * 1024,
            encoding: 'utf-8'
          }
        );
        stdout = result.stdout;
        stderr = result.stderr;
      }

      return {
        success: true,
        cliName,
        command,
        prompt,
        output: stdout || stderr,
        stderr: stderr || '',
        exitCode: 0
      };
    } catch (error) {
      // Handle different error types
      let errorMsg = error.message;
      if (error.code === 'ETIMEDOUT') {
        errorMsg = `Command timed out after ${timeout}ms`;
      } else if (error.signal) {
        errorMsg = `Command killed by signal ${error.signal}`;
      }

      return {
        success: false,
        cliName,
        command,
        prompt,
        error: errorMsg,
        stderr: error.stderr || '',
        exitCode: error.code || -1,
        output: error.stdout || ''
      };
    }
  }

  /**
   * Execute with file input (for CLI tools that support @filename)
   * @param {string} cliName - Name of the CLI to execute
   * @param {string} filePath - Path to the file to process
   * @param {string} instruction - What to do with the file
   * @returns {Promise<object>} Execution result
   */
  async executeWithFile(cliName, filePath, instruction) {
    const cliInfo = this.registry.getCliInfo(cliName);

    if (!cliInfo) {
      return {
        success: false,
        error: `CLI '${cliName}' not found in registry`
      };
    }

    if (!cliInfo.supports_file_input) {
      return {
        success: false,
        error: `CLI '${cliName}' does not support file input`
      };
    }

    const prompt = `${instruction} @${filePath}`;
    return this.execute(cliName, prompt);
  }

  /**
   * Validate prompt to prevent injection
   * @param {string} prompt - The prompt to validate
   * @returns {boolean} True if prompt is valid
   */
  validatePrompt(prompt) {
    if (!prompt || typeof prompt !== 'string') {
      return false;
    }

    // Simple validation: no shell metacharacters for MVP
    const dangerous = /[`$(){}[\]|&;]/;
    if (dangerous.test(prompt)) {
      console.warn('Warning: Prompt contains potentially dangerous characters');
      // MVP: still allow but warn
    }

    return true;
  }
}

module.exports = Executor;
