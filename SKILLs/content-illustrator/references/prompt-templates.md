# 提示词构造模板（两模式共用）

> 每张图出图前，必须把最终完整提示词写入 `prompts/NN-{type-or-layout}-{slug}.md`。本文件给出：提示词文件格式、默认构图/颜色/人物/文字规则、朋友圈卡与公众号插画的具体模板。**所有含文字的提示词必须追加 CJK 防乱码句（§4）。**

---

## 1. 提示词文件格式

```yaml
---
illustration_id: 01
mode: moments              # 或 article
style: warm                # 风格
palette: default           # 或 macaron/warm/neon
layout: sparse             # 模式M：布局
type: infographic          # 模式A：类型
references:                # 仅当用户参考图文件确实存在
  - ref_id: 01
    filename: refs/01-ref-{slug}.png
    usage: direct          # direct | style | palette
aspect: "1:1"              # 或 4:5 / 3:4 / 16:9 / 4:3
---

[按下方模板填充正文]
```

**⚠️ 何时写 `references`**：参考图文件确实存入 `refs/` 才写；仅口头描述则把风格/配色文字追加到正文，不写 frontmatter。

---

## 2. 默认构图要求（所有提示词通用）

| 要求 | 描述 |
|------|------|
| 干净构图 | 简单布局，无视觉 clutter |
| 留白 | 充足边距，元素间呼吸感 |
| 无复杂背景 | 纯色或微妙渐变，避免花哨纹理 |
| 居中或按需 | 主视觉居中或按内容需要摆放 |
| 图形匹配 | 图形元素贴合内容主题 |
| 突出核心信息 | 留白引导视线到关键信息 |

追加到所有提示词：
> Clean composition with generous white space. Simple or no background. Main elements centered or positioned by content needs.

---

## 3. 颜色 / 人物 / 文字规则

### 颜色规则
颜色 hex 仅作渲染指引，不是要显示的文字。模型有时会把色名/hex 画成可见标签——必须防止。

