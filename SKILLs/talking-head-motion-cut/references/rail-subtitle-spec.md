# 逐句字幕 rail 规范（rail-subtitle-spec）

## rail 字幕是什么

rail 字幕是出现在画面底部、跟随口播节奏逐句切换的字幕条。和传统字幕不同，rail 字幕：

- 逐句分组，一次只显示一组（不是整段一起出现）
- 每组 ≤2 行
- 用半透明圆角 pill 底衬（scrim），不做全帧黑条
- emphasis 关键词 inline 标色（不另起元素）
- 150-250ms 快速淡入淡出，无夸张动效

## rail 规范要点

### 1. 逐句分组

把口播文案按语义句拆成组，一组一句（或一个短语义块）。每组的 duration 对应这句话在 transcript.json 里的时长。

- 一组 = 一句完整语义，不要把一句话劈到两组
- 两组之间无缝衔接（前组淡出时后组淡入，或前组结束时刻后组开始）
- 每组 ≤2 行，超过 2 行的拆成两组

### 2. emphasis 词 inline 标色

在字幕文字里，关键词用 inline span 标色，不另起元素：

- 关键词：`<span class="hl-key">替你干活</span>`（紫色 #c4b5fd）
- 数字：`<span class="hl-num">三步</span>`（金色 #fbbf24）
- 普通文字：默认白色

标色原则：标"这段最想让观众注意的词"，不要标太多（一组标 1-3 个词）。

### 3. pill 底衬样式

```css
.rail-pill { display:inline-block; padding:20px 40px; border-radius:18px;
  background: rgba(0,0,0,0.62); backdrop-filter: blur(8px);
  color:#fff; font:500 56px/1.45 "LXGW WenKai TC",serif; text-align:center; max-width:94%; }
```

- 半透明黑底（0.62），带 backdrop-filter 毛玻璃
- 圆角 18px
- 字号 56px（竖屏 1080 宽下，一行约 16 字）
- max-width 94%，超过自动换行到 2 行

### 4. 进出动画

只用 opacity + 轻微 y 位移，无 scale-pop（字幕要稳重，不弹跳）：

```javascript
tl.set(H(id), { visibility: "visible" }, s);
tl.fromTo(H(id), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.22, ease: "power2.out" }, s);
if (s + d < 总时长) {
  tl.to(H(id), { opacity: 0, y: -8, duration: 0.2, ease: "power2.in" }, s + d - 0.2);
  tl.set(H(id), { visibility: "hidden" }, s + d);
}
```

- 淡入 220ms，淡出 200ms
- 淡入 y:+12→0（从下往上轻移），淡出 y:0→-8（往上轻移）

### 5. 位置（竖屏 9:16）

```css
left:0; top:1300px; width:1080px; height:200px;
```

底部偏下，距底 1920-1300-200=420px。横屏调整 top 到画高 - 字幕高 - 边距。

### 6. track-index 最顶层

字幕 `data-track-index="10"`，永远大于所有动效卡，保证全屏段字幕也可见。

## 字幕校对方法（必须做）

字幕写完后，**逐句对照 transcript.json 原文校对一遍**。这是从实际踩坑里总结的必做步骤——AI 凭记忆写字幕会漏关键信息。

### 校对原则

**保留原文所有内容**：字幕逐句对照 transcript.json 原文，补全所有缺失内容

### 校对方法

把 transcript.json 和你写的字幕逐句并排，少了哪些内容就补全上去

### 加长字幕处理

校对后字幕变长了（补回了平台名/主语），可能超过 2 行。处理：

- 超过 2 行的拆成两组（rail 规范每组 ≤2 行）
- 拆句点选在自然停顿处（逗号、句号）
- 两组的 duration 重新分配

## 标色 vs 动效的分工

和动效选型配合（见 motion-thinking.md）：

- **单纯强调某个词** → 字幕标色就够（关键词紫色、数字金色）
- **信息有结构关系**（对比/并列/累积/流程/对话）→ 必须动效呈现，字幕只管完整文字

两者不重叠：字幕管"完整口播文字"，动效管"信息结构可视化"。
