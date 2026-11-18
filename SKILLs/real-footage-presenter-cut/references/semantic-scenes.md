# ⚠️ 已废弃：semantic 自动画层（不要照这份文档写镜头表）

> **以 `references/semantic-thinking.md` 为准。**
> 这份文档描述的「运行时自动替换非素材画面」的能力已经**整体撤除**，
> `kit/semantic_scenes.js` 现在只是无内容的绘图工具箱（`window.KIT_ART`），
> 不会挂到任何场景、不会自动选构图、不会自动填文案、不会自动分配图标。
>
> 本文件保留下来只作上下文，防止旧片子 / 旧对话里的写法被误当成现行规则。

---

## 为什么撤

用户认可的 mid 成片里，第 3/6/7/8 镜是**当时读着口播现画的**，当时没有任何模板
（逐镜拆解见 `references/mid-film-breakdown.md`）。后来把那一次的画面固化成了六种固定构图、
`pickKind()` 自动选型、`ONE ENTRY` / `YOUR RULES` / `FAQ` 固定卡眉、
`['book','rocket','clock']` 按第几张卡自动发图标，还默认自动生效——
结果每条片子、每个 AI 工具做出来的非素材画面都长一个样。

**那不是「会按语义画」，是把某一次画出来的东西写死了。** 用户要的是能根据语义做出画面的能力，
不是把元素写死。换一条口播、换一个 AI 工具，画出来本来就应该不一样。

---

## 错误对照表

| 这份文档以前写的（**已失效**） | 现在该怎么做 |
|---|---|
| `install()` 给 `AUTO` 清单的场景挂网关，默认透传、内容稀疏时自动升级 | 不挂任何网关。非素材画面由写镜头表的人按 `references/semantic-thinking.md` 的四步自己设计，写在 `art.js` 里 |
| 镜头表写 `semantic:{kind:'triple'}` / `semantic:true` / `semantic:'rich'` 强制升级 | `semantic` 已废弃，`--check` 会提醒。自己写 `art.js`，在 `film.js` 里把 `SCENES[name].make` 指过去 |
| `semantic:false` 强制走原版 | 不需要。带真素材的场景本来就一律走原技能，别覆盖它们的 `make` |
| `pickKind()` 按关键词从六种构图里自动选（statement / metric / dialog / headline / triple / persona） | 不给「关键词 → 版式」映射表。按四步思考自己判断这一镜的信息结构，再决定主焦点和呈现形式 |
| 六种固定构图 `S_PERSONA` / `S_DIALOG` / `S_STATEMENT` / `S_TRIPLE` / `S_METRIC` / `S_HEADLINE` | 已删除。工具箱只有无内容的零件：`BG` / `TITLE` / `TXT` / `CARD` / `STICK` / `GLASS` / `ICO` / `A` 等，inner 由你拼 |
| 固定英文卡眉 `ONE ENTRY` `YOUR RULES` `YOUR JUDGEMENT` `FAQ` `THE NUMBER` `CHAPTER` `INPUT` | 已删除。所有文字由调用方传入，工具箱一个默认文案都不给；上屏内容必须来自口播原话或核实过的原文 |
| 固定图标顺序 `['book','rocket','clock']`、不足三张自动补齐 | 已删除。图标库只是一组可选零件，用哪个、按什么顺序由语义决定；取不到内容就少画一张，绝不拿占位词凑数 |
| `density()` / `DENSITY` / `MIN_DUR` / `realFootage()` 自动判定要不要升级 | 已删除。时长、留白、字幕避让改由写画层的人自检，见 `semantic-thinking.md` 的「落点和时长」「交片前自检」 |

---

## 还有参考价值的部分（已搬进新文档）

这些经验本身没错，只是不再由代码自动执行，现在是写画层时的自检项：

- 每屏 34–55 个汉字，2–6 秒能读完；1 个主焦点 + 1 张短句卡 + 少量贴片，留白 30% 以上。
- 元素多、字多的一屏至少 3.0 秒；cue 落点夹在镜内，末尾留静止可读时间。（本文件已废弃，数值以 `references/semantic-thinking.md` 为准。）
- 卡片内部内容垂直居中成簇，不许 `margin-top:auto` 把出处顶到卡底、中间空一大块；
  取不到内容就少画元素，不拿废话填空白。
- 全屏字幕 `top=936`；`pip` 镜 y>880 不放元素；`window` 镜图形板有缩放，板内底部反而安全。
- 配色深蓝 + 琥珀金 + 米白，图标用单色线稿，不用彩色 emoji。

---

## 现在读哪几份

| 要做什么 | 读 |
|---|---|
| 非素材画面怎么按语义自己设计（四步思考、硬原则、自检、art.js 骨架） | **`references/semantic-thinking.md`** |
| 无内容绘图零件的 API | `kit/semantic_scenes.js`（`window.KIT_ART`）+ `starter/art.js` |
| 带真素材的镜头：动效什么时候用、怎么运作、可复制片段 | **`references/footage-effects.md`** + `kit/effects.html` |
| 成片里哪些是原技能做的、哪些是后期手绘的 | `references/mid-film-breakdown.md` |
