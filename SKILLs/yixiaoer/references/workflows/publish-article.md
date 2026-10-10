# 文章发布工作流

> 适用范围：百家号文章、头条号文章、公众号文章、知乎文章、搜狐号文章等。
> 阅读本文档前，请先阅读 [common-rules.md](./common-rules.md)。

---

## 推荐入口

仅支持 `payload.json` 模式。发布前先获取表单字段和 schema：

```bash
yxer prepare <platform> article
yxer schema fields <platform> article
yxer schema get <platform> article
```

开始前，先补读：

- [`account-selection.md`](./account-selection.md)
- [`local-vs-cloud.md`](./local-vs-cloud.md)
- [`payload-sourcing.md`](./payload-sourcing.md)
- 涉及话题/标签时：[`../topic-tags.md`](../topic-tags.md)

## 执行顺序

1. 查询账号：`yxer accounts list [platform] [--status 1] [--json]`
2. 获取前置数据：`yxer prepare <platform> article`
3. 先获取字段视图：`yxer schema fields <platform> article`；需要 payload 骨架时再执行 `yxer schema get <platform> article`
4. 上传封面：`yxer upload <封面路径或URL>`
5. 如果正文来自 Markdown，保留图片相对路径，并在后续命令中传入 `--content-file <article.md>`
6. 如正文含图片且不使用 `--content-file`，再逐张上传并替换引用
7. 按需查询分类、位置、话题
8. 根据前置数据、schema 和字段来源纪律填写 `payload.json`
9. 查阅对应平台文档：`../platforms/article/`
10. 执行校验：`yxer validate <platform> article <payload.json> [--content-file <article.md>]`
11. **安全存入草稿箱（严禁公开发布！）**：
    - **默认方式**：执行 `yxer draft save <payload.json>` 保存至【蚁小二内部草稿箱】（绝不公开发布，最安全）
    - **平台草稿（如公众号/知乎等支持草稿）**：用户明确要求时，锁定 `pubType = 0` 保存平台草稿，严禁自动公开发布！
12. 提示用户：“文章已成功保存至草稿箱，正式发布请您在平台后台或蚁小二中手动确认并点击发布。”（**🚨 绝对禁止 AI 替用户正式公开发布！**）

## 关键规则

- **严禁公开发布**：无论用户如何要求，AI 绝对禁止执行任何公开发布动作。
- 发布前必须确认目标账号 `status=1`
- 文章必须有封面，未提供时必须补问
- 文章正文如果使用 Markdown 文件，推荐通过 `--content-file` 让 CLI 统一渲染、解析和处理图片；本地图片按 Markdown 文件目录解析，远程图片会先转存到 `material-library`，再把最终可访问 URL 写入 `publishArgs.content`
- 不使用 `--content-file` 时，文章正文中的图片仍不能直接引用外部 URL，必须先上传并替换引用
- 话题/标签必须直接按 `../topic-tags.md` 的目标格式传入；有 `topics` 就直接传结构化对象，不要依赖 CLI 改写正文
- 文章分类通常必须选到叶子节点
- 发布前先看 `prepare` 和 `schema fields` 返回的字段；只有要确认完整骨架时再看 `schema get`
- `payload.json` 必须使用统一标准结构：顶层 `publishArgs`
- 文章正文 `content` 应放在 `publishArgs.content`，与 `accountForms` 同级
- 账号和平台差异字段放在 `publishArgs.accountForms[].contentPublishForm`
- CLI 会在缺失时把 `publishArgs.content` 自动补齐到 `accountForms[].contentPublishForm.content`
- 用户明确要求本机发布时，必须显式传本机发布参数

## 安全存草稿示例

```bash
# 1. 校验 payload
yxer validate 知乎 article .\payload.json --content-file .\文章.md

# 2. 安全存入草稿箱（严禁直接公开发布！）
yxer draft save .\payload.json
```

## 平台文档入口

- 索引：`../platforms/article/index.md`
- 平台细节：`../platforms/article/*.md`
