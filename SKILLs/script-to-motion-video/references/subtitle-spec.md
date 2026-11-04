# 字幕轨规范

字幕是动效视频的可读性保障。本文档规范字幕的分段、高亮、防断词、层级。

---

## 一、字幕分段跟语音节奏

字幕不是一大段一次显示，而是按语音节奏分段，每段跟一句旁白。

### 该怎么做

1. 每段字幕对应一个场景的一句旁白
2. 字幕在该句旁白开始 0.2-0.5 秒后淡入（旁白先开口，字幕跟上）
3. 字幕在该句旁白结束时刻淡出（显示窗口与该场景切割窗口一致，不提前消失）
4. 两段字幕之间不重叠（旧段淡出完成后新段才淡入）

### GSAP 时间线示例

```javascript
// 场景 1 旁白 0-6.3s，字幕 0.5s 淡入，6.3s 淡出（与旁白同窗口，不提前消失）
tl.fromTo("#sub-01", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.5);
tl.to("#sub-01", { opacity: 0, duration: 0.3 }, 6.3);

// 场景 2 旁白 6.3-12.5s，字幕 6.8s 淡入，12.5s 淡出
tl.fromTo("#sub-02", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 6.8);
tl.to("#sub-02", { opacity: 0, duration: 0.3 }, 12.5);
```

### 字幕内容来源

每段字幕的文字 = 对应场景的旁白文案。从 scene-plan.json 的 `narration` 字段取。

如果旁白太长（超过 20 字），考虑：

- 按语义断成两段字幕（如"技术好并不等于患者觉得你好" → 断成"技术好" + "并不等于患者觉得你好"）
- 两段字幕时间错开，前段淡出后段淡入

---

## 二、关键词高亮

每段字幕里的关键词用高亮色突出，帮助观众抓重点。

### 该怎么做

```html
<div class="subtitle" id="sub-01">
  技术好 <span class="kw">并不等于</span> 患者觉得你好
</div>
```

```css
.subtitle .kw {
  color: var(--warm-bright);  /* 高亮色，用风格的 accent 色 */
}
```

### 关键词选择

从 scene-plan.json 的 `keywords` 字段取。关键词通常是：

- 核心概念词（如"认知差""内外功""信任"）
- 转折词（如"并不等于""但是""然而"）
- 数据词（如"95%""12%"）
- 情绪词（如"焦虑""安心"）

每段字幕选 0-2 个关键词高亮，不要太多（超过 3 个高亮会失去重点）。

---

## 三、防断词（white-space:nowrap）

字幕用 `white-space:nowrap` 强制一行显示，避免长字幕被拆成两行断词错位。

### 该怎么做

```css
.subtitle {
  white-space: nowrap;  /* 强制一行显示 */
  font-size: 48px;
  /* ... */
}
```

### 为什么需要 nowrap

不加 nowrap 时，长字幕（如"很清楚自己的专业功底有多扎实"15 字）会被容器宽度限制，自动折行。折行位置可能在词中间（如"专业功" + "底"），导致断词错位。

加 nowrap 后，字幕强制一行显示，完整不拆词。

### 容器宽度配合

为了容纳一行长字幕，字幕容器要足够宽：

```css
#subtitle-track {
  left: 8%; right: 8%;  /* 容器宽 84% × 1080 = 907px */
  bottom: 170px;
  height: 170px;
}
```

容器宽 84%（907px），字号 48px，一行可容纳约 18-20 个中文字。如果字幕超过 20 字，考虑分段（见上文）。

### 字号选择

| 字号       | 一行容量（907px 容器） | 适合              |
| -------- | -------------- | --------------- |
| 52px     | ~16 字          | 字幕短的场景（钩子/CTA）  |
| **48px** | ~18 字          | **默认，覆盖大多数字幕**  |
| 44px     | ~20 字          | 字幕长的场景（讲解/诊断）   |
| 40px     | ~22 字          | 极长字幕（不推荐，可读性下降） |

默认用 48px。如果某段字幕超过 18 字，单独调该段字号到 44px，或分段。

---

## 四、DOM 层级最顶层

字幕 rail 是 DOM 中最后的元素 + `z-index:50` 最顶层，确保任何全屏卡都不会盖住字幕。

### 该怎么做

```html
<div id="composition">
  

  
  <div id="subtitle-track">
    <div class="subtitle" id="sub-01">...</div>
    <div class="subtitle" id="sub-02">...</div>
  </div>

  
  <audio id="seg01" src="audio/seg01.mp3"></audio>
</div>
```

```css
#subtitle-track {
  z-index: 50;  /* 最顶层 */
}
```

### 为什么 DOM 顺序很重要

渲染器（render.js）按 DOM 顺序合成截图。如果字幕 rail 在 DOM 中不是最后元素，后面元素（如全屏总结卡）会盖住字幕。

`z-index` 在浏览器实时预览时有效，但渲染器逐帧截图时可能按 DOM 顺序合成。所以双重保障：`z-index:50` + DOM 最后元素。

---

## 五、逐句对照校对

字幕文字必须跟旁白语音完全一致，不能漏字、多字、错字。

### 该怎么做

1. 从 scene-plan.json 取每段 `narration` 文字
2. 生成 TTS 语音后，用 ASR（如 Whisper）转录生成的语音
3. 把 ASR 转录结果跟原文逐字对比
4. 如果不一致（TTS 漏字/多字），修正字幕文字跟实际语音一致

### 校对脚本

```python
#!/usr/bin/env python3
"""
check_subtitles.py — 字幕逐句对照校对
用 Whisper 转录生成的语音，跟原文对比
"""
import json, os, sys

# 用 whisper 转录每段语音
# pip install openai-whisper
import whisper
model = whisper.load_model("base")

plan = json.load(open('scene-plan.json'))
for i, scene in enumerate(plan['scenes'], 1):
    audio_path = f'audio/seg{i:02d}.mp3'
    result = model.transcribe(audio_path, language='zh')
    actual = result['text'].strip()
    expected = scene['narration'].strip()

    if actual == expected:
        print(f'seg{i:02d}: ✓ 一致')
    else:
        print(f'seg{i:02d}: ✗ 不一致')
        print(f'  原文: {expected}')
        print(f'  实际: {actual}')
        # 建议用实际文字更新字幕
```

---

## 六、完整字幕轨模板

```html

<div id="subtitle-track">
  <div class="subtitle" id="sub-01">技术好 <span class="kw">并不等于</span> 患者觉得你好</div>
  <div class="subtitle" id="sub-02">医生很清楚自己的<span class="kw">专业功底</span>有多扎实</div>
  <div class="subtitle" id="sub-03">但患者看到的只有<span class="kw">沟通</span></div>
  
</div>
```

```css
#subtitle-track {
  position: absolute; left: 8%; right: 8%; bottom: 170px;
  height: 170px; z-index: 50;
}
.subtitle {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  text-align: center;
  font-size: 48px; line-height: 1.4; font-weight: 700; color: #ffffff;
  letter-spacing: 0.02em;
  text-shadow: 0 2px 10px rgba(0,0,0,0.92), 0 0 6px rgba(0,0,0,0.75);
  padding: 0 4%; box-sizing: border-box; opacity: 0;
  white-space: nowrap;
}
.subtitle .kw { color: var(--warm-bright); }
```
