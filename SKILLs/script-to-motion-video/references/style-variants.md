# 风格变体库（37 种）

本技能内置 37 种视觉风格，分三层组织。每个风格包含完整定义：调性 + 适用场景 + 视觉描述 + 色板（:root CSS 变量）+ 光学效果 + 滤镜 + 动效节奏参数表 + 标题样式 + 画面底板效果。

> ⚠️ **本文件已降级为「配色 / 标题样式灵感库」**：自 `references/style-skins/` 皮肤包引入后，**禁止**把本文件的 `:root` 直接复制到 composition 当设计系统（旧做法会带回 `.bg img` 全屏压暗 / `scrim/dim/charge` 反模式，画面发脏发灰）。换风格 / 换皮一律走 `references/style-skins/`：用其 `tokens.css` 替换 `:root`、`base.css` 替换 `#paper/#grain`。本文件仅作**配色搭配与 `--masthead-*` 标题样式**的灵感参考；下面的「选风格路径 / 使用说明」仅描述色板语义，**不再作为 composition 的构建指令**（见 SKILL.md 阶段 1 第 4-5 步与 `quality-gate.md` 第三节）。

**选风格路径**：看文案类型 → 核心风格能覆盖就直接选 → 不能覆盖看调性风格 → 还不匹配看场景风格。一个视频选一种主风格贯穿全片。

## 选风格指南

| 文案类型 | 推荐风格 |
|---|---|
| 痛点诊断 / 专业讲解 / 信任建立 | editorial |
| 钩子 / 强观点 / 反差对比 | bold 或 loud |
| 产品介绍 / 教程 / 流程说明 | neutral 或 cream |
| 真实案例 / 患者见证 / 纪实 | documentary |
| 演讲汇报 / 发布会 | keynote |
| 科技 / 数字化 / 未来感 | neon 或 hologram |
| 文化 / 品牌 / 情感叙事 | ink 或 inkwater |
| 温和叙事 / 情感故事 | cream 或 aurora |
| 教学 / 讲解 / 知识科普 | chalkboard |
| 复古怀旧 / 老照片风格 | vhs |
| 故障冲击 / 科技崩坏 | glitch |
| 街头 / 潮流 / 年轻 | graffiti |
| 新闻 / 资讯 / 报道 | anchor |
| 游戏 / 竞技 | arcade 或 scoreboard |
| 档案 / 机密 / 调查 | dossier |
| 工业 / 制造 / 军事 | ordnance |
| 终端 / 代码 / 极客 | terminal |

---

# 第一层：核心风格（8 种）

覆盖 80% 文案场景，AI 默认从这里选。

## editorial
- **标题**：Editorial — serif voice, magazine cadence
- **调性**：`editorial-luxe`
- **适用场景**：introspective monologue, fashion / beauty, poetic or lyrical content, premium brand films on mid/dark scenes. The serif italic carries intimacy that a grotesque can't. The hero stays lowercase italic 
- **色板**：
  ```css
  :root {
    --fg: #f2ead8;
    --accent: #c9a36a;
    --accent-fallback: #c9a36a;
    --bg: #16213a;
    --blend: screen;
    /* masthead 开场标题（由「标题样式」参数生成，随风格自动适配） */
    --masthead-title-size: clamp(44px, calc(40px + 0.3*130px), 96px);
    --masthead-title-weight: 800;
    --masthead-title-track: -0.01em;
    --masthead-title-glow: 0 0 26px color-mix(in srgb, var(--accent) 75%, transparent);
    --masthead-title-case: none;
    --masthead-title-entrance: emergence;
    --masthead-breathe: 0.01;
  }
  ```
- **光学效果**：depthMatch:true, contactShadow:true, warmBloom:true
- **滤镜**：`contrast(1.06)`
- **动效节奏**：
  | 能量 | y | blur | scale | dur | ease |
  |---|---|---|---|---|---|
  | soft | 0 | - | - | 0.55 | power2.out |
  | present | 0 | - | 1.02 | 0.34 | power2.out |
  | impact | 0 | - | 1.06 | 0.28 | power3.out |
  | exit | - | - | - | 0.4 | sine.in |
- **标题样式**：tracking:-0.01em, sizeRange:[0.18, 0.3], glow:0.18, breathe:0.01, entrance:emergence, perLetter:true, letterStagger:0.022, dimOthers:0.5
- **字体**：Bodoni Moda (weights: [400, 700])

## cream
- **标题**：Warm cream — the poetic default
- **调性**：`premium-warm`
- **适用场景**：dark / mid-tone warm scenes (band luma < 150): studios, evening interiors, moody interviews. Introspective, narrative, emotional content. The successor of cinematic-cream.
- **色板**：
  ```css
  :root {
    --fg: #fff5df;
    --accent: #e3c06a;
    --accent-fallback: #e3c06a;
    --bg: #16213a;
    --blend: screen;
    /* masthead 开场标题（由「标题样式」参数生成，随风格自动适配） */
    --masthead-title-size: clamp(44px, calc(40px + 0.34*130px), 96px);
    --masthead-title-weight: 800;
    --masthead-title-track: -0.03em;
    --masthead-title-glow: 0 0 26px color-mix(in srgb, var(--accent) 75%, transparent);
    --masthead-title-case: uppercase;
    --masthead-title-entrance: emergence;
    --masthead-breathe: 0.012;
  }
  ```
- **光学效果**：depthMatch:true, contactShadow:true, warmBloom:true
- **滤镜**：`contrast(1.08)`
- **动效节奏**：
  | 能量 | y | blur | scale | dur | ease |
  |---|---|---|---|---|---|
  | soft | 8 | 2.5 | - | 0.5 | power2.out |
  | present | 6 | 1.5 | 1.03 | 0.3 | power3.out |
  | impact | 12 | 1.5 | 1.08 | 0.24 | power4.out |
  | exit | -8 | - | - | 0.45 | sine.in |
- **标题样式**：case:uppercase, tracking:-0.03em, sizeRange:[0.2, 0.34], glow:0.3, breathe:0.012, entrance:emergence, perLetter:true, letterStagger:0.016, dimOthers:0.45
- **字体**：Inter (weights: [500, 600, 700, 900])

