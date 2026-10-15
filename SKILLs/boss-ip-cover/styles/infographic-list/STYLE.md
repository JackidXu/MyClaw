# 信息图清单（Infographic List）视觉原子

一套为「盘点 / 干货清单 / 数据对比」老板设计的强信息语言。目标：清晰、实用、专业，一眼读完要点。

## 材质（Materials）
- 干净底（白/浅灰），图标+数字，色块分区。
- 拒绝装饰与写实照片。

## 空间逻辑（Spatial Logic）
- 编号清单 / 对比表 / 步骤条，层级分明。
- 主题大标题在上，信息块在下，网格对齐。

## 标题处理（Title Treatment）
- 大标题 + 副标题数据，数字用粗体强调。
- 每条要点配图标或序号。

## 字体行为（Typography）
- 无衬线，数字粗体，清晰。

## 肌理（Texture）
- 无，纯平面。

## 配色（Color System）
> ⚠️ 色值参考：以下 hex 仅为风格定义参考值，编译进最终图像 prompt 时一律转自然语言颜色名（如 #4FC3F7 → bright cyan），hex 不得出现在 prompt 主体；如需保留色值精度，集中放到 prompt 末尾「PALETTE (reference only)」段。详见 references/cover-blueprint.md「参数-文案隔离规则」。
- 白底：`#FFFFFF` / 主题蓝：`#2D6CDF` / 强调橙：`#F5A623` / 灰：`#8A8A8A`

## 风格特有负向约束（Negative Constraints）
- 不要艺术化模糊、过于装饰。
- 不要人物大图抢信息。
- 信息层级必须清晰可扫读。
