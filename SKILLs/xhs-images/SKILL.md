---
name: xhs-images
description: Generates image card series with 12 visual styles, 8 layouts, and 3 color palettes. Breaks content into 1-10 cartoon-style image cards optimized for social media engagement. Use when user mentions "小红书图片", "小红书配图", "小绿书", "微信图文", "朋友圈图片", "朋友圈配图", "微信贴图", "image cards", "图片卡片", xhs-images, or wants social media image series.
version: 2.0.1
metadata:
  openclaw:
    homepage: https://github.com/JimLiu/baoyu-skills#baoyu-xhs-images
---

# Image Card Series Generator

Break down complex content into eye-catching image card series with multiple style options.

## User Input Tools

When this skill prompts the user, follow this tool-selection rule (priority order):

1. **Prefer built-in user-input tools** exposed by the current agent runtime — e.g., `AskUserQuestion`, `request_user_input`, `clarify`, `ask_user`, or any equivalent.
2. **Fallback**: if no such tool exists, emit a numbered plain-text message and ask the user to reply with the chosen number/answer for each question.
3. **Batching**: if the tool supports multiple questions per call, combine all applicable questions into a single call; if only single-question, ask them one at a time in priority order.

Concrete `AskUserQuestion` references below are examples — substitute the local equivalent in other runtimes.

## Image Generation Tools

When this skill needs to render an image, resolve the backend in this order:

1. **Current-request override** — if the user names a specific backend in the current message, use it.
2. **Saved preference** — if `EXTEND.md` sets `preferred_image_backend` to a backend available right now, use it.
3. **Auto-select** (when the preference is `auto`, unset, or the pinned backend isn't available):
   - **Codex (`imagegen`)** — first, inspect your available-skills / tool inventory. If a skill named `imagegen` is listed, you are running inside Codex and MUST use it: invoke via the `Skill` tool with `skill: "imagegen"`, passing the saved prompt file's content (plus output path and aspect ratio per Codex `imagegen`'s own args). Codex `imagegen` is the official raster backend in that runtime and outranks any non-native skill (e.g., `baoyu-image-gen`) unless the user has explicitly pinned a different `preferred_image_backend`.
   - **Codex via `codex exec` (`codex-imagegen`)** — if the current runtime exposes no native `imagegen` skill but the `codex` CLI is on `PATH` with an active `codex login`, route through `baoyu-image-gen --provider codex-cli` (preferred), or — if baoyu-image-gen is unavailable — invoke the bundled wrapper directly. Details, parameters, and the runtime-discovery procedure live in [references/codex-imagegen.md](references/codex-imagegen.md) — load that file only when this branch is selected.
   - **Cursor (`GenerateImage`)** — if the runtime exposes a native `GenerateImage` tool, you are running inside Cursor and it outranks any non-native skill the same way Codex `imagegen` does. Two hard caveats: (a) it has no aspect-ratio parameter — state the target aspect ratio / dimensions explicitly in the prompt text passed as `description`; (b) it does not accept an output directory — it saves to a tool-managed location, so after generation copy/move the file to the skill's expected output path (e.g., `outputs/.../NN-xxx.png`). Reference images go in `reference_image_paths`.
   - **Other runtime-native tools** — if the runtime exposes a different native image tool (e.g., Hermes `image_generate`), use it the same way.
   - Otherwise, if exactly one non-native backend is installed (e.g., `baoyu-image-gen`), use it.
   - Otherwise (multiple non-native backends with no runtime-native tool), ask the user once — batch with any other initial questions.
4. **If none are available**, tell the user and ask how to proceed.

**⛔ Never substitute SVG, HTML, canvas, or other code-based rendering for raster image generation.** Codex `imagegen`'s own description says it should be used "when the output should be a bitmap asset rather than repo-native code or vector." If you cannot resolve a raster backend via step 3, fall through to step 4 and ask the user — do **not** silently emit SVG, write inline `<svg>` markup, or produce HTML/CSS art as a substitute. This applies even if the article/section seems "diagram-like": the consumer skill calling this rule has already decided that a raster image is what it needs.

