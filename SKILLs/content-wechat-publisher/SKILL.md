---
name: 公众号排版发布
version: 1.0.0
description: |
  公众号排版发布（content-wechat-publisher）—— 把脚本路由器产出的公众号长文 Markdown 排成微信兼容的内联样式 HTML，
  并生成可复制粘贴的本地预览，或在用户提供公众号凭据后推入草稿箱。移植自 wewrite 公众号排版方法。
  触发关键词：公众号排版、微信排版、排版发布、推草稿箱、发公众号、生成预览。
  短视频/朋友圈/普通文章不触发。
compatibility: workbuddy
agent_created: true
---

# 公众号排版发布（content-wechat-publisher）

公众号内容生产线的**最后一环**。上游是 `content-script-writer` 模式 D 产出的公众号长文 Markdown，
已依次经过 `文案人味润色·公众号`（长文按节）润色、并由 `视觉配图心法·公众号插画` 准备好配图。
本 skill 负责把它**排成微信能直接用的内联样式 HTML**，并交付预览 / 草稿。

## 运行原则

- 本 skill 只在「要排版 / 要发公众号」时激活，不自动触发，不回头改文案。
- 排版产物是**微信兼容的内联样式 HTML**：所有样式写进 `style` 属性，不用 `<style>`、不用外部 CSS、不用 JS。
- 默认只产出**本地预览 HTML**（复制粘贴进公众号后台即用）。只有用户明确给凭据并要求「推草稿箱」才走 API。
- 主题决定观感，缺省 `professional-clean`；可在对话里换（sspai / warm-editorial / midnight）。

## 输入

- 终稿 Markdown：来自 内容脚本路由器 模式 D 的公众号长文（含封面图引用、插图 `![](...)`）。
- 已润色：文案人味润色·公众号 的输出（长文按节）。
- 已配图：视觉配图心法·公众号插画 产出的图片，正文中以 `![](路径或图床URL)` 引用。
- 主题偏好（可选）：professional-clean / sspai / warm-editorial / midnight。

## 排版（必经）

用自带转换器把 Markdown 转成微信 HTML。**转换器仅依赖 Python 标准库，零额外安装**：

```bash
python "{skill_dir}/scripts/wechat_convert.py" "{终稿md}" \
  --theme professional-clean \
  --embed \
  --out "{终稿md 同目录}/手动复制用.html" \
  --wechat-out "{终稿md 同目录}/接口发布用.html"
```

- `--out 手动复制用.html`：完整预览文档，**手动发布就用这个文件**。在浏览器打开 → 全选复制 → 粘进公众号后台即可（见下方「使用方法」）。加 `--embed` 会把本地图片 base64 内嵌，复制时图片跟着一起走。
- `--wechat-out 接口发布用.html`：仅正文片段（无 `<body>` 外壳），**专供 `wechat_publish.py` API 推送 / 接自动化工位**，不要拿它手动复制（它的图是本地路径，手动粘过去会裂图）。
- 转换已自动处理：内联样式、CJK 间距、列表转 `<section>`、外链转上标脚注、暗黑模式属性、文末 AIGC 声明、粘贴加固。
- 可用容器块增强排版：`:::callout tip|warning|info|danger`、`:::quote`、`:::pullquote`、`:::label`、`:::steps`、`:::dialogue`、`:::timeline`、`:::highlight`、`:::summary`（语法见 `references/wechat-constraints.md`）。

### 图片怎么处理（三种方式，按场景选）

微信只认 http(s) 图，本地相对路径粘进后台不会显示。三选一：

1. **手动发布（推荐默认）**：加 `--embed`，本地图自动 base64 内嵌进 `手动复制用.html`，复制粘贴时图片随文本一起带走，后台会自动上传。最简单。
2. **用图床**：`--img-base https://你的图床域名/目录`（把 `./01-xxx.png` 拼成完整 URL），或 `--img-map 图床映射.json` `{"本地src或文件名": "完整URL"}` 精确替换（真实图床最准，优先级更高）。已是 http(s) 的绝对地址原样保留。
3. **都不做**：图片保留本地路径，仅供本地看；发布时需在后台「插入图片」手动上传。

