// tests/demo.js
// Interactive demonstration without requiring CLIs to be installed

const CLIRegistry = require('../src/cli-registry');
const ResultParser = require('../src/result-parser');
const SimpleReviewer = require('../src/simple-reviewer');

// Simulated CLI outputs for demonstration
const SIMULATED_OUTPUTS = {
  generate: `\`\`\`javascript
function isPrime(n) {
  if (n <= 1) return false;
  if (n <= 3) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
}
\`\`\``,
  review: `The function add() is a simple addition function. 

Issues found:
1. No input validation - should check for valid numbers
2. No TypeScript type hints for better type safety
3. No JSDoc comments for documentation

Suggestions:
- Add input validation to handle edge cases
- Consider adding TypeScript types: (a: number, b: number) => number
- Add JSDoc comment explaining the function's purpose
- Consider handling large numbers or special cases like NaN/Infinity`
};

function demonstrateModules() {
  console.log('=== Cloud Code Orchestrator - Module Demonstration ===\n');

  // 1. Test CLI Registry
  console.log('--- 1. CLI Registry Module ---');
  const registry = new CLIRegistry();
  console.log('Loaded CLIs:', Object.keys(registry.registry));
  console.log('Gemini capabilities:', registry.registry.gemini.capabilities);
  console.log('Copilot capabilities:', registry.registry.copilot.capabilities);

  // 2. Test Result Parser - Code Generation
  console.log('\n--- 2. Result Parser Module (Code Generation) ---');
  const parser = new ResultParser();
  const genResult = parser.parse(
    {
      success: true,
      output: SIMULATED_OUTPUTS.generate,
      cliName: 'gemini'
    },
    'generate'
  );
  console.log('Parsed type:', genResult.type);
  console.log('Has code:', genResult.hasCode);
  console.log('Has error:', genResult.hasError);
  console.log('Code blocks found:', genResult.codeBlocks.length);
  console.log('Language detected:', genResult.language);
  console.log('Stats:', parser.getStats(genResult));

  // 3. Test Result Parser - Code Review
  console.log('\n--- 3. Result Parser Module (Code Review) ---');
  const reviewResult = parser.parse(
    {
      success: true,
      output: SIMULATED_OUTPUTS.review,
      cliName: 'copilot'
    },
    'review'
  );
  console.log('Parsed type:', reviewResult.type);
  console.log('Issues found:', reviewResult.issues.length);
  console.log('Suggestions found:', reviewResult.suggestions.length);
  console.log('Issues:', reviewResult.issues);
  console.log('Suggestions:', reviewResult.suggestions);
  console.log('Stats:', parser.getStats(reviewResult));

  // 4. Test Simple Reviewer - Code Generation
  console.log('\n--- 4. Simple Reviewer Module (Code Generation) ---');
  const reviewer = new SimpleReviewer();
  const genReview = reviewer.review(genResult);
  console.log('Score:', genReview.score);
  console.log('Summary:', reviewer.getSummary(genReview));
  console.log('Checks:');
  genReview.checks.forEach((check) => {
    console.log('  ' + check);
  });
  console.log('Details:', genReview.details);

  // 5. Test Simple Reviewer - Code Review
  console.log('\n--- 5. Simple Reviewer Module (Code Review) ---');
  const reviewReview = reviewer.review(reviewResult);
  console.log('Score:', reviewReview.score);
  console.log('Summary:', reviewer.getSummary(reviewReview));
  console.log('Checks:');
  reviewReview.checks.forEach((check) => {
    console.log('  ' + check);
  });
  console.log('Details:', reviewReview.details);

  // 6. Show complete workflow
  console.log('\n--- 6. Complete Workflow Example ---');
  console.log('\n📝 Scenario 1: Code Generation');
  console.log('Input: Write a function to check if a number is prime');
  console.log('CLI Used: gemini');
  console.log('');
  console.log('Generated Code:');
  console.log(SIMULATED_OUTPUTS.generate);
  console.log('');
  console.log('Quality Review:');
  console.log('  Score: ' + genReview.score);
  console.log('  Summary: ' + reviewer.getSummary(genReview));
  console.log('  ' + genReview.checks.join('\n  '));

  console.log('\n📝 Scenario 2: Code Review');
  console.log('Input: function add(a, b) { return a + b; }');
  console.log('CLI Used: copilot');
  console.log('');
  console.log('Review Output:');
  console.log(SIMULATED_OUTPUTS.review);
  console.log('');
  console.log('Quality Review:');
  console.log('  Score: ' + reviewReview.score);
  console.log('  Summary: ' + reviewer.getSummary(reviewReview));
  console.log('  ' + reviewReview.checks.join('\n  '));

  console.log('\n=== Demonstration Complete ===\n');
}

if (require.main === module) {
  demonstrateModules();
}

module.exports = { demonstrateModules };
