# 动效选型思考方法（motion-thinking）

## 选型四步思考

### 第一步：理解这段口播的信息结构

读完这段口播文案，先想清楚它讲的是什么结构的信息。常见的信息结构有（但不限于）：

- **对比**：在比较两个东西（A vs B）
- **列举**：在并列报几个同类东西（角色/能力/特征/步骤）
- **流程**：在讲一个先后顺序（A→B→C）
- **累积**：在讲一个随时间增长/沉淀的东西
- **对话**：在讲一问一答
- **数值**：在讲具体数字、进度、比例
- **状态**：在讲某种持续状态（在线/覆盖/运行）
- **概念**：在讲一个抽象概念（需要解释才懂）
- **以上几种的组合**：真实口播往往一段里混了好几种结构

也可能遇到完全没见过的全新结构——那就自己想一个能说清它的呈现形式。

### 第二步：想什么样的视觉呈现最能帮观众理解这个结构

想清楚信息结构后，想一个能帮观众"一眼看懂这个结构"的视觉形式。从下面的动效工具箱里选合适的，或自由组合、甚至创造新的呈现形式。

思考的角度：

- 这个结构的核心关系是什么？（并列？递进？因果？累积？）
- 什么样的图形/布局能把这个关系直接"画"出来？
- 观众看到这个画面，能不能不读字就大致理解这段在讲什么关系？

### 第三步：动效卡只放提取的重点信息

动效卡里只放从文案内容中提取出来的关键信息点，不要写太多的文字，更不能直接把文案每一句都放在上面，应该只放关键文字信息，通过动效来表达这个信息的意思。

原因：如果动效卡把整句口播都搬上去，就和字幕重叠了，等于让动效干了字幕的活。动效的职责是"把信息结构可视化"，不是"把文字换个地方显示"。

### 第四步（唯一硬原则）：区域越大，内容越多

**展示动效的区域越大，卡内要承载的内容元素越多，让画面合理且不单调。**

这是唯一的硬性要求。具体来说：

- 动效卡占顶部约 25% 高度（上下结构）→ 卡内放 4-8 个元素，错峰出场
- 动效卡占满屏（全屏分析/画中画）→ 卡内放更多元素，信息密度更高
- 如果区域很大但只放了 2-3 个元素，画面会显得空荡单调，要补内容

补内容的方法：回到口播原文，找还没被可视化的关键词或概念，把它们做成视觉元素。比如口播里提到了平台名、提到了"定规则"这个动作、提到了某个说明性短语——这些都可以做成视觉元素（平台标识、输入框样式、流向箭头、说明 caption 等）。

## 动效工具箱（12 种可选，可自由组合或创造新形式）

这是工具箱，不是必选清单。遇到合适的内容就用，遇到不合适的就换，遇到表里没有的就自己组合或创造。

| 动效            | 效果                       | 使用前提                                  |
| ------------- | ------------------------ | ------------------------------------- |
| scale-pop     | 从 0.6 缩放到 1，带回弹          | 无                                     |
| slide-in      | 从左/右/上/下滑入               | 无                                     |
| grow-x        | 条形宽度生长（从 0 到目标宽度）        | 元素 width 初始为 0，标 target 宽度            |
| grow-y        | 条形高度生长                   | 元素 height 初始为 0，标 target 高度           |
| typewriter    | 打字机，逐字淡入                 | 把文本拆成字/词                              |
| count-up      | 数字滚动（from → to）          | 标 from 和 to 值                         |
| blur-in       | 失焦→对焦，从模糊到清晰             | 无                                     |
| mask-reveal   | 裁剪揭幕，从一边像幕布拉开            | 元素用 clip-path，标 direction             |
| draw-path     | SVG 画线（流程箭头/连线/路径）       | 元素是 SVG `<path>`，用 strokeDasharray 揭示 |
| morph-to      | tween 任意 CSS（颜色/形状变化）    | 标目标 props                             |
| pulse         | 脉冲（持续状态指示）               | 元素是圆点，box-shadow 多层环                  |
| kinetic-chars | 逐字弹出，每个字 scale+fade 错峰飞入 | 把每个字包进 `<span class="char">`          |

### 各动效的 GSAP 实现参考

```javascript
// scale-pop
tl.fromTo(SEL, { opacity:0, scale:0.6 }, { opacity:1, scale:1, duration:D, ease:"back.out(1.6)" }, T);

// slide-in（从左）
tl.fromTo(SEL, { opacity:0, x:-60 }, { opacity:1, x:0, duration:D, ease:"power2.out" }, T);

// grow-x（target 宽度 W）
tl.fromTo(SEL, { width:0 }, { width:W, duration:D, ease:"power2.out" }, T);

// grow-y（target 高度 H）
tl.fromTo(SEL, { height:0 }, { height:H, duration:D, ease:"power2.out" }, T);

// draw-path（SVG 揭线）
(function(){const el=document.querySelector(SEL);if(el){const L=el.getTotalLength();
  tl.set(SEL,{strokeDasharray:L,strokeDashoffset:L},T);
  tl.to(SEL,{strokeDashoffset:0,duration:D,ease:'power2.inOut'},T);}})();

// mask-reveal（从左揭幕）
tl.fromTo(SEL, { clipPath:'inset(0 100% 0 0)' }, { clipPath:'inset(0 0 0 0)', duration:D, ease:'power2.inOut' }, T);

// count-up（数字从 from 到 to）—— 纯属性/离散快照或带安全闭包的 onUpdate：
// 推荐写法（对象属性 tween + onUpdate 同步更新 textContent）：
const counterObj = { val: 0 };
tl.to(counterObj, {
  val: 100,
  duration: D,
  ease: "power1.out",
  onUpdate: () => {
    const el = document.querySelector(SEL);
    if (el) el.textContent = Math.round(counterObj.val);
  }
}, T);

// kinetic-chars —— 先把每个字包进 span，再对每个 span 错峰 scale-pop
// HTML: <span class="char">字</span> 每个字一个 span
// JS: chars.forEach((c,i) => tl.fromTo(c, {opacity:0,scale:0.3}, {opacity:1,scale:1,duration:0.25,ease:"back.out(1.6)"}, T + i*0.05));
```

## 全屏分析模式

当某段内容需要画完整流程图或关系图来说明，顶部约 25% 的小条放不下时，把动效卡的 zone 设成 fullscreen（`left:0 top:0 width:画宽 height:画高`），用全屏空间画。

全屏分析模式常用：

- SVG 节点 + `draw-path` 画连线（流程图/关系图）
- 大段结构化说明（多行文字 + 配图）
- 复杂对比矩阵

全屏分析卡和结尾全屏总结卡的区别：

- 全屏分析卡：用于中间某段内容放不下小条时，切全屏讲清楚
- 全屏总结卡：用于结尾，列全程重点 + CTA

两种都 track-index 设小于字幕（字幕永远在最顶层），所以全屏时段字幕照常在底部出现。

## 错峰出场的时间安排

每个元素在卡进场后 0.1-0.5s 依次出现，营造"讲到哪出现对应信息"的感觉。安排原则：

- 卡进场（opacity 0→1）用 0.3s
- 第一个元素在卡进场后 +0.1s 出
- 后续元素每个间隔 0.3-0.5s
- 同类元素（如三个角色卡）间隔均匀（0.25s 一个）

时间点尽量落在口播讲到对应信息的时刻——例如观众听到"秘书"时，秘书卡刚好出现。这要求先看 transcript.json 的时间码，再排动画时间点。
