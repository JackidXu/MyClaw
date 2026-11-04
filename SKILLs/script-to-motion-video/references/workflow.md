# 六阶段工作流详解

本文档展开 SKILL.md 里六阶段工作流的具体操作步骤。每阶段记录输入、操作、产出。

---

## 阶段 0 · 环境准备

**目标**：渲染环境跑通，再开始创作。

### 操作步骤

1. **确认 node**：`node -v`（≥16）。安装：`brew install node`（macOS）/ `apt install nodejs`（Ubuntu）/ 官网下载（Windows）
2. **确认 ffmpeg**：`ffmpeg -version`。安装：`brew install ffmpeg` / `sudo apt install -y ffmpeg` / `choco install ffmpeg`
3. **安装 Kokoro TTS**：`pip install kokoro misaki[zh] soundfile`（首次运行下载模型约 330MB）
4. **测试渲染器**：`node render.js <composition目录> -o test.mp4 --fps 30`（首次运行 puppeteer 自动下载 Chromium）
5. **环境变量**（见 `render-environment.md`）：如需指定 Chrome 路径，设 `PUPPETEER_EXECUTABLE_PATH`

### 产出

环境就绪，可以开始创作。

---

## 阶段 1 · 文案分析与场景规划

**目标**：把一段文案切分为场景，规划每个场景的视觉元素。

**输入**：一段视频文案（纯文字）

### 操作步骤

1. **估算时长**：用「字数 + 标点停顿」估算（speed=1.08 时约 4.3 字/秒，句末强停顿每处 +0.35s、句中弱停顿每处 +0.12s；详见 `references/tts-guide.md` 七）。一句 20 字约 5.3 秒
2. **按语义切分场景**：每一分钟按语义把文案切分为6-8个场景（平均 7.5-10 秒/场景），不足 1 分钟按 `场景数 ≈ 时长秒 ÷ 9` 比例缩减（下限 3 个），把文案句归组：钩子 / 第一步 / 第二步 / … / 价值段 / CTA，得到每段场景语音时长
3. **提取关键词**：每段提取 1-3 个关键词（用于字幕高亮 + 素材搜索）
4. **选风格皮肤**：看文案类型 → 从 `references/style-skins/` 选浅色(iwod-light)/深色(editorial-dark)/霓虹(neon)/奶油(cream) 之一（见其 README 的适用对照）。皮肤只换 `:root` 配色与底板光学，结构丰富度不变。`style-variants.md` 的 37 种风格仅作配色灵感参考，**严禁**用其 `.bg img` 全屏压暗 / `scrim/dim/charge` 类当 composition 底板（那是旧模版反模式，见 `quality-gate.md` 第三节）
5. **规划视觉元素**：为每个场景列出需要的视觉元素清单（见 `references/scene-design.md` 的映射方法）

### 产出

`scene-plan.json`：

```json
{
  "project": "<项目名>",
  "style": "editorial",
  "voice": "zf_xiaoxiao",
  "speed": 1.08,
  "ratio": "9:16",
  "total_duration": 46.8,
  "scenes": [
    {
      "id": "s1",
      "title": "开场钩子",
      "narration": "你有没有发现，很多医生都会踩同一个误区——技术好并不等于患者觉得你好。",
      "keywords": ["误区", "技术好", "患者觉得你好"],
      "duration": 8.0,
      "elements": ["kicker", "masthead标题", "背景视频"],
      "asset_query": "medical doctor"
    }
  ]
}
```

---

## 阶段 2 · 素材准备

**目标**：三件事并行——TTS 语音 + 背景素材 + 语义元素。

**输入**：`scene-plan.json`

### 操作步骤

1. **TTS 语音**（见 `references/tts-guide.md`）：
   - 用 Kokoro 把**整段文案一次性生成一条连续音频**，再按估算场景边界切割成各段
   - 默认声线 `zf_xiaoxiao`，**固定语速 `speed=1.08`**
   - 4 次重试；只剥整条录音首尾引擎静音（不逐段剥，保留内部气口）
   - 产出 `audio/segXX.mp3`（相邻切片，拼回去即原音频）
   - 运行：`python3 gen_tts.py scene-plan.json audio/`
