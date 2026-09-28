---
name: 脚本结构化适配
version: 1.0.0
description: 脚本结构化适配（content-script-adapter）—— 把 markdown 脚本或纯口播文案，提取/补全口播全文/段落/字幕/元信息，输出结构化 script.json，作为视频生成全链的数据源头。支持标准 md 脚本与裸文案两种输入，自动检测分流。不碰视频、不碰模板包，只做结构化提取。当用户说「结构化脚本」「转 script.json」「准备视频数据」时调用。
compatibility: heyclaw
---

# content-script-adapter — 脚本结构化适配

> 把 markdown 脚本或纯口播文案，提取/补全成结构化 script.json，作为视频生成全链的数据源头。支持标准 md 脚本与裸文案两种输入，自动检测分流。不碰视频、不碰模板包，只做结构化提取。

---

## 做什么

下游视频生成（超会AI、jianying-editor）需要机器读的结构化数据。但输入来源有两类：

- **标准 md 脚本**（content-script-writer 输出）：含钩子/连读版/脚本正文/终稿等结构，解析既有段落提取
- **裸文案**（纯口播文本）：没走完整 script-writer 流程的一段文字，自动按句号/换行分段、估算时长、补全元信息

本 skill 是「结构化适配层」：两种输入都输出符合 `schema/script.json.md` 的 script.json。

**核心原则**：
- 不改写一个字——口播文本原样继承，分段只切不改字（裸文案模式也是切，不是改写）
- 只结构化，不碰视频/模板包/素材匹配
- `main_video_path` 留空占位——视频原片由超会AI（A 模式）或素材拼接（B/C 模式）后续生成后回填

---

## 输入 / 输出

**输入**（二选一）：
- 标准 md 脚本文件路径（content-script-writer 输出）
- 或一段纯口播文案文本（裸文案）
- audio_mode 指定（可选，默认 `A`）

> adapter 自动检测：含 `# 脚本：` 标题行 → 标准 md 模式；否则 → 裸文案模式

**输出**：
- `script_{脚本名或文案首句}.json`，落在输入文件同目录（裸文案模式下落在用户当前工作目录）
- 输出后明确告诉用户：「voiceover_fulltext 字段已准备好，可复制到超会AI 生成数字人视频；生成后把视频原片路径回填到 main_video_path 字段」

---

## 工作流程

### 第一步：检测输入格式并分流

1. 读取用户输入（文件路径或文本）
2. 检测格式：
   - 含 `# 脚本：` 标题行 → **标准 md 模式**，走第二步起的 md 提取流程
   - 不含上述标记的纯文本 → **裸文案模式**，跳到「## 裸文案模式」章节处理
3. 标准 md 模式下若缺连读版/终稿/脚本正文任一，提示用户先回 content-script-writer 补全；裸文案模式不校验这些

### 第二步：提取 script_meta（头部元信息）

从 md 脚本头部提取：

| script.json 字段 | md 脚本来源 |
|------------------|-----------|
| `title` | `# 脚本：[标题]` 行的方括号内容 |
| `video_type` | `**视频类型**：[类型]` 行 |
| `estimated_duration_sec` | `**预计时长**：[XX秒]` 行，数字部分 |
| `target_platforms` | `**目标平台**：[抖音/小红书/...]` 行，按 `/` 拆成数组 |
| `source_script_path` | 输入 md 文件的相对路径 |

### 第三步：提取 voiceover_fulltext（口播全文）

**优先级**：连读版 > 终稿口播全文

1. 先找 `## 连读版` 段落：取 `> [连读版全文：...]` 的内容，**去掉 `〔接〕` 标记**，得到纯连续口播文本
2. 若无连读版，找 `## 终稿` 段落下的 `### 口播全文`：把各段口播按顺序拼接（去掉段间空行），得到连续文本
3. 若两者都没有，提示用户脚本不完整，停止

**注意**：voiceover_fulltext 是去 AI 味后的终稿口播，不是初稿。若 md 脚本只有初稿没有终稿，提示用户先回 content-script-writer 跑完去 AI 味步骤。

### 第四步：提取 scenes（段落列表）

从 `## 脚本正文` 段落提取。每段格式：

```
### 段落N：[段落名]（[起-止秒]）
**画面**：[画面描述]
**口播**：[逐字稿]
**过渡**：[接上/启下]
**事实状态**：🟢事实 / 🟡判断 / 🟠推测 / 🔴需验证
```

每段映射为一个 scene 对象：