## documentary
- **标题**：Documentary — Errol Morris dignity
- **调性**：`formal`
- **适用场景**：interviews, serious subject matter, journalism, testimonial. Burn-in reveals (no animation), bone on charcoal, a deliberately modest hero. Gravitas IS the style — stillness, no accent color, no glow.
- **色板**：
  ```css
  :root {
    --fg: #F5EFE6;
    --accent: #F5EFE6;
    --bg: #16213a;
    --blend: normal;
    /* masthead 开场标题（由「标题样式」参数生成，随风格自动适配） */
    --masthead-title-size: clamp(44px, calc(40px + 0.15*130px), 96px);
    --masthead-title-weight: 800;
    --masthead-title-track: -0.015em;
    --masthead-title-glow: none;
    --masthead-title-case: none;
    --masthead-title-entrance: rise;
    --masthead-breathe: 0;
  }
  ```
- **光学效果**：depthMatch:true, contactShadow:true, warmBloom:false
- **滤镜**：`none`
- **动效节奏**：
  | 能量 | y | blur | scale | dur | ease |
  |---|---|---|---|---|---|
  | soft | - | - | - | - | burn |
  | present | 0 | - | - | 0.18 | power1.out |
  | impact | 6 | - | 1.03 | 0.2 | power2.out |
  | exit | - | - | - | 0.15 | power1.in |
- **标题样式**：tracking:-0.015em, sizeRange:[0.09, 0.15], glow:0, entrance:rise, dimOthers:0.3
- **字体**：Inter (weights: [500, 700])

## keynote
- **标题**：Keynote — Apple-grade confidence
- **调性**：`tech-premium`
- **适用场景**：product walkthroughs, launches, founder updates, tech explainers. Opaque white type, dead-center planes, few words held long. Confidence comes from mass and stillness, not motion.
- **色板**：
  ```css
  :root {
    --fg: #ffffff;
    --accent: #8ab4ff;
    --accent-fallback: #8ab4ff;
    --bg: #16213a;
    --blend: normal;
    /* masthead 开场标题（由「标题样式」参数生成，随风格自动适配） */
    --masthead-title-size: clamp(44px, calc(40px + 0.3*130px), 96px);
    --masthead-title-weight: 800;
    --masthead-title-track: -0.045em;
    --masthead-title-glow: none;
    --masthead-title-case: uppercase;
    --masthead-title-entrance: wipe-up;
    --masthead-breathe: 0;
  }
  ```
- **光学效果**：depthMatch:true, contactShadow:true, warmBloom:false
- **滤镜**：`none`
- **动效节奏**：
  | 能量 | y | blur | scale | dur | ease |
  |---|---|---|---|---|---|
  | soft | - | - | - | - | burn |
  | present | - | - | - | - | burn |
  | impact | - | - | - | - | burn |
  | exit | - | - | - | 0.3 | power2.in |
- **标题样式**：case:uppercase, tracking:-0.045em, sizeRange:[0.16, 0.3], glow:0, entrance:wipe-up, dimOthers:0.35
- **字体**：Inter (weights: [400, 600, 800])

## bold（全局主题）
- **完整色板**：
  ```css
  :root {
    --bg: #080611;
  --fg: #fff8ff;
  --muted: #b6a9ca;
  --surface: #1b1230;
  --border: #493668;
  --brand: #ff3d81;
  --accent: #7c5cff;
  --accent-2: #00d4ff;
  --font-display: Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif;
  --font-body: Inter, "Helvetica Neue", Arial, sans-serif;
  --font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  --radius: 1.4cqmin;
  --space-1: 1.2cqmin;
  --space-2: 2.6cqmin;
  --space-3: 4.6cqmin;
  --dur-beat: 0.32s;
  --ease-standard: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-emphasis: cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  ```

## neutral（全局主题）
- **完整色板**：
  ```css
  :root {
    --bg: #f3f4f6;
  --fg: #111318;
  --muted: #626873;
  --surface: #fcfcfd;
  --border: #d7dbe2;
  --brand: #1d4ed8;
  --accent: #0284c7;
  --accent-2: #60a5fa;
  --font-display: Inter, "Helvetica Neue", Arial, sans-serif;
  --font-body: Inter, "Helvetica Neue", Arial, sans-serif;
  --font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  --radius: 2.4cqmin;
  --space-1: 1.2cqmin;
  --space-2: 2.4cqmin;
  --space-3: 4cqmin;
  --dur-beat: 0.4s;
  --ease-standard: cubic-bezier(0.215, 0.61, 0.355, 1);
  --ease-emphasis: cubic-bezier(0.19, 1, 0.22, 1);
  }
  ```

## neon
- **标题**：Neon — the sign in the scene
- **调性**：`loud-neon`
- **适用场景**：neon-noir / nightlife / tech-noir / music content on dark scenes. The captions ARE neon signage hanging in the room: electric cyan tubes, ignition flicker, a hum of glow. The hero powers ON like a sig
- **色板**：
  ```css
  :root {
    --fg: #d9f7ff;
    --accent: #22e6ff;
    --bg: #16213a;
    --blend: screen;
    /* masthead 开场标题（由「标题样式」参数生成，随风格自动适配） */
    --masthead-title-size: clamp(44px, calc(40px + 0.3*130px), 96px);
    --masthead-title-weight: 800;
    --masthead-title-track: 0.04em;
    --masthead-title-glow: 0 0 26px color-mix(in srgb, var(--accent) 75%, transparent);
    --masthead-title-case: uppercase;
    --masthead-title-entrance: flicker-on;
    --masthead-breathe: 0.01;
  }
  ```
- **光学效果**：depthMatch:false, contactShadow:false, warmBloom:false
- **滤镜**：`none`
- **动效节奏**：
  | 能量 | y | blur | scale | dur | ease |
  |---|---|---|---|---|---|
  | soft | - | - | - | - | flicker |
  | present | - | - | - | - | flicker |
  | impact | - | - | - | - | flicker |
  | exit | - | - | - | 0.18 | power2.in |
- **标题样式**：case:uppercase, tracking:0.04em, sizeRange:[0.18, 0.3], glow:0.5, breathe:0.01, entrance:flicker-on, dimOthers:0.4
- **字体**：Orbitron (weights: [400, 700])

## ink
- **标题**：Ink — printed on the scene
- **调性**：`premium`
- **适用场景**：BRIGHT scenes (band luma > 150): white offices, daylight, pale walls — the scenes where cream/screen washes out. Multiply blend makes the type read as printed ON the wall, picking up its texture. Conf
- **色板**：
  ```css
  :root {
    --fg: #1b1714;
    --accent: #9a3b2e;
    --accent-fallback: #9a3b2e;
    --bg: #f5f0e8;
    --fg: #1a1815;
    --blend: multiply;
    /* masthead 开场标题（由「标题样式」参数生成，随风格自动适配） */
    --masthead-title-size: clamp(44px, calc(40px + 0.34*130px), 96px);
    --masthead-title-weight: 800;
    --masthead-title-track: -0.035em;
    --masthead-title-glow: none;
    --masthead-title-case: uppercase;
    --masthead-title-entrance: settle;
    --masthead-breathe: 0;
  }
  ```