2. **背景素材**（见 `references/background-assets.md`）：
   - 按每个场景的 `asset_query` 搜素材
   - 优先搜视频（Pexels/Pixabay），有则下载 + ffmpeg 压缩到 1080×1920 30fps
   - 无合适视频退回搜图片（Unsplash/Pexels）
   - 产出 `public/vid/sN-bg.mp4` 或 `public/img/sN-bg.jpg`
3. **语义元素**（见 `references/scene-design.md`）：
   - 按每个场景的 `elements` 清单准备 HTML 元素
   - 数据 chip、引言块、图标 SVG、人形剪影等
   - 这些元素直接在阶段 3 写入 composition

### 产出

- `audio/seg01.mp3` ~ `audio/segNN.mp3`（旁白语音）
- `public/vid/sN-bg.mp4`（视频背景）或 `public/img/sN-bg.jpg`（图片背景）
- 语义元素清单（写在 scene-plan.json 的 elements 字段）

---

## 阶段 3 · composition 构建

**目标**：用模板搭 HTML 骨架，填入每场景内容。

**输入**：`scene-plan.json` + 音频 + 背景素材

### 操作步骤

1. **复制模板**：从 `references/composition-template.html` 复制为项目的 `index.html`、从 `references/composition-template.css` 复制为 `styles.css`（结构骨架 + 浅色起手配色）
2. **填入皮肤（换皮不降质）**：从 `references/style-skins/` 选目标皮肤，把其 `tokens.css` 整体替换 `styles.css` 的 `:root` 块、`base.css` 替换 `#paper/#grain`（neon 还需把 `.card`/`.kicker i` 辉光覆盖一并加入）。组件类（`.vframe/.card/.kicker/.h1`）不动——它们都引用 `:root` token，换 token 即换皮。禁止使用 `style-variants.md` 的 `.bg img` 全屏压暗 / `scrim/dim/charge` 类当底板（旧模版反模式，见 `quality-gate.md`）。masthead 开场标题随 `:root` token 自动适配
3. **填入场景**：每个场景填入：
   - 背景（`<video>` 圆角窗口 或 已标 `bg_type:image` 的实拍图；**绝不用 `.bg img` 全屏压暗类**）
   - 视觉元素（按 scene-plan.json 的 elements 清单）
   - kicker（场景提示文字）
4. **填入字幕**（见 `references/subtitle-spec.md`）：
   - 每段字幕对应一个场景的旁白
   - 关键词用 `<span class="kw">` 高亮
   - 字幕 rail 放 DOM 最后元素 + z-index:50
5. **填入 masthead 标题**：
   - 从文案提炼主标题 + 副标题
   - masthead 前 6 秒展示后淡出（强制 6 秒窗口，退场节奏不受风格影响）
   - 外观由阶段 1 选的皮肤决定（浅色 iwod-light / 深色 editorial-dark / 霓虹 neon / 奶油 cream），masthead 随 `:root` token 自动适配。如需微调标题字形，可参考 `style-variants.md` 的「标题样式」作灵感，但底板仍用皮肤包的干净渐变
6. **填入音频**：`<audio id="segXX" src="audio/segXX.mp3" preload="auto"></audio>`（必须加 id）
7. **写 project.json**：`{"project":"<name>","composition":"index.html","duration":<总时长>,"width":1080,"height":1920,"fps":30}`
8. **duration 三处同步**：`data-duration` 属性 + JS `var DUR` + `project.json` 的 `duration` 字段必须一致

### 产出

- `index.html`（完整 composition）
- `project.json`

---

## 阶段 4 · 动效编排

**目标**：用 GSAP 时间线编排所有动效。核心原则：元素跟旁白节奏逐个入场。

**输入**：`index.html`（静态结构）+ `scene-plan.json`（各段时长）

