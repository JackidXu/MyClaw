---
description: "实时抓取全网中文 AI 资讯与热点动态，自动整理生成每日 AI 行业简报与趋势洞察。"
name: "AI 热点日报"
---
name: 01-ai-re-dian-ri-bao
# AI HOT Skill（AI热点日报）

中文 AI 资讯查询 Skill。当用户想知道"今天 AI 圈有什么"、"AI 日报"、"AI 资讯"、"AI 热点"、"最近 AI"、"OpenAI/the AI provider/Google 最近发布了什么"、"AI hot today"、"AI news today"等任何中文 AI 资讯查询时使用。Skill 会直接 curl 公开 REST API 拉数据并整理成中文 markdown 简报，不需要用户配置任何 API Key 或 MCP server。

线上：https://aihot.virxact.com（公开匿名可访，无需 token）

## 先决条件：必须带 User-Agent（仅 API 端点）

`/api/public/*` 走 nginx UA 黑名单挡商业爬虫，默认 `curl/X.Y` UA 会被 403 Forbidden。**调 API 时所有 curl 都必须带浏览器 UA + aihot-skill 标识**：

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 aihot-skill/0.2.0"

# 之后所有调 API 的 curl 都加 -H "User-Agent: $UA"
curl -sH "User-Agent: $UA" "https://aihot.virxact.com/api/public/daily"
```

## 什么时候用

> **路由优先级（第一原则）**：**默认走精选** `items?mode=selected`——它是 AI HOT 每天精挑细选的"主菜单"。
>
> - **仅当用户在话里明确说出"日报"** 二字才走 `daily`
> - **仅当用户明确说"全部 / 完整 / 所有 / 全量"** 才走 `mode=all`

| 用户在说 | 应该走的接口 |
|---|---|
| **默认（宽问题）**："今天 AI 圈有什么"、"过去 24 小时大新闻" | `GET /api/public/items?mode=selected&since=<时间窗>` |
| **明确说"日报"** | `GET /api/public/daily` |
| **明确说"全部 / 完整 / 所有"** | `GET /api/public/items?mode=all` |
| "昨天/前天 AI 日报"、"看下 5 月 6 号的日报" | `GET /api/public/daily/{YYYY-MM-DD}` |
| "最近几天日报有哪些" | `GET /api/public/dailies?take=N` |
| "看下精选条目" | `GET /api/public/items?mode=selected` |
| "最近的模型发布"、"AI 产品发布" | `GET /api/public/items?mode=selected&category=...&since=<7d前>` |
| "最近一周的 AI 动态" | `GET /api/public/items?mode=selected&since=ISO-8601` |
| "OpenAI/the AI provider/Google 最近发的" | `GET /api/public/items?q=OpenAI` |
| "Sora 相关 / GPT-5 相关" | `GET /api/public/items?q=<关键词>` |

## 端点速览

| 端点 | 用途 | 主要参数 |
|---|---|---|
| `/api/public/daily` | 最新日报 | 无 |
| `/api/public/daily/{YYYY-MM-DD}` | 指定日期日报 | path: `date` |
| `/api/public/dailies` | 日报归档列表 | `take` (1-180, default 30) |
| `/api/public/items` | 全部 AI 动态 | `mode` / `category` / `since` / `take` / `cursor` / `q` |

约定：
- Base URL: `https://aihot.virxact.com`
- 鉴权：无（匿名）
- 限流：600 req/min/IP
- items 端点 `since` 限最近 7 天
- `take` 上限 100
- 完整 OpenAPI 3.1 规范：`https://aihot.virxact.com/openapi.yaml`

## 工作流

### 默认路径：拉精选 + 时间窗

```bash
# 拉最近 24 小时精选
since=$(date -u -v-24H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)
curl -sH "User-Agent: $UA" "https://aihot.virxact.com/api/public/items?mode=selected&since=$since&take=50"
```

### 拉日报（用户明确说"日报"时）

```bash
curl -sH "User-Agent: $UA" "https://aihot.virxact.com/api/public/daily"
```

### 拉指定日期日报

```bash
curl -sH "User-Agent: $UA" "https://aihot.virxact.com/api/public/daily/2026-05-07"
```

### 列日报归档

```bash
curl -sH "User-Agent: $UA" "https://aihot.virxact.com/api/public/dailies?take=14"
```

### 按分类拉条目

5 个 category：`ai-models` / `ai-products` / `industry` / `paper` / `tip`

```bash
# 例：拉最近 50 条 AI 论文
curl -sH "User-Agent: $UA" "https://aihot.virxact.com/api/public/items?mode=selected&category=paper&take=50"
```

### 关键词搜索

```bash
# 找 OpenAI 最近发的
curl -sH "User-Agent: $UA" "https://aihot.virxact.com/api/public/items?q=OpenAI&take=30"

# 找 RAG 论文
curl -sH "User-Agent: $UA" "https://aihot.virxact.com/api/public/items?category=paper&q=RAG&take=30"
```

### 翻页（cursor）

```bash
resp1=$(curl -sH "User-Agent: $UA" "https://aihot.virxact.com/api/public/items?mode=all&take=100")
cursor=$(echo "$resp1" | jq -r '.nextCursor')
curl -sH "User-Agent: $UA" "https://aihot.virxact.com/api/public/items?mode=all&take=100&cursor=$cursor"
```

## 给用户的输出格式

**核心原则**：必须 markdown 格式 + 排版好 + 普通人能看得懂的人话。所有 API 参数、端点路径、限流等基础设施细节都不能出现在用户看到的输出里。

### 日报式输出

```markdown
**AI HOT 日报 · 2026-05-07**

## 模型发布/更新
1. **<title>** — <source>
   <summary>
   <url>

## 产品发布/更新
2. ...
```

### 列表式输出

默认按 category 分组 + 全局编号：

```markdown
**AI HOT — 最近 30 条精选**

## 模型发布/更新
1. **<title>** — <source>
   2 小时前
   <summary>
   <url>
```

### 时间转人话

不要直接展示 ISO 字符串，转为北京时间 + 相对时间（如"2 小时前"、"今天上午 09:48"）。

## 常见错误处理

- `No daily report available yet.`（404）：当天日报还没生成，建议拉昨天日报
- `Invalid date format`（400）：date 必须是 `YYYY-MM-DD`
- HTTP 429：超限流，串行调用 + 200ms 间隔

## 不要做

- 不要把宽问题路由到 daily（默认走 selected + since）
- 不要在用户没说"全部"时默认走 mode=all
- 不要试图猜测/编造内容
- 不要把摘要当原文引用
- 不要做高频轮询
- 不要并发猛拉翻页
- 不要在用户输出里暴露端点路径/raw 参数/限流等细节
