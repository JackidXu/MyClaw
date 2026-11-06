# GSAP 动效模式库

本技能内置 100+ 个 GSAP 动效模式，按四层组织。AI 选模式的路径：看场景需要什么效果 → 先查基础原语能否满足 → 不能满足查完整蓝图 → 场景过渡查转场库 → 特定效果查动效规则。

加上本文档末尾的 8 条节奏入场规则（从实战踩坑总结），总共 100+ 模式 + 8 条规则。

---

## 一、基础原语（22 个）

最常用的构建块。AI 直接复制改参数即用。

### 入场（10 个）

| 原语 | GSAP recipe | 适合 |
|---|---|---|
| `slide_bottom` | `fromTo(el, {y:150, opacity:0}, {y:0, opacity:1, ease:"power4.out"})` | 平静、建立、专业 |
| `slide_top` | `fromTo(el, {y:-150, opacity:0}, {y:0, opacity:1, ease:"power4.out"}) | 平静、建立 |
| `slide_left` | `fromTo(el, {x:-200, opacity:0}, {x:0, opacity:1, ease:"power4.out"})` | 平静、建立 |
| `slide_right` | `fromTo(el, {x:200, opacity:0}, {x:0, opacity:1, ease:"power4.out"})` | 平静、建立 |
| `scale_grow` | `fromTo(el, {scale:0, opacity:0}, {scale:1, opacity:1, duration:0.6, ease:"power2.out"})` | 平静、温和 |
| `scale_punch` | `fromTo(el, {scale:0.6, opacity:0}, {scale:1, opacity:1, ease:"back.out(2.2)"})` | 冲击、有力 |
| `fade_in` | `fromTo(el, {opacity:0}, {opacity:1, duration:0.4})` | 微妙 |
| `fade_blur` | `fromTo(el, {opacity:0, filter:"blur(14px)"}, {opacity:1, filter:"blur(0px)"})` | 电影感、梦幻 |
| `bounce_in` | `fromTo(el, {y:-120, opacity:0}, {y:0, opacity:1, ease:"bounce.out"})` | 活泼 |
| `slam` | `fromTo(el, {y:-300, opacity:0}, {y:0, opacity:1, ease:"power4.out"})` + 落地 shake | 冲击、重 |

### 文字逐字/逐词入场（3 个）

| 原语 | GSAP recipe | 适合 |
|---|---|---|
| `typewriter` | 用 clip 或 SplitText 逐字显示宽度 | 技术、叙事 |
| `word_reveal` | 逐词 `fromTo({opacity:0,y:20}, {opacity:1,y:0}, {stagger:0.1})` | 讲故事 |
| `wave` | 逐字母 `fromTo({y:20}, {y:0}, {stagger:{each:0.04}})` | 流动、音乐感 |

### 强调（4 个，原地动效）

| 原语 | GSAP recipe | 适合 |
|---|---|---|
| `scale_pulse` | `to(el, {scale:1.12, yoyo:true, repeat:1, ease:"sine.inOut"})` | 节奏、高潮 |
| `shake` | `to(el, {keyframes:[{x:-9},{x:9},{x:0}], ease:"none"})` | 紧急、强烈 |
| `glow` | `to(el, {textShadow:"0 0 46px var(--teal-bright)", yoyo:true, repeat:1})` | 重要、魔法 |
| `color_shift` | `to(el, {color:"var(--warm-bright)"})` | 动态 |

### 退场（3 个）

| 原语 | GSAP recipe | 适合 |
|---|---|---|
| `fade_out` | `to(el, {opacity:0, duration:0.4, ease:"power2.in"})` | 结尾 |
| `slide_out` | `to(el, {y/x:off, opacity:0, ease:"power2.in"})` | 过渡 |
| `scale_out` | `to(el, {scale:1.06, opacity:0, ease:"power2.in"})` | 过渡 |

### 图形装饰（5 个）

| 原语 | GSAP recipe | 说明 |
|---|---|---|
| `underline_sweep` | `fromTo(el, {scaleX:0}, {scaleX:1}, transformOrigin:"left center")` | 下划线扫过 |
| `bar_wipe` | `fromTo(el, {scaleX:0}, {scaleX:1})` | 条形擦除 |
| `hold_breath` | `to(el, {scale:1.015, ease:"sine.inOut"})` | 微微呼吸 |
| `svg_path_draw` | `fromTo(path, {strokeDashoffset:length}, {strokeDashoffset:0})` | SVG 路径绘制 |
| `particle_burst` | 多个粒子 `fromTo({scale:0,opacity:0}, {scale:1,opacity:1}, {stagger:0.02})` | 粒子爆发 |

---

## 二、完整蓝图（22 个）

复杂场景的完整动效方案。每个蓝图包含 intent + roles served + duration + shot structure（分场景结构）+ motion vocabulary + rule mapping（指向具体规则）。

**完整定义见 [`motion-blueprints.md`](motion-blueprints.md)**（22 个蓝图，265KB）。AI 选蓝图：看场景需要什么叙事结构 → 查索引找匹配蓝图 → 按 shot structure 编排各 scene 的动效。

蓝图索引：

| 蓝图 | 用途 |
|---|---|
| `titlecard-reveal` | 标题卡揭示 |
| `typewriter-reveal` | 打字机揭示 |
| `kinetic-type-beats` | 动态文字跟节拍 |
| `dataviz-countup` | 数据计数动画 |
| `comparison-split` | 左右对比分屏 |
| `grid-card-assemble` | 卡片网格组装 |
| `constellation-hub` | 星座式节点网络 |
| `camera-journey` | 相机旅程 |
| `fixed-anchor-cycle` | 固定锚点循环 |
| `spatial-pan-stations` | 空间平移站点 |
| `overwhelm-surround` | 环绕包围 |
| `cta-morph-press` | CTA 按钮变形 |
| `cursor-ui-demo` | 光标 UI 演示 |
| `video-text-pivot` | 视频-文字旋转 |
| `agent-progress-theater` | Agent 进度剧场 |
| `panel-edit-live-sync` | 面板编辑实时同步 |
| `prompt-type-submit-generate` | 提示词输入→生成 |
| `device-surface-showcase` | 设备表面展示 |
| `logo-assemble-lockup` | Logo 组装锁定 |
| `ticker-takeover` | 跑马灯接管 |
| `zoom-out-workspace-reveal` | 缩出工作区揭示 |
| `transcript-scroll-artifact-reveal` | 转录滚动揭示 |

---

## 三、转场（13 个）

场景之间的过渡。每个转场按 Calm/Medium/High 能量级别给多套完整 GSAP 代码。

**完整代码见 [`motion-transitions.md`](motion-transitions.md)**（13 个转场，20KB）。AI 选转场：看相邻两场景的能量过渡 → 查索引找匹配转场 → 复制代码改参数。

转场索引：

| 转场 | 视觉效果 |
|---|---|
| `css-dissolve` | 溶解（opacity 交叉淡入淡出） |
| `css-scale` | 缩放过渡 |
| `css-push` | 推移 |
| `css-cover` | 覆盖 |
| `css-blur` | 模糊（filter:blur + opacity） |
| `css-light` | 光效（白光闪过） |
| `css-radial` | 径向（圆形遮罩） |
| `css-grid` | 网格（网格块翻转） |
| `css-3d` | 3D 翻转（rotateY/rotateX） |
| `css-mechanical` | 机械（滑动 + 齿轮） |
| `css-distortion` | 扭曲 |
| `css-destruction` | 破碎 |
| `css-other` | 自定义过渡 |

**默认转场**：`css-dissolve`（最通用）。旧场景 opacity 0.3s 淡出 + 新场景 opacity 0.3s 淡入，重叠 0.2 秒。

---

## 四、动效规则（48 个）

特定效果的专业实现规则。每个规则包含 Recipe 代码 + Variations + Values 参数表 + Critical Constraints。

**完整定义见 [`motion-rules.md`](motion-rules.md)**（48 个规则，365KB）。AI 选规则：看场景需要什么效果 → 查索引找匹配规则 → 复制 Recipe 代码改参数即用。

规则索引（按类别）：

### 文字类
- `kinetic-beat-slam` — 跟节拍重击文字
- `gradient-text-sweep` — 渐变文字扫过
- `discrete-text-sequence` — 离散文字序列
- `dynamic-content-sequencing` — 动态内容排序

### 3D / 深度类
- `3d-camera-flight` — 3D 相机飞行
- `3d-page-scroll` — 3D 页面滚动
- `3d-text-depth-layers` — 3D 文字深度层
- `orbit-3d-entry` — 3D 轨道入场
- `depth-of-field-blur` — 景深模糊
- `depth-scatter-assemble` — 深度散布组装
- `multi-phase-camera` — 多阶段相机

### 光效类
- `ambient-glow-bloom` — 环境光晕绽放
- `particle-burst` — 粒子爆发
- `motion-blur-streak` — 运动模糊条纹
- `chromatic-glitch` — 色差故障

### 数据 / 图表类
- `counting-dynamic-scale` — 动态计数缩放
- `stat-bars-and-fills` — 统计条填充
- `chart-scrub-readout` — 图表擦洗读数
- `css-marker-patterns` — CSS 标记图案

### 光标 / 交互类
- `cursor-click-ripple` — 光标点击涟漪
- `cursor-drag` — 光标拖拽
- `camera-cursor-tracking` — 相机光标跟踪
- `context-sensitive-cursor` — 上下文光标
- `multi-cursor-choreography` — 多光标编排
- `control-target-sync` — 控件目标同步
- `coordinate-target-zoom` — 坐标目标缩放

### 布局 / 空间类
- `anchored-layout-expand` — 锚定布局展开
- `center-outward-expansion` — 中心向外扩展
- `split-tilt-cards` — 分割倾斜卡片
- `viewport-change` — 视口变化
- `waterfall-entry` — 瀑布入场
- `avatar-cloud-network` — 头像云网络

### 物理 / 弹簧类
- `spring-pop-entrance` — 弹簧弹出入场
- `press-release-spring` — 按压释放弹簧
- `physics-press-reaction` — 物理按压反应
- `reactive-displacement` — 反应位移
- `nudge-curve` — 推动曲线
- `sine-wave-loop` — 正弦波循环
- `press-release-spring` — 按压释放

### SVG 类
- `svg-path-draw` — SVG 路径绘制
- `svg-icon-enrichment` — SVG 图标丰富化

### 其他
- `ai-tracking-box` — AI 追踪框
- `asr-keyword-glow` — ASR 关键词发光
- `scale-swap-transition` — 缩放交换过渡
- `theme-crossfade-morph` — 主题交叉淡入变形
- `hacker-flip-3d` — 黑客 3D 翻转
- `vertical-spring-ticker` — 垂直弹簧跑马灯
- `card-morph-anchor` — 卡片变形锚定
- `gsap-effects` — GSAP 通用效果（slide/fade/stagger 配方）

---

## 五、8 条节奏入场规则（实战踩坑总结）

这 8 条规则是从 7 轮迭代 + 多次修复中总结的，写进 GSAP 时间线编排时必须遵守。

### 规则 1：全部用 fromTo()，不用 from()

`gsap.from(el, {opacity:0})` 在 CSS 已设 `opacity:0` 时，起始值 0 + CSS 0 = 0→0 永远不可见。全部用 `fromTo()` 明确起止值：

```javascript
// ✓ 正确
tl.fromTo("#el", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5 });

