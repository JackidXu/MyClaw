# 视频封面 Prompt 蓝图（video-cover-blueprint）

本文件是「老板 IP 视频封面」最终图像 prompt 的**强制结构**。编译时把任务字段、所选风格的视觉原子、四色方案、真人抠图与构图决策融合进下面这些栏目，形成一份完整的视频封面制作单。不要删栏目，也不要把风格原文当独立段落贴进来。

```text
# 老板IP视频封面 制作单

## 1. 角色任务
为 {平台} 制作一张老板个人 IP 视频封面。画幅：{ratio}。
{比例说明，若走了就近解析才填}

## 2. 本期身份（老板脸锁定）
- 身份照片：{本地路径或"无，按文字描述"}
- 锁定要求：脸型 / 五官比例 / 发型 / 肤色 / 服装 / 配饰 必须与参考图一致
- 允许改动：动作、表情、朝向、手势、视线（不改身份）

## 3. 输入字段（仅用提炼后内容）
- 标题 / 主题：{title_or_topic}（有标题逐字保留）
- 副标题（可空）：{subtitle}
- 一句话语境：{summary}
- 视觉主体：{visual_subject}
- 受众：{audience}
- 情绪基调：{mood}
- 视觉隐喻（可空）：{metaphor}
- 禁用元素：{banned_elements}

## 4. 四色方案（必须取自本期照片）
- C1 来源 {部位} → 用途：背景主色
- C2 来源 {部位} → 用途：文字 / 标题
- C3 来源 {部位} → 用途：强调 / 点缀
- C4 来源 {部位} → 用途：辅助 / 描边底托
- 同色族派生：{派生说明}

## 5. 真人抠图与构图
- 人物保护区：{位置、景别、占比}
- 抠图：从原环境抠出，保留摄影质感，不复制原背景
- 标题区：{位置、断行、文字路径}
- 留白与阅读方向：{按画幅重写}

## 6. 风格落地
{把所选 STYLE.md 的字形 / 材质 / 标题载体 / 装饰语言改写为本封面的具体执行}

## 7. 图文关系
{标题与人物是咬合还是叠加；遮挡关系；背景大字是否启用}

## 8. 字体与材质设计
{字高、字形、描边、底托、曲线、装饰——读 design-system.md}

## 9. 动作与表情
{按 person-remix.md 调整姿势 / 手势 / 朝向 / 视线 / 情绪，身份不变}

## 10. 色彩 / 材质 / 肌理
{主色、强调色、材质（纸/金属/玻璃/光）、肌理颗粒，全部落到四色方案}

## 11. 禁用约束
{通用避坑 + 所选风格特有 negative：标题错字/被挡/裁切、换脸、肢体畸形、
 AI-slop 指纹（多余手指、扭曲文字、假 logo）、低质拼贴、参考图残留}

## 12. 终检标准
{一眼认主题、二眼见人物；人脸身份跨版本一致；像刻意的人物封面而非通用插画}
```

## 参数-文案隔离规则（强制）

生图模型（Seedream / DALL-E / SD / Flux 等）无法区分 prompt 里的「技术参数」与「要渲染到图上的文字」——凡是裸文本都可能被当成可见文字画进图里。`#4FC3F7`、`60%`、`Source Han Sans Heavy` 这类符号化参数尤其容易被模型当字符串渲染。以下规则确保参数与文案在 prompt 里用**截然不同的语法形态**，模型一眼分清。

### 三层隔离

1. **参数自然语言化**（第一层，最有效，单独做可解决 80% 问题）
   - 四色方案里的 hex（C1–C4）→ 自然语言颜色名 + 来源描述。例：`C1 #1a2332` → `C1 取自照片背景的主色，dark navy blue`。hex 仅在四色方案段内部作记录用，不进 prompt 主体。
   - 人物占比 / 保护区百分比 → 方位词 + 量级分数 + 相对关系（见下「位置改写公式」）。
   - 字体名 → 通用描述，删括号注释。例：`(like Source Han Sans Heavy)` → `modern bold sans-serif`。
   - 括号 `()` 注释一律删除——括号内的串最易被模型当文字渲染。需补充说明时并入正文句子，不要用括号。

2. **文案显式标记**（第二层）
   - 所有要渲染到图上的文字，统一用 `「」` 包裹。如 `「公司落地AI，先从小事开始」`。
   - prompt 开头声明一句：`Render ONLY the text enclosed in 「」 as visible text. Everything else is visual description — do not render it as text.`

3. **全局隔离指令**（第三层，兜底）
   - prompt 结尾补一句：`Do NOT render any color codes, percentages, font names, or technical parameters as visible text.`

### 位置改写公式（强制）

百分比是构图的核心，但生图模型**不按「%」精确计算**——它按「元素间相对关系」构图。人物占比、标题区、留白比例一律改写成「方位 + 量级分数 + 相对关系」，既保留量级信息又给出构图关系，精度反而比纯百分比高。

| 原 prompt 写法 | 改成 |
|---|---|
| `人物占画面 60%，居中偏左` | `the person occupies the central-left zone of the canvas (roughly three-fifths), with the title block to the right of the figure` |
| `标题区占顶部 25%` | `the title sits in the upper portion of the canvas (about a quarter), above the figure's head` |
| `底部留白 15%` | `a thin strip of breathing space hugging the very bottom edge (about one-seventh)` |

要点：去 `%` 符号、用 `three-fifths / a quarter / one-seventh` 分数量级词、加「相对人物/标题/底边的关系」描述。人物与文字的遮挡关系务必写出"X 在 Y 之左/右/上/下"这种关系链。

### 颜色处理（强制，适配四色取自照片）

- 四色方案段里的 hex 仅供本期配色记录与派生计算用，**不得直接出现在 prompt 主体**；编译进 prompt 时一律转自然语言颜色名 + 来源描述（如 `dark navy blue, sampled from the photo's jacket`）。
- `STYLE.md` 配色段里的 hex 同样仅为风格定义参考值，不照搬进 prompt 主体。
- 若必须保留 hex 精度（极少需要），把所有 hex 集中到 prompt 末尾独立段，并标注 `PALETTE (reference only, do NOT render as text): C1 navy #1a2332, C2 white #F5F7FA, C3 cyan #4FC3F7, C4 grey #37474F`。
- 生图模型对 hex 的取色精度与自然语言颜色名基本持平，自然语言颜色名更可控——优先用自然语言。

## 使用纪律

- 四色必须来自本期照片，不照搬风格固定色值。
- 真人抠图、自由构图是全部风格共用的核心规则；风格只决定字形 / 材质 / 装饰。
- `{{...}}` 占位符全部替换；无对应占位符的细节并入最近栏目。
- 多版本：每个版本单独编译，保持人物 / 主题 / 标题 / 比例一致，但在字形、文字路径、人物与字的关系上拉开差异。
- 单版只出一张；多版本每版各一张独立图，不拼九宫格。
- prompt 文件内不写风格选择理由。
