# 朋友圈配图方法论（模式M）

> 本文件服务 `content-illustrator` 的**模式M（朋友圈配图）**。把一条朋友圈文案拆成 1-3 张风格一致的图卡。范式改编自 xhs-images（Style × Layout × Palette + image-1 锚点链），并适配 content-script-writer 模式C 的「配图建议」输入。

---

## 1. 输入

| 输入 | 来源 | 用途 |
|------|------|------|
| **朋友圈文案正文** | 模式C 交付 / 用户直接给 | 提取视觉机会（钩子/核心价值/CTA） |
| **配图建议**字段 | 模式C 交付 | 起点建议：图片类型/张数/风格 |
| **内容类型 + 四柱映射** | 模式C 交付 | 决定卡的语气与构图 |
| **IP 档案**（可选） | content-ip-manager | 视觉风格对齐（§4 对齐表） |

> 若只有文案没有「配图建议」：按内容类型默认 1 张封面卡；含强观点/多要点可建议 2-3 张。

---

## 2. 视觉机会分析

朋友圈文案短（3-5 段），图卡要**单张成立**——文字钩住、图片说服（模式C 六条铁律第5条）。

| 卡角色 | 对应文案位置 | 默认布局 | 作用 |
|--------|------------|---------|------|
| **封面卡 Cover** | 钩子/开头 1-2 行 | `sparse` | 视觉冲击，一秒抓住 |
| **内容卡 Content** | 核心价值/细节 | `balanced` / `dense` / `list` / `comparison` / `flow` | 把文字论点视觉化 |
| **结尾卡 Ending** | 软性 CTA / 收尾 | `sparse` / `balanced` | 情绪收束或引导互动 |

**张数默认**：
- 纯情感/金句 → 1 张封面卡（文字已在，图负责氛围）
- 含观点+要点 → 2 张（封面 + 内容）
- 含强对比/清单/流程 → 3 张（封面 + 内容 + 结尾）

> 朋友圈折叠规则（模式C 合规第1条）：图片 1-3 张最佳。不要超过 3 张。

---

## 3. 维度与选项

### 风格 Style（精选自 xhs-images，适配 IP 内容）

| 风格 | 观感 | 朋友圈适配场景 |
|------|------|--------------|
| `cute` | 甜美可爱·少女心 | 种草/日常/生活分享 |
| `fresh` | 清新自然·干净 | 生活/种草/自然主题 |
| `warm` | 温馨·亲和力 | 情感/故事/共鸣（默认推荐） |
| `bold` | 高冲击·引人注目 | 观点/避坑/警告 |
| `minimal` | 极简高级·精致 | 金句/专业封面 |
| `retro` | 复古怀旧·潮流 | 怀旧分享 |
| `pop` | 活力四射·吸睛 | 趣味/惊叹分享 |
| `notion` | 极简手绘线条·知识感 | 干货/观点卡 |
| `chalkboard` | 彩色粉笔黑板·教学 | 教程/操作步骤 |
| `study-notes` | 真实手写笔记·蓝笔红批 | 学习/重点 |
| `screen-print` | 大胆海报·网点半色调 | 观点/文化氛围封面 |
| `sketch-notes` | 手绘教育信息图·马卡龙 | 教程/清单图解 |

### 布局 Layout

| 布局 | 要点数 | 说明 |
|------|--------|------|
| `sparse`（默认封面） | 1-2 | 最大视觉冲击 |
| `balanced` | 3-4 | 标准排版 |
| `dense` | 5-8 | 知识卡风 |
| `list` | 4-7 | 列举/排行 |
| `comparison` | 左右 | 正反/对比 |
| `flow` | 3-6 步 | 流程/时间线 |
| `mindmap` | 4-8 分支 | 中心发散 |
| `quadrant` | 四象限 | 分区 |

### 配色 Palette（可选覆盖）

