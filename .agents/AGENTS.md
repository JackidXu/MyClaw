# Project Guidelines & HeyClaw Architecture

## 1. 项目定位与架构概述

HeyClaw 基于网易有道龙虾（LobsterAI）二次开发，定位是垂直领域（老板 IP）的 Desktop Claw 产品。

### 1.1 模型与网关体系
- **模型中转站**：统一使用 **NewAPI**（代码中历史命名的 `oneapi` 变量及配置均指代 NewAPI 中转服务）。
- **底层模型提供商**：底层大模型接入来自**字节火山方舟**（Volcano Engine / Doubao 等）。
- **【核心安全铁律】NewAPI / OneAPI 数据库绝对纯只读**：
  - 代码中**绝对禁止、也严禁对 `oneapi` 数据库执行任何 `INSERT`、`UPDATE`、`DELETE` 或 `ALTER` 等写操作**，只能进行 `SELECT` 纯只读查询（如跨库查询注册用户列表）；
  - 所有的权限、订阅、设备绑定及自定义业务数据，必须且只能持久化写入我们自己的业务数据库（如 `heyclaw.vip_subscriptions`、`heyclaw.vip_devices` 等）。

### 1.2 应用数据目录（UserData）
- **正式环境（Packaged 打包后）**：目录名为 `HeyClaw`
  - **macOS**: `~/Library/Application Support/HeyClaw`
  - **Windows**: `%APPDATA%\HeyClaw`（即 `C:\Users\<username>\AppData\Roaming\HeyClaw`）
  - **Linux**: `~/.config/HeyClaw`
- **开发/测试环境（Dev / 本地运行）**：目录名为 `HeyClawDev`（防止与打包后的正式版数据冲突）
  - **macOS**: `~/Library/Application Support/HeyClawDev`
  - **Windows**: `%APPDATA%\HeyClawDev`（即 `C:\Users\<username>\AppData\Roaming\HeyClawDev`）
  - **Linux**: `~/.config/HeyClawDev`

### 1.3 日志目录
- **主进程应用日志（electron-log）**：
  - **macOS**: `~/Library/Logs/HeyClaw/main-YYYY-MM-DD.log`
  - **Windows**: `%USERPROFILE%\AppData\Roaming\HeyClaw\logs\main-YYYY-MM-DD.log`
  - **Linux**: `~/.config/HeyClaw/logs/main-YYYY-MM-DD.log`
- **OpenClaw 网关日志**：
  - **macOS**: `~/Library/Application Support/HeyClaw[Dev]/openclaw/logs/gateway-YYYY-MM-DD.log`
  - **Windows**: `%APPDATA%\HeyClaw[Dev]\openclaw\logs\gateway-YYYY-MM-DD.log`

### 1.4 管理后台与双后端架构
HeyClaw 采用双后端支撑体系：
1. **Node.js 管理后台与共用后端（`admin-claw`）**：
   - **物理位置**：位于当前项目目录的同级目录 `../admin-claw`。
   - **核心入口**：`server.js`。
   - **主要职责**：专家（Experts）、技能（Skills）等后台管理与编辑；客户端登录鉴权（Auth/Session 验证）、VIP 计费与权限（Billing/Subscription）等。
   - **服务地址**：
     - 开发/测试环境：`http://localhost:8082`
     - 生产环境：`https://admin.claw.chaohui.ai`
2. **PHP 后端（业务后端）**：
   - **物理位置**：位于当前项目目录的同级目录 `../scrm`。
   - **维护团队**：由专门的后端开发人员维护。
   - **主要职责**：充值业务、第二大脑（SecondBrain / 认知提取、学习数据沉淀与人设注入）等。
   - **服务地址**：
     - 开发环境：`https://dev-zhike.banchengyun.com`
     - 生产环境：`https://zhike.banchengyun.com`

---

## 2. 核心规则与规范

### 2.1 OpenClaw 增量与补丁更新规则（免全量构建轻量方案）
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

### 2.2 Git 操作规则
- **绝对禁止自动 Commit 与 Push**：任何 Bug 修复或功能实现后，只可将修改保留在本地工作区，绝对禁止调用 `git commit` 或 `git push`，必须等待用户在对话中发送明确的指令（用户指令仅单次有效）。
- **提交前严密审查（杜绝无脑提交）**：在获得用户明确指令执行单次 Commit 之前，必须执行 `git diff` 严格逐行审查改动，完成多维度自检：
  1. **逻辑自洽性检查**：改动是否真正彻底解决问题，边界情况是否闭环；
  2. **代码质量检查**：模块职责是否单一，是否存在冗余废代码或无效兜底；
  3. **安全隐患与硬编码清理**：彻底清理所有本地临时调试硬编码（如 `// TODO: 本地调试`、`return true`、临时 console、敏感密钥等），严禁带入仓库历史。