// ✗ 会出问题
tl.from("#el", { opacity: 0, y: 30 });
```

### 规则 2：循环动画 repeat:-1 + 足够幅度

循环动画幅度太小（scale 1.03 / 2px 位移）肉眼看不见。幅度不低于 scale 1.08：

```javascript
// ✓ 正确：幅度足够
tl.to("#el", { scale: 1.1, duration: 1.0, ease: "sine.inOut", yoyo: true, repeat: -1, transformOrigin: "50% 50%" }, startTime);

// ✗ 看不见
tl.to("#el", { scale: 1.03, duration: 8, repeat: -1 });
```

### 规则 3：元素跟旁白节奏逐个入场

元素不是提前摆好慢慢动，而是跟旁白节奏逐个入场。每个元素的入场时间对齐旁白说到该元素的节奏点：

```javascript
// 旁白 0.3s 说 kicker，0.8s 说数据，1.5s 说结论
tl.fromTo("#kicker", {opacity:0, y:30}, {opacity:1, y:0, duration:0.5}, 0.3);
tl.fromTo("#data-chip", {opacity:0, scale:0.6}, {opacity:1, scale:1, duration:0.5, ease:"back.out(1.6)"}, 0.8);
tl.fromTo("#conclusion", {opacity:0, y:30}, {opacity:1, y:0, duration:0.5}, 1.5);
```

### 规则 4：入场完成后才启动循环动画

循环动画的起始时间要在入场完成之后，不是跟入场同时开始：

```javascript
// ✓ 正确：入场 0.5s，循环从 0.5+0.5=1.0s 开始
tl.fromTo("#el", {opacity:0, y:30}, {opacity:1, y:0, duration:0.5}, 0.5);
tl.to("#el", {scale:1.08, duration:1.2, yoyo:true, repeat:-1}, 1.0);

