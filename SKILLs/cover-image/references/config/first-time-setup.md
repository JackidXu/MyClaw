---
name: first-time-setup
description: First-time setup flow for baoyu-cover-image preferences
---

# First-Time Setup

## Overview

When no EXTEND.md is found, guide user through preference setup.

**⛔ BLOCKING OPERATION**: This setup MUST complete before ANY other workflow steps. Do NOT:
- Ask about reference images
- Ask about content/article
- Ask about dimensions (type, palette, rendering)
- Proceed to content analysis

ONLY ask the questions in this setup flow, save EXTEND.md, then continue.

## Setup Flow

```
No EXTEND.md found
        │
        ▼
┌─────────────────────┐
│ AskUserQuestion     │
│ (all questions)     │
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│ Create EXTEND.md    │
└─────────────────────┘
        │
        ▼
    Continue to Step 1
```

## Questions

**Language**: Use user's input language or saved language preference.

Use AskUserQuestion with ALL questions in ONE call:

### Question 1: Watermark

```yaml
header: "Watermark"
question: "Watermark text for generated cover images?"
options:
  - label: "No watermark / 无水印（推荐）"
    description: "Clean covers, can enable later in EXTEND.md"
```

### Question 2: Preferred Type

```yaml
header: "Type"
question: "Default cover type preference?"
options:
  - label: "Auto-select / 自动选择（推荐）"
    description: "Choose based on content analysis each time"
  - label: "hero / 英雄风格"
    description: "Large visual impact - product launch, announcements"
  - label: "conceptual / 概念化"
    description: "Concept visualization - technical, architecture"
```

### Question 3: Preferred Palette

```yaml
header: "Palette"
question: "Default color palette preference?"
options:
  - label: "Auto-select / 自动选择（推荐）"
    description: "Choose based on content analysis each time"
  - label: "elegant / 优雅"
    description: "Sophisticated - soft coral, muted teal, dusty rose"
  - label: "warm / 暖色调"
    description: "Friendly - orange, golden yellow, terracotta"
  - label: "cool / 冷色调"
    description: "Technical - engineering blue, navy, cyan"
```

### Question 4: Preferred Rendering

```yaml
header: "Rendering"
question: "Default rendering style preference?"
options:
  - label: "Auto-select / 自动选择（推荐）"
    description: "Choose based on content analysis each time"
  - label: "hand-drawn / 手绘风格"
    description: "Sketchy organic illustration with personal touch"
  - label: "flat-vector / 扁平矢量"
    description: "Clean modern vector with geometric shapes"
  - label: "digital / 数字插画"
    description: "Polished precise digital illustration"
```

### Question 5: Default Aspect Ratio

```yaml
header: "Aspect"
question: "Default aspect ratio for cover images?"
options:
  - label: "16:9 / 宽屏（推荐）"
    description: "Standard widescreen - YouTube, presentations, versatile"
  - label: "2.35:1 / 电影宽屏"
    description: "Cinematic widescreen - article headers, blog posts"
  - label: "1:1 / 正方形"
    description: "Square - Instagram, WeChat, social cards"
  - label: "3:4 / 竖版"
    description: "Portrait - Xiaohongshu, Pinterest, mobile content"
```

Note: More ratios (4:3, 3:2) available during generation. This sets the default recommendation.

### Question 6: Default Output Directory

```yaml
header: "Output"
question: "Default output directory for cover images?"
options:
  - label: "Independent / 独立目录（推荐）"
    description: "cover-image/{topic-slug}/ - separate from article"
  - label: "Same directory / 同目录"
    description: "{article-dir}/ - alongside the article file"
  - label: "imgs subdirectory / imgs子目录"
    description: "{article-dir}/imgs/ - images folder near article"
```

### Question 7: Quick Mode

```yaml
header: "Quick"
question: "Enable quick mode by default?"
options:
  - label: "No / 否（推荐）"
    description: "Confirm dimension choices each time"
  - label: "Yes / 是"
    description: "Skip confirmation, use auto-selection"
```

### Question 8: Save Location

```yaml
header: "Save"
question: "Where to save preferences?"
options:
  - label: "Project / 项目（推荐）"
    description: ".baoyu-skills/ (this project only)"
  - label: "User / 用户"
    description: "~/.baoyu-skills/ (all projects)"
```

## Save Locations

| Choice | Path | Scope |
|--------|------|-------|
| Project | `.baoyu-skills/baoyu-cover-image/EXTEND.md` | Current project |
| User | `~/.baoyu-skills/baoyu-cover-image/EXTEND.md` | All projects |

## After Setup

1. Create directory if needed
2. Write EXTEND.md with frontmatter
3. Confirm: "Preferences saved to [path]"
4. Continue to Step 1

## EXTEND.md Template

```yaml
---
version: 3
watermark:
  enabled: [true/false]
  content: "[user input or empty]"
  position: bottom-right
  opacity: 0.7
preferred_type: [selected type or null]
preferred_palette: [selected palette or null]
preferred_rendering: [selected rendering or null]
preferred_text: title-only
preferred_mood: balanced
default_aspect: [16:9/2.35:1/1:1/3:4]
default_output_dir: [independent/same-dir/imgs-subdir]
quick_mode: [true/false]
language: null
preferred_image_backend: auto
custom_palettes: []
---
```

`preferred_image_backend: auto` is the baked-in default — first-time setup does not ask about it. The `## Image Generation Tools` rule in SKILL.md then picks the runtime-native tool (Codex `imagegen`, Hermes `image_generate`, etc.) when available, and falls back to installed backends.

## Modifying Preferences Later

See the `## Changing Preferences` section in `SKILL.md` for the canonical list of common edits (pin backend, change defaults, retrigger setup). Full schema: `preferences-schema.md`.

**EXTEND.md Supports**: Watermark | Preferred type | Preferred palette | Preferred rendering | Preferred text | Preferred mood | Default aspect ratio | Default output directory | Quick mode | Image backend preference | Custom palette definitions | Language preference
