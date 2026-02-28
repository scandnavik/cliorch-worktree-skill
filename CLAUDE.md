# CLI_Runner (cliorch) - 專案開發指南

歡迎來到 **CLI_Runner** 專案！這是一個以「 Single-Operator AI Dev OS 」為核心理念的 AI 引擎代理。
這份文件提供專案的核心約定與架構，若您是 Claude (或其他 AI Agent) 在協助開發此專案，**請務必嚴格遵守此文件的規範**。

## 🎯 核心概念

CLI_Runner `cliorch` 的目標是讓 AI 在本地 Terminal 安全地生成計畫、接受人類攔截審核 (HITL)、記憶過去的失敗 (Context Manager)，並使用多語言模型協作 (Multi-Model Strategies) 自動修改代碼。

## 🏗️ 目錄架構

- `src/cli.js`: 應用的核心進入點 (EntryPoint)，所有 cli 指令都在這解析。
- `src/driver/`: 包含了負責呼叫大語言模型的「大腦驅動器」。包含 `codexDriver.js`、`claudeDriver.js`、`geminiDriver.js` 與 `copilotDriver.js`。
- `src/router/`: 負責解析 JSON 格式步驟、處理 HITL 攔截 (`askApproval.js`)，以及統籌執行 (`orchestratePlan.js`)。
- `src/executor.js`: 底層指令執行引擎，負責將指令傳給真實的 CLI Worker (包含加入 `--model` 等動態參數)。
- `src/memory/`: 負責將錯誤跟歷史寫入 `.json` 建立系統級的短期與長期記憶 (`contextManager.js`)。
- `config/`: 存放靜態設定檔，如 `routing.yaml`、`policies.yaml`、`strategies.yaml` 與 `cli-registry.json`。

## 🚀 常用指令

在開發與除錯本專案時，您通常會使用這幾個內部測試指令：

- **查看可用的 AI 驅動與模型**：
  `node src/cli.js models`
- **產生並執行策略計畫**：
  `node src/cli.js do --task "<任務描述>" --strategy default`
- **進行安全性與 Red-Team 測試**：
  `node src/cli.js redteam`
- **運行 E2E 自動化測試**：
  `node tests/test_driver_e2e.js`

## 🛡️ 安全性與開發守則

1. **嚴禁破壞 HITL**：系統中所有危險指令都必須通過 `askApproval.js`。任何新增的邏輯**絕對不能**繞過這層防護。
2. **多模型協作 (Multi-Model Strategy)**：從 Phase 5 開始，系統支援動態 API 獲取。擴充 Driver 時必須實作 `getAvailableModels()` 並在 `generatePlan` 中支援讀取 `this.strategyProfile.roles`。
3. **記憶提取機制**：有新的除錯經驗或重構模式時，應確保它會被寫入 `memory/project.json` 中，成為後續對話的系統提詞(System Prompt)來源。

## 📝 程式碼風格

- 使用 `CommonJS` 模組語法 (也就是 `require` 和 `module.exports`)，環境為 Node.js。不要在這個專案中使用 ES Module (`import/export`)。
- 請避免撰寫會無限迴圈阻塞 Terminal 的迴圈。
- 顯示於終端機的 Console Output 應盡可能排版整齊，必要的話使用 Emoji 來提示狀態 (🚨/✅/⚙️ 等等)。
