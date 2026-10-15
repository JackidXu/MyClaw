# 新闻热点头条（News Headline）视觉原子

一套为「热点借势 / 时事评论 / 宏观快评」老板设计的头条语言。目标：紧急、醒目、权威，像新闻直播间或头版。

## 材质（Materials）
- 新闻直播间 / 头条版面，红蓝条，字幕条。
- 拒绝文艺留白与柔光。

## 空间逻辑（Spatial Logic）
- 巨幅头条标题压顶（占 30%-45%）。
- 下方快讯条 / 滚动字幕区，副标题小字。
- 可留一处主视觉（人物/场景）但不抢标题。

## 标题处理（Title Treatment）
- 超粗黑体头条字，关键词红/蓝强调。
- 长标题压 2 行，主词加重。

## 字体行为（Typography）
- 粗黑无衬线，字距收紧，清晰有力。

## 肌理（Texture）
- 电视字幕条、版面分割线，轻微光感。

## 配色（Color System）
> ⚠️ 色值参考：以下 hex 仅为风格定义参考值，编译进最终图像 prompt 时一律转自然语言颜色名（如 #4FC3F7 → bright cyan），hex 不得出现在 prompt 主体；如需保留色值精度，集中放到 prompt 末尾「PALETTE (reference only)」段。详见 references/cover-blueprint.md「参数-文案隔离规则」。
- 白：`#FFFFFF` / 红：`#D81E1E` / 深蓝：`#0B3D91` / 黑：`#1A1A1A`

## 风格特有负向约束（Negative Constraints）
- 不要文艺留白、柔光、卡通。
- 不要渐变光斑、水彩。
- 头条紧迫感不可弱化。
