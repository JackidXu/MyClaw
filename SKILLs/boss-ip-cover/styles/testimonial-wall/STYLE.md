# 口碑证言墙（Testimonial Wall）视觉原子

一套为「客户案例 / 好评截图 / 信任背书」老板设计的社会证明语言。目标：可信、真实、有说服力。

## 材质（Materials）
- 真实截图/头像卡拼贴，白底，卡片投影。
- 拒绝虚构数据与过度设计。

## 空间逻辑（Spatial Logic）
- 多张证言卡网格（3–6 张），真实头像 + 短评。
- 主角一句话（最强证言）放大居中。

## 标题处理（Title Treatment）
- 主张大标题（如「他们为什么选我们」）+ 证言小字。
- 绿勾图标强化可信。

## 字体行为（Typography）
- 无衬线，清晰，证言用稍小字。

## 肌理（Texture）
- 卡片投影、真实截图质感。

## 配色（Color System）
> ⚠️ 色值参考：以下 hex 仅为风格定义参考值，编译进最终图像 prompt 时一律转自然语言颜色名（如 #4FC3F7 → bright cyan），hex 不得出现在 prompt 主体；如需保留色值精度，集中放到 prompt 末尾「PALETTE (reference only)」段。详见 references/cover-blueprint.md「参数-文案隔离规则」。
- 白：`#FFFFFF` / 品牌色：`#2D6CDF` / 绿勾：`#2ECC71` / 灰：`#8A8A8A`

## 风格特有负向约束（Negative Constraints）
- 不要虚构数据、过度设计。
- 不要艺术化模糊主体。
- 头像与证言必须真实感。