- **光学效果**：depthMatch:true, contactShadow:true, warmBloom:false
- **滤镜**：`contrast(1.05)`
- **动效节奏**：
  | 能量 | y | blur | scale | dur | ease |
  |---|---|---|---|---|---|
  | soft | 0 | - | 1.06 | 0.22 | power3.out |
  | present | 0 | - | 1.08 | 0.2 | power3.out |
  | impact | 0 | - | 1.12 | 0.18 | power4.out |
  | exit | - | - | - | 0.22 | power2.in |
- **标题样式**：case:uppercase, tracking:-0.035em, sizeRange:[0.2, 0.34], glow:0, entrance:settle, letterStagger:0.014, dimOthers:0.4
- **字体**：Inter (weights: [500, 700, 900])

---

# 第二层：调性风格（12 种）

特定情绪/调性时选。

## chrome
- **标题**：Chrome — Y2K liquid metal
- **调性**：`loud-luxe`
- **适用场景**：fashion-tech, music, Y2K-revival, product-flex content. The hero is cast in liquid metal — a gradient sheen sweeps across it once during the hold. Supporting lines stay cool steel.
- **色板**：
  ```css
  :root {
    --fg: #e8edf2;
    --accent: #9fb6cc;
    --bg: #16213a;
    --blend: normal;
    /* masthead 开场标题（由「标题样式」参数生成，随风格自动适配） */
    --masthead-title-size: clamp(44px, calc(40px + 0.3*130px), 96px);
    --masthead-title-weight: 800;
    --masthead-title-track: 0.02em;
    --masthead-title-glow: 0 0 26px color-mix(in srgb, var(--accent) 75%, transparent);
    --masthead-title-case: uppercase;
    --masthead-title-entrance: settle;
    --masthead-breathe: 0.008;
  }
  ```
- **光学效果**：depthMatch:true, contactShadow:true, warmBloom:false
- **滤镜**：`none`
- **动效节奏**：
  | 能量 | y | blur | scale | dur | ease |
  |---|---|---|---|---|---|
  | soft | 6 | - | 1.04 | 0.3 | power3.out |
  | present | 6 | - | 1.06 | 0.26 | power3.out |
  | impact | 8 | - | 1.1 | 0.22 | power4.out |
  | exit | - | - | - | 0.25 | power2.in |
- **标题样式**：case:uppercase, tracking:0.02em, sizeRange:[0.18, 0.3], glow:0.15, breathe:0.008, entrance:settle, dimOthers:0.4
- **字体**：Audiowide (weights: [400])

## glitch
- **标题**：Glitch — signal corruption
- **调性**：`loud-cyber`
- **适用场景**：digital / hacker / AI / dystopia content; anything that wants the captions to feel like a corrupted feed. RGB-split echoes snap together as each beat lands; timing is machine-percussive; nothing eases
- **色板**：
  ```css
  :root {
    --fg: #eaffff;
    --accent: #ff3df0;
    --bg: #16213a;
    --blend: screen;
    /* masthead 开场标题（由「标题样式」参数生成，随风格自动适配） */
    --masthead-title-size: clamp(44px, calc(40px + 0.32*130px), 96px);
    --masthead-title-weight: 800;
    --masthead-title-track: 0.01em;
    --masthead-title-glow: 0 0 26px color-mix(in srgb, var(--accent) 75%, transparent);
    --masthead-title-case: uppercase;
    --masthead-title-entrance: settle;
    --masthead-breathe: 0;
  }
  ```
- **光学效果**：depthMatch:false, contactShadow:false, warmBloom:false
- **滤镜**：`none`
- **动效节奏**：
  | 能量 | y | blur | scale | dur | ease |
  |---|---|---|---|---|---|
  | soft | - | - | - | 0.12 | power4.out |
  | present | - | - | - | 0.11 | power4.out |
  | impact | - | - | - | 0.1 | power4.out |
  | exit | - | - | 1.02 | 0.1 | power4.in |
- **标题样式**：case:uppercase, tracking:0.01em, sizeRange:[0.2, 0.32], glow:0.18, entrance:settle, dimOthers:0.45
- **字体**：Space Grotesk (weights: [400, 700])

## loud
- **标题**：Loud — the sanctioned blast
- **调性**：`loud`
- **适用场景**：hype, social reels, sport, music, motivational shorts — content that WANTS the type to compete with the face (k-pop-lyric lineage; deliberately breaks 'subject wins' at the hero). Machine-gun letter s
- **色板**：
  ```css
  :root {
    --fg: #ffffff;
    --accent: #ffd600;
    --accent-fallback: #ffd600;
    --bg: #16213a;
    --blend: normal;
    /* masthead 开场标题（由「标题样式」参数生成，随风格自动适配） */
    --masthead-title-size: clamp(44px, calc(40px + 0.4*130px), 96px);
    --masthead-title-weight: 800;
    --masthead-title-track: -0.005em;
    --masthead-title-glow: 0 0 26px color-mix(in srgb, var(--accent) 75%, transparent);
    --masthead-title-case: uppercase;
    --masthead-title-entrance: slam;
    --masthead-breathe: 0.016;
  }
  ```
- **光学效果**：depthMatch:false, contactShadow:true, warmBloom:false
- **滤镜**：`none`
- **动效节奏**：
  | 能量 | y | blur | scale | dur | ease |
  |---|---|---|---|---|---|
  | soft | 0 | - | 1.3 | 0.18 | back.out(1.7) |
  | present | 0 | - | 1.35 | 0.18 | back.out(1.7) |
  | impact | 0 | - | 1.45 | 0.16 | back.out(1.9) |
  | exit | - | - | 0.96 | 0.14 | power3.in |
- **标题样式**：case:uppercase, tracking:-0.005em, sizeRange:[0.26, 0.4], glow:0.25, breathe:0.016, entrance:slam, letterStagger:0.01, dimOthers:0.55
- **字体**：Anton (weights: [400])