**⛔ Never repair rendered text by painting over a generated bitmap.** Do not use ImageMagick, Pillow, Canvas, SVG, HTML/CSS, OCR scripts, or any other programmatic overlay to cover, rewrite, erase, stroke, or replace titles, body copy, tags, or any other text inside an already generated image card. If text is wrong or unclear, regenerate from a corrected prompt, switch to a layout with less on-card text, or ask the user which imperfect candidate to keep.

Setting `preferred_image_backend: ask` forces the step-3 prompt every run regardless of available backends. Users change the pinned backend via the `## Changing Preferences` section below.

**Prompt file requirement (hard)**: write each image's full, final prompt to a standalone file under `prompts/` (naming: `NN-{type}-[slug].md`) BEFORE invoking any backend. The file is the reproducibility record and lets you switch backends without regenerating prompts.

Concrete tool names (`imagegen`, `GenerateImage`, `image_generate`, `baoyu-image-gen`) above are examples — substitute the local equivalents under the same rule.

## Batch Generation Policy

After every prompt file for the current generation group has been saved and verified, generate images in batches by default.

Priority order:

1. Use the chosen backend's native batch / multi-task interface if it exists. Each task must keep its own prompt file, output path, aspect ratio, session ID, and direct reference images.
2. If no native batch interface exists but the runtime can issue parallel tool calls, dispatch up to `generation_batch_size` images at a time. Default: `4`. An explicit user request in the current message, such as `--batch-size 4` or "并行 4 张一起生成", overrides EXTEND.md.
3. If neither native batch nor parallel tool calls are available, generate sequentially.

Rules:

- Honor the image-1 anchor chain: generate image 1 first, then batch images 2+ using image 1 as the reference.
- Never start a batch until every selected prompt file for that batch exists on disk.
- Retry failed items once without regenerating successful items.
- Do not use subagents merely to parallelize image rendering. Use subagents only for separate prompt iteration or creative exploration.

## Confirmation Policy

Default behavior: **confirm before generation**.

- Treat explicit skill invocation, a file path, matched signals/presets, and `EXTEND.md` defaults as **recommendation inputs only**. None of them authorizes skipping confirmation.
- Do **not** start Step 3 until the user completes Step 2.
- Skip confirmation only when the current request explicitly says to do so, for example: `--yes`, "直接生成", "不用确认", "跳过确认", "按默认出图", or equivalent wording.
- If confirmation is skipped explicitly, state the assumed strategy / style / layout / palette / count / backend in the next user-facing update before generating.

## Language

Respond in the user's language across questions, progress, errors, and completion summary. Keep technical tokens (style names, file paths, code) in English.

## Options

| Option | Description |
|--------|-------------|
| `--style <name>` | Visual style (see Styles below) |
| `--layout <name>` | Information layout (see Layouts below) |
| `--palette <name>` | Color override: macaron / warm / neon |
| `--preset <name>` | Style + layout + optional palette shorthand (see Presets below; per-preset prompt fragments in `references/style-presets.md`) |
| `--ref <files...>` | Reference images applied to image 1 as the series anchor |
| `--batch-size <n>` | Temporary generation batch size for this run. Default: `generation_batch_size` from EXTEND.md, otherwise 4. Clamp to 1-8. |
| `--yes` | Non-interactive: skip all confirmations, use EXTEND.md or built-in defaults, auto-confirm recommended plan (Path A) |

## Dimensions

Three independent knobs combine freely:

| Dimension | Controls | Options |
|-----------|----------|---------|
| **Style** | Visual aesthetics (lines, decorations, rendering) | 12 styles (see Styles below) |
| **Layout** | Information structure (density, arrangement) | 8 layouts (see Layouts below) |
| **Palette** (optional) | Color override, replaces the style's default colors | macaron / warm / neon (see Palettes below) |