| scene 字段 | 提取规则 |
|-----------|---------|
| `scene_id` | `s01`、`s02`... 按段落出现顺序递增 |
| `segment_name` | 段落标题的方括号内容（钩子/正文1/正文2/CTA 等） |
| `start_sec` / `end_sec` | 段落标题括号里的秒数（如 `0-3` → start=0, end=3）。若 md 只标段落名没标秒数，按口播字数 ÷ 4.5 字/秒估算 |
| `voiceover_text` | `**口播**：` 行后的逐字稿 |
| `subtitle_text` | 默认 = voiceover_text。若口播过长（>20 字），可精简为字幕版，但**初版默认相等**，精简留给人工在剪映里调 |
| `visual_desc` | `**画面**：` 行后的内容 |
| `fact_status` | `**事实状态**：` 行，把 emoji 转成文字（🟢→事实、🟡→判断、🟠→推测、🔴→需验证） |

### 第五步：填入模板包引用与可选字段

- `template_pack`：若用户指定模板包名则填，否则默认 `default_9_16_v1`
- `bgm_ref` / `cover_ref`：默认留空（用模板包默认 BGM/封面）。用户指定则填
- `hashtags`：从 md 的 `## 话题标签` 行提取，`#标签` 拆成数组
- `cta_type`：从脚本正文 CTA 段的 `**CTA类型**：` 行提取
- `material_query`：A 模式留空数组。B/C 模式预留——从各段 `visual_desc` 抽取素材需求词

### 第六步：填 audio_mode 与 main_video_path 占位

- `audio_mode`：按用户指定（A/B/C），默认 A
- `main_video_path`：**留空字符串 `""`**。这是给超会AI/素材拼接回填的占位

### 第七步：输出 script.json 并告知后续

1. 把以上所有字段组装成符合 `schema/script.json.md` 的 json 对象
2. 写入 `script_{原脚本名}.json`，落在 md 脚本同目录
3. 输出后明确告知用户：
   - 「script.json 已生成：[路径]」
   - 「A 模式下一步：复制 voiceover_fulltext 字段到超会AI 生成数字人视频原片」
   - 「生成后，把视频原片相对路径回填到 script.json 的 main_video_path 字段」
   - 「**回填后必须先跑时间轴校准**（下一步说明），再调用 jianying-editor 组装剪映工程」

### 第七步半：时间轴校准（必做，A模式视频回填后）

**为什么必须**：script.json 的段落时间轴是 adapter 按"字数÷4.5字/秒"**估算**的，但超会AI用自己的语速生成视频，实际时长与估算不一致（如估算30.6s vs 实际25.5s）→ 不校准则字幕/B-roll 与主轨画面全部错位，且尾部字幕超出视频。

**怎么做**：

```bash
python3 skills/content-script-adapter/scripts/align_scenes.py \
  --media <数字人视频或口播音频> \
  --script <script.json> \
  --output <校准后script.json> \
  --model small
```

原理：whisper 识别数字人口播音频取**字级时间戳** → 与 script.json 的文案做字符级对齐（difflib，容忍错字漏字）→ 回填每段真实 start_sec/end_sec → 段间无缝衔接。

- 校准后 script.json 带 `_time_aligned: true` 标记，后续 match/fill 都用它
- 对齐率 <60% 时脚本会警告（检查文案与视频语音是否一致）
- whisper 模型默认 small（已缓存 ~/.cache/whisper/），长视频可换 medium 更准

**链路完整顺序**：裸文案 → adapter（估算时间轴）→ 超会AI生成视频 → **align_scenes.py 校准** → match_materials.py → fill_draft.py

---

## 裸文案模式

当输入是一段纯口播文案（没走 content-script-writer 完整流程）时走此模式。adapter 自动补全缺失字段，让裸文案也能进视频生成链路。

### 触发条件

输入不含 `# 脚本：` 标题行，且是纯文本（可含换行，但无 md 脚本的 `## 连读版` / `## 脚本正文` 等结构标记）。

### 处理流程

1. **元信息补全**（用户未提供则用默认值）：

| script.json 字段 | 裸文案模式取值 |
|------------------|---------------|
| `title` | 取文案首句前 15 字，或用户指定，默认「未命名脚本」 |
| `video_type` | 默认「旁白视频」（A 模式数字人主要口播） |
| `estimated_duration_sec` | 按总字数 ÷ 4.5 字/秒 估算 |
| `target_platforms` | 默认 `["抖音"]` |
| `source_script_path` | 留空（无源 md 文件） |

