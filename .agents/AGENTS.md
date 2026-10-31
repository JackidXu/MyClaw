# Project Guidelines & HeyClaw Architecture

## 1. 项目定位与核心资产

### 1.1 项目定位与模型网关
- **产品定位**：HeyClaw 基于网易有道龙虾（LobsterAI）二次开发，定位垂直领域（老板 IP）的 Desktop Claw 产品。
- **模型中转站**：统一使用 **NewAPI**（代码中历史命名的 `oneapi` 变量及配置均指代 NewAPI 中转服务）。底层接入来自字节火山方舟（Volcano Engine / Doubao 等）。
- **【核心安全铁律】NewAPI / OneAPI 数据库绝对纯只读**：
  - 严禁对 `oneapi` 数据库执行任何 `INSERT`、`UPDATE`、`DELETE` 或 `ALTER` 等写操作，仅限 `SELECT` 纯只读查询（如跨库查询注册用户列表）；
  - 权限、订阅、设备绑定及自定义业务数据必须且只能持久化写入业务库（如 `heyclaw.vip_subscriptions`、`heyclaw.vip_devices`）。

### 1.2 媒体与模型服务网关规范 (NewAPI Gateway & Media Gen)
- **多模态与媒体生成中转站**：底层媒体（图片/视频生成如 **Seedance、Seedream、HappyHorse** 等）、大模型推理聚合中转站统一基于 **NewAPI**。
- **开发与调试认知**：在涉及多模态生成任务分发、状态轮询或模型中转接口的开发、排查、接口改造与协议适配时，直接基于 NewAPI 的接口协议与中转透传规范进行设计与对接，严禁反复向用户询问中转站类型。

### 1.3 应用数据与日志目录
- **UserData 目录**：
  - 正式环境（Packaged 打包后）：macOS `~/Library/Application Support/HeyClaw` | Windows `%APPDATA%\HeyClaw` | Linux `~/.config/HeyClaw`
  - 开发环境（Dev 本地运行）：macOS `~/Library/Application Support/HeyClawDev` | Windows `%APPDATA%\HeyClawDev` | Linux `~/.config/HeyClawDev`
- **日志目录**：
  - 主进程应用日志（electron-log）：macOS `~/Library/Logs/HeyClaw/main-YYYY-MM-DD.log` | Windows `%APPDATA%\HeyClaw\logs\main-YYYY-MM-DD.log` | Linux `~/.config/HeyClaw/logs/main-YYYY-MM-DD.log`
  - OpenClaw 网关日志：macOS `~/Library/Application Support/HeyClaw[Dev]/openclaw/logs/gateway-YYYY-MM-DD.log` | Windows `%APPDATA%\HeyClaw[Dev]\openclaw\logs\gateway-YYYY-MM-DD.log`

### 1.4 双后端架构与服务地址
1. **Node.js 管理后台与共用后端 (`admin-claw`)**：
   - 位于同级目录 `../admin-claw`，核心入口 `server.js`。负责专家/技能后台管理、客户端登录鉴权（Auth/Session 验证）、VIP 计费与权限。
   - 开发环境：`http://localhost:8082` | 生产环境：`https://admin.claw.chaohui.ai`
2. **PHP 业务后端 (`scrm`)**：
   - 位于同级目录 `../scrm`。负责充值业务、第二大脑（SecondBrain / 认知提取、学习数据沉淀与人设注入）。
   - 开发环境：`https://dev-zhike.banchengyun.com` | 生产环境：`https://zhike.banchengyun.com`

