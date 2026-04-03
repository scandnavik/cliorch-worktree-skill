// src/registry.js — CLI detection and command templates

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class CLIRegistry {
  constructor() {
    const configPath = path.join(__dirname, '..', 'config', 'cli-registry.json');
    this.registry = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    this._detectInstalled();
  }

  _detectInstalled() {
    for (const [, info] of Object.entries(this.registry)) {
      try {
        execSync(`${info.command} --version`, { stdio: 'ignore', timeout: 5000 });
        info.installed = true;
      } catch {
        info.installed = false;
      }
    }
  }

  getCliInfo(name) {
    return this.registry[name] || null;
  }

  getAllClis() {
    return this.registry;
  }

  printStatus() {
    console.log('\n=== CLI Registry ===');
    for (const [name, info] of Object.entries(this.registry)) {
      const icon = info.installed ? '✅' : '❌';
      console.log(`${icon} ${name} (${info.command}) — ${info.capabilities.join(', ')}`);
    }
    console.log('');
  }
}

module.exports = CLIRegistry;
