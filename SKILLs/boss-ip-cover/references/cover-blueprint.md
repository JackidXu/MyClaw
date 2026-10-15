# 封面 Prompt 蓝图（cover-blueprint）

本文件是「老板 IP 封面」最终图像 prompt 的**强制结构**。编译时把封面任务字段、所选风格的视觉原子融合进下面这些栏目，形成一份完整的封面制作 brief。不要删栏目，也不要把风格原文当独立段落贴进来。

```text
# 老板IP封面 制作单

## 1. 角色任务
为 {平台} 制作一张老板个人 IP 封面。请求画幅：{请求比例}。实际生成画幅：{生成比例}。
{比例解析说明，若走了就近解析才填}

## 2. 输入字段（仅用提炼后内容）
- 标题 / 主题：{title_or_topic}
- 副标题（可空）：{subtitle}
- 语言模式：{language_mode}
- 一句话语境：{summary}
- 视觉主体：{visual_subject}
- 受众：{audience}
- 情绪基调：{mood}
- 视觉隐喻：{metaphor}
- 禁用元素：{banned_elements}

## 3. 内容理解
{用一两句话讲清这条内容在解决受众的什么问题、为什么值得点开。不要抄原文。}

## 4. 标题层级
- 主标题：{必须完整、清晰、易读；长标题压成短高冲击句，完整含义用副标题或上下文行补}
- 副标题 / 上下文行：{补充，可空}

## 5. 封面构图
{主体位置、前景背景关系、留白比例、阅读方向——全部用所选风格的语言表达}

## 6. 风格落地
{把所选 STYLE.md 的材质 / 空间 / 标题处理 / 字体 / 肌理 / 配色 改写为本封面的具体执行}

## 7. 图文关系
{标题与画面是咬合还是叠加；人物与文字的遮挡关系；是否要真人参考图——若需要，身份在第二步换脸时注入，不混入第一步自由出图}

## 8. 排版字体
{字体调性、字号层级、对齐、描边 / 阴影处理；中文必须清晰不乱码}

## 9. 色彩 / 材质 / 肌理
{主色、强调色、材质（纸/金属/玻璃/光）、肌理颗粒}

## 10. 禁用约束
{通用避坑 + 所选风格特有 negative：PPT感、课程封面感、电商大促感、标题错字/被挡/裁切、无关装饰、
 AI-slop 指纹（多余手指、扭曲文字、假 logo 占位）、低质拼贴}

## 11. 终检标准
{一眼认主题、二眼见隐喻；像刻意的编辑封面而非通用插画；人脸身份（若有参考图）跨图一致}
```

## 参数-文案隔离规则（强制）

生图模型（Seedream / DALL-E / SD / Flux 等）无法区分 prompt 里的「技术参数」与「要渲染到图上的文字」——凡是裸文本都可能被当成可见文字画进图里。`#4FC3F7`、`40%`、`Source Han Sans Heavy` 这类符号化参数尤其容易被模型当字符串渲染。以下规则确保参数与文案在 prompt 里用**截然不同的语法形态**，模型一眼分清。

### 三层隔离

1. **参数自然语言化**（第一层，最有效，单独做可解决 80% 问题）
   - hex 色值 → 自然语言颜色名 + 调性词。例：`#4FC3F7` → `bright cyan`、`#1a2332` → `dark navy blue`、`#F5F7FA` → `clean white`。模型对颜色名的语义理解远胜 hex，取色精度基本持平且更可控。
   - 百分比 → 方位词 + 量级分数 + 相对关系（见下「位置改写公式」）。
   - 字体名 → 通用描述，删括号注释。例：`(like Source Han Sans Heavy)` → `modern bold sans-serif`。
   - 括号 `()` 注释一律删除——括号内的串最易被模型当文字渲染。需补充说明时并入正文句子，不要用括号。

2. **文案显式标记**（第二层）
   - 所有要渲染到图上的文字，统一用 `「」` 包裹。如 `「公司落地AI，先从小事开始」`。
   - prompt 开头声明一句：`Render ONLY the text enclosed in 「」 as visible text. Everything else is visual description — do not render it as text.`

3. **全局隔离指令**（第三层，兜底）
   - prompt 结尾补一句：`Do NOT render any color codes, percentages, font names, or technical parameters as visible text.`

### 位置改写公式（强制）

百分比是构图的核心，但生图模型**不按「%」精确计算**——它按「元素间相对关系」构图。把百分比改写成「方位 + 量级分数 + 相对关系」，既保留量级信息又给出构图关系，精度反而比纯百分比高（因为模型本就靠关系构图，不靠百分比计算）。

| 原 prompt 写法 | 改成 |
|---|---|
| `Top 40% area` | `upper portion of the canvas (roughly two-fifths), sitting above the central visual` |
| `Center 45%` | `central zone (slightly less than half), the main visual occupies here between the title block above and the brand strip below` |
| `Bottom 15%` | `a thin strip hugging the very bottom edge (about one-seventh)` |

要点：去 `%` 符号、用 `two-fifths / one-seventh` 分数量级词、加「相对其他元素的关系」描述。三段式构图（上标题/中主体/下底栏）务必写出"X 在 Y 之上、Z 贴着底边"这种关系链。

### 颜色处理（强制）

- 各 `STYLE.md` 配色段里的 hex 一律视为**风格定义参考值**，编译进 prompt 主体时必须转自然语言颜色名，hex 不得直接出现在 prompt 主体。
- 若必须保留 hex 精度（极少需要），把所有 hex 集中到 prompt 末尾独立段，并标注 `PALETTE (reference only, do NOT render as text): navy #1a2332, cyan #4FC3F7, white #F5F7FA`。
- 生图模型对 hex 的取色精度与自然语言颜色名基本持平，自然语言颜色名更可控——优先用自然语言。

### 改写对照（用户原例）

改写前（参数被当文字渲染）：

```
A premium tech magazine cover, vertical 3:4 format. Dark navy background (#1a2332). Top 40% area: bold modern sans-serif title text "公司落地AI，先从小事开始" in clean white (#F5F7FA), left-aligned, with subtitle "务实路径 · 小步快跑 · 逐步验证" in cyan blue (#4FC3F7) below. Center 45%: ... Bottom 15%: minimal brand area. ... (like Source Han Sans Heavy) ...
```

改写后（三层隔离到位）：

```
Render ONLY the text enclosed in 「」 as visible text. Everything else is visual description — do not render it as text.

A premium tech magazine cover, vertical 3:4 format. Dark navy blue background. Upper portion of the canvas (roughly two-fifths), sitting above the central visual: bold modern sans-serif title text 「公司落地AI，先从小事开始」 in clean white, left-aligned, with subtitle 「务实路径 · 小步快跑 · 逐步验证」 in bright cyan below. Central zone (slightly less than half): the main visual ... between the title block above and the brand strip below. A thin strip hugging the very bottom edge (about one-seventh): minimal brand area. ... modern bold sans-serif font ...

Do NOT render any color codes, percentages, font names, or technical parameters as visible text.
```

## 使用纪律

- 长文只填摘要与提炼字段；**绝不把原文贴进图 / prompt / 小字系统**。
- 每个封面决策都必须通过所选风格表达，不要通用封面 + 风格词。
- `{{...}}` 占位符全部替换；无对应占位符的细节并入最近栏目。
- 多尺寸套装：每个比例单独编译一份，内容/隐喻/风格/配色一致，构图/字号/留白/阅读方向按画幅重写。
- 单图只出一张；多尺寸套装每目标各一张独立图，不拼九宫格。
- prompt 文件内不写风格选择理由。
