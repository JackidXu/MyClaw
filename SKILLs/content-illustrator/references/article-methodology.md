# 公众号配图方法论（模式A）

> 本文件服务 `content-illustrator` 的**模式A（公众号配图）**。按公众号文章结构，在关键论证位置生成插画。范式改编自 article-illustrator（Type × Style × Palette + 结构定位），并接管 content-script-writer 模式D「不含配图…由其他环节负责」的边界。

---

## 1. 输入

| 输入 | 来源 | 用途 |
|------|------|------|
| **公众号成稿正文** | 模式D 交付 | 分析结构，定位配图位置 |
| **brief（文章任务书）** | 模式D 交付 | 读者问题/核心判断/框架 → 决定哪些位置值得配图 |
| **claims（主张清单）** | 模式D 交付 | 识别强对比/强框架主张 → 对比图/框架图候选 |
| **IP 档案**（可选） | content-ip-manager | 视觉风格对齐（§4 对齐表） |

> 若只给成稿无 brief/claims：仍可按正文结构分析配图位置，但主张强弱判断会弱一些。

---

## 2. 内容分析

| 分析项 | 输出 |
|--------|------|
| 内容类型 | 技术/教程/方法论/叙事/观点 |
| 配图目的 | 信息呈现 / 可视化 / 意象营造 |
| 核心论点 | 2-5 个可视觉化的主张 |
| 配图位置 | 哪些段落加图最有价值 |
| 推荐 Type | 基于内容信号与目的 |
| 推荐密度 | 基于篇幅与复杂度 |

**CRITICAL**：比喻 → 可视化其**底层概念**，不是字面画。例：「电锯切西瓜」不要画电锯切西瓜，要画它隐喻的「降维打击」结构。

---

## 3. 配图位置判定

**该配图**：
- 核心论点（REQUIRED）——每篇至少 1 张定调图
- 抽象概念（读者难想象的词）
- 数据对比 / 前后对比
- 流程、工作流、步骤
- 框架 / 模型 / 架构

**不该配图**：
- 比喻字面化
- 纯装饰场景
- 泛泛而谈的通用图

---

## 4. 类型 Type（信息结构）

| Type | 最佳用于 | 公众号场景 |
|------|---------|-----------|
| `infographic` 信息图 | 数据/指标/技术 | 干货文的数据呈现、概念科普 |
| `scene` 场景图 | 叙事/情感 | 人物故事、客户场景、情绪收束 |
| `flowchart` 流程图 | 流程/工作流 | 操作步骤、方法论拆解 |
| `comparison` 对比图 | 并排/选项 | 正反观点、Before/After、方案对比 |
| `framework` 框架图 | 模型/架构 | 文章核心判断的框架定调 |
| `timeline` 时间线 | 历史/演进 | 行业演变、事件脉络 |

**默认**：无强内容信号时，推荐 `infographic` + `notion`（知识感安全牌）。

---

## 5. 风格 Style（渲染方式）

| 风格 | 公众号适配 |
|------|-----------|
| `notion` | 极简手绘线条·知识感（默认推荐） |
| `minimal` | 极简高级·专业总结/商务 |
| `sketch-notes` | 手绘教育信息图·马卡龙（概念科普） |
| `warm` | 温馨·人物故事/情感 |
| `bold` | 高冲击·观点文封面 |
| `screen-print` | 大胆海报·观点/文化评论 |
| `chalkboard` | 彩色粉笔黑板·教程步骤 |
| `vector-illustration` | 扁平矢量·黑描边（信息图/数据） |
| `watercolor` / `elegant` | 文艺调性（慎用，看 IP 调性） |

---

## 6. 配色 Palette（可选覆盖）

`macaron`（柔和教育）/ `warm`（大地温馨）/ `neon`（高能量未来）。无则风格内置色。

---

## 7. 密度 Density

| 密度 | 张数 | 说明 |
|------|------|------|
| minimal | 1-2 | 仅核心概念 |
| balanced | 3-5 | 主要章节（推荐） |
| per-section | 每节≥1 | 系统覆盖 |
| rich | 6+ | 全面覆盖 |