### 1.5 NewAPI 运维只读铁律与 Workbench 诊断工具箱 (Server Diagnostics)
- **服务器资产**：公网域名 `token.chaohui.ai` | 公网 IP `43.99.44.42` | 阿里云香港 ECS `i-j6cc6ew2bqkj0fn4ioer` | 核心容器：`traefik`（网关路由）、`newapi`（中转服务 3000）、`claw-admin`。
- **NewAPI 数据库只读查询**：Host: `pc-bp14g47881fwu0z42pub.rwlb.rds.aliyuncs.com:3306`，DB: `oneapi`（仅限 `SELECT` 查询 `logs`、`channels` 等表排查调用明细）。
- **【核心安全铁律】**：永远只能查，仅用于排查定位问题！绝对严禁擅自修改服务器配置（如 `/config/traefik.yml`、`/config/http.yml`）；绝对严禁擅自重启容器、停止容器或写数据库。
- **免交互远程诊断指令**：`workbench exec -r cn-hongkong -i i-j6cc6ew2bqkj0fn4ioer -c "<linux命令>"`
- **常用排查命令工具箱**：
  - 检查容器状态：`workbench exec -r cn-hongkong -i i-j6cc6ew2bqkj0fn4ioer -c "docker ps"`
  - 查看 Traefik 访问日志（含耗时、状态码、体大小等）：`workbench exec -r cn-hongkong -i i-j6cc6ew2bqkj0fn4ioer -c "docker logs --tail 200 traefik"`
  - 过滤 Traefik 异常请求（如 499 / 504 / 500）：
    `workbench exec -r cn-hongkong -i i-j6cc6ew2bqkj0fn4ioer -c "docker logs traefik 2>&1 | grep '\"DownstreamStatus\":499' | tail -n 20"`
  - 查看 NewAPI 容器日志：`workbench exec -r cn-hongkong -i i-j6cc6ew2bqkj0fn4ioer -c "docker logs --tail 200 newapi"`
  - 检索 NewAPI 异常请求（按 requestId 或错误关键词）：
    `workbench exec -r cn-hongkong -i i-j6cc6ew2bqkj0fn4ioer -c "docker logs newapi 2>&1 | grep '<requestId或关键词>'"`
  - 查看 Traefik 配置：
    - 静态配置：`workbench exec -r cn-hongkong -i i-j6cc6ew2bqkj0fn4ioer -c "docker exec traefik cat /config/traefik.yml"`
    - 动态路由：`workbench exec -r cn-hongkong -i i-j6cc6ew2bqkj0fn4ioer -c "docker exec traefik cat /config/http.yml"`
  - 交互式终端直连（极端复杂场景）：`workbench connect -r cn-hongkong -i i-j6cc6ew2bqkj0fn4ioer`

---

## 2. 核心行为禁令与流程红线

### 2.1 Git 规范与上游同步
- **【核心行为禁令】绝对禁止主动 Commit 与 Push**：没有收到用户在当前对话中发送的明确文字指令前，绝对禁止调用、推荐或生成 `git commit`、`git push` 命令。指令单次有效。
- **提交质量要求**：git 提交信息必须使用中文，严格遵循单一功能提交原则；严禁使用宽泛的 `git add .`，必须且只能暂存本次任务明确相关的改动文件；提交前必须执行 `git diff` 严格审查，彻底清理所有本地临时调试硬编码（如 `// TODO: 本地调试`、临时 console、敏感密钥等）。
- **上游分支同步与品牌必检**：上游分支为 `upstream/main`。每次拉取同步上游代码并解冲突后，必须第一时间全局排查 `LobsterAI`、`lobster` 关键词，严格将用户可见文案（弹窗、退出提示、引导说明、多语言字典 `src/main/i18n.ts` 与 `src/renderer/services/i18n.ts`）、UI 组件标签、窗口标题及测试断言彻底替换为 `HeyClaw`。

### 2.2 开发与启动禁令
- **【核心行为禁令】严禁擅自启动应用与开发服务**：
  在没有收到用户明确许可的情况下，绝对禁止调用命令自行启动应用或常驻开发服务进程（包括但不限于桌面端 `npm run electron:dev`、`npm run electron:dev:openclaw` 及服务端 `npm run dev:server` 等），必须由用户在终端自行启动或经明确授权。

### 2.3 改完代码必须离线验证
- **改完代码必须验证**：任何代码修改完成后，必须第一时间主动运行离线检查：
  - 主进程类型校验：`npx tsc --project electron-tsconfig.json --noEmit`（避免触发 `precompile:electron` 误装依赖）；
  - 代码精准 Lint 检查：`npx eslint --ext ts,tsx --report-unused-disable-directives --max-warnings 0 <改动文件路径>`；
  - 严禁未经验证直接向用户交付。

### 2.4 严谨调试、求真合伙人与防盲猜（内生三道静态检查流水线）
- **严禁凭空盲猜与伪解决**：严禁在未拿到真实日志/堆栈前盲猜病因；遇到不确定接口字段必须查文档、查源码或向用户确认，严禁多重自嗨式链式兜底；同一个问题尝试修复最多 3 次未果必须立刻停止并调试求证真实病因。
- **强制执行【内生三道检查流水线】（坚决根除“头痛医头、脚痛医脚”反模式）**：
  在设计任何方案或修改代码前，必须主动执行以下三道自省，绝不等待用户提示：
  1. **实体全集闭环扫描**：涉及通信协议、消息剪枝、状态机时，必须列出底层全部枚举角色（如 messages 全集为 `system`、`user`、`assistant`、`toolResult`）。若仅处理了局部子集，必须主动自问并自证：剩余分支为何不处理？是否会留存十万 Token 的巨大死角？
  2. **攻防对演（红蓝博弈）堵死后门**：设计拦截或熔断规则时，必须假想模型试图绕过该限制：“堵死 A 工具后，它是否会转调 B、C 工具继续死磕？” 拦截必须做全局工具锁死（Global Lockout），杜绝留后门；
  3. **根因溯源 vs 浅层掩盖**：严禁试图用“增加新一层超时（如15分钟物理保护）”或“增加并发锁/防抖”去掩盖底层的性能与死循环病根。必须从源头击穿数据与调用源。
