---
name: 文案生成动效视频
description: >
  文案生成动效视频（script-to-motion-video）—— 收到一段视频文案（纯文字），自动生成带旁白配音 + 动效元素 + 逐句字幕 + 背景素材的完整动效视频。流程：文案分析切分场景 → 火山豆包大模型 2.0 一次性生成高品质配音 → fetch-assets.js 快速准备背景素材 → 构建 HTML composition → GSAP 编排节奏动效 → 极速渲染与自动紧凑化输出 mp4。内置 37 种视觉风格、100+ GSAP 动效模式、8 条布局防碰撞规则。自带 render.js 极速渲染器，开箱即用。
version: 1.0.0
---

# 文案生成动效视频（script-to-motion-video）— 纯文案 → 动效视频 Skill

## 这个技能做什么

收到一段视频文案（纯文字），输出一个完整的动效视频 mp4：火山豆包大模型 2.0 旁白配音（超自然情感声线）+ 与旁白节奏同步的动效信息元素 + 逐句字幕（关键词高亮）+ 背景素材 + 开场标题。

核心价值：把"一段纯文字文案"变成"讲到哪出现对应动效元素、有视觉辅助、有配音字幕的高品质动效视频"。每句文案变成一个场景，场景里的视觉元素跟旁白节奏逐个入场，构图服务文案概念。

> [!CAUTION]
> **【核心铁律·严禁调用通用 AI 视频生成工具】**
> 本技能是纯前端工程化渲染管线（HTML+CSS+GSAP+TTS+render.js 本地渲染）。
> **严禁调用 `heyclaw_video_generate` 生成整段 AI 视频！** 无论文案长短，均**必须严格执行**本技能包含的“文案场景切分 → `heyclaw_audio_tts` 语音合成 → 搭建 HTML composition → GSAP 动效编排 → `render.js` 渲染”全流程，绝不允许用通用文生视频模型偷懒替代。

> [!IMPORTANT]
> **【性能与稳定性红线·防 Context 爆炸与防网络挂起】**
> 1. **TTS 一次性整段合成**：必须将全文文案**一次性调用 `heyclaw_audio_tts`** 导出完整的 `narration.mp3`。严禁按句子拆分成多个片段循环调用（避免某一句失败导致整个任务卡死中断）。
> 2. **严禁在制作中途调用 `view_image` 频繁审图**：素材视频/图片的分辨率与时长，统一使用 `ffprobe` 纯文本命令检查，**严禁将每一帧画面灌入 Context**！
> 3. **素材准备标准化**：优先调用本技能内置的 `node fetch-assets.js --query "<关键词>" --out assets/<文件名>`，禁止在终端手写复杂爬虫或进行容易超时的网页抓取。
> 4. **成片仅看 1 次九宫格验收**：`render.js` 在渲染成片后会自动输出全片核心帧拼合的 `output_grid.jpg`。**只需调用 1 次 `view_image` 查看这一张图**，即可一次性验收全片 4 层景深、UI 卡片与排版防碰撞。

---

## 输入输出

- **输入**：一段视频文案（纯文字，每句一行或一段）+ 可选参数：
  - 视频比例（默认 9:16 竖屏 1080×1920；可选 16:9 横屏 1920×1080）
  - 风格（根据文案语义选择，见 `references/style-skins/`）
  - 声线（默认知性女声 `zh_female_vv_uranus_bigtts`，可选火山引擎 2.0 音色库）
- **输出**：动效视频 mp4（1080×1920 30fps 或 1920×1080 30fps）
- **依赖**：环境自动就绪，开箱即用。
  - **语音生成 (TTS)**：内置宿主工具 `heyclaw_audio_tts`（基于火山引擎豆包语音合成 2.0），秒级生成高保真音频与字级别时间戳。
  - **素材准备**：内置 `fetch-assets.js`，秒级下载/生成适配分辨率的动态背景素材。
  - **渲染器 (`render.js`)**：自带系统 Chrome/Edge 浏览器智能嗅探与 FFmpeg 检测，支持一键渲染与紧凑化。

---

## 六阶段极简工作流

### 阶段 0 · 环境自动就绪（加速直通）
环境内置就绪，直接进入阶段 1。

### 阶段 1 · 文案分析与场景规划
1. 每一分钟按语义把文案切分为 6-8 个场景，归组：钩子 / 步骤 / 价值段 / CTA。
2. 选定视觉风格皮肤（从 `references/style-skins/` 挑浅色/深色/霓虹/奶油之一，默认推荐浅色纸底 `iwod-light`）。
3. 产出 `scene-plan.json`：场景列表 + 每场景规划重点信息与 UI 呈现元素。