Example: `--style notion --layout dense` makes an intellectual knowledge card; add `--palette macaron` to soften the colors without changing notion's rendering rules. A `--preset` is a shorthand for style + layout (+ optional palette).

**Palette behavior**: no `--palette` → style's built-in colors; `--palette <name>` → overrides colors only, rendering rules unchanged. Some styles declare a `default_palette` (e.g., sketch-notes defaults to macaron).

## Styles (12)

| Style | Description |
|-------|-------------|
| `cute` (Default) | 甜美可爱，少女心 / Sweet, adorable, girly aesthetic |
| `fresh` | 清新自然，干净感 / Clean, refreshing, natural |
| `warm` | 温馨舒适，亲和力 / Cozy, friendly, approachable |
| `bold` | 高冲击力，引人注目 / High impact, attention-grabbing |
| `minimal` | 极简高级，精致感 / Ultra-clean, sophisticated |
| `retro` | 复古怀旧，潮流感 / Vintage, nostalgic, trendy |
| `pop` | 活力四射，吸睛力强 / Vibrant, energetic, eye-catching |
| `notion` | 极简手绘线条风，知识感 / Minimalist hand-drawn line art, intellectual |
| `chalkboard` | 彩色粉笔黑板风，教学感 / Colorful chalk on black board, educational |
| `study-notes` | 真实手写笔记风，蓝笔+红批注+荧光笔 / Realistic handwritten photo style, blue pen + red annotations + yellow highlighter |
| `screen-print` | 大胆海报风，网点半色调，符号化叙事 / Bold poster art, halftone textures, limited colors, symbolic storytelling |
| `sketch-notes` | 手绘教育信息图，马卡龙色系，暖色纸底 / Hand-drawn educational infographic, macaron pastels on warm cream, wobble lines |

Per-style specifications: `references/presets/<style>.md`.

## Layouts (8)

| Layout | Description |
|--------|-------------|
| `sparse` (Default) | 1-2个要点，最大化视觉冲击 / 1-2 points, maximum impact |
| `balanced` | 3-4个要点，标准排版 / 3-4 points, standard |
| `dense` | 5-8个要点，知识卡片风 / 5-8 points, knowledge-card style |
| `list` | 列举/排行（4-7项） / Enumeration / ranking (4-7 items) |
| `comparison` | 左右对比 / Side-by-side contrast |
| `flow` | 流程/时间线（3-6步） / Process / timeline (3-6 steps) |
| `mindmap` | 中心发散（4-8分支） / Center-radial (4-8 branches) |
| `quadrant` | 四象限/圆形分区 / Four-quadrant / circular sections |

Layout specs: `references/elements/canvas.md`.

## Palettes (optional override)

Replaces the style's colors while keeping rendering rules (line treatment, textures) intact.

| Palette | Background | Zone Colors | Accent | Feel |
|---------|------------|-------------|--------|------|
| `macaron` | 暖奶油色 Warm cream #F5F0E8 | Blue #A8D8EA, Lavender #D5C6E0, Mint #B5E5CF, Peach #F8D5C4 | Coral #E8655A | 柔和教育风 / Soft, educational |
| `warm` | 柔桃色 Soft peach #FFECD2 | Orange #ED8936, Terracotta #C05621, Golden #F6AD55, Rose #D4A09A | Sienna #A0522D | 大地色调，温馨舒适 / Earth tones, cozy |
| `neon` | 深紫色 Dark purple #1A1025 | Cyan #00F5FF, Magenta #FF00FF, Green #39FF14, Pink #FF6EC7 | Yellow #FFFF00 | 高能量，未来感 / High-energy, futuristic |

Palette specs: `references/palettes/<palette>.md`.

## Presets (style + layout shortcuts)

Quick-start combos, grouped by scenario. Use `--preset <name>` or recommend during Step 2.