// ✗ 循环跟入场同时开始，动效混乱
tl.fromTo("#el", {opacity:0, y:30}, {opacity:1, y:0, duration:0.5}, 0.5);
tl.to("#el", {scale:1.08, duration:1.2, yoyo:true, repeat:-1}, 0.5);
```

### 规则 5：视频背景用 GSAP call() 重置 currentTime

场景切换时视频需要从头播放。用 `tl.call()` 在场景开始时重置：

```javascript
tl.call(() => {
  const v = document.getElementById('s1-bg');
  if (v) { v.currentTime = 0; v.play().catch(()=>{}); }
}, [], sceneStartTime);
```

### 规则 6：移动元素位置后同步调整入场时间

元素从画面底部移到中下位置后，入场时间也要提前。否则元素在中下位置但入场太晚几乎看不到：

```javascript
// 元素原来在 bottom:400（约 1500px），入场 39.6s
// 移到 top:1100 后，入场应提前到 37.0s
tl.fromTo("#quote", {opacity:0, x:-60}, {opacity:1, x:0, duration:0.5}, 37.0);  // ✓ 提前
```

### 规则 7：场景过渡用退场动画

场景间过渡用旧场景退场动画（opacity/scale/y 变化），最后场景不退场。退场在**旧场景音频结束时刻**开始，不提前、不抢拍；新场景在切割边界同时接入，自然交叉溶解（整段录音切割后段间本无静音，无需为躲死区提前退场）：

```javascript
// 场景 1 在 6.5s（音频尾音结束时刻，非提前）开始退场，场景 2 在 6.5s（切割边界）接入
tl.to("#s1 .clip", { y: -60, opacity: 0, duration: 0.4, ease: "power2.in" }, 6.5);
// 最后场景 s7 不退场
```

### 规则 8：Ken Burns 幅度区分视频/图片背景

视频背景本身已有动态感，Ken Burns 幅度小一些（scale 1.0→1.2）；图片背景静态，幅度大一些（scale 1.0→1.4~1.5）：

```javascript
// 视频背景：幅度小
tl.fromTo("#s1-bg", {scale:1.0, x:0, y:0}, {scale:1.2, x:-40, y:20, duration:6.3, ease:"power1.inOut"}, 0);

// 图片背景：幅度大
tl.fromTo("#s2-bg", {scale:1.0, x:0, y:0}, {scale:1.4, x:-60, y:30, duration:6.2, ease:"power1.inOut"}, 6.336);
```
