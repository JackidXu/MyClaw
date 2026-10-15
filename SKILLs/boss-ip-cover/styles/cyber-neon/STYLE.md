# 赛博霓虹（Cyber Neon）视觉原子

一套为「年轻科技 / 潮流 / 二次元向」老板设计的赛博朋克语言。目标：像一部赛博都市海报，未来、酷、高能。

## 材质（Materials）
- 暗紫黑底（`#0A0612` / `#120A24`）。
- 霓虹光管描边（青/品红/黄），故障艺术 glitch 错位。
- 拒绝纸质与柔焦。

## 空间逻辑（Spatial Logic）
- 主体（人物/产品）被霓虹描边，孤立于暗场。
- 背景赛博网格地平线 / 城市剪影，纵深感。
- 大面积暗部承担氛围，光只点缀。

## 标题处理（Title Treatment）
- 霓虹发光字，双重描边（外青内品红），斜切排版。
- 关键词高亮，可带轻微 glitch 错位。

## 字体行为（Typography）
- 几何无衬线 + 等宽代码感（如 Orbitron / JetBrains Mono 类）。
- 中文需清晰，发光不糊字。

## 肌理（Texture）
- 扫描线、光晕、微噪点，强化屏幕感。

## 配色（Color System）
> ⚠️ 色值参考：以下 hex 仅为风格定义参考值，编译进最终图像 prompt 时一律转自然语言颜色名（如 #4FC3F7 → bright cyan），hex 不得出现在 prompt 主体；如需保留色值精度，集中放到 prompt 末尾「PALETTE (reference only)」段。详见 references/cover-blueprint.md「参数-文案隔离规则」。
- 底：深蓝紫 `#0A0612`
- 荧光青：`#2DE2E6`
- 品红：`#FF2E97`
- 警示黄：`#F9F871`

## 风格特有负向约束（Negative Constraints）
- 不要明亮平光、纸质、衬线古典。
- 不要柔焦、治愈系低饱和。
- 金/暖色只作极小点缀，不破坏冷调。