2. **voiceover_fulltext**：整段文案去首尾空白，作为口播全文。**不改一个字**

3. **自动分段**（scenes）——核心原则：**一句文案 = 一个段落 = 一个画面点 = 一个素材片段**：

   - 优先按**换行符**分段：每行一段，**无论多少行都不合并**（用户按行写文案时，每行就是一个画面点）
   - 无换行的长文案：按**句号/问号/叹号**切句，**一句一段**（不合并）
   - **冒号 `：`/分号 `；` 也切**：冒号后通常是新的画面点（如"超会AI 就是干这个的：你把卖点讲清楚"应切成"超会AI 就是干这个的" + "你把卖点讲清楚…"两段）
   - **长句的逗号也切**：单段字数 >15 字且含逗号时，按逗号进一步细切（让每段≤8秒）；短句的逗号不切（如"老板最头疼的，内容跟不上"4+5字不切）
   - 唯一合并规则：单段估算时长 < 1.5 秒（约7字以下）的短句，与相邻段合并（避免素材切换过碎）
   - **不设段数上限**：1分钟文案自然切成 8-15 段是正常的，每段 3-8 秒
   - 每段 `scene_id` 递增 s01/s02...，`segment_name` 用「正文1/正文2/...」或首句关键词

   ⚠️ **2026-09-28 流程执行纠偏**：跑裸文案模式时不得简化为"只按句号切"——曾出现把 11 个分句的文案压成 5 段（冒号/逗号被合并）导致下游 match 只配出 2 段素材的故障。必须按上述"句号+冒号+分号+长句逗号"四级切分执行。

4. **时长估算**：
   - 每段 `start_sec` / `end_sec` 按该段字数 ÷ 4.5 字/秒累加
   - 第一段 start=0；后续段 start = 上一段 end

5. **字幕**：`subtitle_text` = `voiceover_text`（初版相等，精简留剪映人工调）

   **分段粒度为什么重要**：下游 match_materials.py 按段落配素材——素材片段时长 = 段落时长（如段落3秒，素材只截3秒，不用素材全长10秒）。段落粗（如70秒一段）会导致：①一条字幕堆满屏 ②一个素材铺满整段 ③画面无节奏。所以宁细勿粗，一句一段是默认。

6. **画面/事实状态**：`visual_desc` 留空（A 模式不驱动素材）；`fact_status` 留空（裸文案未经事实标注流程）

7. **其余字段**：`template_pack` 默认值；`hashtags` / `cta_type` 留空；`audio_mode` 按用户指定默认 A；`main_video_path` 留空占位

8. **输出**：`script_{首句关键词}.json`，落在用户当前工作目录

### 质量提醒（必须告知用户）

裸文案模式**跳过了 content-script-writer 的几个关键步骤**，质量可能打折：

| 跳过的环节 | 影响 |
|-----------|------|
| 去 AI 味（qu-ai-wei） | 文案可能有 AI 腔，数字人念出来会暴露 |
| 事实标注 | 无 🟢🟡🟠🔴 标记，发布前需人工复核事实 |
| 首尾融合/段落衔接 | 分段是机械切分，过渡可能生硬 |
| 补录提示 | 无补录清单，拍摄时可能漏料 |
| 钩子设计 | 无钩子方案，裸文案开头未必抓人 |

**建议**：裸文案模式适合「快速验证数字人效果」「内部测试片」「不重要的口播内容」。正式发布的成片，仍建议走完整 content-script-writer 流程再进 adapter。

---

## 解析容错

md 脚本可能存在的格式偏差，按以下规则容错：

| 偏差 | 处理 |
|------|------|
| 缺 `## 连读版` 但有 `## 终稿` | 用终稿口播全文拼成 voiceover_fulltext |
| 段落标题没标秒数 `（3-15秒）` | 按 voiceover_text 字数 ÷ 4.5 估算 start/end |
| 段落数 ≠ 5（钩子+3正文+CTA） | 按实际段落数提取，不强凑 5 段 |
| `**口播**` 行缺失 | 该 scene 的 voiceover_text 留空，subtitle_text 也留空，标注 `"_warning": "口播缺失"` |
| 有 `## 补录清单` / `## 事实核验清单` | 不进 script.json（这些是过程信息，不进结构化数据） |

---

## A / B / C 模式分流

本 skill 支持 audio_mode 字段的 A/B/C 三种值，但**只负责填这个字段**，不负责下游分流：

