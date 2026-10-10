# 草稿工作流

> 适用范围：用户提到“保存草稿”“先存草稿”“不要立即发布”“分发内容”“发送图文”。

## 🚨 核心原则（三铁律落地）

1. **【默认内部草稿】**：所有草稿保存意图，**默认一律且优先走【蚁小二内部草稿】(`yxer draft save <payload.json>`)**。100% 隔离外部平台发布流水线，绝对安全。
2. **【小红书等平台硬拦截】**：小红书等平台接口未开放外部草稿箱，**绝对禁止对小红书执行 `yxer publish`**（会导致审核后自动公开！），必须强制降级并保存为蚁小二草稿。
3. **【严禁公开发布】**：Agent 绝不能执行任何公开发布，正式发布必须由用户手动操作。

## 草稿分流与执行

先判断目标平台是否支持平台草稿：

- **场景 A：默认或用户未指定平台草稿**
  - 执行 `yxer draft save <payload.json>` 保存为蚁小二内部草稿。
- **场景 B：用户硬性指定推入平台草稿箱（如“必须存到小红书草稿箱”）**
  - **小红书图文等无平台草稿接口平台**：**严禁调用 `publish`！** 直接调用 `yxer draft save`，并明确回复用户：“小红书接口不开放外部直接推入平台草稿箱，调用发布会导致审核后自动公开。为确保安全，已为您保存至【蚁小二草稿箱】，您可在蚁小二中一键手动发布。”
  - **微信视频号等支持草稿的平台**：进入平台发布流程，但**必须将 `contentPublishForm.pubType` 严格锁定为 `0` (草稿)**，且绝不带任何自动发布参数。

## 蚁小二草稿标准步骤

1. 先判断发布类型：`video` / `imageText` / `article`
2. 读取 [`payload-sourcing.md`](./payload-sourcing.md)
3. 补齐账号、schema、资源和动态字段
4. 生成草稿 payload
5. 执行 `yxer draft save <payload.json> [--dry-run]`
6. 提示用户：“内容已成功保存至蚁小二草稿箱，正式发布请您在蚁小二或平台后台手动确认并点击发布。”

微信公众号文章如果来源是 Word 文档，使用 `yxer draft import <article.docx>`，并同时传入账号 ID 和横版封面。

## 推荐命令

```bash
yxer draft save .\draft-payload.json --dry-run
yxer draft save .\draft-payload.json
```

## 严禁行为

- 对小红书等无草稿接口的平台执行 `yxer publish`
- 替用户执行任何公开发布动作
- 把 `publishAfterApproval: auto_publish` 或发布任务当成草稿箱
- 省略账号、资源、动态字段准备，直接存一个不完整 payload
