# Phase 1: MVP 简化架构设计

## 1.1 系统架构概述

### MVP 简化架构图

```
┌──────────────────────────────────────────┐
│  User Input (CLI Arguments)              │
│  Example: "generate <prompt>"            │
│           "review <file>"                │
└────────────────┬─────────────────────────┘
                 ↓
        ┌────────────────┐
        │ Input Parser   │
        │ (简单的 argv   │
        │  或 readline)  │
        └────────┬───────┘
                 ↓
      ┌──────────────────────┐
      │  CLI Registry        │
      │  (JSON 配置 +        │
      │   环境变量检查)      │
      └────────┬─────────────┘
               ↓
         ┌─────────────┐
         │  Executor   │      Task Router
         │ (execFile   │  (后续版本，MVP 用
         │  + 输出解析)│   固定映射)
         └────────┬────┘
                  ↓
         CLI 工具执行
         (Gemini / Copilot)
                  ↓
         ┌────────────────┐
         │  Result Parser │
         │  (输出解析)    │
         └────────┬───────┘
                  ↓
         ┌────────────────────┐
         │  Simple Reviewer   │
         │  (规则引擎评审)    │
         └────────┬───────────┘
                  ↓
         ┌────────────────────┐
         │  Output Generator  │
         │  (结果展示)        │
         └────────┬───────────┘
                  ↓
         ┌────────────────┐
         │  User Output   │
         │  (JSON/Text)   │
         └────────────────┘
```

---

## 1.2 MVP 核心模块

### 模块 1: CLI Registry
**职责**: 注册和查询可用 CLI 的信息

**配置文件**: `src/config/cli-registry.json`
```json
{
  "gemini": {
    "name": "Gemini CLI",
    "command": "gemini",
    "installed": false,
    "capabilities": ["code_generation", "summarization", "explanation"],
    "auth": "google",
    "args_format": "-p"
  },
  "copilot": {
    "name": "GitHub Copilot CLI",
    "command": "copilot",
    "installed": false,
    "capabilities": ["code_review", "debugging", "refactoring"],
    "auth": "github_oauth",
    "args_format": "-p"
  }
}
```

**主要方法**:
- `loadRegistry()` - 加载配置
- `checkCliAvailable(cliName)` - 检查 CLI 是否已安装
- `getCliInfo(cliName)` - 获取 CLI 信息

---

### 模块 2: Executor
**职责**: 安全调用 CLI 子进程，收集和解析输出

**接口**:
```javascript
async execute(cliName, prompt, options = {}) {
  // 1. 验证 CLI 是否可用
  // 2. 构建命令字符串
  // 3. 使用 execFile 执行
  // 4. 捕获 stdout 和 stderr
  // 5. 返回结构化结果
  
  return {
    success: true/false,
    output: string,
    exitCode: number,
    error?: string
  };
}
```

---

### 模块 3: Result Parser
**职责**: 将 CLI 输出解析为结构化格式

**接口**:
```javascript
parse(cliName, output) {
  // 1. 检查输出是否包含错误信息
  // 2. 提取关键内容
  // 3. 规范化格式
  
  return {
    cliName: string,
    content: string,
    type: 'code' | 'review' | 'text',
    metadata: {}
  };
}
```

---

### 模块 4: Simple Reviewer
**职责**: 对结果进行基础质量评审（规则引擎）

**评审规则** (基于 Phase 0):
- 代码生成: 检查语法错误、代码长度、格式
- 代码审查: 检查问题识别、建议、覆盖面

**接口**:
```javascript
review(parsedResult) {
  // 1. 根据 task 类型选择规则
  // 2. 运行规则检查
  // 3. 生成评分
  
  return {
    score: 'PASS' | 'FAIL',
    checks: string[],
    details: object
  };
}
```

---

### 模块 5: Orchestrator (主控制器)
**职责**: 协调各个模块的工作流

**工作流**:
```
1. 解析用户输入 → 确定任务类型
2. 查询 Registry → 获取 CLI 信息
3. 调用 Executor → 执行 CLI
4. 解析结果 → 结构化输出
5. 评审结果 → 生成评分
6. 格式化输出 → 展示给用户
```

**接口**:
```javascript
async orchestrate(taskType, input) {
  // 1. 路由到相应 CLI (MVP: 固定映射)
  // 2. 执行
  // 3. 解析
  // 4. 评审
  // 5. 返回结果
  
  return {
    taskType,
    cliUsed,
    result,
    review,
    timestamp
  };
}
```

---

## 1.3 MVP 数据流

### 场景 1: 代码生成
```
User Input: "generate 'Write a function to check if a number is prime'"
    ↓
Input Parser: { type: 'generate', prompt: '...' }
    ↓
CLI Registry: { cli: 'gemini', command: 'gemini', args: '-p' }
    ↓
Executor: execFile('gemini', ['-p', '...'])
    ↓
Output: "```javascript\nfunction isPrime(n) { ... }\n```"
    ↓
Result Parser: { type: 'code', content: '...' }
    ↓
Simple Reviewer: PASS (3/4 checks passed)
    ↓
Output Generator: JSON or formatted text
    ↓
User: Receives structured result
```

---

## 1.4 MVP 技术栈

| 层次 | 技术 | 说明 |
|------|------|------|
| 语言 | Node.js + JavaScript | 简单快速，无需编译 |
| CLI 解析 | argv (内置) | MVP 不用 commander.js 等 |
| 子进程 | child_process.execFile | 内置模块，安全 |
| 数据格式 | JSON | 结构化，易于解析 |
| 配置 | JSON 文件 | 简单可读 |
| 日志 | console (MVP) | 先简单打印，后升级 |

---

## 1.5 文件结构

```
cloud-code-orchestrator/
├── src/
│   ├── cli-registry.js       # CLI Registry 模块
│   ├── executor.js           # Executor 模块
│   ├── result-parser.js      # Result Parser 模块
│   ├── simple-reviewer.js    # Simple Reviewer 模块
│   ├── orchestrator.js       # 主 Orchestrator
│   ├── config/
│   │   └── cli-registry.json # CLI 配置文件
│   └── index.js              # 入口点 (CLI 工具)
├── tests/
│   └── poc.js                # PoC 测试脚本
├── docs/
│   ├── PHASE0_RESEARCH.md    # Phase 0 研究
│   └── PHASE1_DESIGN.md      # 本文件
├── package.json
└── README.md
```

---

## 1.6 MVP 成功标准

- ✅ 模块设计清晰，职责分离
- ✅ 数据流明确，易于理解
- ✅ 使用内置 Node.js 模块，无重依赖
- ✅ 支持 2 个场景（代码生成 + 代码审查）
- ✅ 可以通过命令行调用
- ✅ 输出结构化（JSON 格式）

---

## 📌 下一步

Phase 2: 核心实现
- [ ] 2.1 项目初始化 (TypeScript/ESLint 配置)
- [ ] 2.2 CLI Registry 实现
- [ ] 2.3 Executor 实现
- [ ] 2.4 Result Parser 实现
- [ ] 2.5 Simple Reviewer 实现
- [ ] 2.6 Orchestrator 实现
- [ ] 2.7 主 CLI 工具实现