- **上游分支（Upstream）**：网易有道上游仓库分支为 `upstream/main`。在需要比对上游改动、同步上游新特性或排查与上游实现差异时，以此分支作为参照与同步基准。

### 2.3 管理类/功能独立页面视觉规范 (Management Page Visual Specification)
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

### 2.4 媒体与模型服务网关规范 (NewAPI Gateway Specification)
- **中转站架构**：本项目底层媒体（图片/视频生成）、模型调用聚合中转站统一基于 **NewAPI**（代码中历史命名的 `oneapi` 相关变量和配置均指代 NewAPI 中转服务）。
- **开发与调试认知**：在涉及多模态生成（如 Seedance、Seedream、HappyHorse 等）或模型中转接口的开发、排查、接口改造与协议适配时，直接基于 NewAPI 的接口协议与中转透传规范进行设计与对接，严禁反复向用户询问中转站类型。

### 2.5 客户端长效鉴权与后端请求规范 (Auth & Request Headers)
- **核心凭证存储规范**：
  - **长效用户访问令牌 (User Access Token)**：`localStorage.getItem('heyclaw_session')`（由登录时向 PHP 换票接口 `POST /api/chaohuixie/claw/token/accessToken` 置换得到，作为客户端与 **Node 后端（admin-claw）** 及 **PHP 业务后端（第二大脑 / 充值）** 全业务接口的**全局唯一长期鉴权凭证**）。
  - **大模型对话令牌 (Model API Key)**：`localStorage.getItem('heyclaw_api_key')`（即 `sk-xxxx`，专供 OpenClaw 与底层 NewAPI `/v1` 大模型对话推理）。
  - **用户 ID**：`localStorage.getItem('heyclaw_user_id')`。
- **全站统一鉴权传参约定**：
  - **Node 后端（admin-claw）**：所有业务接口请求头统一携带 `Authorization: Bearer <user_access_token>`（从 `heyclaw_session` 获取）。由 Node 后端原生直连 NewAPI `/api/user/self` 实时校验用户身份，天然防 IDOR 越权与过期失效。
  - **PHP 业务后端**：
    - **第二大脑全量接口 (`/api/chaohuixie/claw/fmp/***` 等)**：请求头统一携带 `Authorization: Bearer <user_access_token>`（由 PHP 维护表进行持久校验，彻底杜绝 15 分钟掉线问题）。
    - **换票接口 (`/api/chaohuixie/claw/token/accessToken`)**：由 Node 服务端在登录时调用换取长效访问令牌。

### 2.6 本地数据存储与迁移规范 (SQLite & Data Persistence)
- **数据库路径**：位于 `userData/lobsterai.sqlite`。
- **历史命名字段认知**：如 `cowork_sessions` 表中的 `claude_session_id` 实际等同于 `session_id`，底层已全面切换为 OpenClaw。
- **平滑迁移原则**：新增字段/表时，遵循现有代码模式使用 `PRAGMA table_info()` 动态检查并补充，严禁破坏性重构或随意丢弃老数据。

### 2.7 进程通信与架构边界 (IPC & Context Isolation)
- **安全沙箱隔离**：渲染进程严格开启 `contextIsolation`、关闭 `nodeIntegration`。
- **禁止在 Renderer 乱用 Node 原生模块**：渲染层禁止直接 import `fs`、`path`、`electron-log` 等，必须通过 `src/main/preload.ts` 暴露的 `window.electron.*` 进行桥接。
- **IPC 通道常量化**：新增或修改 IPC 接口时，必须在 `src/shared/*/constants.ts` 统一声明常量，禁止在组件或主进程中使用散落的魔法字符串（Magic Strings）。

### 2.8 国际化与文案规范 (i18n)
- **严禁 UI 硬编码**：组件中的可见文案必须走 `t('xxx')`。
- **双端多语言字典**：
  - 渲染进程：`src/renderer/services/i18n.ts`（需同步维护 `zh` 与 `en`）。
  - 主进程（菜单/系统通知）：`src/main/i18n.ts`（需同步维护 `zh` 与 `en`）。

