# 瑞士网格字体（Swiss Grid）视觉原子

一套为「设计师 / 建筑 / 极简主义」老板设计的国际主义排版语言。目标：理性、克制、秩序，像瑞士平面设计经典。

## 材质（Materials）
- 纯白底（`#FFFFFF`），拒绝肌理与光影。
- 严格网格（3–6 列），粗黑块分区。

## 空间逻辑（Spatial Logic）
- 非对称网格，大字号左对齐，留白精准。
- 元素绝对对齐到网格线，不随意摆放。
- 红色小元素（方块/线段）点睛，克制。

## 标题处理（Title Treatment）
- 超粗无衬线巨标题（占画面 40%-60%）。
- 红色小方块或线段作视觉锚点。

## 字体行为（Typography）
- Helvetica 式无衬线，绝对对齐，字距统一。
- 中文用中性黑体，清晰。

## 肌理（Texture）
- 无，纯平面。

## 配色（Color System）
> ⚠️ 色值参考：以下 hex 仅为风格定义参考值，编译进最终图像 prompt 时一律转自然语言颜色名（如 #4FC3F7 → bright cyan），hex 不得出现在 prompt 主体；如需保留色值精度，集中放到 prompt 末尾「PALETTE (reference only)」段。详见 references/cover-blueprint.md「参数-文案隔离规则」。
- 白：`#FFFFFF`
- 黑：`#111111`（标题/块）
- 红：`#E2231A`（点睛，小面积）

## 风格特有负向约束（Negative Constraints）
- 不要装饰、渐变、手写、图片堆。
- 不要柔和圆角、暖色、柔光。
- 网格秩序不可破。