- **平等协作与求真合伙人**：与用户保持平等的研发与产品合伙人关系；当发现构想或设计存在潜在暗坑、性能隐患、反模式或边界缺陷时，必须第一时间提出异议与更优替代方案，严禁盲目附和。
- **严禁自嗨式盲目运行与遇阻隐瞒**：严禁未经授权自顾自执行耗时冗长的复杂脚本；遇到不可抗力或意图不明确时，必须即时沟通，全过程保持透明。

### 2.5 极致减负与商业级交付 (Product-First)
- **商业客户第一，摒弃极客自嗨思维**：HeyClaw 是面向商业客户与最终用户的消费级产品，严禁向终端用户转嫁技术认知（如要求用户在提示词中提供内部模型参数、框架代号等）。
- **极简输入下的超预期交付**：用户只需输入最简短直白的大白话意图，系统和能力必须具备在内部自动解析、智能丰满商业细节与成熟版式的能力，交付开箱即用的高质感作品。

### 2.6 严禁针对单次 Case 搞硬编码与严禁篡改用户意图
- **严禁针对单个实体搞硬编码**：系统公共层、网关或拦截器严禁针对某一特定商品或局部 Case 写死狭隘逻辑，必须保持 100% 通用自适应。
- **严禁篡改用户核心业务意图**：用户输入的主题、色调与核心文案是第一优先级输入，系统底层的职责是“在忠实于用户意图的前提下提升细节与专业美感”，绝对禁止粗暴替换或塞入私货偏好强行违背用户明确指示。

---

## 3. 架构分工与工程哲学

### 3.1 遵循业界成熟标准，严禁自嗨自造轮子 (Industry Standards First)
- **方案设计先看业界基准**：在设计任何技术方案、架构规范、生命周期流转或拦截机制时，**必须首先调研并严格遵循业界主流成熟的最佳实践与工业标准**，坚决杜绝脱离业界共识的拍脑袋瞎搞与自嗨式发明；
- **成熟范式降维打击**：充分依托经过行业大规模验证的成熟设计哲学与工程范式来解决问题，保持系统思想的先进性、健壮性与纯粹性，绝不在高级业务层徒手捏造反模式的脆弱逻辑。

### 3.2 OpenClaw 扩展原则：优先插件与 Hook，补丁仅作最后兜底
- **第一优先级（首选推荐：非侵入式扩展）**：
  - 凡是业务增强、生命周期拦截、上下文修剪（Context Pruning）、模型输入前后介入（`llm_input` / `before_prompt`）、工具结果监控（`tool_result`）等，**必须优先使用 OpenClaw 原生 Hook、ContextEngine 扩展插件或上层适配器（`openclawRuntimeAdapter.ts`）**；
  - 优势：随主应用热加载，100% 确定性实时生效，不污染底包源码，升级上游版本零冲突。
- **第二优先级（兜底手段：迫不得已才用补丁）**：
  - 仅当所需行为深埋在 OpenClaw 核心通信层或网关内部闭包，且**官方完全没有提供 Hook 或插件切入点**时，才允许编写版本作用域的补丁（`scripts/patches/<version>/`）；
  - 补丁生效必须且只能通过秒级增量打包：`rm -f vendor/openclaw-runtime/mac-x64/gateway-bundle.mjs vendor/openclaw-runtime/current/gateway-bundle.mjs && npm run openclaw:bundle vendor/openclaw-runtime/mac-x64`（耗时仅 2~4 秒）。
- **绝对红线禁令**：
  - 严禁在有 Hook/插件可选的情况下滥用补丁；
  - 严禁擅自运行 `pnpm build` 或 `npm run openclaw:runtime:host` 等高消耗全量重构建脚本。

