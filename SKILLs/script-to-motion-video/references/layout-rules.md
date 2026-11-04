# 布局规则（均匀分布 + 防碰撞 + 安全区）

布局是动效视频最容易出问题的环节。本文档把所有布局规则写成「该怎么做」的正面表述，AI 构建每场景时逐条遵守。

核心原则：**元素不应扎堆在画面某个区域，应从 kicker 到字幕均匀分布，相邻元素间距不超过 350px，所有元素 bbox 不相交，不侵入安全区。**

**例外：前景叠层允许有意重叠**（见 `visual-quality-baseline.md` 第八节）——印章压在卡片边缘上、手机卡部分覆盖 b-roll 窗口、胶囊标签叠在卡片右上角等，属于刻意创造层次感的重叠，不算违规。bbox 碰撞扫描时，跨层级的重叠（L4 前景压 L3 内容卡、L3 内容卡压 L2 实拍窗）可豁免。

---

## 一、均匀分布原则（最重要）

### 该怎么做

每个场景的元素从顶部 kicker 到底部字幕，垂直方向均匀分布：

1. 画布 1080×1920，可用区域约 top:210 ~ bottom:340（即 210~1580px，约 1370px 高度）
2. 每场景通常 10-14 个元素（图形 + 文字合计），均匀分布在这 1370px 内；其中**非文字图形须 5–6、文字元素须 5–8，两类都不可为 0**（见 scene-design.md）
3. 相邻元素（垂直方向最近的两个）间距 ≤350px
4. 超过 350px 的空白用光晕（glow-orb）填充，或调整元素位置填补

### 均匀分布检查方法

渲染前列出每场景所有 absolute 元素的 top 值，按从小到大排序，检查相邻差值：

```
场景 S4 元素 top 值排序：
  kicker    210
  chip-l    265    (+55)  ✓
  chip-r    265    (同行)
  title     420    (+155) ✓
  stage     580    (+160) ✓
  sil-l     920    (+340) ✓
  sil-r     920    (同行)
  quote     1360   (+440) ✗ 超过 350px → 加 glow-orb 在 1150 填充
```

### 常见问题

| 问题   | 表现                   | 修复                                              |
| ---- | -------------------- | ----------------------------------------------- |
| 上紧下空 | 元素扎堆在 210-760，下半部分空旷 | 把底部元素上移填补中间空白，或把上半元素间距拉开                        |
| 三集中带 | 元素只在顶部、中部、底部三个集中带    | 把集中带的元素打散到中间空白区                                 |
| 元素过少 | 每场景 <10 个元素，或图形 <5 个，或文字元素 <5  | 补充语义元素到 10-14 个（图形 5–6 + 文字 5–8）：SVG 图示 / 图标 / 引言块 / 人形剪影 / kicker / 数据chip / 标签说明，图形与文字都不可缺 |

---

## 二、bbox 碰撞扫描（R1-R8）

每场景所有 absolute 定位的元素，bounding box（矩形包围盒）两两不相交。渲染前跑一遍扫描。

### R1 — 顶部安全带

内容元素的 `top` ≥ kicker.bottom + 20px（最小）/ +30px（推荐）。

- `kicker.bottom = kicker.top + kicker.height`（kicker 字号 28px → 高度约 34px；masthead 高度 380px）
- 任何其他元素 `top ≥ kicker.bottom + 20`
- 例：kicker 在 top:210（高度 34px）→ kicker.bottom = 244 → 其他元素 top ≥ 264

### R2 — bbox 不相交

任意两个同屏元素的矩形包围盒（x1, y1, x2, y2）不得相交。

- 每个元素计算 bbox：`x1=left, y1=top, x2=left+width, y2=top+height`
- 两两检查：`a.x2 > b.x1 && a.x1 < b.x2 && a.y2 > b.y1 && a.y1 < b.y2` 为相交
- 相交则调整其中一个的位置

### R3 — nowrap 长文本独占行

`white-space:nowrap` + 居中的长文本（如引言块），其 ±120px 垂直带内不得有同 x 范围的其他元素。

- 引言块文字长（如"感知不到 = 等于没有"），水平占据宽度大
- 在引言块的 top ± 120px 范围内，不要放跟引言块 x 范围重叠的元素
- 修复：把引言块移到不跟其他元素争空间的位置（如圆环图下方）

### R4 — 对称内收 ≥14%

左右对称布局的 `left/right` 百分比 ≥14%，不贴边。

```css
/* ✓ 正确：内收 14% */
.dchip { left: 14%; }  /* 或 right: 14% */

/* ✗ 过宽贴边 */
.dchip { left: 8%; }
```

- 画布宽 1080px，14% = 151px，元素左边距至少 151px
- 贴边 8% = 86px，元素会过于靠近画面边缘，视觉上"拉得过宽"

### R5 — 装饰避让内容

纯装饰元素（齿轮、光晕、碎片）的 bbox 不与内容元素相交。