追加到所有含 COLORS 的提示词：
> Color values (#hex) and color names are rendering guidance only — do NOT display color names, hex codes, or palette labels as visible text in the image.

### 人物渲染
| 准则 | 描述 |
|------|------|
| 风格 | 简化卡通剪影或符号化表达 |
| 避免 | 写实人脸、精细五官 |
| 多样性 | 多人时体型各异 |
| 情绪 | 用姿态与简单手势表达 |

追加到含人物的提示词：
> Human figures: simplified stylized silhouettes or symbolic representations, not photorealistic.

### 文字规则
| 元素 | 准则 |
|------|------|
| 尺寸 | 大、醒目、一眼可读 |
| 风格 | 手写体优先（温暖感） |
| 内容 | 仅关键词与核心概念 |
| 语言 | 匹配文案/文章语言 |

追加到含文字的提示词：
> Text should be large and prominent with handwritten-style fonts. Keep minimal, focus on keywords.

---

## 4. CJK 防乱码（关键，所有含非拉丁文字的图必加）

追加到**每一个**含文字的提示词末尾：
> CRITICAL: All text in the image must be perfectly legible with ZERO garbled characters (乱码), ZERO incorrect characters, ZERO corrupted glyphs. Use clean sans-serif fonts only (e.g., PingFang SC, Noto Sans SC style). Keep text labels to 3-5 characters maximum.

若风格本身有装饰性文字处理，再加：
> Text must remain readable despite stylistic treatment. No garbled or corrupted characters.

---

## 5. 朋友圈卡模板（模式M）

```
[Card N] — [Role: Cover/Content/Ending]

VISUAL CONCEPT: [这张卡传达什么，绑定文案哪一句]
MOOD: [情绪基调，来自文案调性]

LAYOUT: [sparse/balanced/dense/list/comparison/flow/mindmap/quadrant]

BACKGROUND: [风格特定底色，如 warm → 柔桃色微渐变]

ELEMENTS: [装饰/图标/涂鸦，克制使用]

TYPOGRAPHY:
- 主标题：[文案钩子句，≤10字]
- 副文：[可选，≤6字]
- 保持标签 ≤3-5 字

COLORS: [palette hex，语义化]

STYLE: [风格特定渲染，如 warm → 柔光、暖调、手绘感]

ASPECT: 1:1
```

**warm 风格示例片段**：
```
BACKGROUND: Soft peach (#FFECD2) gentle gradient, cozy.
ELEMENTS: small doodle of a warm mug, soft rounded shapes.
STYLE: Warm, approachable, soft lighting, hand-drawn friendly lines, not photorealistic.
```

**bold 风格示例片段**：
```
BACKGROUND: High-contrast solid color block.
ELEMENTS: Bold geometric shapes, strong focal icon.
STYLE: High impact, bold outlines, attention-grabbing, minimal decoration.
```

---

## 6. 公众号插画模板（模式A）

### 信息图 infographic
```
[Title] - 数据可视化

Layout: [grid/radial/hierarchical]

ZONES:
- Zone 1: [具体数值/数据点]
- Zone 2: [对比/指标]
- Zone 3: [结论]

LABELS: [文章中的真实数字/术语/指标，不用占位]
COLORS: [语义化配色：红=警示 绿=正向]
STYLE: [风格特定渲染]
ASPECT: 16:9
```

### 场景图 scene
```
[Title] - 氛围场景

FOCAL POINT: [主主体]
ATMOSPHERE: [光线/环境]
MOOD: [情绪]
COLOR TEMPERATURE: [暖/冷/中性]
STYLE: [风格特定渲染]
ASPECT: 4:3
```

### 流程图 flowchart
```
[Title] - 流程

Layout: [左右/上下/环形]

STEPS:
1. [步骤名] - [简述]
2. [步骤名] - [简述]

CONNECTIONS: [箭头类型/决策点]
STYLE: [风格特定渲染]
ASPECT: 16:9
```

### 对比图 comparison
```
[Title] - 对比视图

LEFT - [选项A]:
- [要点1]
- [要点2]

RIGHT - [选项B]:
- [要点1]
- [要点2]

DIVIDER: [视觉分隔]
STYLE: [风格特定渲染]
ASPECT: 16:9
```

### 框架图 framework
```
[Title] - 概念框架

STRUCTURE: [层级/网络/矩阵]

NODES:
- [概念1] - [角色]
- [概念2] - [角色]

RELATIONSHIPS: [节点如何连接]
STYLE: [风格特定渲染]
ASPECT: 16:9
```

### 时间线 timeline
```
[Title] - 时间脉络

DIRECTION: [横向/纵向]

EVENTS:
- [时期1]: [里程碑]
- [时期2]: [里程碑]

MARKERS: [视觉标记]
STYLE: [风格特定渲染]
ASPECT: 16:9
```

---

## 7. notion 风格渲染片段（公众号默认推荐）

```
Minimalist hand-drawn line art on clean white/notion-beige background.
Thin consistent black or dark ink lines, subtle wobble, no heavy fills.
Simple geometric icons, generous white space, intellectual and calm.
No photorealistic elements, no gradients beyond faint paper texture.
```

---

## 8. 水印（可选）

若用户要求，追加到提示词正文：
```
Include a subtle watermark "[内容]" positioned at [位置].
The watermark should be legible but not distracting.
```

---

## 9. 文字修正政策

- 图中文字乱码/错字/难读 → **不**用程序化叠加修补；从修正后的提示词**重出**新文件新路径（保留次品对比）。
- 后期处理仅限裁剪/缩放/压缩/格式转换，且不改动文字与主构图。

---

## 10. 封面图模板（模式K）

结合 cover-image 的提示词结构与 content-illustrator 的 CJK 零乱码硬规则。出图前写入 `prompts/01-cover-{slug}.md`。

```yaml
---
illustration_id: 01
mode: cover
type: conceptual          # hero / conceptual / typography / metaphor / scene / minimal
palette: elegant           # warm/elegant/cool/dark/earth/vivid/pastel/mono/retro/duotone/macaron
rendering: digital         # flat-vector/hand-drawn/painterly/digital/pixel/chalk/screen-print
text: title-only           # none/title-only/title-subtitle/text-rich
mood: balanced             # subtle/balanced/bold
font: clean                # clean/handwritten/serif/display
aspect: "16:9"             # 16:9 / 2.35:1 / 1:1 / 3:4
title: "[模式D 原文标题 / 模式A-B 钩子原文]"
references: []             # 仅当用户参考图文件确实存在
---

# Content Context
Article title: [原文标题，绝不臆造或改写]
Content summary: [2-3 句核心主张摘要，来自 brief/claims 或脚本钩子]
Keywords: [5-8 个关键词，用于图标/装饰元素]

# Visual Design
Cover theme: [从核心主张提炼的 2-3 词视觉隐喻，如"不敢被看见"]
Type: [type]
Palette: [palette]
Rendering: [rendering]
Font: [font]
Text level: [text]
Mood: [mood]
Aspect ratio: [aspect]
Language: zh

# Text Elements
- title-only: "Title: [原文标题]"
# - title-subtitle: "Title: [原文] / Subtitle: [副文]"
# - text-rich: "Title: [原文] / Subtitle: [副文] / Tags: [2-4 关键词]"

# Mood Application
[subtle: low contrast, muted, light weight | balanced: medium contrast, standard | bold: high contrast, vivid, heavy]

# Font Application
[clean: geometric sans-serif | handwritten: warm hand-lettered | serif: elegant editorial | display: bold decorative]

# Composition
Type composition: [Type 对应构图，见 cover-methodology.md §2]
Visual composition:
- Main visual: [具象隐喻，如"一个人站在聚光灯外、身后是一扇半开的门"]
- Layout: [主视觉居中或偏左，右侧/底部留标题区]
- Decorative: [palette 装饰提示，强化主题]
Color scheme: [palette 主色/底色/强调，按 mood 调整]
Color constraint: Color values (#hex) and color names are rendering guidance only — do NOT display color names, hex codes, or palette labels as visible text in the image.

# Text Accuracy Constraint
CRITICAL: All text in the image must be perfectly legible with ZERO garbled characters (乱码), ZERO incorrect characters, ZERO corrupted glyphs. Use clean sans-serif fonts only (e.g., PingFang SC, Noto Sans SC style). Keep text labels to 3-5 characters maximum. If text cannot be rendered perfectly, omit it entirely and use visual elements instead.

Rendering notes: [rendering 关键特征：线条/纹理/深度/元素词汇]
Type notes: [type 关键特征]
Palette notes: [palette 关键特征]
```

**参考图（可选）**：用户 `--ref` 或贴图时，存入 `refs/` 并在 frontmatter `references` 列出；同时按 cover-image「Reference-Driven Design」规则在正文写详细 MUST/REQUIRED 指令，不止传 `--ref`。

**高危行业（财经/IP 红线）**：封面文字只用成稿原文标题/钩子，绝不新增收益承诺或数据；隐喻只用方案隐喻（如"资产隔离"用"分隔的容器"），不用立场隐喻。

---

## 11. Top-3 风格样张命名与出图

模式M（朋友圈）与模式K（封面）默认出 **3 张不同风格样张**，文件名须带风格后缀以便区分与挑选：

| 模式 | 命名格式 | 示例 |
|------|---------|------|
| 朋友圈（M） | `NN-cover-{style}-{slug}.png` | `01-cover-warm-xiaoguoliang.png` / `02-cover-notion-xiaoguoliang.png` / `03-cover-bold-xiaoguoliang.png` |
| 封面（K） | `NN-cover-{palette}-{rendering}-{slug}.png` | `01-cover-warm-handdrawn.png` / `02-cover-elegant-digital.png` / `03-cover-bold-screenprint.png` |

- 每个样张是**独立提示词文件**（各自 `prompts/NN-*.md`），不共用 ref（样张彼此独立，见 SKILL.md §5.4）。
- **CJK 零乱码句（§4）对每张样张必加**——不同风格渲染下中文易出乱码，须逐张保障。
- 用户选定某风格后，同系列/比例变体沿用该风格，文件名延续风格后缀（如 `04-cover-warm-share.png`）。
- 公众号（A）不默认出 3 样张，文件名按位置 `NN-{type}-{slug}.png`，风格由 §9 确认策略决定（单风格贯穿 / 多种风格）。
