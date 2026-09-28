---
name: 剪映工程组装
version: 1.0.0
description: 剪映工程组装（jianying-editor）—— 读 script.json + 剪映模板 draft_content.json，把数字人视频 + 口播字幕 + BGM + 封面填进模板槽位，输出本地可编辑的剪映工程（draft_content.json + draft_info.json），由剪映 Desktop 打开微调导出。技术性 skill，不创作内容，做格式组装与时间轴换算，含模式A素材决策脚本（match_materials.py，选择性插入B-roll，非全覆盖）。当用户说「组装剪映工程」「生成 draft」「填槽」「素材匹配」时调用。
compatibility: heyclaw
---

# jianying-editor — 剪映工程组装

> 读 script.json + 剪映模板 draft_content.json，填槽组装成本地可编辑的剪映工程。技术性 skill，不做内容创作，只做格式组装与时间轴换算。基于 v7 实战跑通经验固化（7 轮调试），含全部坑点修复。

---

## 做什么

上游交付物（script.json + 数字人视频 + 剪映模板草稿目录）进来，本 skill 把它们组装成一个**本地可编辑的剪映工程目录**——不是成片，是工程。用户用剪映 Desktop 打开这个工程，微调后导出成片。

**核心原则**：
- 只组装，不渲染——最终渲染靠剪映 Desktop（人工步骤）
- 只填槽，不设计——转场/动画/BGM/封面由模板锁定，本 skill 只把素材填进模板预留的轨道槽位
- 时间轴换算——script.json 用秒，剪映 draft 用微秒（1 秒 = 1,000,000 微秒），本 skill 负责换算
- A 模式素材决策——配 match_materials.py 做选择性插入（模式A：有些段保留原数字人口播画面，有些段配素材画面），输出 assets.json 带 use_original 标记 + clips 数组（多素材拼接），fill_draft.py 据此决定插不插 B-roll 及多个 segment 拼接。**非全覆盖**（区别于模式C纯素材整合）。长段落（如1分钟+）支持多素材按时长拼接铺满，铺不满的尾部露原视频（模式A）或标缺口（模式C）

---

## 输入 / 输出

**输入**（命令行参数）：

```
python3 fill_draft.py \
  --template <模板草稿目录>      # 含 draft_content.json + 素材子目录
  --script <script.json>         # 含 scenes 字幕 + start_sec/end_sec
  --video <数字人视频.mp4>        # 超会AI 生成的数字人视频原片
  --output <输出草稿目录>         # 落到剪映草稿目录
  [--voice <口播音频.m4a>]        # 不传则自动 afconvert 从视频抽取
  [--cover <封面图.jpg/png>]      # 不传则保留模板原封面
  [--bgm-volume 0.3]              # BGM 音量，默认 0.3（旁白视频背景用，不盖人声）
  [--narration-volume 2.0]        # 旁白音轨增益，默认 2.0=200%（模式B，压过 BGM；剪映里仍可手动微调）
  [--no-voice-track]              # 跳过口播独立音轨（主轨音频未剥离时用）
  [--assets <assets.json>]        # 素材匹配结果（match_materials.py 输出，选择性插入 B-roll）
```

**输出**：
- 剪映草稿目录（落在剪映草稿根目录下，可直接打开）
  - `draft_content.json`（填槽后的明文剪映 draft）
  - `draft_info.json`（draft_content.json 的副本，Mac 版剪映 10.x 只认这个文件名打开）
  - `video/digital_human.mp4`（数字人视频复制进来）
  - `audio/digital_human_voice.m4a`（口播音频，仅 audio 自检判定需要时）
  - `draft_cover.jpg` + `draft_local_cover.jpg`（封面替换，仅 --cover 传入时）
- 输出后明确告诉用户：「草稿已生成：[路径]。下一步跑 fix_draft_for_local.py 适配 → Cmd+Q 退出剪映 → 重开 → 打开草稿」

---

## 前置依赖

1. **剪映 Desktop**：Mac 版剪映专业版 10.x（测试版本）。Windows 版差异见下文「跨平台差异」
2. **模板草稿目录**：含明文 `draft_content.json` + 素材子目录（video/ videos/ audio/ audios/）。由 content-template-pack 抽取或直接用第三方明文模板
3. **script.json**：由 content-script-adapter 生成，含 `scenes` 数组（每段有 `start_sec` / `end_sec` / `subtitle_text` / `segment_name`）
4. **数字人视频**：超会AI 生成的视频原片（含画面 + 口播音频流）。用户手动从超会AI 下载后传入
5. **口播音频（可选）**：若主轨音频被"音频分离"剥离（见下文），需要独立口播音频。不传 --voice 时自动用 macOS `afconvert` 从视频抽取
6. **素材库目录**（模式A/B/C 都需要）：含 `_索引表.csv` + 素材文件子目录。`match_materials.py --library` 必传，目录不存在直接报错退出。**跑流程前必须先问用户素材库路径**，避免用户有素材但 AI 不知道路径导致 ip_direct/narrative 段（口播/叙事性质）全保留原视频——这会让模式A的素材插入段为 0，违背"选择性插入"的设计目的

