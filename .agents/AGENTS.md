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

### 3. 管理类/功能独立页面视觉规范 (Management Page Visual Specification)
编写或重构管理/配置/独立功能页面（如定时任务 ScheduledTasks、技能管理 Skills、MCP、第二大脑 SecondBrain 等）时，**必须严格遵循统一的视觉规范**：
- **容器与布局**：
  - 外层容器：`<div data-skin-management-page="true" className="relative z-10 flex-1 flex flex-col bg-background h-full overflow-hidden">`
  - 顶部 Header：`<div className="draggable flex h-12 items-center justify-between px-4 border-b border-border shrink-0">`
  - 主标题：引入 `src/renderer/components/common/managementTypography.ts` 中的 `MANAGEMENT_PAGE_TITLE_TEXT`，格式为 `<h1 className={`${MANAGEMENT_PAGE_TITLE_TEXT} font-semibold text-foreground`}>页面标题</h1>`
  - 内容滚动区：`<div className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]"><div className="mx-auto w-full max-w-[1120px] px-8 py-6 space-y-6">`（必须带 `max-w-[1120px]` 居中限制）
- **文字与排版阶梯**（使用 `managementTypography` 导出变量）：
  - 页面副标题/说明：`${MANAGEMENT_BODY_TEXT} text-secondary`
  - 区块标题：`${MANAGEMENT_TITLE_TEXT} font-semibold text-foreground`
  - 小标签/徽章/统计标签：`${MANAGEMENT_META_TEXT} text-secondary`
- **卡片规范**：
  - 背景为 `bg-surface`，边框 `border border-border`，圆角 `rounded-xl`，阴影 `shadow-subtle`，交互态带 `hover:border-primary/50 hover:shadow-card transition`
- **Tab 栏规范**：
  - 统一使用底部横线高亮指示条风格（`border-b border-border`，激活项为 `text-foreground font-semibold` 且底部带有 `bg-primary h-0.5 rounded-full` 指示线）。