- **A 模式（数字人出镜）**：voiceover_fulltext 是核心输出字段，喂超会AI。main_video_path 留空等回填
- **B 模式（素材拼接+AI旁白）**：voiceover_fulltext 喂 narrate_tts 生成旁白音频轨（见下「模式B 旁白合成」）；material_query 填素材需求词喂 matcher
- **C 模式（素材拼接+字幕）**：无配音，voiceover_fulltext 仍可作为字幕参考；material_query 填素材需求词

A 模式当前优先落地。B/C 模式的 material_query 提取规则待补（需要 content-material-matcher 的查询语法定下来后回填）。

### 模式B 旁白合成（narrate_tts + 声音库）

模式B = 素材主轨 + AI 旁白配音（无数字人）。旁白用 edge-tts（微软在线TTS，音质接近真人），内置4种中文音色可选。

**何时用**：模式B（无数字人视频，用素材画面 + AI配音旁白）。C 模式不需要旁白。

**声音库**：

| 别名 | voice id | 性别 | 适用 |
|------|----------|------|------|
| 晓晓 | zh-CN-XiaoxiaoNeural | F | 女声温暖，通用口播首选（默认） |
| 晓伊 | zh-CN-XiaoyiNeural | F | 女声甜美，生活/美业 |
| 云希 | zh-CN-YunxiNeural | M | 男声年轻，品牌口播 |
| 云扬 | zh-CN-YunyangNeural | M | 男声成熟，新闻主播感 |

**用法**：

```bash
# 查看声音库
python3 scripts/narrate_tts.py --list-voices

# 用「云扬」音色合成（默认晓晓）
python3 scripts/narrate_tts.py \
  --script script_xxx_aligned.json \
  --output-dir narration/ \
  --voice 云扬 \
  --rate +0% \
  --volume +50%
```

**参数**：
- `--voice`：音色别名（晓晓/晓伊/云希/云扬）或 edge-tts 完整 id（zh-CN-xxxNeural），默认晓晓
- `--rate`：语速，edge 用百分比 `+10%`/`-10%`（默认 `+0%`）；`0`=默认
- `--volume`：edge-tts 音量增益，默认 `+50%`（旁白视频需清晰可辨；如仍嫌小可 `+100%`/`+150%`）；`+0%`=原始音量
- `--engine`：`edge`（默认，在线音质好）/ `say`（macOS 本地，断网 fallback，音色用 Tingting 等）
- `--list-voices`：列出声音库后退出

**输出**：
- `narration/s01.mp3, s02.mp3, ...`（每段一个音频；edge 引擎输出 mp3，say 引擎输出 m4a）
- `script_xxx_aligned_narrated.json`：时间轴已按各段实际音频时长重排（前段结束=下段开始），新增 `narration_audio` 字段指向每段音频。**路径前缀 = `--output-dir` 的 basename**（2026-09-28 修复：原写死 `narration/` 前缀，传别的 output-dir 时 fill_draft 找不到音频；改为 `os.path.basename(os.path.normpath(output_dir))`，路径与实际目录名一致）

**原理**：逐段独立合成 → ffmpeg 读实际时长 → 累计重排时间轴（不需要 whisper 对齐，TTS 语速与估算不一致，分段独立合成最准）。

**链路（模式B完整顺序）**：
裸文案 → adapter（估算时间轴）→ **narrate_tts.py 合成旁白 + 重排时间轴** → match_materials.py（--mode C，按旁白时间轴配素材）→ fill_draft.py（--mode B，素材主轨 + 旁白音轨）

**断网 fallback**：edge-tts 需联网。断网时用 `--engine say --voice Tingting` 退回 macOS 系统音色（音质偏机械，应急可用）。

---

## 注意事项

1. **不改写口播文本**：voiceover_text / voiceover_fulltext 必须原样提取，不改字、不调语序。改写是 qu-ai-wei 和 content-script-writer 的事，adapter 只搬运
2. **产物落 md 脚本同目录**：不落 skill 目录、不落临时目录。用户在哪个目录跑 adapter，json 就落在 md 脚本旁边
3. **main_video_path 必须留空**：adapter 不碰视频文件。即便用户已经先有视频，也让用户手动回填或由导演 skill 协调——adapter 的职责边界是「只解析 md」
4. **字幕初版 = 口播**：subtitle_text 默认等于 voiceover_text。字幕精简是剪映里人工调的事，adapter 不替用户做
5. **schema 以 `schema/script.json.md` 为准**：本 skill 输出必须符合该 schema。schema 升级时，本 skill 跟着更新