---

## 剪映 draft 机制（实战踩坑总结）

### 文件三态

| 文件 | 作用 | 加密状态 |
|------|------|---------|
| `draft_content.json` | 剪映 draft 主体（tracks/materials/canvas_config） | 明文（剪映从不加密它） |
| `draft_info.json` | Mac 版剪映 10.x 打开草稿的入口文件 | **剪映打开后会加密**（密文，密钥存 crypto_key_store.dat） |
| `draft_meta_info.json` | 草稿元信息（draft_id/name/path/version） | **剪映打开后会加密** |

**关键规则**：
- **填槽必须在 draft_content.json 上做**（明文可操作），不能碰 draft_info.json（可能加密）
- **填完后 cp draft_content.json → draft_info.json**（让 Mac 版剪映能打开）
- **删复制来的 draft_meta_info.json**，让 fix_draft_for_local 从头生成明文版（避免加密残留字段干扰）
- 剪映打开草稿后会自己加密 draft_info.json + draft_meta_info.json，但**不碰 draft_content.json**——下次填槽仍可用明文 draft_content.json

### 路径占位符格式

剪映 draft 里素材 path 用占位符格式：`##_draftpath_placeholder_<UUID>_##/<子目录>/<文件名>`

**严格规则**（踩坑修复）：
- 占位符是**单下划线** `_##`（不是双下划线 `__##`）——双下划线会导致剪映解析失败，素材全部离线
- 路径分隔符必须用**正斜杠** `/`（Windows 版导出的模板可能是反斜杠 `\audio/`，Mac 版剪映不认）——fill 脚本有全局兜底把所有反斜杠转正斜杠

### 音频分离机制

Windows 版剪映对原视频做「音频分离」时，会把原声抽成独立 m4a 放音频轨，**主轨视频的音频信息被彻底剥离**——主轨 `volume=0.0` 只是表象，改成 1.0 也救不回来。

**判断方法**（audio 自检，在 fill 主轨前做）：
- 主轨 segment `volume=0.0` → 可能音频被分离
- segment 的 `extra_material_refs` 引用了 `type=video_original_sound` 的 audio material → 确认音频已分离
- 主轨 material `has_audio=False` → 音频被标记为无

**解决方案**：照抄模板的分离模式——afconvert 抽数字人音频为独立 m4a + 加 extract material（video_id 关联主视频）+ 加独立 audio track 承载口播。

---

## 工作流程

### 第零步：前置确认（跑流程前必做）

1. **素材库路径**：问用户素材库目录在哪（含 `_索引表.csv` + 素材文件）。模式A/B/C 都需要——`match_materials.py --library` 不传会报错退出，传错路径会导致素材匹配全失败、模式A 整段保留原视频。**不要假定默认路径**，每次都问。
2. **数字人视频路径**（模式A必需）：问用户从超会AI 下载的数字人视频原片在哪。模式B/C 不需要。
3. **BGM 文件路径（可选）**：模板根 `assets/bgm.m4a` 自带 BGM，不传 `--bgm` 时自动用模板自带的。仅当用户想换不同 BGM 才需传入外部文件路径。
4. **script.json 来源**：模式A 用 `script_xxx_aligned.json`（whisper 校准过）；模式B/C 用 `script_xxx_narrated.json`（TTS 重排过）。两者 scenes 的 start_sec 不同，不能混用。

### 第一步：读入并校验

1. 读 script.json，校验 `scenes` 非空
2. 读视频时长（afinfo → mdls 兜底），转微秒
3. 复制模板全目录到输出草稿目录
4. 删复制来的 `draft_meta_info.json`（让 fix 从头生成明文）
5. 复制数字人视频到草稿 `video/` 子目录
6. 替换封面（如传入 --cover）

### 第二步：兼容检查

```
check_template_compatibility(d):
  必需顶层字段：canvas_config / tracks / materials / duration
  必需 track：attribute=1 的 video track（主轨）
  推荐 track：text track（字幕）、audio track（BGM）
  主轨 material type=photo → 警告（图片模板，填 video 特效可能不兼容）
```

