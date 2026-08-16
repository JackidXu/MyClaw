# 封面图方法论（模式K）

> 本文件服务 `content-illustrator` 的**模式K（封面图）**。把公众号文章（模式D 成稿）或视频脚本（模式A/B 成稿）变成一张用于发布的封面/头图/缩略图。方法论改编自 `cover-image` skill 的**五维体系**（Type × Palette × Rendering + Text/Mood + Font/Aspect），并复用 content-illustrator 的底层纪律（CJK 零乱码、提示词优先、确认后生成、不用 SVG 替代、IP 视觉风格对齐）。

---

## 1. 输入

| 输入 | 来源 | 用途 |
|------|------|------|
| **文章标题 / 钩子** | 模式D 成稿标题区 / 模式A/B 脚本钩子 | 封面文字来源（不臆造） |
| **核心主张 / 摘要** | 模式D brief+claims / 模式A/B 脚本 | 提炼视觉隐喻、关键词 |
| **IP 档案 风格定位** | content-ip-manager | 五维自动匹配的持久偏好 |
| **发布平台** | 用户指定 | 决定 Aspect 与文字层级 |

> 朋友圈封面由**模式M 的封面卡**承担，本模式 K 主要服务：**公众号文章封面** + **视频封面/缩略图**。

---

## 2. 五维体系

模式K 用完整五维（cover-image 范式），比模式M/A 更重「整体调性 + 文字层级」。

| 维度 | 取值 | 默认 |
|------|------|------|
| **Type 构图** | hero / conceptual / typography / metaphor / scene / minimal | auto |
| **Palette 配色** | warm / elegant / cool / dark / earth / vivid / pastel / mono / retro / duotone / macaron | auto |
| **Rendering 渲染** | flat-vector / hand-drawn / painterly / digital / pixel / chalk / screen-print | auto |
| **Text 文字层级** | none / title-only / title-subtitle / text-rich | title-only |
| **Mood 情绪** | subtle / balanced / bold | balanced |
| **Font 字体** | clean / handwritten / serif / display | clean |
| **Aspect 比例** | 见 §3 | 见 §3 |

### Type（构图）

| Type | 简述 | 最适合 |
|------|------|--------|
| `hero` | 大视觉冲击，标题叠加 | 产品/品牌/重大宣布 |
| `conceptual` | 抽象概念、信息层级 | 方法论/架构/技术文 |
| `typography` | 标题为主元素（≥40%） | 观点/金句/洞察 |
| `metaphor` | 具象物喻抽象（锁喻安全） | 哲学/成长/个人突破 |
| `scene` | 氛围场景、叙事感 | 故事/旅行/生活方式 |
| `minimal` | 单一焦点、大留白 | 极简/核心概念 |

### Palette（配色，精选）

| Palette | 调性 | 适合 |
|---------|------|------|
| `warm` | 暖橙/桃/陶土，亲和 | 个人成长/故事/情绪 |
| `elegant` | 珊瑚/雾蓝/金，低调奢华 | 商业/专业/思想领导力 |
| `cool` | 冷静科技蓝 | 架构/技术/数据 |
| `dark` | 暗底高对比 | 电影感/ premium |
| `earth` | 自然大地色 | 自然/健康/有机 |
| `mono` | 单色极简 | 极简/聚焦 |
| `macaron` | 柔和教育 | 教程/知识 |
| 其余 | retro/vivid/pastel/duotone | 复古/促销/梦幻/双色海报 |

> ⚠️ 配色 hex 仅作渲染指引，**绝不**把色名/hex 画成可见文字（content-illustrator §5.5）。

### Rendering（渲染）

| Rendering | 观感 | 配字体 |
|-----------|------|--------|
| `flat-vector` | 扁平矢量·干净描边 | clean / display |
| `hand-drawn` | 手绘·有机·有温度 | handwritten |
| `painterly` | 水彩·柔和·梦幻 | handwritten / serif |
| `digital` | 数字·精致·SaaS 感 | clean / serif |
| `pixel` | 像素·复古 | display |
| `chalk` | 粉笔·教学 | handwritten |
| `screen-print` | 海报·网点·大胆 | display / serif |

### Text（文字层级）

| Text | 含 | 视觉占比 | 适用 |
|------|----|---------|------|
| `none` | 纯视觉 | 100% | 摄影/抽象/外部加标题 |
| `title-only` | 主标题 | 85% | 多数文章封面（默认） |
| `title-subtitle` | 标题+副文 | 75% | 技术/系列需上下文 |
| `text-rich` | 标题+副文+2-4 标签 | 60% | 信息密集/多要点 |

