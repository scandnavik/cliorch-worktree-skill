// tests/poc.js
// Proof of Concept test script

const CLIRegistry = require('../src/cli-registry');
const Executor = require('../src/executor');
const ResultParser = require('../src/result-parser');
const SimpleReviewer = require('../src/simple-reviewer');
const Orchestrator = require('../src/orchestrator');

async function runTests() {
  console.log('=== Cloud Code Orchestrator PoC ===\n');

  // Initialize components
  const registry = new CLIRegistry();
  const executor = new Executor(registry);
  const parser = new ResultParser();
  const reviewer = new SimpleReviewer();
  const orchestrator = new Orchestrator(registry, executor, parser, reviewer);

  // Check status
  console.log('--- Step 1: Check CLI Status ---');
  registry.printStatus();

  const available = registry.getAvailableClis();
  if (available.length < 2) {
    console.log(
      '⚠️  Not enough CLIs installed (need at least 2). Please install:'
    );
    console.log('  npm install -g @google/gemini-cli');
    console.log('  npm install -g @github/copilot');
    return;
  }

  console.log('--- Step 2: Test Code Generation (Gemini) ---');
  try {
    const genResult = await orchestrator.orchestrate(
      'generate',
      'Write a function to check if a number is prime in JavaScript'
    );
    if (!genResult.success) {
      console.log('Error:', genResult.error);
    } else {
      console.log('Result:', genResult.review.score);
      console.log('Output preview:', genResult.result.content.substring(0, 100) + '...');
      console.log('Checks:', genResult.review.checks);
    }
  } catch (error) {
    console.log('Test failed:', error.message);
  }

  console.log('\n--- Step 3: Test Code Review (Copilot) ---');
  try {
    const reviewResult = await orchestrator.orchestrate(
      'review',
      'function add(a, b) { return a + b; }'
    );
    if (!reviewResult.success) {
      console.log('Error:', reviewResult.error);
    } else {
      console.log('Result:', reviewResult.review.score);
      console.log(
        'Output preview:',
        reviewResult.result.content.substring(0, 100) + '...'
      );
      console.log('Checks:', reviewResult.review.checks);
    }
  } catch (error) {
    console.log('Test failed:', error.message);
  }

  console.log('\n=== PoC Complete ===\n');
}

// Run tests
if (require.main === module) {
  runTests().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runTests };
