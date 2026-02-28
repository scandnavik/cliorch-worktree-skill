// src/executor.js
// Executor Module - Safely executes CLI commands

const { execFile } = require('child_process');
const util = require('util');
const execFilePromise = util.promisify(execFile);

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

    // SECURITY: Validate prompt before execution to prevent injection
    if (!this.validatePrompt(prompt)) {
      return {
        success: false,
        error: `Prompt rejected: contains dangerous shell metacharacters`
      };
    }

    // Route to direct API call for providers that support it
    if (cliInfo.api_mode === 'anthropic') {
      return this._executeViaAnthropicAPI(cliName, prompt, options, cliInfo);
    }

    const command = cliInfo.command;
    const timeout = options.timeout || 30000; // 30 seconds default

    try {
      // On Windows, shell: true concatenates args without proper quoting, so
      // newlines in the prompt would be interpreted as command separators by
      // cmd.exe. Normalize to spaces to prevent shell parse errors.
      const isWindows = process.platform === 'win32';
      const safePrompt = isWindows ? prompt.replace(/\r?\n/g, ' ') : prompt;

      // Build command args based on CLI's args_format
      const argsFormat = cliInfo.args_format || '-p';
      let cmdArgs;
      if (argsFormat === 'subcommand' && cliInfo.args_template) {
        // e.g. "exec {prompt}" → ['exec', prompt]
        const parts = cliInfo.args_template.split(' ');
        cmdArgs = parts.map(p => p === '{prompt}' ? safePrompt : p);
      } else {
        // Default: -p "prompt"
        cmdArgs = [argsFormat, safePrompt];
      }

      // Add dynamic model if specified by the strategy layer
      if (options.model) {
        if (command === 'node' && argsFormat === '-e') {
          cmdArgs.push('--', '--model', options.model);
        } else {
          cmdArgs.push('--model', options.model);
        }
      }

      const cmdDisplay = `${command} ${cmdArgs.map(a => a === prompt ? `"${prompt}"` : a).join(' ')}`;
      console.log(`[${cliName}] Executing: ${cmdDisplay}`);

      // SECURITY: Always use execFile with args array to prevent shell injection.
      // On Windows, shell: true is needed for .cmd/.ps1 wrappers but execFile
      // still keeps arguments properly separated (no string concatenation).
      const result = await execFilePromise(
        command,
        cmdArgs,
        {
          timeout,
          maxBuffer: 10 * 1024 * 1024,
          encoding: 'utf-8',
          shell: isWindows
        }
      );
      const stdout = result.stdout;
      const stderr = result.stderr;

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
   * Execute via Anthropic Messages API directly (no subprocess).
   * Requires ANTHROPIC_API_KEY env var.
   */
  async _executeViaAnthropicAPI(cliName, prompt, options, cliInfo) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error: 'ANTHROPIC_API_KEY not set. Required for claude api_mode.'
      };
    }

    const model = options.model || cliInfo.default_model || 'claude-haiku-4-5-20251001';
    const timeout = options.timeout || 60000;
    console.log(`[${cliName}] Calling Anthropic API (model: ${model})...`);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!res.ok) {
        const body = await res.text();
        return {
          success: false,
          cliName,
          error: `Anthropic API ${res.status}: ${body}`,
          exitCode: res.status
        };
      }

      const data = await res.json();
      const text = (data.content || [])
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');

      console.log(`[${cliName}] API response received (${text.length} chars)`);

      return {
        success: true,
        cliName,
        command: 'anthropic-api',
        prompt,
        output: text,
        stderr: '',
        exitCode: 0
      };
    } catch (error) {
      return {
        success: false,
        cliName,
        error: error.name === 'AbortError'
          ? `Anthropic API timed out after ${timeout}ms`
          : error.message,
        exitCode: -1
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

    // SECURITY: Reject prompts containing shell metacharacters to prevent injection.
    // Since we use execFile (args array), parentheses/brackets are safe.
    // Block: backtick, $( command substitution, pipe, ampersand, semicolon
    const dangerous = /[`|&;]|\$\(/;
    if (dangerous.test(prompt)) {
      console.error(`🚨 [SECURITY] Prompt rejected — dangerous shell metacharacters detected`);
      return false;
    }

    return true;
  }
}

module.exports = Executor;