> **封面文字来源纪律**：只用模式D 标题区 / 模式A-B 钩子的**原文**；绝不臆造、改写标题（cover-image §Text Accuracy）。CJK 文字遵守 content-illustrator §5.5 零乱码硬规则。

### Mood（情绪）

| Mood | 对比/饱和/重量 |
|------|---------------|
| `subtle` | 低对比·去饱和·轻 |
| `balanced` | 标准（默认） |
| `bold` | 高对比·高饱和·重 |

### Font（字体）

| Font | 观感 |
|------|------|
| `clean` | 几何无衬线·现代中性（默认） |
| `handwritten` | 手写·温暖·个人 |
| `serif` | 衬线·编辑感·权威 |
| `display` | 装饰粗体·吸睛 |

---

## 3. Aspect（比例，按平台）

| 场景 | 推荐 Aspect | 说明 |
|------|-------------|------|
| 公众号首图（16:9 展示） | `16:9` | 默认，列表页横向 |
| 公众号头图横幅 | `2.35:1` | 顶部通栏 |
| 公众号分享卡 | `1:1` | 转发方形 |
| 视频封面（横屏 B站/视频号） | `16:9` | 默认 |
| 视频封面（竖屏 抖音/视频号竖版） | `3:4` | 竖版封面 |

> 默认：`16:9`（最通用）。用户指定平台时按上表取。

---

## 4. 自动匹配（无显式维度时推荐 Top-3）

优先级：**IP 档案风格定位 > 内容信号 > 默认值**。

默认输出 **Top-3 风格组合**（Type/Palette/Rendering 各取最优，按匹配度评分排序取前 3），各自生成一张样张供用户挑选（样张即选风格，见 SKILL.md §5.3）。用户显式指定单一组合（如"用 elegant+digital"）或说"出一张"时，按 Top-1 单张出图。

### 4.1 IP 风格定位 → 五维映射

| IP 风格定位（文字） | 推荐 Palette | Rendering | Font | 备注 |
|--------------------|-------------|-----------|------|------|
| 大白话、犀利直接、戳痛点 | `bold`→`dark`/`vivid` | `screen-print`/`flat-vector` | `display`/`clean` | 观点鲜明 |
| 温柔、有温度、共情 | `warm` | `hand-drawn` | `handwritten` | 情感 |
| 专业沉淀、理性靠谱 | `elegant`/`cool` | `digital`/`flat-vector` | `clean`/`serif` | 财经/专业 |
| 教育者、爱讲方法 | `macaron` | `hand-drawn`/`chalk` | `handwritten` | 教程 |
| 生活方式、审美在线 | `earth`/`pastel` | `painterly`/`flat-vector` | `clean`/`serif` | 生活方式 |
| 观点鲜明、爱输出立场 | `duotone`/`dark` | `screen-print` | `display` | 海报感 |

无 IP 档案时回退内容信号自动匹配（§4.2）。

### 4.2 内容信号 → Type/Palette/Rendering（改编自 cover-image auto-selection）

| 信号 | Type | Palette | Rendering |
|------|------|---------|-----------|
| 个人故事/情感/成长 | metaphor / scene | warm | hand-drawn |
| 商业/专业/思想领导力 | conceptual / typography | elegant | digital |
| 架构/方法论/技术 | conceptual | cool | flat-vector |
| 金句/观点/洞察 | typography | mono / elegant | flat-vector |
| 哲学/突破/意义 | metaphor | earth / warm | painterly |
| 宣布/促销/事件 | hero | vivid / dark | screen-print |
| 极简/核心概念 | minimal | mono | flat-vector |

Text 自动：文章封面→`title-only`；系列/技术→`title-subtitle`；多要点→`text-rich`。
Mood 自动：专业/思想→`subtle`；通用→`balanced`；宣布/促销→`bold`。
Font 自动：个人/温暖→`handwritten`；专业/数据→`clean`；编辑/权威→`serif`；宣布/促销→`display`。

> **Top-3 样张示例**：信号「个人故事/情感/成长」命中 → 主推 `metaphor + warm + hand-drawn`；取次优 2 组作备援样张（如 `conceptual + elegant + digital`、`typography + bold + screen-print`），共 3 张不同风格样张，文件名带风格后缀（`01-cover-warm-handdrawn.png` / `02-cover-elegant-digital.png` / `03-cover-bold-screenprint.png`）。用户挑一张定稿；要同风格再出比例变体（2.35:1 头图 / 1:1 分享卡）时不重出样张，直接沿用选定风格。

