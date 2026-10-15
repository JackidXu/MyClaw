# 直播带货（Live Commerce）视觉原子

一套为「直播预告 / 带货 / 福利款」老板设计的强转化语言。目标：热烈、急迫、促销，一眼想点。

## 材质（Materials）
- 高饱和撞色，气泡，箭头，价格标签。
- 拒绝极简留白与暗调。

## 空间逻辑（Spatial Logic）
- 主播/产品大图居主，利益点贴纸环绕。
- 贴纸（限时/秒杀/赠品）抢眼但不乱。

## 标题处理（Title Treatment）
- 粗体大字 + 福利标签（限时/秒杀/直降）。
- 关键词放大，红黄撞色。

## 字体行为（Typography）
- 粗圆无衬线，字重重，活泼。

## 肌理（Texture）
- 贴纸、光效、轻微放射线。

## 配色（Color System）
> ⚠️ 色值参考：以下 hex 仅为风格定义参考值，编译进最终图像 prompt 时一律转自然语言颜色名（如 #4FC3F7 → bright cyan），hex 不得出现在 prompt 主体；如需保留色值精度，集中放到 prompt 末尾「PALETTE (reference only)」段。详见 references/cover-blueprint.md「参数-文案隔离规则」。
- 红：`#FF3B30` / 黄：`#FFCC00` / 橙：`#FF9500`（高饱和撞色）

## 风格特有负向约束（Negative Constraints）
- 不要极简留白、暗调、文艺。
- 不要严肃衬线、低饱和。
- 促销感与急迫感不可丢。