### 阶段 2 · 语音与素材生成
1. **TTS 一次性整段生成**：
   - 调用内置 `heyclaw_audio_tts` 工具一次性生成完整语音：
     ```json
     {
       "text": "你的完整旁白文案全文...",
       "outputPath": "narration.mp3",
       "speedRatio": 1.05,
       "enableSubtitle": true
     }
     ```
   - 获取音频真实时长，作为场景切分与动画时间轴的绝对基准。
2. **背景素材快速准备**：
   - 为每个场景使用内置脚本准备素材（放置于 `assets/`）：
     ```bash
     node fetch-assets.js --query "nature lake" --out assets/scene01.mp4 --width 1080 --height 1920
     ```
   - 纯文本验证：`ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration -of csv=p=0 assets/scene01.mp4`

### 阶段 3 · 搭建 HTML Composition
基于 `references/composition-template.html` 骨架：
1. 复制模板并替换 `:root` 设计系统变量（调色板/字号/圆角/阴影）。
2. 保持**至少 4 层景深**：L0 底板纸底 + L1 纹理颗粒 + L2 实拍窗/UI 卡片 + L3 前景标签印章 + 顶部字幕条。
3. **每个场景至少包含 1 个具象 UI mockup**（手机界面/数据面板/流程图/文档卡），用纯 HTML+CSS 搭建，禁止纯 PPT 文字块。
4. 写 `project.json`：`{"project":"<name>","composition":"index.html","duration":<音频总时长>,"width":1080,"height":1920,"fps":30}`。

### 阶段 4 · GSAP 动效与音画对齐
1. 元素跟随旁白节奏逐个入场，使用 `gsap.fromTo()`（配合 `back.out` 或 `power3.out`）。
2. 入场完成后启动微幅持续动效（上下浮动 ±4px 或呼吸缩放 1.0-1.04，防死板）。
3. 字幕分段跟语音节奏，关键词加金色/品牌色高亮。

### 阶段 5 · 极速渲染与成片验收
1. 执行一键渲染与紧凑化（自动剔除场景间多余静默停顿）：
   ```bash
   node render.js <composition目录> -o output.mp4 --fps 30 --tighten
   ```
2. **单次终审**：渲染完成后，系统自动在输出目录生成 `output_grid.jpg`（全片九宫格预览图）。
   - 调用 1 次 `view_image` 查看 `output_grid.jpg`；
   - 对照 `references/quality-gate.md` 一次性完成 G1~G8 质量门禁自检。全绿即可交付最终 mp4！

---

## 选风格路径

```
看文案类型
  ├─ 痛点诊断 / 专业讲解 / 信任建立 → editorial（编辑风）
  ├─ 钩子 / 强观点 / 反差对比 → bold（醒目风）
  ├─ 产品介绍 / 教程 / 流程说明 → neutral（中性风）
  ├─ 案例 / 真实故事 / 患者见证 → documentary（纪实风）
  ├─ 演讲 / 汇报 / 总结陈词 → keynote（演讲风）
  ├─ 科技 / 数字化 / 未来感 → neon（霓虹风）
  ├─ 文化 / 品牌 / 情感叙事 → ink（水墨风）
  └─ 温和 / 健康教育 / 生活日常 → cream（奶油风）
```

---

## 技术栈一览

| 组件          | 技术                                            | 说明                         |
| ----------- | --------------------------------------------- | -------------------------- |
| 旁白配音        | 火山豆包大模型 2.0（`heyclaw_audio_tts`）          | 超自然情感声线，一次性整段秒级合成，带字级时间码 |
| 背景素材        | `fetch-assets.js`                             | 自动化检索与 1080x1920 高保真转码    |
| composition | HTML + CSS + GSAP                             | 单个 index.html 文件，4 层景深骨架   |
| 动效引擎        | GSAP 3.x（本地 vendor/gsap.min.js）               | 100+ 动效模式，带微浮动防僵死          |
| 渲染器         | render.js（puppeteer + ffmpeg）                 | 逐帧渲染 + 一键紧凑化 + 自动生成九宫格图     |
| 质检验收        | `output_grid.jpg` + 单次 `view_image`          | 1 次看图全片验收，零 Token 膨胀       |
