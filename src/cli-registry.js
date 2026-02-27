// src/cli-registry.js
// CLI Registry Module - Manages available CLI tools

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class CLIRegistry {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(__dirname, 'config', 'cli-registry.json');
    this.registry = this.loadRegistry();
    this.updateInstalledStatus();
  }

  /**
   * Load CLI registry from JSON config file
   */
  loadRegistry() {
    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`Failed to load CLI registry: ${error.message}`);
      throw new Error('Cannot load CLI registry configuration');
    }
  }

  /**
   * Check which CLIs are actually installed
   */
  updateInstalledStatus() {
    Object.keys(this.registry).forEach((cliName) => {
      this.registry[cliName].installed = this.isCliInstalled(cliName);
    });
  }

  /**
   * Check if a specific CLI is installed
   */
  isCliInstalled(cliName) {
    if (!this.registry[cliName]) {
      return false;
    }

    const command = this.registry[cliName].command;
    try {
      // Try to run CLI with --version flag
      execSync(`${command} --version`, { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get CLI info by name
   */
  getCliInfo(cliName) {
    return this.registry[cliName] || null;
  }

  /**
   * Get all registered CLIs
   */
  getAllClis() {
    return this.registry;
  }

  /**
   * Get all available (installed) CLIs
   */
  getAvailableClis() {
    return Object.values(this.registry).filter((cli) => cli.installed);
  }

  /**
   * Get CLIs by capability
   */
  getClisByCapability(capability) {
    return Object.entries(this.registry)
      .filter(([, cli]) => cli.capabilities.includes(capability) && cli.installed)
      .map(([name, cli]) => ({ name, ...cli }));
  }

  /**
   * Get list of CLIs supporting a specific capability
   */
  canHandle(taskType) {
    const capabilityMap = {
      generate: 'code_generation',
      review: 'code_review',
      debug: 'debugging',
      refactor: 'refactoring'
    };

    const capability = capabilityMap[taskType];
    if (!capability) {
      return [];
    }

    return this.getClisByCapability(capability);
  }

  /**
   * Get recommended CLI for a task type
   */
  recommendCliForTask(taskType) {
    const candidates = this.canHandle(taskType);
    if (candidates.length === 0) {
      return null;
    }
    // MVP: return the first available CLI with name property
    const cli = candidates[0];
    return { name: cli.name || cli.command, ...cli };
  }

  /**
   * Print registry status
   */
  printStatus() {
    console.log('\n=== CLI Registry Status ===');
    Object.entries(this.registry).forEach(([name, cli]) => {
      const status = cli.installed ? '✅ Installed' : '❌ Not Installed';
      console.log(`${name}: ${status}`);
      console.log(`  Command: ${cli.command}`);
      console.log(`  Capabilities: ${cli.capabilities.join(', ')}`);
    });
    console.log('');
  }
}

module.exports = CLIRegistry;