### 3.2 现成公共封装优先复用与公用逻辑下沉
- **公共能力优先检索与复用**：
  编写新功能或修复问题前，必须先检索项目中是否已有现成公共封装，严禁在业务组件中重新手写底层逻辑：
  - 网络与文件上传：优先复用 `src/renderer/services/httpClient.ts`；
  - 业务 API 端点：优先在 `src/renderer/services/endpoints.ts` 与 `src/main/libs/endpoints.ts` 声明与获取；
  - 应用配置读写：优先复用 `src/renderer/services/config.ts` 中的 `configService`；
  - 管理页面排版：优先复用 `src/renderer/components/common/managementTypography.ts`；
  - 弹窗通用部件：优先复用 `src/renderer/components/common/Modal.tsx` 等。
- **公用逻辑及时抽取下沉**：存在 2 处及以上相似的逻辑（请求、数据格式化、轮询、弹窗等），必须抽取下沉至 Service/Helper/Component 公共层，禁止复制代码。

### 3.3 严禁无效兜底与自嗨兼容 (Strict Anti-Fallback)
- **字段不确定严禁盲猜与链式兜底**：必须查阅后端源码或向用户确认，契约必须百分之百确定。
- **严禁写毫无意义的自欺欺人兜底**：完全由后端动态下发的场景下，严禁在前端预埋私自意淫的默认假数据；外部开放类型严禁狭隘假定为某种具体固定行为。
- **重构即彻底替换，严禁保留历史别名**：重命名或重构方法/接口时，必须全仓库同步重命名与清理，**严禁保留无用的别名导出（如 `export const oldName = newName;`）**。

### 3.4 单一真理来源（SSOT）与业务内核与触发机制彻底解耦
- **业务内核彻底下沉**：校验、去重算法、状态流转、实体处理、存储入库、记账计费、配额扣减等业务逻辑，必须且只能有一套纯粹、原子、闭环的底层领域服务。
- **触发源（Triggers）纯粹薄适配**：UI 点击、Cron 定时任务、文件/事件监听、IPC 通信、命令行脚本等仅仅是触发管道（Thin Adapters）。其职责仅限在何时以何参数唤起业务内核并呈现结果，**绝对严禁在触发源中私自夹带业务规则或写两套平行割裂的业务逻辑**。

### 3.5 立足成熟基础设施，严禁层次倒错
- **上层编排 vs 底层基底**：应用层与业务脚本只负责轻量意图表达与任务编排（Orchestration）。
- **严禁在高级胶水代码中重新发明轮子**：绝对严禁在应用层徒手实现底层已完美解决的大吞吐网络重试、大文件分片乱序拼装、原子锁竞争与 ACID 事务；遇到高频超时、竞态或假死，严禁顺着局部缺陷缝缝补补，必须后退一步依托成熟工业级基础设施/原生工具降维打击。

### 3.6 关键链路原子化与极速反馈思维
- **严禁长链路黑盒探错**：严禁将耗时长、依赖复杂的完整流水线（如全量 CI/CD、全量打包构建）直接作为排查单点问题的调试工具。
- **长链路解耦与近地验证优先**：将长流程切割为独立的原子单元（鉴权、网络传输、协议解析等），优先使用极简脚本或离线数据在秒级内完成近地确定性验证，单点闭环后再行链路集成。

### 3.7 根治调用源头，拒绝过度工程掩盖
- **严禁制造多余调用再去下游加并发锁/防抖**：遇到重复触发或竞态，绝对禁止通过增加并发锁、防抖节流或下游层层防御判断去掩盖问题。
- **确立唯一调用源（Single Caller）**：
  - 主进程冷启动是冷启动阶段的唯一网络请求源；
  - 渲染进程冷启动只读权威缓存，绝不越权发起网络拉取；
  - 凭据同步（如 `SyncUserSession`）只负责凭证存储，严禁偷偷掺杂副作用与网络请求；
  - 显式网络刷新只保留在用户真正完成操作的单一入口（如登录成功、签到完成）。

### 3.8 契约驱动，坚决摒弃“Bug 掩盖师”反模式
- **通用契约驱动 vs 报错字符串特判**：状态流转与生命周期判定必须 100% 依托协议层结构化枚举与权威标志位，绝对严禁看日志抓取特定报错文本写死 `if (error.includes('xxx')) return;` 的掩耳盗铃式假修复。
- **终态裁决权归属权威源**：谁拥有物理生命周期，谁才拥有终态裁决权。只要底层仍在重试（Retry）、退避（Backoff）、历史压缩自愈（Compaction）或等待恢复中，上层必须维持接收态，绝对严禁越权提前 abort 或拉黑 runId。