**Knowledge & Learning**:

| Preset | Style | Layout | Best For |
|--------|-------|--------|----------|
| `knowledge-card` | notion | dense | 干货知识卡、概念科普 |
| `checklist` | notion | list | 清单、排行榜 |
| `concept-map` | notion | mindmap | 概念图、知识脉络 |
| `swot` | notion | quadrant | SWOT 分析、四象限 |
| `tutorial` | chalkboard | flow | 教程步骤、操作流程 |
| `classroom` | chalkboard | balanced | 课堂笔记、知识讲解 |
| `study-guide` | study-notes | dense | 学习笔记、考试重点 |
| `hand-drawn-edu` | sketch-notes | flow | 手绘教程、流程图解 |
| `sketch-card` | sketch-notes | dense | 手绘知识卡 |
| `sketch-summary` | sketch-notes | balanced | 手绘总结、图文笔记 |

**Lifestyle & Sharing**:

| Preset | Style | Layout | Best For |
|--------|-------|--------|----------|
| `cute-share` | cute | balanced | 少女风分享、日常种草 |
| `girly` | cute | sparse | 甜美封面、氛围感 |
| `cozy-story` | warm | balanced | 生活故事、情感分享 |
| `product-review` | fresh | comparison | 产品对比、测评 |
| `nature-flow` | fresh | flow | 健康流程、自然主题 |

**Impact & Opinion**:

| Preset | Style | Layout | Best For |
|--------|-------|--------|----------|
| `warning` | bold | list | 避坑指南、重要提醒 |
| `versus` | bold | comparison | 正反对比 |
| `clean-quote` | minimal | sparse | 金句、极简封面 |
| `pro-summary` | minimal | balanced | 专业总结、商务内容 |

**Trend & Entertainment**:

| Preset | Style | Layout | Best For |
|--------|-------|--------|----------|
| `retro-ranking` | retro | list | 复古排行、经典盘点 |
| `throwback` | retro | balanced | 怀旧分享 |
| `pop-facts` | pop | list | 趣味冷知识 |
| `hype` | pop | sparse | 炸裂封面、惊叹分享 |

**Poster & Editorial**:

| Preset | Style | Layout | Best For |
|--------|-------|--------|----------|
| `poster` | screen-print | sparse | 海报风封面、影评书评 |
| `editorial` | screen-print | balanced | 观点文章、文化评论 |
| `cinematic` | screen-print | comparison | 电影对比、戏剧张力 |

Full prompt-fragment definitions: `references/style-presets.md`.

## Auto-Selection

Match content signals to the best combo. First row whose keywords appear wins; fall back to `cute-share` if nothing matches.

| Signals in source | Style | Layout | Recommended preset |
|-------------------|-------|--------|--------------------|
| beauty, fashion, cute, girl, pink, 美妆, 时尚, 可爱, 少女, 粉色 | `cute` | sparse/balanced | `cute-share`, `girly` |
| health, nature, fresh, organic, 健康, 自然, 清新, 有机 | `fresh` | balanced/flow | `product-review`, `nature-flow` |
| life, story, emotion, warm, 生活, 故事, 情感, 暖心 | `warm` | balanced | `cozy-story` |
| warning, important, must, critical, 避坑, 重要, 必须, 警告 | `bold` | list/comparison | `warning`, `versus` |
| professional, business, elegant, 专业, 商务, 优雅 | `minimal` | sparse/balanced | `clean-quote`, `pro-summary` |
| classic, vintage, traditional, 经典, 复古, 传统 | `retro` | balanced | `throwback`, `retro-ranking` |
| fun, exciting, wow, amazing, 有趣, 炸裂, 惊叹 | `pop` | sparse/list | `hype`, `pop-facts` |
| knowledge, concept, productivity, SaaS, 知识, 概念, 干货, 工具 | `notion` | dense/list | `knowledge-card`, `checklist` |
| education, tutorial, learning, classroom, 教育, 教程, 学习, 课堂 | `chalkboard` | balanced/dense | `tutorial`, `classroom` |
| notes, handwritten, study guide, realistic, 笔记, 手写, 考试, 重点 | `study-notes` | dense/list/mindmap | `study-guide` |
| movie, poster, opinion, editorial, cinematic, 电影, 海报, 观点, 评论 | `screen-print` | sparse/comparison | `poster`, `editorial`, `cinematic` |
| hand-drawn, infographic, workflow, 手绘, 图解, 流程图 | `sketch-notes` | flow/balanced/dense | `hand-drawn-edu`, `sketch-card`, `sketch-summary` |