`macaron`（柔和教育）/ `warm`（大地温馨）/ `neon`（高能量未来）。无则用风格内置色。

---

## 4. 自动匹配（无显式风格时推荐 Top-3）

按内容信号命中评分排序，取**最匹配的前 3 种风格**，各自生成一张样张供用户挑选（样张即选风格，见 SKILL.md §5.3）。

**评分规则**：首行命中信号 +3 分；次相关信号 +1 分；未命中回退 `warm` + `sparse`（情感共鸣安全牌，作为 Top-3 保底之一）。命中多条信号时，按总分排序取 Top-3；总分相同时按上表排列顺序优先。

| 信号 | 风格 | 布局 | 预设 |
|------|------|------|------|
| 美妆/时尚/可爱/种草/粉色 | `cute` | sparse/balanced | `cute-share` |
| 健康/自然/清新/有机 | `fresh` | balanced/flow | `product-review` |
| 生活/故事/情感/暖心 | `warm` | balanced | `cozy-story` |
| 避坑/重要/警告/必须 | `bold` | list/comparison | `warning` |
| 专业/商务/优雅 | `minimal` | sparse/balanced | `clean-quote` |
| 知识/干货/概念/工具 | `notion` | dense/list | `knowledge-card` |
| 教程/学习/步骤 | `chalkboard` | balanced/dense | `tutorial` |
| 笔记/手写/重点 | `study-notes` | dense/list | `study-guide` |
| 观点/海报/评论 | `screen-print` | sparse/comparison | `editorial` |
| 手绘/图解/流程 | `sketch-notes` | flow/balanced | `hand-drawn-edu` |

> **Top-3 样张输出**：例「生活/故事/情感」命中 → Top-3 = `[warm, notion, bold]`（warm 首推，notion 知识感备援，bold 观点冲击备援），各出一张；用户挑一张后，若需同风格多卡，以选定风格为锚点链。

---

## 5. 大纲策略（三选一，自动推荐一种）

| 策略 | 概念 | 朋友圈适配 | 结构 |
|------|------|-----------|------|
| **A 故事驱动** | 个人体验为主线·情感优先 | 客户故事/前后对比/深夜感悟 | 钩子 → 痛点 → 发现 → 体验 → 结论 |
| **B 信息密集** | 价值优先·高效传递 | 避坑/清单/干货 | 核心结论 → 信息卡 → 优劣 → 推荐 |
| **C 视觉先行** | 视觉冲击为核心·文字极简 | 高颜值/氛围/种草 | 主图 → 细节 → 场景 → CTA |

默认推荐 **A 或 C**（朋友圈重真实感与氛围）；B 用于干货/避坑类。

---

## 6. 一致性：image-1 锚点链（关键）

朋友圈图卡系列**最怕风格漂移**（角色/配色/线条在每张图变样）。唯一最重要的一致性技巧：

1. **先出图1（封面）**，不带 `--ref`，定下角色渲染、配色、线条、底色——这就是锚。
2. 图2+ 生成时，**把图1 作为 `--ref`** 传给后端，让后续卡继承锚的视觉基因。
3. 即便后端支持 sessionId，也用 ref 链——双保险。
4. 用户参考图（`--ref`）是**额外叠加**在锚点链之上，不要和图1 锚重复堆叠。

> 单张卡（默认 1 张）无锚点链需求，直接出。

> **Top-3 样张阶段不用锚点链**：§4 生成的 3 张样张是不同风格对比用途，彼此独立出图、互不参考。锚点链仅在用户**选定一种风格后**，要出同风格多张系列图时才启用（图2+ 以选定风格的样张为 ref）。

---

## 7. 大纲模板 outline.md