### 使用方法（手动发布，给接手的人一步一步照做）

> ⚠️ **两个文件别搞混**：转换产出 `手动复制用.html` 和 `接口发布用.html`。**默认只打开 `手动复制用.html` 复制**；`接口发布用.html` 是给程序走 API 的，拿它手动复制会裂图。**交付时把 `手动复制用.html` 作为默认预览打开。**

1. 运行上面的命令，生成 `手动复制用.html`（已带 `--embed`）。
2. **双击用浏览器打开** `手动复制用.html`，确认排版、配图、样式无误。
3. 在浏览器里 **`Ctrl/Cmd + A` 全选 → `Ctrl/Cmd + C` 复制**（Mac 用 Command）。
4. 登录公众号后台 `mp.weixin.qq.com` → 内容与互动 → 图文消息 → 新建图文。
5. 在正文编辑区 **`Ctrl/Cmd + V` 粘贴**，样式和图片会自动带入（图片由后台自动上传）。
6. 填标题、选封面、核对后点「发布 / 保存」。

> 一句话记忆：**打开 `手动复制用.html` → 全选复制 → 粘进公众号编辑器**。不要碰 `接口发布用.html`，那是给程序用的。

转换完成后**先让用户看预览**（浏览器打开 `手动复制用.html`）确认无误，再进入发布。

## 发布（两步，按需）

### A. 本地预览（默认，零门槛）

按上方「使用方法」：用浏览器打开 `--out 手动复制用.html`（建议带 `--embed`），全选复制 → 粘进公众号后台编辑器即可。图片随文本一起带入、由后台自动上传，无需图床。
若未加 `--embed` 且图片是本地路径：粘贴后需在后台「插入图片」手动补图，或排版时改用 `--img-base` / `--img-map`（见约束文档第 4 节）。

### B. 草稿箱推送（需凭据，用户明确要求才做）

仅当用户说「推草稿箱 / 发公众号」并提供了公众号凭据时执行。凭据**绝不写进包里**：

- 环境变量 `WECHAT_APPID` / `WECHAT_SECRET`，或
- `--config` 指向本地 JSON `{"appid":"...","secret":"..."}`（放在用户自己工作区，不要进分享包）。

```bash
python "{skill_dir}/scripts/wechat_publish.py" \
  --html "{接口发布用.html}" \
  --title "{标题}" \
  --digest "{摘要，≤120字节，可省略自动截取}" \
  --cover "{封面图路径}" \
  --config ~/wechat_cred.json
```

- 草稿进后台「草稿箱」，用户登录 mp.weixin.qq.com 核对后再点发布。
- 内文图片需用 `uploadimg` 换成微信图床 URL，或后台手动上传；本脚本只负责封面上传 + 草稿创建。
- 失败不自动重试，保留本地 HTML 供手动复制。

## 预检清单（发布前必过）

- 标题 ≤ 64 字；摘要 ≤ 120 字节；正文 200–20000 字。
- 正文图片 ≤ 10 张（视频算 1 张）；表格列数 ≤ 4。
- 发布草稿**必须有封面**（thumb_media_id）。
- 外链已转为脚注（微信屏蔽外部链接）；未认证号不支持外链。

## 衔接

- 上游：`content-script-writer`（模式 D 公众号文章）→ `qu-ai-wei`（文案人味润色·公众号）→ `content-illustrator`（公众号插画）。
- 守门：`content-quality-guard` 应在排版前完成合规审查。
- 回流：发布后数据可回 `content-material-library` / 选题库，进入下一轮迭代。

## 参考

- `references/wechat-constraints.md` — 微信平台硬约束、容器块语法、图片/外链处理细则。
- `themes/` — 4 套内置主题（JSON，rules 映射，无需 cssutils/PyYAML）。
- `scripts/wechat_convert.py` / `scripts/wechat_publish.py` — 转换器与草稿推送（纯标准库）。