## Style × Layout Matrix

Compatibility scores (✓✓ highly recommended, ✓ works well, ✗ avoid). Use when the user picks a non-default combo and you want to flag a poor match.

|              | sparse | balanced | dense | list | comparison | flow | mindmap | quadrant |
|--------------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| cute         | ✓✓ | ✓✓ | ✓  | ✓✓ | ✓  | ✓  | ✓  | ✓  |
| fresh        | ✓✓ | ✓✓ | ✓  | ✓  | ✓  | ✓✓ | ✓  | ✓  |
| warm         | ✓✓ | ✓✓ | ✓  | ✓  | ✓✓ | ✓  | ✓  | ✓  |
| bold         | ✓✓ | ✓  | ✓  | ✓✓ | ✓✓ | ✓  | ✓  | ✓✓ |
| minimal      | ✓✓ | ✓✓ | ✓✓ | ✓  | ✓  | ✓  | ✓  | ✓  |
| retro        | ✓✓ | ✓✓ | ✓  | ✓✓ | ✓  | ✓  | ✓  | ✓  |
| pop          | ✓✓ | ✓✓ | ✓  | ✓✓ | ✓✓ | ✓  | ✓  | ✓  |
| notion       | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ |
| chalkboard   | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓  | ✓✓ | ✓✓ | ✓  |
| study-notes  | ✗  | ✓  | ✓✓ | ✓✓ | ✓  | ✓  | ✓✓ | ✓  |
| screen-print | ✓✓ | ✓✓ | ✗  | ✓  | ✓✓ | ✓  | ✗  | ✓✓ |
| sketch-notes | ✓  | ✓✓ | ✓✓ | ✓✓ | ✓  | ✓✓ | ✓✓ | ✓  |

## Outline Strategies

Three differentiated approaches — each produces a structurally different outline. The workflow recommends one; Path C generates all three and lets the user choose.

| Strategy | Concept | Best for | Structure |
|----------|---------|----------|-----------|
| **A — 故事驱动 Story-Driven** | 个人体验为主线，情感共鸣优先 / Personal experience as the thread, emotional resonance first | 测评、个人分享、前后对比 / Reviews, personal shares, transformation | 钩子 → 痛点 → 发现 → 体验 → 结论 |
| **B — 信息密集 Information-Dense** | 价值优先，高效传递信息 / Value-first, efficient information delivery | 教程、对比评测、清单 / Tutorials, comparisons, checklists | 核心结论 → 信息卡 → 优劣 → 推荐 |
| **C — 视觉先行 Visual-First** | 视觉冲击为核心，文案极简 / Visual impact as core, minimal text | 高颜值产品、生活方式、氛围感 / High-aesthetic products, lifestyle, mood content | 主图 → 细节特写 → 场景 → CTA |

## Reference Images

User-supplied refs are **separate from** the internal "image-1 as anchor" chain (Step 3) — they layer on top of it.

**Intake**: via `--ref <files...>` or paths pasted in conversation.
- File path → copy to `refs/NN-ref-{slug}.{ext}`
- Pasted with no path → ask for the path, or extract style traits as a text fallback

**Usage modes** (per reference):