```yaml
---
mode: moments
style: top3                    # top3 = 出 Top-3 风格样张；选定后改为具体风格名
palette: default
count: 2                       # 样张阶段=3（不同风格）；选定后按系列重新计
anchor: (选定风格后填写，如 01-cover-warm-{slug}.png)
references:                    # 仅当用户提供参考图且文件存在
  - ref_id: 01
    filename: refs/01-ref-{slug}.png
    usage: direct
---

## Sample A — Top-3 样张 1 (warm)
**Role**: 风格样张
**Visual Content**: [钩子句主视觉——warm 温馨场景感]
**Layout**: sparse
**Filename**: 01-cover-warm-{slug}.png
**Ref**: (无，样张独立)

## Sample B — Top-3 样张 2 (notion)
**Role**: 风格样张
**Visual Content**: [同钩子句——notion 极简知识感]
**Layout**: sparse
**Filename**: 02-cover-notion-{slug}.png
**Ref**: (无，样张独立)

## Sample C — Top-3 样张 3 (bold)
**Role**: 风格样张
**Visual Content**: [同钩子句——bold 高冲击]
**Layout**: sparse
**Filename**: 03-cover-bold-{slug}.png
**Ref**: (无，样张独立)

# 用户选定 warm 后，若需内容卡：
## Card 2 — Content (warm)
**Role**: 内容卡
**Position**: 文案核心价值段旁
**Visual Content**: [把核心论点视觉化]
**Layout**: balanced
**Filename**: 04-content-warm-{slug}.png
**Ref**: 01-cover-warm-{slug}.png  # 锚点链
```

---

## 8. 确认步骤（Step 3 详细）

**硬门**：生成前必须确认（除非用户说「直接生成」等跳过词）。

一个问题、合并选项（≤4 问）：

| 问 | 选项（含推荐） |
|----|--------------|
| 风格 | **默认直接出 Top-3 风格样张**（warm/notion/bold 等按匹配），无需先选；显式指定单一风格则跳过样张 |
| 布局/张数 | 按视觉机会推荐（推荐）/ 调整 |
| 配色 | 默认（风格内置色）（推荐）/ macaron / warm / neon |
| 后端 | 本地图像工具（推荐）/ 询问 |

展示摘要后再问：
```
📋 朋友圈配图方案（自动匹配 Top-3）
  内容：[内容类型] | 六感：[触发项]
  策略：[A/B/C] [name]（[reason]）
  风格：出 Top-3 样张 [A:warm / B:notion / C:bold] · 布局：[layout] · 配色：[palette]
  样张即选风格；选定后同系列用锚点链
```

---

## 9. 生成与交付

1. 每张卡提示词写入 `prompts/NN-{style}-{slug}.md`（见 prompt-templates.md，NN 含风格区分）。
2. **Top-3 样张阶段**：3 张不同风格各自独立出图（无 ref），文件名带风格后缀（如 `01-cover-warm.png`）。
3. 用户选定风格后，若需同系列多卡：先出图1（无 ref）定调，再出图2+（以图1 为 ref 锚点链）。
4. 失败重试一次。
5. 交付：图片文件 + 每张「插入建议」（配在文案哪一段/哪一句旁）+ 输出摘要。

```
朋友圈配图完成！
方案：策略[A] · Top-3 样张[warm/notion/bold] · 选定[warm] · 配色[default] · 张数[2] · 锚点链[✓]
位置：配图/朋友圈/{slug}/
- 01-cover-warm-{slug}.png ✓ 封面样张（sparse）→ 文案最上方
- 02-cover-notion-{slug}.png ✓ 样张（sparse）
- 03-cover-bold-{slug}.png ✓ 样张（sparse）
- （选定 warm 后）04-content-warm-{slug}.png ✓ 内容（balanced）→ 核心价值段旁
```

---

## 10. 高危行业注意

- 🔴 财经：不画「稳赚/保本」类误导图；遵守模式C 财经合规声明。
- 🔴 医疗：不画「治愈率/疗效保证」图。
- 🔴 法律：不画「必胜/包赢」图。
- 配图文字只来自文案已确认内容，不新增收益承诺。