检查不通过时明确报错（缺哪个字段/缺哪条 track），不强行填。

### 第三步：分类 tracks

按 track 用 `classify_track(t)` 动态识别（**双契约兼容**）：

**新版剪映 10.x 模板**（type=mixed）优先看 `_SLOT` 标记：
- `_SLOT=SLOT_MAIN_VIDEO` → 主轨（segments 空 + 有 `_template_seg` 模板段）
- `_SLOT=SLOT_SUBTITLES_NORMAL` → 字幕轨
- `_SLOT=SLOT_SUBTITLES_HIGHLIGHT` → 标题轨（花字段槽位, 置顶展示标题）
- `_SLOT=SLOT_SFX` → 音效轨
- `_SLOT=SLOT_BGM` → BGM 轨

**旧版剪映模板**（type=video/text/audio）兜底看 type+attribute：
- `type=video, attribute=1` → 主轨
- `type=text` → 字幕轨（取第一条）
- `type=audio, attribute=1` → BGM 轨
- `type=audio` → 音效轨
- 其他 → 清空 segments

新版模板 segments 空时用 `_template_seg` 字段取模板段（`get_template_seg(track)`），兼容 default_v1 这类只声明槽位不带真实段的结构。

### 第四步：audio 自检（在填主轨之前）

```
check_main_track_audio(d, main_track):
  if volume == 0.0 → 需要独立音轨（音频可能被分离）
  if extra_material_refs 引用 video_original_sound → 需要独立音轨
  if has_audio == False → 需要独立音轨
  else → 主轨音频正常，跳过
```

**必须在 fill_main_track 之前做**——fill 会改 volume，改后就读不到原始值了。
新版模板 segments 空时用 `get_template_seg()` 取模板段做检查, 不强求 segments 已有内容。

### 第五步：填主轨

| 字段 | 改法 | 为什么 |
|------|------|--------|
| material path | `##_draftpath_placeholder_<ID>_##/video/digital_human.mp4` | 单下划线占位符 + 正斜杠 |
| material duration | 视频实际时长（微秒） | afinfo 读的真实值 |
| material width/height | mdls 读的真实分辨率 | 不写死 1080×1920 |
| material type | `video`（确保不是 photo） | 图片模板填 video 时改 |
| segment target_timerange | `tr(0, 视频时长)` = `{duration, start, offset}` 同值 | **新版剪映 10.x 用 start 定位, offset 被丢弃 → 必须 tr() 双写** |
| segment source_timerange | `tr(0, 视频时长)` | 同上 |
| segment volume | `1.0`（308 原是 0.0 静音） | 恢复数字人音频 |
| segment speed | `1.0`（308 原是 0.8 慢放） | 避免变速导致音频异常 |
| segment extra_material_refs 引用的 speeds material | speed → 1.0, mode=0, curve_speed=None | **剪映优先以 speeds material 为准**，segment.speed 只是冗余展示值 |

### 第六步：填字幕轨（合并版强化）

`fill_subtitle_track()` 增强为 4 项能力:

1. **字幕细切**(`split_subtitles`): 按句末标点+逗号切, 短句(<6字)合并, 避免碎行; 比 adapter 的"一句一段"更适合短视频字幕
2. **ASR 精确对齐**(`asr_line_timings`): whisper 逐词时间戳 + SequenceMatcher 实义字对齐 → 每行起点=该行首字说出口的时刻
   - 三级兜底: whisper ASR(主) → silencedetect 停顿DP(二级) → 字数均分(末)
   - 需要本机装 openai-whisper + whisper_asr.py 助手脚本(已带)
3. **每段独立 material**(`clone_text_material`): 修复原 fill_draft bug(N 段共享同一 material_id → 全部显示最后一段文字)
4. **行内关键词高亮**: 白色样式盖全行 + 黄色样式只盖关键词区间(多 styles)
   - `find_keyword_ranges(line)` 用 KEYWORD_LEXICON 词库识别(营销+养生两类)
   - 黄色样式从模板花字段(SLOT_SUBTITLES_HIGHLIGHT)的 text material 抽取
   - `--keyword-mode off` 可关闭高亮

字幕段 target_timerange 必须用 `tr()` 双写 start+offset, 否则新版剪映会丢弃 offset 导致所有段堆到第0秒。

### 第六步半: 填标题轨（新增）

`fill_title_track()` 用花字段槽位 SLOT_SUBTITLES_HIGHLIGHT 填主标题:

