// src/simple-reviewer.js
// Simple Reviewer Module - Basic quality review rules

class SimpleReviewer {
  /**
   * Review parsed result based on task type
   * @param {object} parsed - Parsed result from ResultParser
   * @returns {object} Review result with score and details
   */
  review(parsed) {
    if (!parsed.success) {
      return {
        score: 'FAIL',
        reason: 'Execution failed',
        checks: [],
        details: { error: parsed.error }
      };
    }

    const taskType = parsed.taskType;

    if (taskType === 'generate') {
      return this.reviewCodeGeneration(parsed);
    } else if (taskType === 'review') {
      return this.reviewCodeReview(parsed);
    }

    return {
      score: 'UNKNOWN',
      reason: 'Unknown task type',
      checks: [],
      details: {}
    };
  }

  /**
   * Review code generation results
   * Rules from Phase 0 research
   */
  reviewCodeGeneration(parsed) {
    const checks = [];
    let passedCount = 0;

    // Check 1: No syntax errors
    if (!parsed.hasError) {
      checks.push('✓ No syntax errors detected');
      passedCount++;
    } else {
      checks.push('✗ Contains error indicators');
    }

    // Check 2: Code length sufficient (>50 characters)
    if (parsed.content.length > 50) {
      checks.push('✓ Code length is sufficient');
      passedCount++;
    } else {
      checks.push('✗ Code length too short');
    }

    // Check 3: Has code structure
    if (parsed.hasCode || parsed.codeBlocks.length > 0) {
      checks.push('✓ Contains code structure');
      passedCount++;
    } else {
      checks.push('✗ No clear code structure');
    }

    // Check 4: Has code blocks (markdown style)
    if (parsed.codeBlocks && parsed.codeBlocks.length > 0) {
      checks.push('✓ Contains code blocks');
      passedCount++;
    } else {
      checks.push('⚠ No markdown code blocks (but may contain inline code)');
    }

    const score = passedCount >= 3 ? 'PASS' : 'FAIL';
    const summary = `Review ${score === 'PASS' ? 'passed' : 'failed'}: ${passedCount}/${checks.length} checks`;

    return {
      score,
      summary,
      passedChecks: passedCount,
      totalChecks: checks.length,
      checks,
      details: {
        taskType: 'code_generation',
        hasCode: parsed.hasCode,
        contentLength: parsed.content.length,
        codeBlockCount: parsed.codeBlocks ? parsed.codeBlocks.length : 0,
        language: parsed.language
      }
    };
  }

  /**
   * Review code review results
   * Rules from Phase 0 research
   */
  reviewCodeReview(parsed) {
    const checks = [];
    let passedCount = 0;

    // Check 1: Issues identified
    const hasIssues = parsed.issues && parsed.issues.length > 0;
    if (hasIssues) {
      checks.push(`✓ Found ${parsed.issues.length} issue(s)`);
      passedCount++;
    } else {
      checks.push('✗ No issues identified');
    }

    // Check 2: Suggestions provided
    const hasSuggestions = parsed.suggestions && parsed.suggestions.length > 0;
    if (hasSuggestions) {
      checks.push(`✓ Provided ${parsed.suggestions.length} suggestion(s)`);
      passedCount++;
    } else {
      checks.push('✗ No suggestions provided');
    }

    // Check 3: Sufficient feedback
    const contentQuality =
      parsed.content.length > 100 &&
      (hasIssues || hasSuggestions) &&
      !parsed.hasError;
    if (contentQuality) {
      checks.push('✓ Comprehensive feedback');
      passedCount++;
    } else {
      checks.push('✗ Feedback seems incomplete');
    }

    const score = passedCount >= 2 ? 'PASS' : 'FAIL';
    const summary = `Review ${score === 'PASS' ? 'passed' : 'failed'}: ${passedCount}/${checks.length} checks`;

    return {
      score,
      summary,
      passedChecks: passedCount,
      totalChecks: checks.length,
      checks,
      details: {
        taskType: 'code_review',
        issueCount: parsed.issues ? parsed.issues.length : 0,
        suggestionCount: parsed.suggestions ? parsed.suggestions.length : 0,
        hasIssues,
        hasSuggestions,
        contentLength: parsed.content.length
      }
    };
  }

  /**
   * Get review summary
   */
  getSummary(review) {
    if (!review || !review.score) {
      return 'No summary available';
    }
    const summary =
      review.score === 'PASS'
        ? `Review passed: ${review.passedChecks || 0}/${review.totalChecks || 0} checks`
        : `Review failed: ${review.passedChecks || 0}/${review.totalChecks || 0} checks`;

    return summary;
  }
}

module.exports = SimpleReviewer;