### 操作步骤

1. **选动效模式**（见 `references/motion-patterns.md`）：
   - 看场景需要什么效果 → 先查基础原语 → 不能满足查完整蓝图 → 场景过渡查转场库
   - 每个元素选一个入场原语（slide/scale/fade/bounce 等）
2. **编排入场时间线**：
   - 每个元素的入场时间对齐旁白说到该元素的节奏点
   - 全部用 `gsap.fromTo()` 明确起止值
   - 入场完成后才启动循环动画（repeat:-1, yoyo:true, 幅度 scale 1.08-1.1）
3. **场景过渡**：
   - 旧场景在旁白结束时刻开始退场（不提前、不抢拍）
   - 新场景在切割边界（旧场景结束时刻）同时接入，交叉溶解
   - 默认用 css-dissolve（交叉淡入淡出）
   - 最后场景不退场
4. **视频背景控制**：
   - 用 GSAP `call()` 在场景开始时 `currentTime=0 + play()`
   - Ken Burns 幅度：视频 scale 1.0→1.2，图片 scale 1.0→1.4~1.5
5. **字幕时间线**：
   - 每段字幕在该句旁白开始 0.2-0.5 秒后淡入
   - 在旁白结束时刻淡出（显示窗口 = 该场景切割窗口，不提前消失）
   - 两段字幕不重叠
6. **旁白播放**：
   - 用 GSAP `call()` 在场景开始时播放对应音频
   - `audio.currentTime=0; audio.play()`

### 产出

`index.html`（含完整 GSAP JS）

---

## 阶段 5 · 布局校验与渲染

**目标**：渲染前先跑布局检查，抽帧验证，再渲染输出。

**输入**：`index.html`（完整 composition）

### 操作步骤

1. **布局规则检查**（见 `references/layout-rules.md`）：
   - 列出每场景所有 absolute 元素 bbox 表
   - 检查均匀分布：相邻元素间距 ≤350px
   - 检查 bbox 不相交：R1-R8 规则逐条检查
   - 检查安全区：顶部 ≥kicker.bottom+20px / 底部 340px 字幕区 / 对称内收 ≥14%
2. **跑出片前质量门禁（强制，见 `references/quality-gate.md`）**：逐场景过 G1–G8 结构丰富度 + G9 紧凑化 + G10 时长同步 + G11/G12 密度，并扫反模式黑名单。任何一项红 → 禁止渲染，回去补满。本门禁与风格无关，任何 `style-skins/` 皮肤都必须全绿
3. **抽帧验证**：
   - 用渲染器抽 3-5 个关键时间点的帧（每场景元素最多可见时刻）
   - 人工或 AI 检查布局：元素有无重叠？有无超出安全区？分布是否均匀？
   - 命令：`node render.js <目录> --snapshot --at 5,15,25,35 --output /tmp/snaps`
4. **跑自检清单**（见 `references/checklist.md`）：
   - 18 项逐条检查
   - 不通过的项修复后重新检查
5. **渲染输出**：
   - `node render.js <composition目录> -o output.mp4 --fps 30`
6. **后处理**（可选）：
   - 检查渲染日志有无警告
   - 清理 lock 文件：`rm -f .render.lock`

### 产出

`output.mp4`（最终视频）

---

## 项目目录结构

完成后的项目目录：

```
<project-name>/
├── index.html              # composition（HTML + CSS + GSAP）
├── project.json            # 项目配置
├── scene-plan.json         # 场景规划（阶段 1 产出）
├── audio/
│   ├── seg01.mp3           # 各段旁白
│   ├── seg02.mp3
│   └── ...
├── public/
│   ├── vid/
│   │   ├── s1-bg.mp4       # 视频背景
│   │   └── ...
│   └── img/
│       ├── s2-bg.jpg       # 图片背景
│       └── ...
├── assets/
│   └── vendor/
│       └── gsap.min.js     # GSAP 库（从技能复制）
└── renders/
    └── output.mp4          # 最终视频
```
