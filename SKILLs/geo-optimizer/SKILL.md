---
description: "基于 GEO 10步优化框架，帮助品牌内容在 Perplexity、Kimi 等 AI 搜索引擎中获得高频引用卡位。"
name: "GEO 全流程优化"
version: 1.0.0
---

# GEO Optimizer

AI 搜索优化全流程工具，基于 10 步 GEO 实战框架，帮助品牌内容被 AI 引擎引用。

## 工作流决策树

根据用户需求选择执行路径：

```
用户提供 URL 要求优化？
  → 模块 E：内容差距分析（调用 /geo-content-optimizer）

用户要求生成 Schema/JSON-LD？
  → 模块 A：结构化数据生成

用户提供文本要求检测质量？
  → 模块 B：内容 AI 可读性检测

用户要求规划内容架构？
  → 模块 C：Pillar Page 集群规划

用户要求测试/监控 AI 曝光？
  → 模块 D：可见度测试与报告

用户首次使用 / 不确定从哪开始？
  → 执行"首次完整 GEO 设置"流程（见下方）
```

---

## 首次完整 GEO 设置流程

适用于从未做过 GEO 优化的用户，按顺序执行：

1. 收集品牌信息（名称、行业、核心业务、目标市场）
2. 执行模块 A1：生成 Organization Schema
3. 引导用户创建 ≥10 个 FAQ 问答对
4. 执行模块 A2：生成 FAQ Schema
5. 执行模块 A3：为已有文章生成 Article Schema
6. 执行模块 B：检测关键页面的 AI 可读性
7. 执行模块 C：规划 Pillar Page 内容集群
8. 执行模块 D1：首次 AI 可见度基线测试
9. 汇总输出完整 GEO 部署清单

---

## 模块 A：结构化数据生成

使用 `scripts/schema_generator.py` 或参考 `references/schema-templates.md` 生成 JSON-LD。

### A1. Organization 实体标记

收集以下信息后生成：
- 品牌名称、一句话描述、成立年份
- 目标市场 (areaServed)
- 核心领域 (knowsAbout, 3-5 个)
- 提供的产品/服务描述

```bash
python3 scripts/schema_generator.py --type organization --name "品牌名" --description "描述" --knows-about "领域1" "领域2" --offers "产品描述"
```

### A2. FAQ Schema

要求用户提供 ≥10 个问答对。每个问答要：
- 问题用自然口语（用户会怎么问 AI）
- 答案含具体数据、案例、可操作建议
- 答案长度 80-200 字

```bash
python3 scripts/schema_generator.py --type faq --input faq_pairs.json
```

输入文件格式：
```json
[
  {"question": "新手第一步应该做什么？", "answer": "具体答案..."},
  {"question": "A 和 B 有什么区别？", "answer": "具体答案..."}
]
```

### A3. Article Schema

为每篇文章生成 TechArticle 或 Article Schema。

### A4. E-E-A-T 作者标记

生成 Person + Article @graph 联合标记。要求：
- 作者署名 + 简介（不能是"佚名"/"本站编辑"）
- 列出社交账号 (sameAs)
- 列出资质/成果 (hasCredential)

### A5. 引用标记

为引用了权威来源的文章添加 citation Schema。

**Schema 模板详见**：[references/schema-templates.md](references/schema-templates.md)

---

## 模块 B：内容 AI 可读性检测

使用 `scripts/readability_checker.py` 分析文本。

```bash
python3 scripts/readability_checker.py --text "要检测的文本内容"
python3 scripts/readability_checker.py --file article.txt
```

检测维度：
1. **营销词密度** — "创新/领先/卓越/全方位/一站式/极致/颠覆/最佳" 等，越少越好
2. **平均句长** — 理想 15-25 字，>35 字 AI 难以理解
3. **直接问句** — 包含 "？/?" 的句子，AI 偏好有问句的内容
4. **数据引用** — 具体数字/百分比/金额，AI 更信任含数据的内容
5. **综合评分** — 高/中/低

优化建议规则：
- 营销词 > 3 个 → 建议替换为具体事实描述
- 句长 > 25 字 → 建议拆分长句
- 无问句 → 建议加入 1-2 个直接问句
- 无数据 → 建议加入行业数据或自有统计

---

## 模块 C：Pillar Page 集群规划

### 设计内容集群结构

1 个核心主题页 + 5-10 个子主题，内部链接串联。

收集用户输入：
- 核心主题（Pillar Page 标题）
- 子主题列表（5-10 个相关主题）
- 每个子主题与核心主题的关系