- 装饰元素 opacity 低（0.3-0.6），但 bbox 仍不能压在内容元素上
- 低 opacity 装饰只能叠在背景层（bg/wash 之上，内容层之下）
- 如果装饰跟内容重叠，删除装饰或移到不重叠的位置

### R6 — 中心图与列表互让

居中大图（≥380px 宽高）与左右两侧的列表元素保持 ≥40px 水平间距。

- 居中圆图 380×380（中心在 540），左右边缘在 350/730
- 左侧列表 left:3% = 32px，列表宽约 200px → 右边缘 232 → 跟圆图左边缘 350 间距 118px ✓
- 如果间距 <40px：缩小居中大图（如 480→380）或外移列表（如 8%→3%）

### R7 — 字幕 340 区

任何元素不侵入 `bottom: 0~340px` 字幕带。

- 字幕轨在 `bottom:170px, height:170px`，占 170~340px
- 元素的 `bottom` 值 + 元素高度 不得 <340px（即元素底边不得高于 340px 线）
- 或用 top 表示：元素的 `top + height` 不得 > 1580px（1920-340）

### R8 — 渲染前必扫

渲染前列出每场景所有 absolute 元素 bbox 表，跑两两相交检查，抽「最多元素可见时刻」的帧验证。

扫描表格格式：

```
场景 S4 碰撞扫描
| 元素 ID    | x1  | y1  | x2  | y2  | R1  | R4  | R7  |
|------------|-----|-----|-----|-----|-----|-----|-----|
| kicker     | 0   | 210 | 1080| 244 | -   | -   | ✓   |
| s4-c1      | 151 | 265 | 431 | 365 | ✓21 | ✓14%| ✓   |
| s4-c2      | 649 | 265 | 929 | 365 | ✓21 | ✓14%| ✓   |
| s4-title   | 0   | 420 | 1080| 570 | ✓176| -   | ✓   |
| ...        |     |     |     |     |     |     |     |
```

抽帧验证时间点选在每个场景「最多元素可见时刻」（通常是场景中段，所有入场动画完成后）。

---

## 三、flex 排列相邻元素

相邻元素（如 chip + 箭头 + chip）放 flex 容器排列，不各自 absolute 定位。

### 该怎么做

```html

<div style="position:absolute; top:270px; left:0; right:0;
            display:flex; justify-content:center; align-items:center; gap:20px;">
  <div class="dchip teal">专业术语</div>
  <div class="arrow">→</div>
  <div class="dchip warm">听得懂</div>
</div>


<div class="dchip" style="position:absolute; top:270px; left:14%;">专业术语</div>
<div class="arrow" style="position:absolute; top:280px; left:50%;">→</div>
<div class="dchip" style="position:absolute; top:270px; right:14%;">听得懂</div>
```

flex 容器的优点：

- 元素自动均匀分布，不会重叠
- 箭头自动在两个 chip 正中间
- 响应式：chip 宽度变化时箭头自动调整位置

### 需要用 flex 的场景

- chip + 箭头 + chip（对比/转化）
- 多个并列数据 chip（统计行）
- 图标 + 文字 + 图标（流程行）
- 任何 2-4 个相邻元素的水平排列

---

## 四、CSS 居中方法

absolute 定位的元素需要水平居中时，用 margin auto 方法，不用 translateX(-50%)（会被 GSAP transform 覆盖）。

```css
/* ✓ 正确：margin auto 居中 */
.quote-block {
  position: absolute;
  top: 1100px;
  left: 0; right: 0;
  margin-left: auto; margin-right: auto;
  width: fit-content;
}

/* ✗ translateX(-50%) 会被 GSAP 覆盖 */
.quote-block {
  position: absolute;
  top: 1100px;
  left: 50%;
  transform: translateX(-50%);  /* GSAP 的 x/scale 会覆盖这个 */
}
```

GSAP 操作 transform 属性（x, y, scale, rotation）时，会覆盖 CSS 的 `transform`。如果 CSS 用 `translateX(-50%)` 居中，GSAP 一动元素就跑到错误位置。用 `left:0; right:0; margin:auto` 居中则不受影响。

---

## 五、光晕用 box-shadow 实现

光晕（glow-orb）用 `box-shadow` 实现，不用 `radial-gradient` / `filter:blur` / `backdrop-filter`。

```css
/* ✓ 正确：box-shadow 光晕 */
.glow-orb {
  position: absolute;
  border-radius: 50%;
  background: transparent;
  box-shadow: 0 0 60px 30px rgba(79,209,197,0.25);
  pointer-events: none;
}

/* ✗ radial-gradient 会触发 heavy overlay 检测（≥40 黑屏） */
.glow-orb {
  background: radial-gradient(circle, rgba(79,209,197,0.4) 0%, transparent 70%);
}

/* ✗ filter:blur 和 backdrop-filter 也会触发检测 */
.glow-orb {
  filter: blur(20px);
}
```

渲染器（render.js）会检测 overlay 层的"重量"。`radial-gradient` / `blur` / `backdrop-filter` 被判定为 heavy overlay，叠加层数 ≥40 时首帧黑屏。`box-shadow` 不被判定为 overlay，安全使用。
