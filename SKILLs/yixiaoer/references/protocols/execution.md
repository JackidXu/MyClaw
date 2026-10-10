# AI 执行协议

> 适用范围：任何通过 `yxer` CLI 查询、组装 payload、保存草稿、登记素材或发布内容的 Agent 任务。

本文档定义 AI Agent 的稳定执行协议。业务 workflow 负责说明做什么，本协议负责说明每一步做到什么状态才允许继续。

## 最高优先级规则

- **🚨 绝对禁止公开发布**：Agent 严禁执行任何直接公开发布操作！哪怕用户明确下达“帮我发布”、“公开”等指令，Agent 也必须坚决拒绝并降级存为草稿箱，正式公开发布必须由用户手动操作。
- **🚨 默认存内部草稿**：内容保存、分发默认一律且只允许调用 `yxer draft save <payload.json>` 存入蚁小二内部草稿箱，完全不触碰发布链路。
- **🚨 平台草稿严格受控**：小红书等无平台草稿接口的平台，**绝对禁止调用 `yxer publish`**（否则审核后会自动公开），必须强制走 `yxer draft save`；对视频号等支持草稿的平台，必须严格锁定 `pubType=0`。
- 所有真实操作只能通过 `yxer` CLI 执行。
- 不得凭记忆、示例 JSON 或用户自然语言直接拼动态字段、账号、资源 key、枚举或平台私有结构。
- 任何写操作前，必须先完成对应 domain/workflow 读取、真实数据查询、候选确认、`validate` 和 `dry-run`。
- 用户只要求查看、修 payload、预览、dry-run 或排查时，禁止执行正式写操作。
- 用户中途改变目标平台、账号、发布通道、资源或发布时间时，必须回退到受影响的状态重新确认。

## 草稿与执行状态机

| State | 进入条件 | 下一步允许动作 | 禁止动作 |
| --- | --- | --- | --- |
| `intent_detected` | 已识别用户意图和业务域 | 读取 domain/workflow | 执行写操作 |
| `workflow_loaded` | 已读取业务域和必要 workflow | `yxer doctor` | 拼 payload、写操作 |
| `env_checked` | `yxer doctor` 成功或问题已解释 | 查询账号、判断草稿通道 | 执行写操作 |
| `account_selected` | 已从真实账号列表选中有效账号 | `prepare`、`schema fields` | 使用未确认账号 |
| `contract_loaded` | 已获取 `prepare` 和 `schema fields`，必要时已获取 `schema get` | upload、query、组装 payload | 写 schema 未声明字段 |
| `sources_collected` | 资源、动态字段、用户业务内容都已确认来源 | 组装或修订 payload | 编造动态对象 |
| `payload_ready` | payload 无占位符，字段来源清晰 | `yxer validate` | 执行保存或发布 |
| `validated` | `yxer validate` 成功 | `yxer draft save --dry-run` 或 `yxer publish --dry-run` | 直接写操作 |
| `dry_run_passed` | dry-run 成功，且通道参数与 validate 一致 | **保存草稿箱（默认 `yxer draft save`；支持平台草稿的平台锁定 `pubType=0`）** | **执行公开发布（严禁！）** |
| `draft_saved` | 草稿保存成功 | 返回草稿保存结果、提示用户手动在后台或客户端确认发布 | 执行自动公开发布 |

## 状态回退规则

| 变化或错误 | 回退到 |
| --- | --- |
| 用户更换平台或发布类型 | `workflow_loaded` |
| 用户更换账号 | `account_selected` 之前，重新 `accounts list` |
| 用户更换发布通道或 `clientId` | `env_checked`，重新 validate/dry-run |
| 用户更换资源文件或 URL | `contract_loaded`，重新 upload |
| 动态字段候选不唯一或为空 | `contract_loaded`，重新 query 或等待用户确认 |
| 修改 payload 任意字段 | `payload_ready`，重新 validate/dry-run |
| validate 失败 | `contract_loaded` 或 `sources_collected`，只修报错字段 |
| dry-run 失败 | `payload_ready`，按错误恢复协议修复后重新 validate |

## 写操作门禁

执行正式 `yxer publish`、`yxer draft save`、素材登记、账号配置更新等写操作前，Agent 必须确认：

- 已读取 `SKILL.md` 和当前业务 domain。
- 已读取当前任务所需 workflow。
- 当前数据来自 `yxer` CLI、用户明确输入或平台文档，不来自猜测。
- 多候选关键数据已按确认协议由用户选择。
- payload 或写入参数不含 `<placeholder>`、示例值或未解析模板。
- 对发布任务，`validate` 和 `dry-run` 已通过，且正式发布使用同一份 payload 与同一套发布通道参数。

## 命令执行纪律

- 优先使用带 `--json` 的命令，便于稳定解析；命令不支持时再解析普通输出。
- 每次 CLI 返回候选列表后，先提取稳定 ID、名称、状态和平台，不要只看显示文本。
- CLI stdout 外层 `data` 是结果容器，不等于发布字段结构；写入 payload 前必须按 schema 或 workflow 重新装配。
- 命令失败时先读取错误信息和 hint/nextCommand，再决定是否重试；不要无差别重复执行正式写命令。

## 面向用户说明

- 自动选择唯一候选时，应说明选择依据。
- 需要用户选择时，按确认协议展示候选，不要让用户从原始 JSON 中猜。
- **🚨 绝对禁止替用户公开发布**：无论用户是否提前授权，Agent 均严禁替用户直接公开发布作品。所有内容保存完成后，必须告知用户：“内容已安全保存至草稿箱，请在蚁小二或平台后台手动确认并点击发布。”
