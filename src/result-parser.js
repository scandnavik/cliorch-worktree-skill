// src/result-parser.js
// Result Parser Module - Parses CLI outputs into structured format

class ResultParser {
  /**
   * Parse CLI output based on task type
   * @param {object} executionResult - Result from Executor
   * @param {string} taskType - Type of task (generate, review, etc.)
   * @returns {object} Parsed result
   */
  parse(executionResult, taskType) {
    if (!executionResult.success) {
      return {
        success: false,
        error: executionResult.error,
        taskType,
        cliName: executionResult.cliName
      };
    }

    const output = executionResult.output || '';
    const parsed = {
      success: true,
      taskType,
      cliName: executionResult.cliName,
      content: output.trim(),
      length: output.length,
      hasCode: this.containsCode(output),
      hasError: this.containsError(output),
      rawOutput: output
    };

    // Task-specific parsing
    if (taskType === 'generate') {
      parsed.type = 'code';
      parsed.codeBlocks = this.extractCodeBlocks(output);
      parsed.language = this.detectLanguage(output);
    } else if (taskType === 'review') {
      parsed.type = 'review';
      parsed.issues = this.extractIssues(output);
      parsed.suggestions = this.extractSuggestions(output);
    }

    return parsed;
  }

  /**
   * Check if output contains code blocks
   */
  containsCode(output) {
    // Check for code block markers or common code patterns
    return /```|function|const|let|var|class|async|await|import|export|=>/i.test(output);
  }

  /**
   * Check if output contains error indicators
   */
  containsError(output) {
    const errorPatterns = [
      /error:/i,
      /syntax error/i,
      /failed/i,
      /not found/i,
      /undefined/i,
      /exception/i
    ];
    return errorPatterns.some((pattern) => pattern.test(output));
  }

  /**
   * Extract code blocks from output (marked with ```)
   */
  extractCodeBlocks(output) {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const blocks = [];
    let match;

    while ((match = codeBlockRegex.exec(output)) !== null) {
      blocks.push({
        language: match[1] || 'unknown',
        code: match[2].trim()
      });
    }

    return blocks;
  }

  /**
   * Detect programming language from code blocks
   */
  detectLanguage(output) {
    const match = /```(\w+)/.exec(output);
    return match ? match[1] : 'unknown';
  }

  /**
   * Extract issues from review output
   */
  extractIssues(output) {
    const issues = [];
    const lines = output.split('\n');

    lines.forEach((line) => {
      if (/issue|problem|bug|error|warning|concern/i.test(line)) {
        const cleaned = line
          .replace(/^[-*•]\s*/, '')
          .replace(/^#+\s*/, '')
          .trim();
        if (cleaned) {
          issues.push(cleaned);
        }
      }
    });

    return issues;
  }

  /**
   * Extract suggestions from review output
   */
  extractSuggestions(output) {
    const suggestions = [];
    const lines = output.split('\n');

    lines.forEach((line) => {
      if (/suggest|recommend|should|could improve|consider/i.test(line)) {
        const cleaned = line
          .replace(/^[-*•]\s*/, '')
          .replace(/^#+\s*/, '')
          .trim();
        if (cleaned) {
          suggestions.push(cleaned);
        }
      }
    });

    return suggestions;
  }

  /**
   * Count words (handles empty/whitespace-only strings correctly)
   */
  countWords(text) {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }

  /**
   * Get summary statistics about the output
   */
  getStats(parsed) {
    return {
      characterCount: parsed.content.length,
      wordCount: this.countWords(parsed.content),
      lineCount: parsed.content ? parsed.content.split('\n').length : 0,
      hasCode: parsed.hasCode,
      hasError: parsed.hasError,
      codeBlockCount: parsed.codeBlocks ? parsed.codeBlocks.length : 0,
      issueCount: parsed.issues ? parsed.issues.length : 0,
      suggestionCount: parsed.suggestions ? parsed.suggestions.length : 0
    };
  }
}

module.exports = ResultParser;