## velocity
- **标题**：Velocity — speed lines
- **调性**：`loud-sport`
- **适用场景**：sport, automotive, fitness, anything kinetic. Every word arrives ALONG its own motion vector (streak + skew settles upright); the hero passes through with speed trails behind it. Condensed italic forw
- **色板**：
  ```css
  :root {
    --fg: #ffffff;
    --accent: #ffd600;
    --accent-fallback: #ffd600;
    --bg: #16213a;
    --blend: normal;
    /* masthead 开场标题（由「标题样式」参数生成，随风格自动适配） */
    --masthead-title-size: clamp(44px, calc(40px + 0.38*130px), 96px);
    --masthead-title-weight: 800;
    --masthead-title-track: 0.015em;
    --masthead-title-glow: none;
    --masthead-title-case: uppercase;
    --masthead-title-entrance: streak;
    --masthead-breathe: 0;
  }
  ```
- **光学效果**：depthMatch:false, contactShadow:true, warmBloom:false
- **滤镜**：`none`
- **动效节奏**：
  | 能量 | y | blur | scale | dur | ease |
  |---|---|---|---|---|---|
  | soft | - | - | - | 0.22 | expo.out |
  | present | - | - | - | 0.2 | expo.out |
  | impact | - | - | - | 0.18 | expo.out |
  | exit | - | - | - | 0.16 | power3.in |
- **标题样式**：case:uppercase, tracking:0.015em, sizeRange:[0.24, 0.38], glow:0, entrance:streak, dimOthers:0.5
- **字体**：Teko (weights: [400, 700])

## aurora
- **调性**：`elegant`
- **适用场景**：dreamy / romantic / wonder content, night-sky and travel pieces, poetry, weddings, elegant brand films, '极光/丝带/优雅手写字幕' asks — anything that should feel written by light rather than printed. Soft register; the apex scrim + dark understroke carry contrast on bright skies.
- **视觉描述**：polar-night elegance — the sky is alive and every caption is woven light. Two huge aurora blobs drift the top of frame all clip; body words are silk serif ink whose rose→teal→violet sheen drifts continuously through the letters (emphasis words get one bright highlight sweep), lines share two coexisting rows like a woven couplet and dissolve UPWARD into drifting light streaks. The apex is a SILK RI
- **色板**：
  ```css
  :root {
    --body: #F2EFF7;
    --rose: #FF9EC4;
    --accent: #7FE0D4;
    --violet: #B9A8FF;
    --deep: #070C24;
  }
  ```
- **字体**：body:Cormorant Garamond, strokeFont:HersheyScript1.svg
- **画面底板**：scrim:0.42, pushIn:0.012, grain:5

## biolume
- **调性**：`dreamy`
- **适用场景**：ocean / nature / science-wonder docs, dreamy or meditative monologues, slow night-time reveals, 'underwater / 深海 / 发光水母' asks — anything that should feel alive and submerged rather than printed. Soft register; the abyss grade + pocket scrim make their own contrast on bright scenes.
- **视觉描述**：deep-sea bioluminescence — the clip sinks into an abyss grade with a breathing vignette and every caption is a living light. Body words GLOW ON like jellyfish (2-frame opacity + radial bloom from center while a cyan glow breathes in), emphasis words pulse a slow double-beat (propulsion), lines float on a gentle drift across two coexisting rows and SINK away dimming; seeded plankton motes drift the
- **色板**：
  ```css
  :root {
    --body: #E9FFFA;
    --accent: #6DF2E0;
    --violet: #9D7BFF;
    --ice: #8FE8FF;
    --core: #F2FFFD;
    --em: #F4FFFD;
    --mote: #96F5E8;
    --spore: #BDFFF4;
  }
  ```
- **字体**：body:Fredoka, hero:Fredoka, tag:Fredoka
- **画面底板**：scrim:0.42, pushIn:0.012, grain:5

