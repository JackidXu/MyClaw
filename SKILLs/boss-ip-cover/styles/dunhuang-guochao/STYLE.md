# 敦煌国潮（Dunhuang Guochao）视觉原子

一套为「文化 / 国货 / 非遗 / 高端中式」老板设计的敦煌美学语言。目标：华美、神秘、文化自信，像一幅壁画局部。

## 材质（Materials）
- 敦煌壁画肌理，金线勾勒，矿物色平涂。
- 拒绝现代霓虹与扁平卡通。

## 空间逻辑（Spatial Logic）
- 飞天/藻井/卷草纹样环绕主体，主体居中。
- 纹样对称或环抱，留白用在纹样间隙。

## 标题处理（Title Treatment）
- 书法体或衬线，金描边，庄重。
- 可竖排，呼应传统版式。

## 字体行为（Typography）
- 书法 / 衬线，端正。

## 肌理（Texture）
- 壁画肌理、金线、轻微斑驳。

## 配色（Color System）
> ⚠️ 色值参考：以下 hex 仅为风格定义参考值，编译进最终图像 prompt 时一律转自然语言颜色名（如 #4FC3F7 → bright cyan），hex 不得出现在 prompt 主体；如需保留色值精度，集中放到 prompt 末尾「PALETTE (reference only)」段。详见 references/cover-blueprint.md「参数-文案隔离规则」。
- 石青：`#2E5C8A` / 石绿：`#5A8A6E` / 赭石：`#B5651D` / 金：`#C9A24B`

## 风格特有负向约束（Negative Constraints）
- 不要现代霓虹、扁平卡通。
- 不要高饱和糖果色。
- 敦煌符号不可省，否则失魂。
