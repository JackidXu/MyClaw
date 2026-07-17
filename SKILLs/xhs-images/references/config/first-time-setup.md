---
name: first-time-setup
description: First-time setup flow for baoyu-xhs-images preferences
---

# First-Time Setup

## Overview

When no EXTEND.md is found, guide user through preference setup.

**⛔ BLOCKING OPERATION**: This setup MUST complete before ANY other workflow steps. Do NOT:
- Ask about content/article
- Ask about style or layout
- Ask about target audience
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

Use single AskUserQuestion with multiple questions (AskUserQuestion auto-adds "Other" option):

### Question 1: Watermark

```
header: "Watermark"
question: "Watermark text for generated images? Type your watermark content (e.g., name, @handle)"
options:
  - label: "无水印（推荐） No watermark (Recommended)"
    description: "暂不添加水印，后续可在 EXTEND.md 中开启 / No watermark, can enable later in EXTEND.md"
```

Position defaults to bottom-right.

### Question 2: Preferred Style

```
header: "Style"
question: "Default visual style preference? Or type another style name or your custom style"
options:
  - label: "无偏好（推荐） None (Recommended)"
    description: "每次根据内容自动匹配 / Auto-select based on content analysis"
  - label: "cute 甜美可爱风"
    description: "甜美可爱，经典小红书审美 / Sweet, adorable - classic XHS aesthetic"
  - label: "notion 极简手绘风"
    description: "极简手绘线条，知识感 / Minimalist hand-drawn, intellectual"
```

### Question 3: Save Location

```
header: "Save"
question: "Where to save preferences?"
options:
  - label: "项目级 Project"
    description: ".baoyu-skills/（仅当前项目） / this project only"
  - label: "用户全局 User"
    description: "~/.baoyu-skills/（所有项目共享） / all projects"
```

## Save Locations

| Choice | Path | Scope |
|--------|------|-------|
| Project | `.baoyu-skills/baoyu-xhs-images/EXTEND.md` | Current project |
| User | `~/.baoyu-skills/baoyu-xhs-images/EXTEND.md` | All projects |

## After Setup

1. Create directory if needed
2. Write EXTEND.md with frontmatter
3. Confirm: "Preferences saved to [path]"
4. Continue to Step 1

## EXTEND.md Template

```yaml
---
version: 1
watermark:
  enabled: [true/false]
  content: "[user input or empty]"
  position: bottom-right
  opacity: 0.7
preferred_style:
  name: [selected style or null]
  description: ""
preferred_layout: null
language: null
preferred_image_backend: auto
generation_batch_size: 4
custom_styles: []
---
```

`preferred_image_backend: auto` is the baked-in default — first-time setup does not ask about it. The `## Image Generation Tools` rule in SKILL.md then picks the runtime-native tool (Codex `imagegen`, Hermes `image_generate`, etc.) when available, and falls back to installed backends.

`generation_batch_size: 4` is the baked-in default for batch rendering. The current user request may override it for one run.

## Modifying Preferences Later

See the `## Changing Preferences` section in `SKILL.md` for the canonical list of common edits (pin backend, change defaults, retrigger setup). Full schema: `preferences-schema.md`.