## brush
- **调性**：`contemplative-elegant`
- **适用场景**：calm-authority explainers, craft / design / philosophy / Japan-adjacent content, tea-ceremony-paced brand films, meditation and writing channels — anything that wants ink-and-paper elegance with one violent flourish. The dark ink needs a mid/bright scene band (the paper wash supplies its own ground 
- **视觉描述**：sumi-e study — the lower third is a washi paper band (deckle-edged under-sheets, warm translucent sheet) where every word is brush-WIPED on behind a traveling brush-head shadow in a Mincho serif, seeded ±1° tilt; emphasis words get a double curved ink underline drawn beneath, and spent lines are wiped OFF right-to-left like a wet cloth. At the apex a warm paper wash charges behind the subject and 
- **色板**：
  ```css
  :root {
    --ink: #19120b;
    --nib: #1a130c;
    --body: #221a12;
    --ulInk: #2a1c12;
    --bh: #281e14;
    --paperHi: #efe8d7;
    --paperLo: #e7dfcb;
    --sheetHi: #f5efe2;
    --sheetLo: #ece4d2;
    --wash: #f6f0e2;
    --wash2: #f4edde;
    --seal: #d24a32;
    --sealMid: #c03422;
    --sealLo: #a92a1a;
    --sealText: #f7efe2;
    --accent: #c03422;
  }
  ```
- **字体**：body:Shippori Mincho, seal:Shippori Mincho, strokeFont:HersheyScript1.svg
- **画面底板**：punch:0.04, punchDecay:9, punchOffset:0.49, shakeAmpX:7, shakeAmpY:5, shakeHz:12, shakeDecay:7, shakeWindow:0.6, grain:6

## inkwater
- **调性**：`contemplative-still`
- **适用场景**：contemplative, literary or scientific-wonder narration, astronomy / nature / memory / essay films, poetry and slow-craft channels — anything spoken quietly that wants one liquid, meditative event instead of an impact. Dark ink needs a mid/bright scene band (the paper washes supply their own ground o
- **视觉描述**：sumi ink dropped in still water — the scene offers paper-white radial washes to the text zones, then Mincho-serif ink words BLEED into a lower-third of three fixed reading rows (blur + scale carry the bleed over a paper-glow halo, a dark blurred halo overshoots and tightens, an ink-settling hairline draws under each line, emphasis words shed a curling ink wisp) and spent lines re-dissolve upward l
- **色板**：
  ```css
  :root {
    --body: #14110e;
    --ink: #14110e;
    --paper: #fffaee;
    --paper2: #fff8e8;
    --wash: #fff9ee;
    --washApex: #fffaf0;
    --accent: #14110e;
  }
  ```
- **字体**：body:Shippori Mincho, hero:Shippori Mincho
- **画面底板**：pushIn:0.012, grain:5

## vhs
- **调性**：`retro-analog`
- **适用场景**：retro / nostalgia / found-footage / home-video registers, music and lifestyle edits, '90s tech content, '录像带/VHS/复古/DV' asks — anything that should read as a tape being played back. Mid-loud register; the backlight-comp scrim makes its own contrast on bright skies.
- **视觉描述**：camcorder tape playback — the whole frame is a VHS deck. A permanent lens vignette and OSD furniture (▶ PLAY, ● REC, green blinking timestamp) frame the clip; body words are an OSD lower third with a permanent 1px red+cyan misregistration fringe, arriving by tracking glitch (instant on + 2-frame y-shake + 1-frame band-slice shift) and exiting as REWIND streaks with flat-white echoes + scrub lines;
- **色板**：
  ```css
  :root {
    --body: #F2F2EE;
    --hot: #FFFFFF;
    --accent: #D9F7D2;
    --red: #FF2E2E;
    --cyan: #3FE8E8;
    --green: #B9FFB0;
  }
  ```
- **字体**：body:VT323, hero:VT323, tag:VT323
- **画面底板**：charge:0.42, dim:0.12, grain:5

## stomp
- **调性**：`takeover`
- **适用场景**：hooks, manifestos, ads, hype openers. The plate runs dimmed throughout — content where the words ARE the show. Body stays bg (text behind the subject is the identity).
- **视觉描述**：full-frame typographic takeover — every beat is a hard-cut center card over a dimmed plate; a long-held card creeps with tension into a true VOID, then the apex detonates in the accent color; the final word dissolves to blur.
- **色板**：
  ```css
  :root {
    --body: #F5F1E8;
    --accent: #FF5C39;
  }
  ```
- **字体**：body:Anton
- **画面底板**：punch:0.05, punchDecay:9, shakeAmpX:8, shakeAmpY:5, shakeHz:12, shakeDecay:7, shakeWindow:0.6, grain:7, minorPunch:0.02

## spectrum
- **调性**：`tech-retro`
- **适用场景**：science / signal / audio / measurement / astronomy explainers, data-nerd content, retro-lab or synth aesthetics, "示波器/波形/信号字幕" asks. The band brings its own dark glass; bright scenes fine.
- **视觉描述**：an oscilloscope is listening — a dark scope band hosts an always-alive waveform (speech grows it, silence flattens it, every word kicks a local burst) and body words are traced on in phosphor mono with a just-traced flash; the apex is the trace itself LEAPING off the scope to hand-write the hero word in a thin phosphor stroke, fill flicker, hum, then collapse to a flatline — and on the final word 
- **色板**：
  ```css
  :root {
    --body: #4dff88;
    --accent: #4dff88;
    --bright: #d6ffe4;
    --flash: #eafff2;
    --em: #ffb347;
    --hud: #2f8f55;
    --panic: #ff5f47;
  }
  ```
- **字体**：body:VT323, tag:VT323, strokeFont:HersheyScript1.svg
- **画面底板**：scrim:0.42, grain:5

## stardust
- **调性**：`poetic`
- **适用场景**：introspective, poetic, memory, science-wonder monologues. The poem column needs one clear side; a soft gradient scrim (behind the subject) handles bright skies.
- **视觉描述**：celestial condensation — letters condense out of drifting dust into an accumulating poem; the apex assembles from inbound star particles; on the final word the entire visible poem disperses back into dust (semantic exit).
- **色板**：
  ```css
  :root {
    --body: #f7f0dd;
  }
  ```
- **字体**：body:Cormorant Garamond
- **画面底板**：pushIn:0.01, grain:5

---

# 第三层：场景风格（17 种）

特定行业/形式时选。

## anchor
- **调性**：`calm`
- **适用场景**：explainers, tutorials, product walkthroughs, corporate and news-adjacent clips — anywhere every word must be read and nothing should show off. Pick it when unsure.
- **视觉描述**：the quiet professional — a verbatim rail that simply reads (2-frame fade-ups, accent emphasis), and one climax that settles into the scene behind the subject with a drawn accent underline. No spectacle: discipline IS the style. This is the conservative default that replaced Standard mode.
- **色板**：
  ```css
  :root {
    --body: #F2EFE9;
    --accent: #D9B98C;
    --em: #EFCB9A;
  }
  ```
- **字体**：body:Sora, hero:Sora, tag:Sora
- **画面底板**：dim:0.16, pushIn:0.012, grain:5

## arcade
- **调性**：`loud`
- **适用场景**：gaming, retro-tech, playful hype, launches, achievement/level-up beats, '像素/街机/8-bit/打游戏' asks — anything that should read as an arcade cabinet boss fight. Loud register; the boss dim + dark HUD bar bring their own contrast on bright skies.
- **视觉描述**：8-bit cabinet attract mode — the whole frame plays through a CRT (scanlines + vignette) above a bordered HUD bar (1UP blinking on the classic cadence, CREDIT 01) where every word coin-pops in on steps(2) with a 1-frame white blip; emphasis words run a cyan→magenta palette swap. The apex is a BOSS INTRO behind the subject: the room dims, WARNING blinks twice, ~64 seeded pixel blocks fall quantized 
- **色板**：
  ```css
  :root {
    --body: #FFFFFF;
    --accent: #00E5FF;
    --magenta: #FF2E88;
    --yellow: #FFE600;
    --credit: #7ADCFF;
  }
  ```
- **字体**：body:Press Start 2P, hero:Press Start 2P, tag:Press Start 2P
- **画面底板**：dim:0.42, punch:0.04, punchDecay:9, punchOffset:0.14, shakeAmpX:7, shakeAmpY:5, shakeHz:12, shakeDecay:7, shakeWindow:0.6, grain:6

## chalkboard
- **调性**：`scholarly-warm`
- **适用场景**：education/explainers, science and lecture content, teacher channels, documentary asides, 'professor energy' brand spots. Reads as handwriting, so it suits thoughtful pacing; the deep-green board supplies its own contrast on bright scenes.
- **视觉描述**：night lecture — the lower third is a worn deep-green chalk band where every word is SCRIBBLED in fast chalk (2-frame pop + scribble reveal + dust puff, seeded crooked), emphasis gets double underline dashes and the final word lands in yellow chalk; between sentences an ERASER SWIPE smears the old words off and leaves ghost smudges. At the apex the band grows into a full blackboard behind the subje
- **色板**：
  ```css
  :root {
    --body: #f3f6ee;
    --em: #f3d96b;
    --accent: #fbf9ef;
    --chalk: #fbf9ef;
    --dust: #f6f4e9;
    --board: #1d3328;
    --boardHi: #22392c;
    --boardLo: #182b22;
    --bandHi: #23392d;
    --bandLo: #16271f;
    --rim: #8a6a48;
    --rimLo: #5f452c;
  }
  ```
- **字体**：body:Caveat, tag:Caveat, strokeFont:HersheyScript1.svg
- **画面底板**：grain:5

## dossier
- **调性**：`archival-noir`
- **适用场景**：investigations, exposés, true-crime, document-driven storytelling, 'the record shows' narration, declassified/archival framing. Works on any luma (the manila strip is self-lit; the stamp brings its own sepia charge).
- **视觉描述**：cold-war case file — the clip is typed onto a manila transcript strip (carbon Special Elite hammered in char by char on seeded baselines, red ink circles around the evidence), and the verdict lands as a RUBBER STAMP behind the subject: the footage goes sepia-archival, the stamp crushes in at -8°, double-strike ghost, thin-ink patches, then holds DEAD STILL — sold only by a breathing paper indent —
- **色板**：
  ```css
  :root {
    --body: #2b2722;
    --accent: #b3271e;
    --paper: #d8c49a;
    --ink: #8a6f3f;
    --fleck: #8e1f17;
  }
  ```
- **字体**：body:Special Elite, hero:Special Elite, tag:Special Elite
- **画面底板**：charge:0.32, dim:0.26, punch:0.04, punchOffset:0.074, punchDecay:9, shakeAmpX:7, shakeAmpY:5, shakeHz:12, shakeDecay:7, shakeWindow:0.6, grain:6

## graffiti
- **调性**：`loud-street`
- **适用场景**：street culture, hip-hop / rap, sneaker and fashion drops, urban sports, skate/BMX, rebellious brand spots — anything that wants real handstyle energy. Loud register; the dark under-stroke armors the tag against bright skies.
- **视觉描述**：street bombing run — the lower third is a marker rail where words FLICK on crooked like fast handstyles (1-frame squeak skew, seeded rotation, back.out settle); emphasis words take alternating paint colors (yellow/magenta) with a spray-underline swoosh + overspray dots, spent lines are ROLLER-BUFFED away by a gray paint roller whose wet smear lingers, and the final word lands BIG in yellow with th
- **色板**：
  ```css
  :root {
    --body: #f7f2e7;
    --accent: #ffd23f;
    --em: #ffd23f;
    --em2: #ff2e88;
    --under: #241008;
    --nib: #fff6d9;
    --dripMid: #eab928;
    --dripLo: #d8a51d;
    --rollerHi: #8d8a86;
    --rollerLo: #6f6c69;
    --roller: #807d79;
  }
  ```
- **字体**：body:Permanent Marker, tag:Permanent Marker, strokeFont:HersheyScript1.svg
- **画面底板**：punch:0.04, punchDecay:9, punchOffset:0.63, shakeAmpX:7, shakeAmpY:5, shakeHz:12, shakeDecay:7, shakeWindow:0.6, grain:6

## hologram
- **调性**：`sleek`
- **适用场景**：tech / sci-fi / AI / product-reveal explainers, futuristic UI talk, space and imaging content — anything that should feel projected rather than printed. Sleek register. Needs a lower frame edge for the emitter dots; the apex scrim makes its own contrast on bright scenes.
- **视觉描述**：volumetric projection — every caption is LIGHT cast from an emitter. The body rail is a scanlined projection plate fed by a desk cone; words boot with a rising sweep + 1-frame interference glitch + chromatic fringe, emphasis words drop out for 2 frames and restore brighter, lines drift in rotationY and exit with the projector cut (collapse to a slit, then a dot). The apex is the full volumetric bo
- **色板**：
  ```css
  :root {
    --body: #C7F1FF;
    --accent: #7AE8FF;
    --magenta: #FF5FD6;
    --glow: #3ECCF2;
    --core: #EAFBFF;
    --em: #F4FEFF;
    --glowEm: #A0F2FF;
    --band: #D8FAFF;
    --dot: #BFF0FF;
    --dotHot: #DFF8FF;
  }
  ```
- **字体**：body:Orbitron, hero:Orbitron, tag:Orbitron
- **画面底板**：scrim:0.42, charge:0.28, dim:0.18, grain:5

## laser
- **调性**：`loud`
- **适用场景**：music, nightlife, festivals, drops, hype reveals, tech keynote 'one more thing' beats — anything that should read as a light show. Loud register; the concert blackout makes its own contrast on any plate (bright skies included).
- **视觉描述**：concert laser rig — the room goes to blackout and the light operator types the transcript. Every body word is IGNITED where two thin beams (green from the top-left, magenta from the top-right) converge on it two frames early: flare pop, snap-on in laser green, single strobe on emphasis; a sweeper beam carries each line away. The apex is the drop: a 6-beam array sweeps to one hot point, the word ig
- **色板**：
  ```css
  :root {
    --body: #58ff9d;
    --accent: #58ff9d;
    --magenta: #ff4df0;
    --core: #eefff5;
    --glowSoft: #c9ffe2;
  }
  ```
- **字体**：body:Audiowide, hero:Audiowide, tag:Audiowide
- **画面底板**：charge:0.45, dim:0.3, punch:0.04, punchDecay:9, punchOffset:0.07, shakeAmpX:5, shakeAmpY:4, shakeHz:12, shakeDecay:7, shakeWindow:0.5, grain:5

## lastpage
- **调性**：`literary-prophetic`
- **适用场景**：visionary thesis, prophecy-toned founder talks, trailers, literary content. Mid/dark scenes (the field needs air).
- **视觉描述**：the speaker reads from a manuscript that already exists — a blurred future-transcript haunts the room all video; one rack-focus reveals every faint line was the apex word. The future was only ever one sentence.
- **色板**：
  ```css
  :root {
    --body: #F0E9D8;
  }
  ```
- **字体**：body:Cormorant Garamond
- **画面底板**：pushIn:0.012, grain:6

## neonsign
- **调性**：`creator-warm`
- **适用场景**：lifestyle, night/dusk scenes, music, fashion, mood pieces. Needs a darker or dusk backdrop for the glow to read; rose accent loves cool/dusk palettes.
- **视觉描述**：sign district at dusk — body lines are warm tube light flicking on word by word and dying like power cuts; the apex is a hand-bent neon tube WRITTEN onto the scene stroke by stroke (single-line font draw-on), then it hums.
- **色板**：
  ```css
  :root {
    --body: #ffe9d6;
    --accent: #ff3fae;
    --em: #ff9ed2;
  }
  ```
- **字体**：body:Space Grotesk, strokeFont:HersheyScript1.svg
- **画面底板**：pushIn:0.012, grain:5

## ordnance
- **调性**：`loud`
- **适用场景**：punchy announcements, hype, product drops, sports, anything that should hit. Loud register. Needs a scene that tolerates a charge-dim (any luma).
- **视觉描述**：military marking system — everything has mass. Body words STAMP in and cool from hot amber to bone; the apex is a sliced stencil stamp that detonates: sheared slices snap into register, paint cools, positioning bars + designation tag deploy, the room reacts.
- **色板**：
  ```css
  :root {
    --body: #EDE6D8;
    --hot: #FFB347;
    --accent: #FFB347;
  }
  ```
- **字体**：body:Anton, hero:Anton, tag:Space Grotesk
- **画面底板**：charge:0.45, dim:0.32, punch:0.045, punchDecay:9, shakeAmpX:7, shakeAmpY:5, shakeHz:12, shakeDecay:7, shakeWindow:0.6, grain:6

## papercut
- **调性**：`playful`
- **适用场景**：craft/DIY, kids and family content, indie product demos, behind-the-scenes, maker channels — anything warm and handmade that suits a 12fps stop-motion heartbeat. Playful register; needs a lower third that tolerates a kraft-paper strip.
- **视觉描述**：stop-motion paper craft — the frame becomes an animator's table. Body words are cream paper chips PLACED one by one on a kraft strip (steps(2) drop, seeded crooked, handmade jitter weave, washi-tape slaps on emphasis, accent-red sign-off chip); the apex is a torn kraft mat slapped down behind the subject where torn-edge letter chips DROP with stepped gravity, land crooked, wobble at 8fps, then a t
- **色板**：
  ```css
  :root {
    --body: #2b241b;
    --ink: #2b241b;
    --accent: #ff4f3f;
    --accentEdge: #c93527;
    --chip: #f6edd8;
    --chipEdge: #cdb98e;
    --paper: #f8f0dd;
    --paper2: #efe3c6;
    --tag: #503d20;
  }
  ```
- **字体**：body:Inter, hero:Anton, tag:Caveat
- **画面底板**：grain:6

## popup
- **调性**：`playful`
- **适用场景**：kids and family content, storytelling, education, greeting-card and wholesome brand spots, picture-book or craft channels — anything warm, rounded and gentle that suits a paper toy theater. Playful register; needs a lower third that tolerates a cream paper strip.
- **视觉描述**：a pop-up book opens inside the frame — body words POP UP on a baseline hinge (rotationX back.out, paper overshoot) along a cream page strip that unfolds from the bottom edge (center foldline, two reading rows); emphasis words land bigger with a contact squash the page FEELS, then flick-wobble with a paper strut leaning in behind. The apex is THE CENTERFOLD: blue + cream paper starbursts unfold beh
- **色板**：
  ```css
  :root {
    --body: #33271a;
    --ink: #33271a;
    --accent: #6cb6e3;
    --accentEdge: #3f7fae;
    --blue: #2e7cb3;
    --page: #f7eed8;
    --page2: #f0e4c8;
    --page3: #e7d8b4;
    --pageEdge: rgba(122,96,54,0.55);
    --cream: #f6ecd4;
    --creamEdge: #8a6f45;
    --kraft1: #a98f5e;
    --kraft2: #cdbb92;
    --kraft3: #e6d6af;
    --strut1: #4f93c4;
    --strut2: #6cb6e3;
  }
  ```
- **字体**：body:Baloo 2, hero:Baloo 2, tag:Baloo 2
- **画面底板**：grain:5

## ransom
- **调性**：`loud-collage`
- **适用场景**：true crime, mystery / thriller content, heist energy, punk / DIY zine aesthetics, edgy product drops, unhinged-comedy hooks, "勒索信/剪贴/拼贴字幕" asks. Loud register; the solid chip backgrounds carry their own contrast on any scene.
- **视觉描述**：kidnapper's collage — every word is a cutout chip clipped from a different page (cream Anton, black Inter, newsprint typewriter, accent-yellow marker) and PASTED crooked on the rail with torn edges and misaligned baselines; emphasis words get a 1-frame re-paste lift, spent chips are RIPPED off with paper-tear flashes. The apex: the sky darkens behind a collage scrim and the hero word slams in lett
- **色板**：
  ```css
  :root {
    --body: #f5f1e4;
    --paper: #f5f1e4;
    --paperInk: #17130d;
    --dark: #141414;
    --darkInk: #f7f5ef;
    --news: #d8d3c5;
    --newsInk: #262017;
    --accent: #ffd23f;
    --accentInk: #1c160c;
    --flash: #fffdf2;
  }
  ```
- **字体**：body:Anton, hero:Anton, dark:Inter, news:Special Elite, accent:Permanent Marker
- **画面底板**：punch:0.04, punchDecay:9, punchOffset:0.64, shakeAmpX:7, shakeAmpY:5, shakeHz:12, shakeDecay:7, shakeWindow:0.6, grain:6

## scoreboard
- **调性**：`loud`
- **适用场景**：sports, transit/travel, scores, countdowns, announcements and reveals — anything that should read as DEPARTURES-board mechanical. Loud register; needs a lower third that tolerates a dark chyron bar.
- **视觉描述**：stadium split-flap departures board — every body word is a mechanical flap tile on a chyron bar that flip-cycles two seeded wrong words before clacking onto the real one (hot amber flash, cools to bone); a ROW counter flips at each line change and an odometer chip rolls beside the first emphasis line. The apex is a board takeover behind the subject: floodlights swing on, a giant departures housing
- **色板**：
  ```css
  :root {
    --body: #F5EEDD;
    --hot: #FFB347;
    --accent: #FFB347;
    --grey: #B9BEC7;
    --boardBone: #F6EFDF;
  }
  ```
- **字体**：body:Teko, hero:Anton, tag:Teko
- **画面底板**：charge:0.45, dim:0.34, punch:0.045, punchDecay:9, punchOffset:0.34, shakeAmpX:7, shakeAmpY:5, shakeHz:12, shakeDecay:7, shakeWindow:0.6, grain:6

## terminal
- **调性**：`creator-tech`
- **适用场景**：tech, data, AI, engineering, investigative explainers. Cool scenes preferred (the cyan is scene-motivated on cool/dusk palettes).
- **视觉描述**：console session — the transcript is a signal log typed into a docked glass panel; the apex decodes out of noise as slot-machine glyph reels, and the log REDACTS the apex words (█████) until the decode locks. The feed corrupts on the final word.
- **色板**：
  ```css
  :root {
    --body: #bfeefe;
    --accent: #66e0ff;
    --magenta: #ff5fd6;
    --panelBg: rgba(2,14,22,0.62);
    --prompt: #4d7f93;
  }
  ```
- **字体**：body:VT323, hero:Orbitron, tag:VT323
- **画面底板**：dim:0.22, punch:0.016, punchDecay:10, shakeAmpX:0, shakeAmpY:0, rgbashift:4, grain:6

## thunder
- **调性**：`loud`
- **适用场景**：dramatic reveals, storm/weather content, epic hype beats, trailer-toned monologues, anything that should land like a thunderclap. Loud register; the charge-dim + word scrim make their own contrast on any plate (bright skies included).
- **视觉描述**：the storm is the editor — slate storm mood on the room, ambient slanted rain in front of the subject, and the sky 'kisses' (1-frame brighten) on every body word. Body words arrive on a rain-scrimmed lower third with a lit-bright lightning pop; emphasis words get a sheet-lightning double flash mirrored by a double sky-kiss. The apex is THE STRIKE: a hand-authored branched bolt flashes two frames be
- **色板**：
  ```css
  :root {
    --body: #EEF4FB;
    --hero: #F2F7FF;
    --accent: #9FD0FF;
    --glow: #CFE8FF;
    --core: #FFFFFF;
  }
  ```
- **字体**：body:Sora, hero:Anton, tag:Sora
- **画面底板**：charge:0.3, dim:0.22, punch:0.04, punchDecay:9, punchOffset:0.02, shakeAmpX:5, shakeAmpY:4, shakeHz:12, shakeDecay:7, shakeWindow:0.5, grain:5

## transit
- **调性**：`loud`
- **适用场景**：travel/transit, announcements, schedules, countdowns, retro-terminal or arcade registers — anything that should read as an amber dot-matrix station board. Mid-loud register; needs a lower third that tolerates a dark LED strip.
- **视觉描述**：amber LED departure board — the whole video is a station PA system. Body words light column-by-column (L→R LED wipe + 1-frame arrival flicker) on a docked departure strip whose lines page in/out by scroll-snap; furniture: green platform tag, ticking seconds clock, a ⚠ DELAYED → ● ON TIME swap gag after the apex. The apex is a board takeover behind the subject: a big LED panel expands upward inside
- **色板**：
  ```css
  :root {
    --body: #FFB000;
    --hot: #FFE9B8;
    --accent: #FFB000;
    --green: #36E57A;
    --warn: #FF9E3D;
  }
  ```
- **字体**：body:VT323, hero:VT323, tag:VT323
- **画面底板**：charge:0.45, dim:0.2, grain:5

---

# 暗化叠层亮度下限（全局硬规则）

所有风格的暗化叠层——模板 `.wash` 渐变，或任何风格自带的 full-frame `scrim` / `dim` / `charge` 类全屏压暗——都必须遵守**亮度下限**：

- 全屏暗化叠层的最深不透明度**不得超过 0.35**（模板 `.wash` 默认最深 0.30，已合规；此前 0.6 偏暗，已收紧）。
- 叠加后画面**主体人物 / 图形区域亮度不低于原画面的 55%**——绝不允许把背景压到人物、图形主体看不清（即工具自述"底色压太暗、人物几乎看不清"的违规情况）。
- **背景本身偏暗时，优先「提亮背景」而非「加重压暗」**：给背景元素加 `filter: brightness(1.25) contrast(1.05)`（CSS），或在 ffmpeg 转码时加 `-vf "eq=brightness=1.25:contrast=1.05"`，而不是叠更深的暗化层来保证文字可读。
- 风格自带 `--bg` 为偏黑（如 `#16213a`）时，禁止再叠 heavy 的 `scrim` / `dim` / `charge`（值 >0.5）——这类风格应改用「底部局部压暗 + 字幕 text-shadow」保证可读性，而非全屏暴力压暗。
- 若某风格需要额外压暗以保证字幕可读，优先用**底部局部压暗 + 字幕自身 text-shadow**（模板字幕已带重阴影），而非全屏暴力压暗。
- 自检：抽帧检查每场景，人物 / 图形主体边缘清晰可辨、整体明亮可读；若主体被压成剪影或看不见、或画面明显发闷，即违规，须降低叠层不透明度或提亮背景。

---

# 使用说明

1. 风格不设默认——根据文案语义选（核心→调性→场景三级路径，见 SKILL.md 阶段 1 第 4 步）。**选定后不要复制本文件 `:root` 到 composition**（旧做法，会带回压暗类反模式）——正确做法：从 `references/style-skins/` 选一套皮肤（浅色 iwod-light / 深色 editorial-dark / 霓虹 neon / 奶油 cream），用其 `tokens.css` 替换 `:root`、`base.css` 替换 `#paper/#grain`。本文件仅作**配色与标题样式灵感**：可参考其色板搭配与 `--masthead-*` 标题参数微调，但底板绝不用其 `.bg img` 全屏压暗 / `scrim/dim/charge` 类。
2. 字体策略：中文依赖系统字体兜底（macOS=苹方 / Linux=Noto Sans CJK / Windows=微软雅黑），英文用自带 `Inter`，手写用自带 `Caveat`，草图用自带 `Virgil`；ink 风格的楷体/宋体需系统字体支持（Linux 容器需装 fonts-noto-cjk，详见 render-environment.md）
3. 动效节奏参数表的 soft/present/impact/exit 四级能量用于 GSAP 时间线编排——soft 用于平静入场，present 用于正常展示，impact 用于高潮冲击，exit 用于退场
4. 光学效果参数（depthMatch/contactShadow/warmBloom）控制元素与背景的视觉融合度——depthMatch 让元素深度匹配背景，contactShadow 给元素加接触阴影，warmBloom 给画面加暖光晕
5. 画面底板参数（scrim/pushIn/grain/dim）控制整体氛围——scrim 是画面遮罩透明度，pushIn 是画面推近距离，grain 是颗粒噪点，dim 是画面变暗程度
6. 标题样式参数（case/tracking/sizeRange/glow/breathe/entrance）用于 masthead 标题区——case 控制大小写，tracking 控制字间距，sizeRange 控制字号范围，glow 控制发光度，breathe 控制呼吸幅度，entrance 控制入场方式。这些参数已写入各风格 `:root` 的 `--masthead-*` 变量（见各风格色板块内注释），模板 masthead 读取后自动适配；未单独写参数的风格使用模板默认值，但其背景仍从 `--bg` 自动派生，深色 / 浅色风格天然分化
7. 如需混合两种风格的特征（如 editorial 布局 + neon 配色），以核心风格的结构为基础，替换色板变量