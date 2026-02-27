# Phase 0: MVP 可行性研究

## 0.1 CLI 集成快速测试结果

### 目标
验证两个关键 CLI（Copilot + Gemini）是否支持命令行调用，输出是否可解析。

### 研究结论

#### ✅ Copilot CLI
**安装**: `npm install -g @github/copilot`  
**调用方式**: 命令行交互式或直接提示
```bash
# 交互式
copilot

# 直接提示
copilot -p "Your prompt here"
copilot --prompt "Your prompt here"
```
**输出格式**: 默认是交互式输出，但支持重定向到文件  
**认证**: GitHub OAuth（需要 GitHub Copilot 订阅）  
**可行性**: ✅ **高** - 已在项目中存在，完全支持命令行

**关键特性**:
- 支持 `-p/--prompt` 直接输入
- 支持文件引用 `@filename`
- 支持安全确认机制
- 输出可以重定向
- 需要 GitHub 账户和订阅

---

#### ✅ Gemini CLI
**安装**: `npm install -g @google/gemini-cli`  
**调用方式**: 命令行交互式或直接提示
```bash
# 交互式
gemini

# 直接提示
gemini -p "Your prompt here"
```
**输出格式**: 纯文本或 JSON（通过配置）  
**认证**: Google 账户或 Gemini API Key  
**可行性**: ✅ **高** - 完全支持命令行调用

**关键特性**:
- 支持 `-p/--prompt` 直接输入
- 支持管道输入 `echo "task" | gemini`
- 支持文件操作 `@filename`
- 支持 JSON 输出
- 配置文件：`~/.gemini/settings.json`
- 频率限制：~60 请求/分钟，1000 请求/天

---

### 集成可行性结论

| 项目 | Copilot | Gemini | 结论 |
|------|---------|--------|------|
| 命令行支持 | ✅ 是 | ✅ 是 | **两者都支持** |
| 直接提示方式 | ✅ `-p` | ✅ `-p` | **都支持 `-p` 参数** |
| 输出重定向 | ✅ 可以 | ✅ 可以 | **都支持** |
| JSON 输出 | ⚠️ 需验证 | ✅ 是 | **Gemini 原生支持** |
| 文件输入 | ✅ `@file` | ✅ `@file` | **都支持** |
| 管道输入 | ❌ 否 | ✅ 是 | **Gemini 更灵活** |
| 认证方式 | GitHub OAuth | Google/API Key | **都便捷** |

**最终判断**: ✅ **完全可行** - 两个 CLI 都能通过命令行调用并解析输出

---

## 0.2 MVP 场景定义

### 选择的 MVP 场景

**场景 1: 代码生成** (使用 Gemini)
- 输入：任务描述或伪代码
- CLI：Gemini CLI
- 输出：生成的代码

**场景 2: 代码审查** (使用 Copilot)
- 输入：代码文件
- CLI：Copilot CLI
- 输出：审查意见和建议

### 场景工作流

```
用户输入
  ↓
┌─────────────────────────────────┐
│  Cloud Code Orchestrator        │
├─────────────────────────────────┤
│ 任务类型识别                    │
│  - "generate" → Gemini          │
│  - "review" → Copilot           │
└──────────┬──────────────────────┘
           ↓
     ┌─────┴──────┐
     ↓            ↓
  Gemini       Copilot
  (生成)        (审查)
     ↓            ↓
     └─────┬──────┘
           ↓
      结果汇总
           ↓
      基础评审
           ↓
    显示给用户
```

### 具体示例

#### 示例 1：代码生成
```
输入: node orchestrator.js generate "Write a function to check if a number is prime"
输出: 
  {
    "cli": "gemini",
    "task": "code generation",
    "result": "function isPrime(n) { ... }",
    "review": "PASSED - Code is syntactically valid and runnable"
  }
```

#### 示例 2：代码审查
```
输入: node orchestrator.js review "my_file.js"
输出:
  {
    "cli": "copilot",
    "task": "code review",
    "result": "Issues found: ..., Suggestions: ...",
    "review": "PASSED - Multiple issues identified, actionable feedback"
  }
```

---

## 0.3 简单审核规则

### MVP Review Engine - 基础规则

#### 对于 "代码生成" 任务 (Gemini)
| 评审指标 | 通过条件 | 失败条件 |
|---------|--------|--------|
| **语法错误** | 无 | 包含 `SyntaxError`, `ParseError`, `Error:` |
| **可执行性** | 可以运行 | 包含 `undefined is not a function` |
| **代码长度** | >10 行 | <5 行（认为太简单） |
| **格式** | 包含代码块标记 | 无代码块 |

**评分**:
- 3 个或以上通过 → 分数 ✅ PASS
- 少于 3 个通过 → 分数 ❌ FAIL

---

#### 对于 "代码审查" 任务 (Copilot)
| 评审指标 | 通过条件 | 失败条件 |
|---------|--------|--------|
| **问题识别** | 找到 ≥1 个问题 | 0 个问题 |
| **建议可操作** | 包含具体建议 | 仅有评论无建议 |
| **覆盖面** | 涉及 ≥2 个方面 | 仅关注 1 个方面 |

**评分**:
- 2 个或以上通过 → 分数 ✅ PASS
- 少于 2 个通过 → 分数 ❌ FAIL

---

## 0.4 技术验证 PoC

### PoC 目标
编写最小可运行的 Node.js 脚本，验证整个链路：
1. 调用 Gemini CLI 生成代码
2. 调用 Copilot CLI 审查代码
3. 解析两个输出
4. 进行基础评审
5. 显示结果

---

## 📊 Phase 0 完成标准

- ✅ CLI 集成方案明确（命令行 + 参数方式）
- ✅ 两个核心场景定义清晰（代码生成 + 代码审查）
- ✅ MVP 审核规则具体（基于代码特征）
- ✅ 研究文档完成

## 🚀 后续步骤
1. 制定 Phase 1 架构设计
2. 实现 Phase 2 核心模块
3. 测试 PoC 脚本