- 位置: `clip.transform.y = +0.72`(本版剪映 y 正值=向上, hk 顶部分段标题 y=+0.73)
- 大小: `clip.scale = 1.0/1.0`(归一, 花字原 scale 1.33/1.556 是给短关键词放大用的, 套长标题会拉变形)
- 字号: `TITLE_SIZE=15`(模板素材原始 size=10, scale 归一后用字号放大)
- 时长: 默认 `min(12s, 45%片长)`, 让标题持续展示一段时间(不是字幕闪过)
- 长标题: `title_two_lines()` 超 8 字居中拆两行, 不拆断英文/数字词(如"超会AI")
- 文本来源: `--title` 显式指定(优先, 标题是独立主题标题不是文案第一句), 兜底 `generate_title()` 从第一句提取

### 第七步：填 BGM 轨

- BGM material duration **保持原值不动**（不改成视频时长——超出部分无数据=静音）
- BGM path 反斜杠→正斜杠
- **多 segment 拼接循环**（BGM 短于视频时）：
  - 每段 speed=1.0（避免变速铺满——剪映 `speed = source/target`，不等会变慢）
  - 前段取完整 BGM 时长，后段取剩余补齐
  - 每段生成新 uuid id
- BGM 长于视频时单段即可
- **`--bgm` 参数支持**：传入真实 BGM 文件(bgm.m4a), fill 复制到草稿 audio 子目录 + 改 BGM material path 为占位符 + probe 真实时长。**未传 --bgm 时自动探测模板根 `assets/bgm.m4a`（或 bgm.mp3）并复制到草稿 audio/**，自动用作 BGM 源（V10 修复：default_v1 模板的 BGM 在 `templates/default_v1/assets/bgm.m4a`，但 draft_content.json 里没 BGM material 引用它，原来必须靠 --bgm 传外部文件，现在自动用模板自带的）。
- **BGM 轨 attribute=1 必须清 0**（hk 模板继承的静音标记坑, 不清 0 BGM 没声音）

### 第七步半: 填音效轨（新增）

`fill_sfx_track()` 保留模板音效素材 + segments 重排到分句切换点（**模式 A/B/C 都跑**，2026-09-28 实测坑：原只 A/B 跑导致模式C保留模板原始音效位置，既不对应文案也不对应场景切换）:

- 收集模板音效素材 material_id(去重保序)
- 切换点: 每个 scene 起点(从第2段开始, 第1段开头不加音效避免压口播第一句)
- 模式A/B: 切换点=分句起点（画面=数字人+素材插入点）; 模式C: 切换点=素材段起点（素材主轨每段=一个scene，同一组时间点）
- 用 scenes 的 start_sec(align_scenes 已校准为 ASR 真实时间)
- 不够循环用(每个切换点用 1 个音效, % 循环)

### 第八步：新增口播独立音轨（仅 audio 自检判定需要时）

- afconvert 抽数字人音频为 m4a（用户传入或自动抽取），复制到草稿 `audio/` 子目录
- `materials.audios` 加 extract 素材（`type=extract`, `video_id` 关联主视频 material id）
- `materials.speeds` 加 speed=1.0 素材
- 新增 audio track（1 segment 0~视频时长, volume=1.0, speed=1.0）
- segment 的 `extra_material_refs` 引用新建的 speed material

### 第八步半: 填 B-roll 素材轨（合并版强化）

`add_broll_track()` 保留 match_materials 的模式 A/B/C 决策逻辑:

- 读 assets.json 的 b_rolls 数组, 每段带 `use_original` 标记 + `clips` 数组
- `use_original=true` 的段保留原视频画面(模式A), 不插素材
- `use_original=false + clips` 数组: 遍历 clips, 每个 clip 生成一个 segment
  - `target_timerange` 用 `tr(scene_start + clip.target_offset, clip.seg_duration)` 双写 start+offset
  - `source_timerange` 用 `tr(clip.clip_start, source_dur)` 双写
  - 多 clip 在段落内按 target_offset 连续拼接, 铺不满的尾部主轨画面露出(模式A)
- `clip.scale` 用 `broll_scale_for_fit(w, h)` 算: 横屏素材塞竖屏画布, 高度填满左右裁掉(短视频审美)
- segment `volume=0.0` 静音(不抢数字人口播音频)
- 模式 A(is_main=False): B-roll 覆盖轨 attribute=0, 叠在主轨上方
- 模式 B/C(is_main=True): B-roll 做主轨 attribute=1, 纯素材拼接无数字人
  - **必须加 `_SLOT=SLOT_MAIN_VIDEO` 标记**（2026-09-28 实测坑）：新建主轨无标记会被剪映当普通视频轨，字幕/标题轨不渲染
  - **必须 `insert(0)` 到 tracks 数组开头**（2026-09-28 实测坑）：剪映 tracks 数组越靠后层级越高，append 到末尾会跑到最上层盖住字幕/标题轨；insert(0) 放回模板原主轨位置（最底层）
- 模式 B: 同模式 C 但加 TTS 旁白音轨(`add_narration_track`)

**合并版关键**: B-roll 时间戳跟随 align_scenes ASR 校准后的 scenes 真实时间走, 不用 script.json 估算时间。

### 第九步：收尾

- 清空其他轨 segments（音效轨/标题轨已分别处理, 不再这里清）
- 顶层 duration → 视频时长
- 全局兜底：所有 material path 反斜杠→正斜杠
- 写回 draft_content.json
- cp draft_content.json → draft_info.json
- 提示用户跑 fix_draft_for_local.py 适配

---

## 合并来源说明（2026-09-28 固化）

本 fill_draft.py 是 **fill_draft.py（标准A/B/C模式B-roll决策）+ fill_template.py（ASR对齐+标题+关键词高亮）合并版**:

- **保留 fill_draft 原生**: A/B/C 模式 + script.json/assets.json 契约 + `add_broll_track` 多素材拼接 + `add_voice_track` 音频分离 + `add_narration_track` TTS 旁白
- **从 fill_template 搬过来**: `split_subtitles` 细切 / `asr_line_timings` ASR对齐 / `find_keyword_ranges` 行内高亮 / `fill_title_track` 标题置顶 / `fill_sfx_track` 音效重排 / `broll_scale_for_fit` 横屏塞竖屏
- **修复 fill_draft 原 bug**: 字幕轨 N 段共享同一 material_id(全部显示最后一段) → 每段独立 material
- **修复新版剪映兼容**: target_timerange 用 `tr()` 同时写 start+offset(原只写 offset 被剪映丢弃 → 素材堆第0秒)
- **fill_template.py 已删除**(2026-09-28), 不再有两套填槽实现

---

## 衔接关系

| 上游 skill | 提供什么 |
|-----------|---------|
| content-script-adapter | script.json（scenes 含字幕文本+时间戳） |
| content-template-pack | 模板草稿目录（含明文 draft_content.json + 素材） |
| 超会AI（外部系统） | 数字人视频原片（含画面+口播音频） |

| 下游 | 做什么 |
|------|--------|
| fix_draft_for_local.py | 适配本机剪映（路径/id/版本/meta 重建/索引注册） |
| 剪映 Desktop（人工） | 打开草稿 → 微调 → 导出成片 |

---

## 跨平台差异

| 差异点 | Windows 版导出 | Mac 版导出 | 本 skill 处理 |
|--------|---------------|-----------|--------------|
| draft_info.json | 可能无此文件 | 有（剪映打开后加密） | fill 后 cp draft_content.json → draft_info.json |
| 素材 path 反斜杠 | `\audio/` 混合 | 全正斜杠 | 全局兜底反斜杠→正斜杠 |
| draft_fold_path | `E:/...` | `~/Movies/...` | fix_draft_for_local 修复 |
| 主轨音频分离 | 会做（剥离音频） | 一般不做 | audio 自检自动判断 |
| new_version | 54.0.0（旧版） | 141.0.0+ | fix_draft_for_local 对齐到 164.0.0 |

---

## 已知坑 + 修复方案（7 轮调试经验）

| # | 坑 | 症状 | 修复 |
|---|-----|------|------|
| 1 | 占位符双下划线 | 素材全部「媒体缺失」 | `_##` 单下划线（不是 `__##`） |
| 2 | Windows 反斜杠路径 | BGM 媒体缺失 | 全局反斜杠→正斜杠 |
| 3 | 主轨 volume=0.0 | 数字人音频静音 | volume → 1.0（但音频分离时不够） |
| 4 | 主轨 speed=0.8 | 音频被变速处理失败 | speed → 1.0 + speeds material 同步 |
| 5 | speeds material 未同步 | segment.speed 改了但没用（剪映以 speeds material 为准） | 遍历 extra_material_refs 同步改 |
| 6 | BGM 变速铺满 | BGM 被放慢而非循环 | 多 segment 拼接（每段 speed=1.0） |
| 7 | 音频分离剥离 | 改 volume/speed 都救不回来 | 独立口播音频轨（extract material + 独立 audio track） |
| 8 | draft_meta_info 加密 | Mac 版剪映打不开草稿 | 删复制来的 meta，让 fix 从头生成明文 |
| 9 | draft_id 不一致 | 剪映「草稿内容已损坏」 | fix 用全新 draft_id（meta/draft_content/索引三处一致） |

---

## 注意事项

1. **技术性 skill**：不写文案、不做创意判断，只做格式组装。和 content-script-writer / qu-ai-wei 性质不同，单独归类
2. **绑定剪映版本**：draft 格式随版本变。Mac 版剪映 10.x 测试通过，其他版本需跑兼容检查
3. **最终渲染靠剪映**：本 skill 输出的是可编辑工程，不是成片。剪映 Desktop 微调导出是人工步骤，本 skill 不替代
4. **占位符路径原则**：draft 里素材路径用 `##_draftpath_placeholder_<ID>_##/<dir>/<file>` 格式，绝不写本机绝对路径
5. **字幕时间戳是估算**：scene 的 start/end 秒按口播字数估算，实际数字人视频语速可能偏差。用户在剪映里微调字幕时间点是正常操作
6. **模板 locked 不动**：转场/调色/BGM 音量等模板锁定的设计项，本 skill 不修改。只填素材槽位
7. **特效走模板继承**：fill 保留模板原有特效/动画/转场，自动继承生效。不同效果=不同模板。程序化新增特效是后补能力

---

## 实际执行脚本

```
scripts/
├── fill_draft.py        # 主填槽脚本（参数化，含 audio 自检 + 兼容检查 + 全部坑点修复 + B-roll选择性插入）
├── match_materials.py   # 模式A素材决策引擎（三分类+内容驱动+不硬凑+ffprobe实测，输出 assets.json）
```

**调用示例**：

```bash
# 标准调用（数字人视频含音频，主轨未做音频分离）
python3 fill_draft.py \
  --template ~/Movies/JianyingPro/.../308-语录-月底再见 \
  --script ./script_xxx.json \
  --video ./digital_human.mp4 \
  --output ~/Movies/JianyingPro/User\ Data/Projects/com.lveditor.draft/草稿名

# 主轨音频被分离时（Windows 版模板常见）
python3 fill_draft.py \
  --template <模板目录> \
  --script <script.json> \
  --video <数字人视频> \
  --voice <口播音频.m4a> \
  --cover <封面图> \
  --bgm-volume 0.3 \
  --output <输出草稿目录>

# 模式A素材匹配（选择性插入，先跑 match 再 fill）
python3 match_materials.py \
  --script ./script_xxx.json \
  --library ~/Downloads/素材库 \
  --output ./assets_xxx.json

# fill 时带 --assets（use_original=true 的段保留原视频，不插 B-roll）
python3 fill_draft.py \
  --template <模板目录> \
  --script <script.json> \
  --video <数字人视频> \
  --assets ./assets_xxx.json \
  --output <输出草稿目录>

# fill 后必跑 fix
python3 ../content-template-pack/scripts/fix_draft_for_local.py <输出草稿目录>
```

---

## 模式A素材决策逻辑（match_materials.py）

模式A ≠ 模式C。模式C是纯素材整合（全覆盖，无原视频），模式A有原数字人口播视频（选择性插入）。

### 三层决策

| 层 | 判断 | 输出 |
|---|---|---|
| 第1层 文案性质三分类（内容驱动） | 看 subtitle_text 关键词：ip_direct（IP直视镜头）/ visual_aid（画面可佐证）/ narrative（口播叙事） | ip_direct+narrative → 保留原视频 |
| 第2层 素材能否承接（只对visual_aid段） | 文件存在性 + ffprobe实测时长≥段落×70% + 内容评分≥阈值 | 不达标 → 保留原视频（不硬凑） |
| 第3层 输出决策 | 每段带 use_original 标记 | fill_draft.py 据此决定插不插 B-roll |

### 数据契约（assets.json 每段结构）

- `use_original: true` → 保留原视频，不插 B-roll（fill_draft 跳过此段）
- `use_original: false` + `clips: [...]` → 插 B-roll 素材画面覆盖该段，**clips 是多素材拼接数组**：
  - 每个 clip 有 `material_id` / `clip_start_sec` / `clip_end_sec`（素材内截取范围）/ `target_offset_sec`（段落内偏移）/ `seg_duration_sec`（这段铺多久）
  - fill_draft 为每个 clip 生成一个 segment，按 `target_offset` 连续拼接，素材够长截取到剩余空间，不够用满素材后取下一个
  - 模式A：clips 铺不满段落尾部 → `tail_original: true`（剩余时间主轨画面露出）
  - 模式C：clips 铺不满段落尾部 → `gap: true` + `gap_duration_sec`（缺口标记，无原视频兜底）

### 继承 content-material-matcher 理念

- 不硬凑：最高分 < 阈值 → 保留原视频
- 文件存在性验证：不存在则跳过
- 可用片段利用：优先用索引表黄金片段截取（不从头盲截）
- 照片不参与视频段匹配：有原视频兜底，缺视频素材就保留原视频

### 通用素材兜底（模式B/C，2026-09-28 启用）

模式B/C 无原视频兜底，缺口段画面空白。`fallback_scene()` 从通用素材池填充：

- **通用素材池**：索引表第23列"通用素材"=是 且 素材类型=视频。由 `01_人物形象/`（口播画面）+ `02_场景环境/`（场景空镜）组成
- **按文案性质选偏好**（`classify_scene_nature` + `mode` 参数）：
  - 模式A/B（口播视频）：ip_direct 性质（钩子/CTA）→ `01_人物形象/` 口播画面优先（钩子是老板对镜头说话）
  - **模式C（展示类视频）：统一 `02_场景环境/` 优先**（展示类钩子/CTA 多是产品/场景，不是人对镜头——2026-09-28 修复：原不管模式都按 ip_direct 选口播画面，对展示类视频错误）
- 场景空镜不够才轮到口播画面（ordered 列表把非偏好放后面）
- 文件存在 + 实测时长 ≥ 段落×70% + 截取点顺延（`used_end_map` 避免相邻段重复画面）
- 输出 clips 带 `fallback: true` + `reason` 提示"建议人工替换为更贴切素材"

### 三个组件各归其位（互补，非替代）

- **content-material-library**（入库）：提供索引表基础数据 → 补 ffprobe 实测时长
- **content-material-matcher**（选题匹配）：选题级匹配大脑，理念已对 → 不改
- **match_materials.py**（本脚本）：继承 matcher 理念下沉到段落级 + 新增文案性质三分类

---

## 版本记录

| 版本 | 日期 | 改进 |
|---|---|---|
| V1 | 2026-09-21 | 基于 v7 实战经验固化：占位符单下划线、全正斜杠、volume=1.0、speed=1.0+speeds同步、BGM多段拼接、audio自检决策树、删meta让fix重建 |
| V2 | 2026-09-22 | 模式A素材决策升级：①新增 match_materials.py（三分类内容驱动+不硬凑+ffprobe实测+可用片段利用+照片不参与）②fill_draft.py 的 add_broll_track 加 use_original 判断（true的段保留原视频不插B-roll）③从"全覆盖"（模式C逻辑）改为"选择性插入"（模式A逻辑）④补充 content-material-library 入库时 ffprobe 实测时长 |
| V3 | 2026-09-23 | 多素材拼接升级：①match_materials.py 从"1段=1素材"升级为"1段=多素材按时长拼接"（按分数排序累加时长，素材够长截取到剩余空间，不够用下一个；模式A尾部不够露原视频，模式C标缺口）②fill_draft.py 的 add_broll_track 改为遍历 clips 数组生成多个 segment（target_timerange 按 scene起点+段落内偏移算，source_timerange 按素材内截取算）③解决长段落（1分钟+）单一素材无法覆盖的问题 |
| V4 | 2026-09-23 | 时间轴校准（必做步骤）：①新增 content-script-adapter/scripts/align_scenes.py——whisper 字级时间戳 + difflib 字符对齐，把 adapter 估算时间轴校准到数字人视频实际时间轴（估算30.6s vs 实际25.5s 会错位）②链路变为：裸文案→adapter→超会AI视频→**align校准**→match→fill ③配合 adapter 分段规则改为"一句一段"（素材片段时长=句子时长，素材全长65s只截句子对应的2-4s） |
| V5 | 2026-09-23 | 子片段标注+顺延：①parse_golden_clip升级为parse_sub_clips——解析索引表"可用片段"字段的多个子片段（格式`00:00-00:08(描述) \| 00:08-00:25(描述)`）②新增match_best_sub_clip——按句子内容匹配最合适的子片段截取（不只从头截）③同素材被相邻句选中时截取点顺延（used_end_map记录已用截取点，第二句从第一句之后开始，避免画面重复）④无子片段标注退回从头截（兼容旧索引表）⑤配合content-material-library V1.6（入库时AI子片段标注）+content-video-cutter V1.4（切片时AI子片段标注） |
| V6 | 2026-09-23 | 模式C通用素材兜底：①索引表新增第23列"通用素材"（是/否）——标记可复用的通用内容（人物口播/场景空镜），由content-material-library入库时标注②match_materials.py新增fallback_scene——模式C下精准匹配不到的段，从通用池按文案性质选兜底（ip_direct性质→人物形象类口播画面优先；narrative→场景环境类空镜优先），文件存在+实测时长≥段落×70%+截取点顺延③输出clips带fallback:true标记+reason提示"建议人工替换"④兜底仍无可用素材才标缺口。验证：9段全覆盖0缺口，钩子/CTA兜底R-01顺延不重复画面 |
| V7 | 2026-09-23 | 模式B（纯素材+AI旁白）落地：①新增content-script-adapter/scripts/narrate_tts.py——macOS say分段TTS合成（语音Tingting普通话），每段独立m4a，按各段实际音频时长重排时间轴（不需whisper校准，旁白时长=音频实测时长）②fill_draft.py新增--mode B + add_narration_track函数——模式B=模式C的素材主轨+旁白音轨（每段audio segment按scene时间偏移连续拼接，volume=1.0）③三模式定型：A=数字人+素材覆盖+口播音轨，B=纯素材+AI旁白音轨，C=纯素材无旁白 |
| V8 | 2026-09-28 | 模式B/C实测坑修复（4处固化）：①fill_draft.py add_broll_track is_main=True时给新主轨加`_SLOT=SLOT_MAIN_VIDEO`标记（原无标记被剪映当普通视频轨，字幕/标题不渲染）②fill_draft.py is_main=True时insert(0)到tracks数组开头（原append到末尾跑到最上层盖住字幕/标题轨）③fill_draft.py音效轨从`args.mode in ("A","B")`改为`if sfx_track:`三模式都重排（原模式C保留模板原始音效位置，与当前文案/素材无关）④match_materials.py fallback_scene加mode参数，模式C统一`02_场景环境`优先（原不管模式都按ip_direct选口播画面，对展示类视频错误）。同步修fix_draft_for_local.py：draft_dir规范化为绝对路径（os.path.abspath）、有resource_id的material不清ghost（剪映内置音效本机文件不存在但能云端下载）。验证：模式B字幕/音效恢复，模式C钩子/CTA改用场景空镜兜底，音效9段精准对齐素材切换点 |
| V9 | 2026-09-28 | 工作流前置确认：①SKILL.md前置依赖加"素材库目录"条目（match_materials.py --library必传）②新增"第零步：前置确认"小节，明确跑流程前必问用户4项：素材库路径/数字人视频路径/BGM文件路径/script.json来源（模式A用aligned，模式B/C用narrated，不可混用）。背景：用户有素材但AI没问路径直接跑模式A，导致ip_direct+narrative段全保留原视频，素材插入段为0。验证三模式音效都精准对齐scenes[1:].start_sec（每句文案开始时响） |
| V10 | 2026-09-28 | BGM 自动探测：fill_draft.py copytree模板后自动从模板根 `assets/bgm.m4a`（或 bgm.mp3）复制到草稿 `audio/`，未传 --bgm 时自动用作 BGM 源。背景坑：default_v1 模板的 BGM 文件在 `templates/default_v1/assets/bgm.m4a`（2.7M），但 draft_content.json 里没有 BGM material 引用它，原来必须靠 --bgm 传外部文件；hk/quote 模板的 draft 里有 BGM material 但 path 写成 `assets/bgm.m4a`（assets 里实际是 bgm.mp3 后缀对不上）。--template 指向 `template.draft/` 子目录时，copytree 不会带上一级的 assets/，所以新增探测+复制逻辑。BGM 现在是"可选"前置确认项（仅换 BGM 时才需 --bgm 传外部文件） |
| V11 | 2026-09-28 | 旁白音量三层修复（模式B声音太小+剪映无法调音）：①narrate_tts.py 加 `--volume` 参数，edge-tts 生成时 volume 默认 +50%（原 +0% 输出响度低）②fill_draft.py 旁白 material 结构补全——type 从 `extract` 改 `extract_music`（和 BGM 一致）+ 加 `audio` 子字段（duration/source_timerange/type）+ segment 加 `source: segmentsourcenormal`（原结构不全致剪映不识别音量调节面板，无法调音）③fill_draft.py 旁白 segment volume 默认 2.0（原 1.0 与 BGM 平齐被盖），新增 `--narration-volume` 可调④fill_draft.py `--bgm-volume` 默认从 1.0 降到 0.3（BGM 作背景不盖旁白）。验证：TTS 输出更响 + 旁白轨 2.0 增益 + BGM 0.3 背景音，剪映里旁白音轨可手动调音 |
