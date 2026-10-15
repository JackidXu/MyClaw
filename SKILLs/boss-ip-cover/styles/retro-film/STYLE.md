# 胶片复古（Retro Film）视觉原子

一套为「怀旧 / 复古品牌 / 老字号」老板设计的年代语言。目标：怀旧、温暖、有故事，像一张老照片。

## 材质（Materials）
- 胶片颗粒，暖黄褪色，光晕/漏光。
- 拒绝高清冷调与现代扁平。

## 空间逻辑（Spatial Logic）
- 人物/场景居中，年代感氛围。
- 暗角与漏光强化时间感。

## 标题处理（Title Treatment）
- 复古衬线或手写，做旧处理。
- 字重轻，不抢画面。

## 字体行为（Typography）
- 衬线 / 手写，温和怀旧。

## 肌理（Texture）
- 胶片颗粒、漏光、暖黄褪色。

## 配色（Color System）
> ⚠️ 色值参考：以下 hex 仅为风格定义参考值，编译进最终图像 prompt 时一律转自然语言颜色名（如 #4FC3F7 → bright cyan），hex 不得出现在 prompt 主体；如需保留色值精度，集中放到 prompt 末尾「PALETTE (reference only)」段。详见 references/cover-blueprint.md「参数-文案隔离规则」。
- 暖黄：`#E8C97A` / 褪色橙：`#D98A4E` / 褐：`#8C6A4A` / 米：`#F0E6D2`

## 风格特有负向约束（Negative Constraints）
- 不要高清冷调、霓虹、现代扁平。
- 不要高饱和、金属。
- 胶片褪色质感不可丢。