默认 `balanced`（3-5 张），按篇幅调整。

---

## 8. 大纲模板 outline.md

```yaml
---
mode: article
type: framework
style: notion
palette: default
image_count: 3
---

## Illustration 1
**Position**: 开头核心判断段后
**Purpose**: 定调——把核心判断画成框架
**Visual Content**: [C1 主张的框架结构]
**Type Application**: framework
**Filename**: 01-framework-{slug}.png

## Illustration 2
**Position**: C2 对比主张段后
**Visual Content**: [正反/Before-After 左右分栏]
**Type Application**: comparison
**Filename**: 02-comparison-{slug}.png

## Illustration 3
**Position**: 结尾行动建议段后
**Visual Content**: [场景图收束]
**Type Application**: scene
**Filename**: 03-scene-{slug}.png
```

---

## 9. 确认步骤（Step 3 详细）

**硬门**：生成前必须确认（除非「直接生成」等跳过词）。一个问题、≤4 问：

| 问 | 选项（含推荐） |
|----|--------------|
| Q1 统一风格 | **系统自动匹配该篇 Top-1 风格（推荐）** / 手动指定一种（notion / minimal / bold / warm / screen-print / ...） |
| Q2 预设/Type | 按分析推荐预设（推荐）/ 手动选 infographic/scene/flowchart/comparison/framework/timeline/mixed |
| Q3 密度 | minimal / balanced（推荐）/ per-section / rich |
| Q4 配色 | 默认（推荐）/ macaron / warm / neon |

> **⚠️ 单篇强制统一（硬规则）**：同一篇文章内的所有插画**必须共用同一种 Style + 同一种 Palette**，视觉语言完全一致。这是底线，不是可选项。
> - 系统按 IP 风格定位（或内容信号）为该篇自动匹配**最合适的一种统一风格**（Top-1）；用户可手动指定覆盖。
> - **"多种风格"的真实含义 = 跨文章/跨选题的多样性**：这篇文章用 notion、那篇用 bold——每篇各自统一，多篇之间可以多种；**绝不是** 一篇文章里 3 张各用 3 种风格。
> - Type（信息结构：framework / comparison / scene / ...）可随位置变化，但 Style 必须全篇唯一。

展示摘要：
```
📋 公众号配图方案（自动匹配）
  主题：[topic] | 类型：[content_type] | 框架：[framework]
  主张：[key claims]
  风格策略：[单风格贯穿 / 多种风格]
  Type：[type] · 密度：[level] · 风格：[style] · 配色：[palette]
  图片：[N]张（位置见 outline）
```

---

## 10. 生成与交付

1. 每张插画提示词写入 `prompts/NN-{type}-{slug}.md`（见 prompt-templates.md）。
2. **单篇强制统一（硬规则）**：全篇所有插画共用同一 Style + Palette 保证一致（不像朋友圈需要 ref 锚点链，因为每图对应明确段落，风格由 outline 锁定，且全篇唯一）。outline 中每图可标注不同 Type，但 Style / Palette 必须一致。
3. 批量出图（默认 4/批），失败重试一次。
4. 交付：图片文件 + 每张「文章内插入位置」（建议 `![alt](配图/公众号/{slug}/NN-{type}-{slug}.png)` 插在对应段后）+ 输出摘要。

```
公众号配图完成！
文章：[path] | Type：[type] | 密度：[level] | 风格：[style] | 配色：[palette]
位置：配图/公众号/{slug}/
图片：3/N 生成

位置：
- 01-framework-{slug}.png → 插在「开头核心判断」段后
- 02-comparison-{slug}.png → 插在「C2 对比」段后
- 03-scene-{slug}.png → 插在「结尾行动」段后
```

---

## 11. 高危行业注意

- 🔴 财经：不画「收益曲线保证」「稳赚」图；遵守模式D 财经合规声明（不构成投资建议）。
- 🔴 医疗：不画疗效/治愈率承诺图。
- 🔴 法律：不画「必胜」图。
- 图中文字只来自文章已确认内容（claims 中 supported/bounded 的主张），不新增数据。