| Usage | Effect |
|-------|--------|
| `direct` | Pass the file to the backend (typically on image 1 only, so the anchor propagates through the chain) |
| `style` | Extract style traits and append to every card's prompt body |
| `palette` | Extract hex colors and append to every card's prompt body |

Record refs in each affected card's prompt frontmatter:

```yaml
references:
  - ref_id: 01
    filename: 01-ref-brand.png
    usage: direct
```

At generation time: verify files exist. Image 1 with `usage: direct` + backend that accepts refs → pass via the backend's ref parameter (becomes the chain anchor). Images 2+ keep using image-1 as `--ref` per Step 3 — do NOT re-stack user refs on top (avoids conflicting signals). For `style`/`palette`, embed extracted traits in every prompt.

## File Layout

```
image-cards/{topic-slug}/
├── source-{slug}.{ext}
├── analysis.md
├── outline-strategy-{a,b,c}.md    # Path C only
├── outline.md
├── prompts/NN-{type}-{slug}.md
├── NN-{type}-{slug}.png
└── refs/                          # only if --ref used
```

**Slug**: 2-4 words, kebab-case. "AI 工具推荐" → `ai-tools-recommend`. On collision, append `-YYYYMMDD-HHMMSS`.

**Backup rule** (applies throughout): before overwriting any file — source, outline, prompt, image — rename the existing one to `<name>-backup-YYYYMMDD-HHMMSS.<ext>`. This protects user edits.

## Workflow

```
- [ ] Step 0: Load EXTEND.md ⛔ BLOCKING (interactive only)
- [ ] Step 1: Analyze content → analysis.md
- [ ] Step 2: Smart Confirm ⚠️ REQUIRED (Path A / B / C)
- [ ] Step 3: Generate images
- [ ] Step 4: Completion report
```

### Step 0: Load EXTEND.md ⛔ BLOCKING

Check these paths in order; first hit wins:

| Path | Scope |
|------|-------|
| `.baoyu-skills/baoyu-xhs-images/EXTEND.md` | Project |
| `${XDG_CONFIG_HOME:-$HOME/.config}/baoyu-skills/baoyu-xhs-images/EXTEND.md` | XDG |
| `$HOME/.baoyu-skills/baoyu-xhs-images/EXTEND.md` | User home |

- **Found** → read, parse, print a summary (style / layout / watermark / language), continue.
- **Not found + interactive** → run first-time setup (see `references/config/first-time-setup.md`) and save before anything else. Do NOT analyze content or ask style questions until preferences exist — this keeps first-run behavior predictable.
- **Not found + `--yes`** → skip setup, use built-in defaults (no watermark, style/layout auto-selected, language from content). Do not prompt, do not create EXTEND.md.

**EXTEND.md keys**: watermark, preferred style/layout, custom style definitions, language preference, preferred image backend, generation batch size. Schema: `references/config/preferences-schema.md`.

### Step 1: Analyze Content → `analysis.md`

1. Save the source (backup rule applies if `source.md` exists).
2. Run the deep analysis in `references/workflows/analysis-framework.md`: content type, hook potential, audience, engagement signals, visual opportunity map, swipe flow.
3. Detect source language, pick recommended image count (2-10).
4. Auto-recommend strategy + style + layout + palette using the **Auto-Selection** table above.
5. Write everything to `analysis.md`.

### Step 2: Smart Confirm ⚠️ REQUIRED