### 3.9 鉴权、通信与边界契约
- **凭证存储规范**：长效用户访问令牌为 `heyclaw_session`（全局唯一长期鉴权凭证）；模型 API Key 为 `heyclaw_api_key`；用户 ID 为 `heyclaw_user_id`。所有后端业务接口请求头统一携带 `Authorization: Bearer <heyclaw_session>`。
- **统一 HTTP 与 401 全局拦截**：严禁在 UI 组件中散落裸写请求，所有业务请求统一收敛至 `httpClient.ts`。全局拦截器自动识别 401/403 及 PHP `code: 10001`，触发 3 秒防抖 Toast、清理本地与主进程凭证并派发 `app:unauthorized` 唤起登录弹窗。
- **进程隔离与数据迁移**：渲染层严格开启沙箱，禁止直接 import Node 原生模块，必须通过 `src/main/preload.ts` 暴露的 `window.electron.*` 桥接；新增或修改 IPC 接口必须在 `src/shared/*/constants.ts` 统一声明常量；SQLite 数据库表变更遵循现有 `PRAGMA table_info()` 动态平滑迁移；可见文案严格维护双端 i18n 字典。

---

## 4. 专项规范与检查清单

### 4.1 内置技能新增与更新双配置闭环
HeyClaw 所有真实用户技能 100% 保存在 `userData/SKILLs`，NSIS 安装程序已彻底解绑历史扫描包袱，新增或更新内置技能无需修改任何 NSIS 代码。
凡在 `SKILLs/<skill-name>` 新增或更新内置技能，必须且只需在同一次提交中完整同步以下 2 处配置：
1. `SKILLs/skills.config.json`：在 `defaults` 字典中登记白名单条目（包含 `order` 与 `enabled: true`），作为主进程同步至 `userData/SKILLs` 的放行凭证；
2. `src/renderer/components/skills/bundledSkillNames.ts`：在 `BUNDLED_SKILL_DISPLAY_NAMES` 中添加对应中英文对照 `{ zh: '...', en: '...' }`。

**提交前必须通过的 3 道验证命令**：
```bash
# 1. 验证技能目录与 skills.config.json 100% 一一对应（无多余、无遗漏）
node -e "const fs=require('fs');const path=require('path');const cfg=JSON.parse(fs.readFileSync('SKILLs/skills.config.json','utf8')).defaults;const dirs=fs.readdirSync('SKILLs').filter(f=>fs.statSync(path.join('SKILLs',f)).isDirectory());const diff=dirs.filter(d=>!cfg[d]);if(diff.length)throw new Error('存在未在skills.config.json中配置的目录: '+diff.join(','));console.log('✅ skills.config.json 与 SKILLs 目录 100% 对应（共 ' + dirs.length + ' 个技能）');"

# 2. 验证前端展示名称与 skills.config.json 完全同步
npx vitest run src/renderer/components/skills/bundledSkillNames.test.ts

# 3. 验证 Windows 安装程序契约测试无回归
npx vitest run tests/windowsInstallerContract.test.ts -t "Skills|manifest|degraded restore"
```

### 4.2 管理类独立页面视觉规范
编写或重构管理/配置/独立功能页面（如定时任务 ScheduledTasks、技能管理 Skills、MCP、第二大脑 SecondBrain 等）时，必须严格遵循统一视觉规范：
- **布局容器**：
  - 外层容器：`<div data-skin-management-page="true" className="relative z-10 flex-1 flex flex-col bg-background h-full overflow-hidden">`；
  - 顶部 Header：`<div className="draggable flex h-12 items-center justify-between px-4 border-b border-border shrink-0">`；
  - 内容滚动区：`<div className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]"><div className="mx-auto w-full max-w-[1120px] px-8 py-6 space-y-6">`（必须带 `max-w-[1120px]` 居中限制）。
- **文字与排版阶梯**：统一使用 `src/renderer/components/common/managementTypography.ts` 导出变量：
  - 主标题：`<h1 className={`${MANAGEMENT_PAGE_TITLE_TEXT} font-semibold text-foreground`}>页面标题</h1>`；
  - 页面副标题/说明：`${MANAGEMENT_BODY_TEXT} text-secondary`；
  - 区块标题：`${MANAGEMENT_TITLE_TEXT} font-semibold text-foreground`；
  - 小标签/徽章/统计标签：`${MANAGEMENT_META_TEXT} text-secondary`。
- **卡片与 Tab 规范**：
  - 卡片：`bg-surface border border-border rounded-xl shadow-subtle hover:border-primary/50 hover:shadow-card transition`；
  - Tab 栏：统一使用底部横线高亮指示条风格（激活项为 `text-foreground font-semibold` 且底部带有 `bg-primary h-0.5 rounded-full` 指示线）。