---

## 5. 大纲策略与 outline 模板

默认出 **Top-3 风格样张**（3 张不同风格，同标题）；用户选定一张后再按该风格出比例变体（2.35:1 头图 / 1:1 分享卡）。

```yaml
---
mode: cover
style_strategy: top3       # top3 = 出 Top-3 风格样张；选定后改为具体组合名
aspect: "16:9"
title: "[模式D 原文标题]"
references: []            # 仅当用户参考图文件确实存在
---

## Sample A — Top-3 样张 1 (warm + hand-drawn)
type: metaphor
palette: warm
rendering: hand-drawn
text: title-only
mood: balanced
font: handwritten
**Visual Metaphor**: [从核心主张提炼的具象隐喻]
**Filename**: 01-cover-warm-handdrawn.png

## Sample B — Top-3 样张 2 (elegant + digital)
type: conceptual
palette: elegant
rendering: digital
text: title-only
mood: subtle
font: clean
**Visual Metaphor**: [同隐喻，不同视觉处理]
**Filename**: 02-cover-elegant-digital.png

## Sample C — Top-3 样张 3 (bold + screen-print)
type: typography
palette: bold
rendering: screen-print
text: title-only
mood: bold
font: display
**Visual Metaphor**: [同隐喻，海报感处理]
**Filename**: 03-cover-bold-screenprint.png

# 用户选定 A 后，若需比例变体：
## Share Card — 1:1 (沿用 warm + hand-drawn)
aspect: "1:1"
**Filename**: 04-cover-warm-share.png
```

---

## 6. 确认步骤（Step 3 详细）

**硬门**：生成前必须确认（除非用户说「直接生成」等跳过词，§5.3）。

一个问题、合并选项（≤4 问，用 AskUserQuestion）：

| 问 | 选项（含推荐） |
|----|--------------|
| 风格组合 | **默认直接出 Top-3 风格样张**（按匹配度排序，如 warm+hand-drawn / elegant+digital / bold+screen-print），无需先选；显式指定单一组合则跳过样张 |
| 文字层级 | 按场景推荐 Text（推荐）/ none/title-subtitle/text-rich |
| 比例/后端 | Aspect 按平台（推荐）/ 本地图像工具（推荐） |

展示摘要后再问：
```
📋 封面图方案（自动匹配 Top-3）
  来源：[公众号文章 / 视频脚本] | 平台：[微信16:9 / 抖音3:4]
  样张：01 warm+hand-drawn / 02 elegant+digital / 03 bold+screen-print
  Text：[text] · Aspect：[ratio] · 标题：[原文标题]
  IP 对齐：[风格定位 → 五维]
  样张即选风格；选定后出比例变体
```

---

## 7. 提示词构造

每张封面出图前，把最终完整提示词写入 `prompts/01-cover-{slug}.md`（模板见 prompt-templates.md §10）。含封面文字的提示词**必加 CJK 零乱码句**（§5.5）。

流程顺序（content-illustrator §5）：
1. 解析后端（本地 ImageGen 为默认）。
2. 写提示词文件（硬要求）。
3. 确认后生成（§5.3）。
4. 失败重试一次。

> 多张封面（如首图+分享卡）出图后**核对路径**：并行调用可能不分别采用 `output_dir`（实测 ImageGen 已知行为），统一目录后移动或顺序调用（§5.4）。

---

## 8. 高危行业注意（财经/IP 红线）

- 🔴 财经封面：不画「稳赚/保本/收益曲线向上」等误导图；封面文字只用标题原文，不加收益承诺。
- 🔴 医疗/法律同理：不画「治愈率/必胜」图。
- 封面文字只来自成稿已确认标题/钩子，不新增数据或主张。
- IP 红线清单（如「不碰身份敏感立场」）在隐喻选择时遵守——用方案隐喻，不用立场隐喻。

---

## 9. 完成报告格式

```
封面图生成完成！
来源：[公众号文章 / 视频脚本] | 平台：[平台] | Aspect：[ratio]
Top-3 样张：
- 01-cover-warm-handdrawn.png ✓ warm+hand-drawn
- 02-cover-elegant-digital.png ✓ elegant+digital
- 03-cover-bold-screenprint.png ✓ bold+screen-print
选定：[01] | Text：[text] | 标题：[原文标题]
IP 对齐：[风格定位 → 五维]
位置：配图/封面/{slug}/
- （选定后）04-cover-warm-share.png ✓ 1:1 分享卡（同 warm 调性）
```