生成内容：
- 集群 HTML 代码块（放到每篇子文章末尾）
- 站点地图 JSON 结构
- 内部链接策略建议

**模板详见**：[assets/pillar-template.html](assets/pillar-template.html)

---

## 模块 D：可见度测试与报告

### D1. AI 可见度测试（月度）

使用 `scripts/visibility_tester.py`，支持 4 种后端引擎。

```bash
# Kimi API（默认）
python3 scripts/visibility_tester.py --brand "品牌名" --keywords "关键词1" "关键词2" --engine kimi --api-key "sk-xxx"

# Perplexity API
python3 scripts/visibility_tester.py --brand "品牌名" --keywords "关键词1" "关键词2" --engine perplexity --api-key "pplx-xxx"

# 豆包 / 火山引擎 API
python3 scripts/visibility_tester.py --brand "品牌名" --keywords "关键词1" "关键词2" --engine doubao --api-key "ark-xxx"

# 自定义接口（任何 OpenAI 兼容 + 联网搜索的 API）
python3 scripts/visibility_tester.py --brand "品牌名" --keywords "关键词1" "关键词2" \
    --engine custom --api-key "sk-xxx" \
    --base-url "https://your-api.com/v1" --model "your-model" \
    --web-search-tool-name "web_search"
```

| 引擎 | API Key 获取 | 环境变量 | 说明 |
|------|-------------|----------|------|
| **Kimi** | [platform.moonshot.cn](https://platform.moonshot.cn/) | `KIMI_API_KEY` | 默认，自带 `$web_search` tool |
| **Perplexity** | [docs.perplexity.ai](https://docs.perplexity.ai/) | `PERPLEXITY_API_KEY` | 原生 AI 搜索引擎 |
| **豆包** | [console.volcengine.com/ark](https://console.volcengine.com/ark) | `ARK_API_KEY` | 火山引擎 Responses API + web_search |
| **Custom** | 自备 | `CUSTOM_API_KEY` | 任意 OpenAI 兼容接口 |

> **Custom 引擎**可用于 DeepSeek、通义千问等任何支持 OpenAI 格式 + 联网搜索 tool 的 API。通过 `--web-search-tool-name` 和 `--web-search-tool-params` 自定义 tool 定义。

脚本会：
1. 用多个关键词构造查询
2. 检测品牌名是否出现在 AI 回复中
3. 提取引用上下文
4. 结果自动追加到历史 JSON 文件

**无 API Key 时**：提供手动测试指引（在 ChatGPT/Perplexity/Gemini/Kimi 中搜索目标关键词，观察是否提及品牌）。

### D2. 季度 GEO 报告

使用 `scripts/geo_report_generator.py`。

```bash
python3 scripts/geo_report_generator.py --history visibility_history.json
```

报告包含：
- 引用率趋势（前半期 vs 后半期）
- 趋势方向（上升/下降/持平）
- 行动建议（根据趋势自动生成）

---

## 模块 E：内容差距分析

当用户提供 URL 要求优化时，调用 `geo-content-optimizer` skill。

触发词："优化这个页面"、"分析这个网址"、"GEO 分析"、用户提供 URL 要求改进。

该 skill 会自动完成：抓取标题 → Google 查询扩展 → AI Overview 获取 → 对比分析 → 优化建议报告。

---

## 30 分钟快速落地清单

| 步骤 | 时间 | 操作 |
|------|------|------|
| 实体标记 | 5 min | 模块 A1：生成 Organization JSON-LD |
| FAQ Schema | 10 min | 模块 A2：写 10 个 FAQ + 生成标记 |
| 口语化检查 | 5 min | 模块 B：跑可读性检测 |
| 引用标记 | 5 min | 模块 A5：加 citation 标记 |
| Schema 全部署 | 10 min | 模块 A3/A4：文章 + 品牌 + 作者 |
| Pillar 集群 | 30 min | 模块 C：设计 1+5 内容结构 |
| 可见度测试 | 5 min/月 | 模块 D1：跑 API 脚本 |
| 季度报告 | 10 min/季 | 模块 D2：跑对比分析 |

---

## 参考资料

- **GEO 10 步框架**：[references/geo-framework.md](references/geo-framework.md) — 每步原理、数据支撑、操作要点
- **Schema 模板汇总**：[references/schema-templates.md](references/schema-templates.md) — 所有 JSON-LD 类型完整模板
- **最佳实践**：[references/best-practices.md](references/best-practices.md) — 行业数据、部署清单、常见错误