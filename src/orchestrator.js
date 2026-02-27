// src/orchestrator.js
// Orchestrator Module - Main coordinator

class Orchestrator {
  constructor(registry, executor, parser, reviewer) {
    this.registry = registry;
    this.executor = executor;
    this.parser = parser;
    this.reviewer = reviewer;
  }

  /**
   * Main orchestration method
   * Routes task to appropriate CLI, executes, parses, and reviews
   */
  async orchestrate(taskType, input, options = {}) {
    const startTime = Date.now();

    // Step 1: Find appropriate CLI for the task
    const cliInfo = this.registry.recommendCliForTask(taskType);
    if (!cliInfo) {
      return {
        success: false,
        error: `No CLI available for task type: ${taskType}`,
        taskType,
        duration: Date.now() - startTime
      };
    }

    // Step 2: Execute CLI command
    const executionResult = await this.executor.execute(cliInfo.command, input, options);
    if (!executionResult.success) {
      return {
        success: false,
        error: executionResult.error,
        taskType,
        cliUsed: cliInfo.command,
        duration: Date.now() - startTime
      };
    }

    // Step 3: Parse the result
    const parsedResult = this.parser.parse(executionResult, taskType);

    // Step 4: Review the result
    const review = this.reviewer.review(parsedResult);

    // Step 5: Compile final output
    const finalResult = {
      success: true,
      taskType,
      cliUsed: cliInfo.command,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      result: {
        content: parsedResult.content,
        type: parsedResult.type || 'unknown',
        metadata: {
          contentLength: parsedResult.content.length,
          wordCount: parsedResult.content.trim() ? parsedResult.content.trim().split(/\s+/).length : 0,
          hasCode: parsedResult.hasCode,
          hasError: parsedResult.hasError,
          codeBlocks: parsedResult.codeBlocks || [],
          issues: parsedResult.issues || [],
          suggestions: parsedResult.suggestions || []
        }
      },
      review: {
        score: review.score,
        summary: this.reviewer.getSummary(review),
        checks: review.checks,
        details: review.details
      }
    };

    return finalResult;
  }

  /**
   * Orchestrate with file input
   */
  async orchestrateWithFile(taskType, filePath, options = {}) {
    const startTime = Date.now();

    const cliInfo = this.registry.recommendCliForTask(taskType);
    if (!cliInfo) {
      return {
        success: false,
        error: `No CLI available for task type: ${taskType}`
      };
    }

    const instruction = taskType === 'review' ? 'Review this code' : 'Process this file';
    const executionResult = await this.executor.executeWithFile(
      cliInfo.command, filePath, instruction
    );

    if (!executionResult.success) {
      return {
        success: false,
        error: executionResult.error,
        taskType,
        cliUsed: cliInfo.command,
        duration: Date.now() - startTime
      };
    }

    const parsedResult = this.parser.parse(executionResult, taskType);
    const review = this.reviewer.review(parsedResult);

    return {
      success: true,
      taskType,
      cliUsed: cliInfo.command,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      result: {
        content: parsedResult.content,
        type: parsedResult.type || 'unknown',
        metadata: {
          contentLength: parsedResult.content.length,
          wordCount: parsedResult.content.trim() ? parsedResult.content.trim().split(/\s+/).length : 0,
          hasCode: parsedResult.hasCode,
          hasError: parsedResult.hasError,
          codeBlocks: parsedResult.codeBlocks || [],
          issues: parsedResult.issues || [],
          suggestions: parsedResult.suggestions || []
        }
      },
      review: {
        score: review.score,
        summary: this.reviewer.getSummary(review),
        checks: review.checks,
        details: review.details
      }
    };
  }

  /**
   * Get status of available CLIs
   */
  getStatus() {
    const clis = this.registry.getAllClis();
    const available = this.registry.getAvailableClis();

    return {
      totalClis: Object.keys(clis).length,
      availableClis: available.length,
      clis: Object.entries(clis).map(([name, info]) => ({
        name,
        installed: info.installed,
        capabilities: info.capabilities
      }))
    };
  }

  /**
   * Batch orchestrate multiple tasks (sequential)
   */
  async orchestrateBatch(tasks) {
    if (!Array.isArray(tasks)) {
      return [{ success: false, error: 'tasks must be an array' }];
    }

    const results = [];
    for (const task of tasks) {
      if (!task || !task.type || !task.input) {
        results.push({
          success: false,
          error: 'Each task must have "type" and "input" properties'
        });
        continue;
      }
      const result = await this.orchestrate(task.type, task.input, task.options);
      results.push(result);
    }
    return results;
  }

  /**
   * Run the same prompt on multiple CLIs in parallel, then compare results
   * @param {string} taskType - Task type (generate, review)
   * @param {string} input - The prompt
   * @param {string[]} cliNames - Which CLIs to use (e.g. ['gemini','codex','copilot'])
   * @param {object} options - Execution options
   * @returns {Promise<object>} Aggregated results with comparison
   */
  async orchestrateParallel(taskType, input, cliNames, options = {}) {
    const startTime = Date.now();

    // Validate CLIs
    const validClis = cliNames.filter(name => {
      const info = this.registry.getCliInfo(name);
      return info && info.installed;
    });

    if (validClis.length === 0) {
      return {
        success: false,
        error: 'No valid/installed CLIs specified',
        requested: cliNames
      };
    }

    console.log(`\n⚡ Parallel execution: ${validClis.join(', ')}\n`);

    // Launch all CLIs simultaneously
    const promises = validClis.map(async (cliName) => {
      const cliStart = Date.now();
      try {
        const execResult = await this.executor.execute(cliName, input, options);
        if (!execResult.success) {
          return { cliName, success: false, error: execResult.error, duration: Date.now() - cliStart };
        }
        const parsed = this.parser.parse(execResult, taskType);
        const review = this.reviewer.review(parsed);
        return {
          cliName,
          success: true,
          duration: Date.now() - cliStart,
          content: parsed.content,
          review: { score: review.score, summary: review.summary, checks: review.checks }
        };
      } catch (err) {
        return { cliName, success: false, error: err.message, duration: Date.now() - cliStart };
      }
    });

    const results = await Promise.all(promises);

    // Pick the best result (highest review pass count)
    const successful = results.filter(r => r.success);
    const best = successful.length > 0
      ? successful.reduce((a, b) => {
          const aPass = (a.review.checks || []).filter(c => c.startsWith('✓')).length;
          const bPass = (b.review.checks || []).filter(c => c.startsWith('✓')).length;
          return bPass > aPass ? b : a;
        })
      : null;

    return {
      success: successful.length > 0,
      taskType,
      mode: 'parallel',
      totalDuration: Date.now() - startTime,
      clisUsed: validClis,
      results,
      best: best ? { cliName: best.cliName, score: best.review.score, duration: best.duration } : null,
      summary: `${successful.length}/${results.length} CLIs succeeded` +
        (best ? `, best: ${best.cliName} (${best.review.score})` : '')
    };
  }
}

module.exports = Orchestrator;
