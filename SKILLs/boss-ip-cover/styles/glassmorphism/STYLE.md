# 玻璃拟态（Glassmorphism）视觉原子

一套为「现代 App / SaaS / 数字产品」老板设计的通透界面语言。目标：干净、轻盈、现代，像主流产品设计稿。

## 材质（Materials）
- 半透明磨砂玻璃卡片（白 20%-30% 不透明 + 模糊）。
- 细高光边（1px 白色半透明）勾边。
- 背景柔和彩色光斑（蓝紫渐变弥散）。

## 空间逻辑（Spatial Logic）
- 漂浮玻璃卡片承载标题与关键信息，悬浮于背景。
- 背景光斑不抢卡片内容。
- 通透不拥挤，留白充足。

## 标题处理（Title Treatment）
- 玻璃卡片内重体无衬线，轻微投影增强层级。
- 关键词可放大或换强调色。

## 字体行为（Typography）
- 现代无衬线（Inter / 思源黑体），中性。

## 肌理（Texture）
- 背景高斯模糊、玻璃高光、柔和阴影。

## 配色（Color System）
> ⚠️ 色值参考：以下 hex 仅为风格定义参考值，编译进最终图像 prompt 时一律转自然语言颜色名（如 #4FC3F7 → bright cyan），hex 不得出现在 prompt 主体；如需保留色值精度，集中放到 prompt 末尾「PALETTE (reference only)」段。详见 references/cover-blueprint.md「参数-文案隔离规则」。
- 背景：浅色渐变（蓝紫 `#6D8BFF`→`#B07CFF` 弥散）
- 玻璃：白半透明
- 强调：蓝紫 `#5B6CFF`

## 风格特有负向约束（Negative Constraints）
- 不要重暗角、纸质肌理、霓虹。
- 不要信息图堆叠、高饱和撞色。
- 玻璃透明度要够，体现通透。