**Hard gate**: this step is mandatory per the [Confirmation Policy](#confirmation-policy) — Step 3 cannot start until the user confirms here (or explicitly opts out with `--yes` / equivalent wording in the current request).

Goal: present the auto-recommended plan and let the user confirm or adjust. Skip this step entirely under `--yes` — proceed with Path A using the analysis and any CLI overrides.

**Display summary** before asking:

```
📋 内容分析
  主题：[topic] | 类型：[content_type]
  要点：[key points]
  受众：[audience]

🎨 推荐方案（自动匹配）
  策略：[A/B/C] [name]（[reason]）
  风格：[style] · 布局：[layout] · 配色：[palette or 默认] · 预设：[preset]
  图片：[N]张（封面+[N-2]内容+结尾）
  元素：[background] / [decorations] / [emphasis]
```

Then ask one question — three paths. Verbatim option copy: `references/confirmation.md`.

**Path A — Quick confirm** (trust auto-recommendation): generate a single outline using the recommended strategy + style → save to `outline.md` → Step 3.

**Path B — Customize**: ask five questions (strategy/style, layout, palette, count, optional notes) with the recommendation pre-filled — blanks keep the recommendation. Generate one outline with the user's choices → `outline.md` → Step 3. See `references/confirmation.md`.

**Path C — Detailed mode**: two sub-confirmations.

- *Step 2a — Content understanding*: ask selling points (multi-select), audience, style preference (authentic / professional / aesthetic / auto), optional context. Update `analysis.md`.
- *Step 2b — Three outline variants*: generate `outline-strategy-a.md`, `outline-strategy-b.md`, `outline-strategy-c.md`. Each MUST have a different structure AND a different recommended style — include `style_reason` in the frontmatter. Page-count heuristic: A ~4-6, B ~3-5, C ~3-4. Template: `references/workflows/outline-template.md`; frontmatter example in `references/confirmation.md`.
- *Step 2c — Selection*: ask three questions (outline A/B/C/Combined, style, visual elements). Save selected/merged outline to `outline.md` → Step 3.

### Step 3: Generate Images

With confirmed outline + style + layout + palette:

**Visual consistency — image-1 anchor chain**: character / mascot / color rendering drifts between calls unless you anchor them. Generate image 1 (cover) first WITHOUT `--ref`, then pass image 1 as `--ref` to every subsequent image. This is the single most important consistency trick for this skill — don't skip it even if the backend also supports a session ID.

Generation flow:

1. Write the full prompt for every image to `prompts/NN-{type}-{slug}.md` in the user's preferred language (backup rule applies), then verify all selected prompt files exist.
2. Generate **image 1** first without `--ref`; backup rule applies to the PNG file. This establishes the anchor.
3. Build a task list for **images 2+** using image 1 as `--ref <path-to-image-01.png>`.
4. Dispatch images 2+ in batches per the `## Batch Generation Policy`: backend native batch first, runtime parallel tool calls second, sequential only as fallback.
5. Report progress after each completed image. On failure, retry only the failed item once from the same saved prompt file.

**Watermark** (if enabled in EXTEND.md): append to the generation prompt:

```
Include a subtle watermark "[content]" positioned at [position].
The watermark should be legible but not distracting.
```

See `references/config/watermark-guide.md`.

**Backend selection**: per the Image Generation Tools rule at the top — use whatever is available, ask once if multiple, before any generation. Under `--yes`, use the EXTEND.md preference and fall back to the first available backend. Prompt files MUST exist before invoking any backend.

**`codex-imagegen` invocation**: when the rule resolves to `codex-imagegen`, see [references/codex-imagegen.md](references/codex-imagegen.md) for the invocation contract (preferred `baoyu-image-gen --provider codex-cli` path, runtime wrapper discovery, parameter notes, stdout schema, batch semantics — n=1 per call so card batches must dispatch one wrapper call per card; the wrapper does NOT accept `--sessionId`, so chain consistency must come from `--ref` per Step 3 above).

**Session ID** (if the backend supports `--sessionId`): use `cards-{topic-slug}-{timestamp}` for every image; combined with the ref chain this gives maximum consistency.

### Step 4: Completion Report

```
Image Card Series Complete!

Topic: [topic]
Mode: [Quick / Custom / Detailed]
Strategy: [A/B/C/Combined]
Style: [name]
Palette: [name or "default"]
Layout: [name or "varies"]
Location: [directory]
Images: N total

✓ analysis.md
✓ outline.md
✓ outline-strategy-a/b/c.md (detailed mode only)

- 01-cover-[slug].png ✓ Cover (sparse)
- 02-content-[slug].png ✓ Content (balanced)
- ...
- NN-ending-[slug].png ✓ Ending (sparse)
```

## Content Breakdown Principles

| Position | Purpose | Typical layout |
|----------|---------|----------------|
| Cover (image 1) | Hook + visual impact | `sparse` |
| Content (middle) | Core value per image | `balanced` / `dense` / `list` / `comparison` / `flow` |
| Ending (last) | CTA / summary | `sparse` or `balanced` |

For the style × layout compatibility matrix, see the **Style × Layout Matrix** above.

## Image Modification

| Action | How |
|--------|-----|
| Edit | Update `prompts/NN-{type}-{slug}.md` **first**, then regenerate with the same session ID |
| Add | Specify position, create prompt, generate, renumber subsequent files `NN+1`, update outline |
| Delete | Remove files, renumber subsequent `NN-1`, update outline |

Always update the prompt file before regenerating — it's the source of truth and makes changes reproducible.

Text correction policy:

- If a card's title, body copy, tags, or any other rendered text is misspelled, garbled, hard to read, or visually weak, do not patch the bitmap with code.
- For text-correction regenerations, write a new prompt file and a new output path so the flawed candidate is preserved for comparison.
- Post-processing is limited to crop, resize, compression, or format conversion that does not alter text or the main composition.

## References

| File | Content |
|------|---------|
| `references/confirmation.md` | Verbatim AskUserQuestion copy for every confirmation path |
| `references/style-presets.md` | Full preset shortcut definitions |
| `references/presets/<style>.md` | Per-style element definitions |
| `references/palettes/<name>.md` | Per-palette color definitions |
| `references/elements/canvas.md` | Aspect ratios, safe zones, grid layouts |
| `references/elements/image-effects.md` | Cutout, stroke, filters |
| `references/elements/typography.md` | Decorated text, tags, text direction |
| `references/elements/decorations.md` | Emphasis marks, backgrounds, doodles, frames |
| `references/workflows/analysis-framework.md` | Content analysis framework |
| `references/workflows/outline-template.md` | Outline template with layout guide |
| `references/workflows/prompt-assembly.md` | Prompt assembly guide |
| `references/config/preferences-schema.md` | EXTEND.md schema |
| `references/config/first-time-setup.md` | First-time setup flow |
| `references/config/watermark-guide.md` | Watermark configuration |

## Notes

- Auto-retry once on generation failure before reporting an error.
- For sensitive public figures, use stylized cartoon alternatives.
- Smart Confirm (Step 2) is required; Detailed mode adds a second confirmation (2a + 2c).

## Changing Preferences

EXTEND.md lives at the first matching path listed in Step 0. Three ways to change it:

- **Edit directly** — open EXTEND.md and change fields. Full schema: `references/config/preferences-schema.md`.
- **Reconfigure interactively** — delete EXTEND.md (or ask "reconfigure baoyu-xhs-images preferences" / "重新配置"). The next run re-triggers first-time setup.
- **Common one-line edits**:
  - `preferred_image_backend: auto` — default; runtime-native tool wins, falls back to the only installed backend, asks only if multiple non-native are present.
  - `preferred_image_backend: codex-imagegen` — pin to Codex's built-in.
  - `preferred_image_backend: baoyu-image-gen` — pin to the baoyu-image-gen skill.
  - `preferred_image_backend: ask` — confirm backend every run.
  - `generation_batch_size: 4` — default number of images to render concurrently when the backend/runtime supports batch or parallel generation.
  - `preferred_style: notion`, `preferred_layout: dense`, `preferred_palette: macaron`, `language: zh`.
  - `watermark.enabled: true` + `watermark.content: "@handle"` — add a watermark.
