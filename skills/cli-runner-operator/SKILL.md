---
name: cli-runner-operator
description: A built-in skill to trigger CLI_Runner (cliorch) for complex, multi-model, and agentic code interventions with HITL protection.
---

# CLI_Runner Operator Skill

This skill teaches Claude how to offload complex, multi-step, or risky coding tasks to the local `CLI_Runner` framework (`cliorch`).

## When to use this skill

Whenever the user asks you to:

1. "Generate a complex codebase"
2. "Refactor an entire directory"
3. "Execute tasks that require dynamic capabilities from multiple models (like mixing Gemini's speed with Claude's reasoning)"
4. "Run terminal commands that might be dangerous and need Human-In-The-Loop (HITL) protection"

Do NOT manually generate large boilerplate or use raw `bash` for complex operations. Delegate it to `cliorch` instead!

## How to use this skill

Execute the following command to invoke CLI_Runner's orchestration engine:

```bash
node src/cli.js do --task "<describe the task context completely>" --strategy <strategy_name>
```

### Strategy Selection Guidelines

- If the user explicitly asks to use a specific strategy, pass `--strategy <name>`.
- If the user doesn't specify, first show available options by running:

```bash
node src/cli.js options
```

- If the user wants to choose the sequence and LLM interactively, run:

```bash
node src/cli.js do --task "<task>" --interactive
```

- If the user already gave exact sequence/model mapping, run with explicit params:

```bash
node src/cli.js do --task "<task>" \
  --flow "ideation,converge,execution,review" \
  --llm-map "ideation=gemini:gemini-3.1-pro-preview,execution=copilot:copilot-default,review=codex:gpt-5.2" \
  --manager "claude:claude-opus-4-6"
```

### How it works behind the scenes

Once you execute `node src/cli.js do`, the CLI_Runner OS will:

1. Dynamically discover local and remote models (via `node src/cli.js models`).
2. Load past "memories" of previous errors.
3. Automatically determine an execution plan (JSON Schema).
4. Prompt the user visually in the terminal (HITL) if a dangerous command is attempting to run.
5. Provide a safe and orchestrated modification of the codebase.

## Example Usage

**User:** "Can you rewrite the entire logging module and ensure tests pass? Use the fast code strategy."
**Claude:**
(Action: run command)
`node src/cli.js do --task "Rewrite the entire logging module in src/logger/ and ensure the test suite passes" --strategy fast_code`

Let `CLI_Runner` handle the orchestration and just relay the output back to the user!
