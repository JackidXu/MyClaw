# Project Guidelines & OpenClaw Incremental Bundle Policy

## 核心规则与规范

### 1. OpenClaw 增量与补丁更新规则（免全量构建轻量方案）
- **禁止全量构建**：严禁擅自运行高 CPU/内存消耗的全量构建脚本（如 `npm run openclaw:runtime:host`）。
- **轻量秒级打包 (Incremental Fast Bundling)**：
  当对 OpenClaw 引擎或补丁进行修改（如 `scripts/patches/` 或 `../openclaw/src` 相关的修改）后，**必须自动使用轻量级方案**直接刷新更新 `gateway-bundle.mjs`，无需向用户反复询问：
  ```bash
  # 步骤 1：应用补丁
  npm run openclaw:patch

  # 步骤 2：秒级构建增量 Bundle (优先从 ../openclaw/src 源码直接 esbuild 打包，耗时约 2~4 秒)
  rm -f vendor/openclaw-runtime/mac-x64/gateway-bundle.mjs vendor/openclaw-runtime/current/gateway-bundle.mjs
  npm run openclaw:bundle vendor/openclaw-runtime/mac-x64
  ```
- 此流程无需耗费数分钟重构建整个 runtime，4秒内即可让 Patch 变更在 Electron 开发与运行环境中直接生效。

### 2. Git 操作规则
- **绝对禁止自动 Commit 与 Push**：任何 Bug 修复或功能实现后，只可将修改保留在本地工作区，绝对禁止调用 `git commit` 或 `git push`，必须等待用户在对话中发送明确的指令。
