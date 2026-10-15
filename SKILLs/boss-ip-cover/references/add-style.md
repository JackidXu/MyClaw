# 接入新风格（add-style）

当用户提供新风格文档、提示词或参考，要把它纳入共享风格库 `styles/` 时，按本流程操作。

## 何时触发

- 用户说「加一个 XX 风格」「接入这套设计」「把这套参考写成风格」。
- 用户贴来一份风格描述 / 提示词，希望以后能直接用。

## 操作步骤

1. 在 `styles/{new-style-id}/` 下新建 `META.md`、`STYLE.md` 与 `PROMPT.md`。
   - 目录名用**英文 ASCII ID**（如 `ink-wash`）；`META.md` 里 `id` 字段与之同名。
2. 写 `META.md`（YAML frontmatter），至少包含：
   - `id`、`name_zh`、`name_en`
   - `outputs: [cover, poster]`（视频封面风格也标 cover，便于进菜单）
   - `best_for`：最适合的场景 / 主题
   - `mood`：情绪基调
   - `style_anchors`：材质 / 空间 / 标题处理 / 字体 / 肌理 / 配色 的核心锚点
   - `cover_shape_adaptation`：如何把主题压成该风格封面
   - `must_preserve`：不可妥协的锚点
   - `avoid_when_applying_to_cover`：风格特有负向约束
3. 写 `STYLE.md`（Markdown 视觉原子），展开材质、空间逻辑、标题处理、字体行为、肌理、配色、负向约束。
4. 写 `PROMPT.md`（编译指南），把 STYLE.md 的视觉原子重组为 prompt 编译格式：构图与文字路径、字形字高与效果、颜色逻辑、人物与主题物、装饰、迁移与边界。hex 色值仅作风格定义参考，编译时一律转自然语言颜色名。
5. 在 `../../references/style-catalog.md` 的表格里追加一行，并补一句选择启发。
6. 不建议覆盖现有风格文件；新风格独立成目录，保留溯源。

## 命名与规范

- 禁止用中文做目录名（跨平台稳定，参考用户 skill 命名规范）。
- 不虚构他人授权素材；用户提供的参考若含第三方版权，提醒用户确认使用权。
- 接入不代表已验证生成效果；首次使用后如实记录验证状态。
