# Project Guidelines & HeyClaw Architecture

## 1. 项目定位与核心资产

### 1.1 项目定位与模型网关
- **产品定位**：HeyClaw 基于网易有道龙虾（LobsterAI）二次开发，定位垂直领域（老板 IP）的 Desktop Claw 产品。
- **模型中转站**：统一使用 **NewAPI**（代码中历史 `oneapi` 变量及配置均指代 NewAPI 中转服务）。底层接入火山方舟等。
- **【核心安全铁律】NewAPI 数据库绝对纯只读**：严禁对 `oneapi` 执行写操作，仅限 `SELECT` 只读查询；业务数据持久化写入业务库（如 `heyclaw.vip_subscriptions`、`heyclaw.vip_devices`）。
- **多模态与媒体生成中转**：图片/视频（Seedance、Seedream 等）与大模型推理均统一基于 NewAPI 协议透传与分发。

### 1.2 数据目录与服务后端
- **UserData 目录**：正式环境 macOS `~/Library/Application Support/HeyClaw`（Dev 对应 `HeyClawDev`）；Windows `%APPDATA%\HeyClaw[Dev]`。
- **日志目录**：主进程日志 macOS `~/Library/Logs/HeyClaw/main-YYYY-MM-DD.log`；OpenClaw 网关日志 `userData/openclaw/logs/gateway-YYYY-MM-DD.log`。
- **双后端架构**：
  1. `admin-claw` (Node.js，同级目录)：负责账号/登录鉴权、VIP/权限、专家/技能管理、企业管理。Dev: `http://localhost:8082` | Prod: `https://admin.claw.chaohui.ai`。
  2. `scrm` (PHP，同级目录)：负责充值、第二大脑（SecondBrain / 认知提取与人设注入）。Dev: `https://dev-zhike.banchengyun.com` | Prod: `https://zhike.banchengyun.com`。
- **NewAPI 服务器诊断速查**：公网 IP `43.99.44.42` | 香港 ECS `i-j6cc6ew2bqkj0fn4ioer`。
  - 远程命令：`workbench exec -r cn-hongkong -i i-j6cc6ew2bqkj0fn4ioer -c "<命令>"`（仅排查，严禁擅改配置或停机）。

---

## 2. 核心行为禁令与流程红线

### 2.1 Git 规范与上游同步
- **【核心行为禁令】绝对禁止主动 Commit 与 Push**：无用户当次明确文字指令，绝对严禁执行或生成 commit/push 命令。
- **提交质量要求**：git 提交信息必须使用中文，单一功能提交；严禁宽泛 `git add .`；提交前严格检查 `git diff` 清理临时代码。
- **品牌与工具名统一**：拉取 `upstream/main` 后必须全局排查并将可见文案替换为 `HeyClaw`；媒体生成工具严格对齐 `heyclaw_image_generate` / `heyclaw_video_generate`。

### 2.2 开发启动禁令与离线验证
- **【核心行为禁令】严禁擅自启动应用/服务**：无明确许可绝对禁止命令启动常驻进程（如 `electron:dev`、`openclaw`、`dev:server`）。
- **改完代码必须离线验证**：
  - 主进程类型校验：`npx tsc --project electron-tsconfig.json --noEmit`；
  - 代码精准 Lint 检查：`npx eslint --report-unused-disable-directives --max-warnings 0 <改动文件路径>`。

### 2.3 严谨工程与防盲猜准则
- **严禁凭空盲猜病因与伪解决**：修复必须基于真实日志/堆栈；同一个问题最多尝试修复 3 次未果必须立刻停止并针对性求证；遇到不确定字段查文档或询问，严禁自嗨链式兜底。
- **通用严谨自适应**：系统公共层严禁针对局部 Case 写死硬编码；忠实用户核心业务意图，杜绝篡改。

---

## 3. 架构分工与工程规范

### 3.1 OpenClaw 扩展原则
- **优先非侵入式（Hook / 插件 / 适配器）**：业务增强、生命周期拦截、上下文修剪优先使用 OpenClaw 原生 Hook 或上层适配器（`openclawRuntimeAdapter.ts`）。
- **补丁兜底**：仅当官方无扩展切入点时才编写版本补丁（`scripts/patches/<version>/`），通过增量打包生效；**严禁全量重构建脚本（如 `runtime:host`）**。

### 3.2 架构设计与调用链铁律
- **单一真理来源 (SSOT)**：业务规则下沉至领域服务，触发源（UI/Cron/IPC）仅作轻量薄适配。
- **唯一调用源与杜绝过度工程掩盖**：遇到重复触发从调用源头排查收敛，严禁通过下游滥加并发锁/防抖掩盖问题；冷启动由主进程单源拉取。
- **契约驱动与终态裁决**：状态判定基于结构化枚举与权威标志位，严禁匹配报错字符串；权威物理源未结束前上层严禁越权 abort。
- **现成公共封装优先复用**：网络请求必须收敛至 `httpClient.ts`，配置读写使用 `configService`，弹窗与排版复用公共部件。

### 3.3 鉴权与边界契约
- **凭证存储规范**：长效用户访问凭据为 `heyclaw_session`；模型 Key 为 `heyclaw_api_key`；用户 ID 为 `heyclaw_user_id`。统一携带 `Authorization: Bearer <heyclaw_session>`。
- **渲染层沙箱隔离**：渲染层禁止直导 Node 原生模块，IPC 常量统一在 `src/shared/*/constants.ts` 声明。

---

## 4. 专项规范与检查清单

### 4.1 内置技能双配置闭环
在 `SKILLs/<skill-name>` 新增/更新内置技能，必须同步以下两处：
1. `SKILLs/skills.config.json`：`defaults` 字典中登记白名单条目；
2. `src/renderer/components/skills/bundledSkillNames.ts`：登记中英文对照。

### 4.2 管理类独立页面视觉规范
管理类页面必须遵循：
- 容器：`<div data-skin-management-page="true" className="relative z-10 flex-1 flex flex-col bg-background h-full overflow-hidden">`；
- 内容滚动区：`<div className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]"><div className="mx-auto w-full max-w-[1120px] px-8 py-6 space-y-6">`；
- 文字排版统一复用 `src/renderer/components/common/managementTypography.ts`。

### 4.3 企业版开发契约
- **角色体系**：`owner` (老板)、`staff` (员工)、`individual` (个人)，由 Redux `auth.userRole` 权威提供。侧边栏品牌栏按角色展示（老板/员工工作台 + 企业版徽章）。
- **员工权限限制**：员工端隐藏算力点数与充值入口；任务/FMP 请求必须在 Header 携带 `X-Claw-Fmp-Owner-Uid` 指向老板 UID。
- **算力换算铁律**：`1 点 HeyClaw 算力 = 5,000 NewAPI Quota`。前端输入/展示为点数，后端与 NewAPI 交互时 `* 5000` 或 `/ 5000`。
- **管理与查询 SSOT**：`EnterpriseSection`（第二大脑底部）仅外层 `userRole === 'owner'` 时渲染；员工列表直接查 `oneapi.tokens` 数据库获取真实 `remain_quota` / `unlimited_quota`。
