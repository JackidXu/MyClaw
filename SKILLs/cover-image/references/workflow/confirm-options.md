# Step 2: Confirm Options

## Purpose

Validate all 6 dimensions + aspect ratio.

## Skip Conditions

| Condition | Skipped Questions | Still Asked |
|-----------|-------------------|-------------|
| `--quick` flag | Type, Palette, Rendering, Text, Mood, Font | **Aspect Ratio** (unless `--aspect` specified) |
| All 6 dimensions + `--aspect` specified | All | None |
| `quick_mode: true` in EXTEND.md | Type, Palette, Rendering, Text, Mood, Font | **Aspect Ratio** (unless `--aspect` specified) |
| Otherwise | None | All 7 questions |

**Important**: Aspect ratio is ALWAYS asked unless explicitly specified via `--aspect` CLI flag. User presets in EXTEND.md are shown as recommended option, not auto-selected.

## Quick Mode Output

When skipping 6 dimensions:

```
Quick Mode: Auto-selected dimensions
• Type: [type] ([reason])
• Palette: [palette] ([reason])
• Rendering: [rendering] ([reason])
• Text: [text] ([reason])
• Mood: [mood] ([reason])
• Font: [font] ([reason])

[Then ask Question 7: Aspect Ratio]
```

## Confirmation Flow

**Language**: Auto-determined (user's input language > saved preference > source language). No need to ask.

Present ALL options in a **single AskUserQuestion call** (4 questions max).

Skip any question where the dimension is already specified via CLI flag or `--style` preset.

### Q1: Type (skip if `--type`)

```yaml
header: "Type"
question: "Which cover type?"
multiSelect: false
options:
  - label: "[auto-recommended type] (Recommended)"
    description: "[reason based on content signals]"
  - label: "hero / 英雄风格"
    description: "Large visual impact, title overlay - product launch, announcements"
  - label: "conceptual / 概念化"
    description: "Concept visualization - technical, architecture"
  - label: "typography / 文字排版"
    description: "Text-focused layout - opinions, quotes"
```

### Q2: Palette (skip if `--palette` or `--style`)

```yaml
header: "Palette"
question: "Which color palette?"
multiSelect: false
options:
  - label: "[auto-recommended palette] (Recommended)"
    description: "[reason based on content signals]"
  - label: "warm / 暖色调"
    description: "Friendly - orange, golden yellow, terracotta"
  - label: "elegant / 优雅"
    description: "Sophisticated - soft coral, muted teal, dusty rose"
  - label: "cool / 冷色调"
    description: "Technical - engineering blue, navy, cyan"
```

### Q3: Rendering (skip if `--rendering` or `--style`)

Show compatible renderings (✓✓ first from compatibility matrix):

```yaml
header: "Rendering"
question: "Which rendering style?"
multiSelect: false
options:
  - label: "[best compatible rendering] (Recommended)"
    description: "[reason based on palette + type + content]"
  - label: "flat-vector / 扁平矢量"
    description: "Clean outlines, flat fills, geometric icons"
  - label: "hand-drawn / 手绘风格"
    description: "Sketchy, organic, imperfect strokes"
  - label: "digital / 数字插画"
    description: "Polished, precise, subtle gradients"
```

### Q4: Font (skip if `--font`)

```yaml
header: "Font"
question: "Which font style?"
multiSelect: false
options:
  - label: "[auto-recommended font] (Recommended)"
    description: "[reason based on content signals]"
  - label: "clean / 简洁无衬线"
    description: "Modern geometric sans-serif - tech, professional"
  - label: "handwritten / 手写体"
    description: "Warm hand-lettered - personal, friendly"
  - label: "serif / 衬线体"
    description: "Classic elegant - editorial, luxury"
  - label: "display / 展示字体"
    description: "Bold decorative - announcements, entertainment"
```

### Q5: Other Settings (skip if all remaining dimensions already specified)

Combine remaining settings into one question. Include: Output Dir (if no preference + file path input), Text, Mood, Aspect. Show auto-selected values as recommended option. User can accept all or type adjustments via "Other".

**When output dir needs asking** (no `default_output_dir` preference + file path input):

```yaml
header: "Settings"
question: "Output / Text / Mood / Aspect?"
multiSelect: false
options:
  - label: "imgs/ / imgs子目录/ / [auto-text] / [auto-mood] / [preset-aspect] (Recommended)"
    description: "{article-dir}/imgs/, [text reason], [mood reason], [aspect source]"
  - label: "same-dir / 同目录 / [auto-text] / [auto-mood] / [preset-aspect]"
    description: "{article-dir}/, same directory as article"
  - label: "independent / 独立目录 / [auto-text] / [auto-mood] / [preset-aspect]"
    description: "cover-image/{topic-slug}/, separate from article"
```

**When output dir already set** (preference exists or pasted content):

```yaml
header: "Settings"
question: "Text / Mood / Aspect?"
multiSelect: false
options:
  - label: "[auto-text] / [auto-mood] / [preset-aspect] (Recommended)"
    description: "Auto-selected: [text reason], [mood reason], [aspect source]"
  - label: "[auto-text] / bold / [preset-aspect]"
    description: "High contrast, vivid — matches [content signal]"
  - label: "[auto-text] / subtle / [preset-aspect]"
    description: "Low contrast, muted — calm, professional"
```

*Note*: "Other" (auto-added) allows typing custom combo. Parse `/`-separated values matching the question format.

## After Response

Proceed to Step 3 with confirmed dimensions.