### 2.9 常用开发与质量检查指令 (Daily Development Commands)
- **日常热更新开发**：`npm run electron:dev`（前端 Vite 跑在 5175 端口 + Electron 启动）。
- **主进程 TypeScript 类型校验**：`npm run compile:electron`。
- **精准 Lint 检查（规避老旧历史包袱）**：
  `npx eslint --ext ts,tsx --report-unused-disable-directives --max-warnings 0 <改动文件路径>`。

### 2.10 改完代码必须验证原则 (Mandatory Verification Post-Edit)
- **改完代码必须验证**：任何代码修改完成后，必须第一时间主动运行编译/类型检查（如主进程改动必须运行 `npm run compile:electron`，触碰代码必须运行指定文件的 eslint 检查），**严禁未验证直接向用户交付**。

### 2.11 统一网络请求与全局鉴权拦截规范 (Unified HTTP & Auth Error Interception)
- **禁止在 UI 组件散落裸写请求**：严禁在 React 组件内部裸写 `window.electron.api.fetch` 或手拼 `Authorization` 请求头。所有业务请求必须统一收敛至 `httpClient` 或对应的业务 Service 模块。
- **全局唯一未授权拦截**：由 `httpClient.ts` 的全局响应拦截器统一识别 HTTP 401/403、PHP 业务状态码 `code: 10001` 及包体中的 `未授权 / 未登录 / 认证失败`，自动触发 3 秒防抖 Toast + 清理本地与主进程凭证 + 派发 `app:unauthorized` 唤起登录弹窗。严禁在各个业务组件中重复手写碎片化的未授权处理代码。

### 2.12 全局视角与长期迭代工程质量准则 (Global Perspective & Long-Term Engineering Standards)
- **立足全局，拒绝单次应付**：HeyClaw 是一个长期演进的商业级工程，绝非临时代码拼凑。编写任何代码时必须以系统全局视角审视架构合理性，杜绝为了“凑出单次效果”而破坏模块边界、散落重复逻辑或写无效意淫兜底。
- **保持代码优雅、干净、模块化**：
  - **职责单一**：业务逻辑、网络请求、状态管理与 UI 渲染必须层次分明，UI 组件只消费数据，底层通信和鉴权拦截统一收敛。
  - **方案更替彻底清理**：方案迭代或更换时，必须第一时间彻底清理上一个方案留下的所有非相关废代码与临时字段，不留历史债。
  - **真实严谨解决问题**：所有的功能设计与 Bug 修复必须基于确定性规范与确凿证据，严禁在未排查真实病因前凭空盲猜或采用硬编码/篡改产物等反模式手段。

### 2.13 现成公共封装优先复用与公用逻辑下沉准则 (Reusability & Common Module Priority)
- **公共能力优先检索与复用**：
  在编写任何新功能或修复问题前，**必须先检索项目中是否已有现成的公共封装与工具层**，严禁在业务组件中重新手写底层逻辑或重复造轮子：
  - **网络与文件上传**：优先复用 `src/renderer/services/httpClient.ts`（统一支持通用请求、文件上传与全局 401/10001 拦截）；
  - **业务 API 端点**：优先在 `src/renderer/services/endpoints.ts` 与 `src/main/libs/endpoints.ts` 统一声明与获取；
  - **应用配置读写**：优先复用 `src/renderer/services/config.ts` 中的 `configService`；
  - **管理与独立页面排版规范**：优先复用 `src/renderer/components/common/managementTypography.ts`（`MANAGEMENT_PAGE_TITLE_TEXT`、`MANAGEMENT_BODY_TEXT` 等）；
  - **弹窗与通用 UI 部件**：优先复用 `src/renderer/components/common/Modal.tsx` 等通用组件。
- **公用逻辑及时抽取与下沉（Extract Once, Reuse Everywhere）**：
  - 当在不同业务组件、页面或服务中发现存在 **2 处及以上相似的逻辑**（如同一类业务的 API 请求、数据格式化、轮询定时器、弹窗模版等），**必须第一时间将其抽取下沉至对应的 Service / Helper / Component 公共层**，禁止多处复制粘贴；
  - 遇到需要新增领域能力时，严格遵循 `UI Component -> Domain Service (如 billingService / tradeService) -> httpClient` 的分层架构，保持每一层纯粹透明。


