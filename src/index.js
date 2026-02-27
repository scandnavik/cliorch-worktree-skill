#!/usr/bin/env node
// src/index.js
// Main entry point and CLI tool

const CLIRegistry = require('./cli-registry');
const Executor = require('./executor');
const ResultParser = require('./result-parser');
const SimpleReviewer = require('./simple-reviewer');
const Orchestrator = require('./orchestrator');

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const command = args[0];
  const input = args.slice(1).join(' ');

  // Initialize components
  const registry = new CLIRegistry();
  const executor = new Executor(registry);
  const parser = new ResultParser();
  const reviewer = new SimpleReviewer();
  const orchestrator = new Orchestrator(registry, executor, parser, reviewer);

  try {
    if (command === 'status') {
      registry.printStatus();
      const status = orchestrator.getStatus();
      console.log('=== Orchestrator Status ===');
      console.log(`Available CLIs: ${status.availableClis}/${status.totalClis}`);
      console.log('');
    } else if (command === 'generate' && input) {
      console.log('🚀 Starting code generation...\n');
      const result = await orchestrator.orchestrate('generate', input);
      displayResult(result);
    } else if (command === 'review' && input) {
      console.log('🔍 Starting code review...\n');
      const result = await orchestrator.orchestrate('review', input);
      displayResult(result);
    } else if (command === 'help') {
      printHelp();
    } else {
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

function displayResult(result) {
  if (!result.success) {
    console.log('❌ Failed:', result.error);
    return;
  }

  console.log('✅ Success!\n');
  console.log('=== Result ===');
  console.log(`Task: ${result.taskType}`);
  console.log(`CLI Used: ${result.cliUsed}`);
  console.log(`Duration: ${result.duration}ms`);
  console.log(`\n${result.result.content}\n`);

  console.log('=== Review ===');
  console.log(`Score: ${result.review.score}`);
  console.log(`Summary: ${result.review.summary}`);
  console.log('Checks:');
  result.review.checks.forEach((check) => {
    console.log(`  ${check}`);
  });

  console.log('\n=== Details ===');
  console.log(JSON.stringify(result.review.details, null, 2));
}

function printUsage() {
  console.log(`
Usage: orchestrator <command> [options]

Commands:
  generate <prompt>     Generate code using Gemini
  review <text>         Review code using Copilot
  status                Show CLI registry status
  help                  Show this help message

Examples:
  orchestrator generate "Write a function to check if a number is prime"
  orchestrator review "function add(a, b) { return a + b; }"
  orchestrator status
  `);
}

function printHelp() {
  console.log(`
Cloud Code Orchestrator - MVP

This tool routes coding tasks to different AI CLI tools.

Tasks:
  - generate: Uses Gemini CLI to generate code
  - review: Uses Copilot CLI to review code

Requirements:
  - Gemini CLI installed: npm install -g @google/gemini-cli
  - Copilot CLI installed: npm install -g @github/copilot

Status:
  Run 'orchestrator status' to see which CLIs are available

Examples:
  orchestrator generate "Write a sorting function"
  orchestrator review "const x = 1"

For more info:
  - https://geminicli.com/docs/
  - https://docs.github.com/en/copilot/how-tos/copilot-cli/

  `);
}

// Run main
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { CLIRegistry, Executor, ResultParser, SimpleReviewer, Orchestrator };
