---
name: 模板包制作
version: 1.0.0
description: |
  模板包制作（content-template-pack）—— 从剪映「保存为模板」导出的明文 template.json，抽取可复用骨架 + 槽位契约，输出模板包三件套（template.draft/draft_content.json + template_manifest.json + assets/）。技术 skill，不做内容创作。当用户说「做模板包」「抽模板」「导出模板」「template-pack」时调用。
triggers:
  - 做模板包
  - 抽模板
  - 导出模板
  - template-pack
  - 模板包制作
---

# 模板包制作（content-template-pack）— 技术Skill

> 从剪映「保存为模板」导出的明文 `template.json`，抽取可复用骨架 + 槽位契约，输出模板包三件套。不碰内容创作，只做结构提取与槽位声明。

---

## 关键技术前提（必读）

剪映新版（9.x）**默认加密**草稿目录里的 `draft_info.json`（密文，密钥存 `crypto_key_store.dat`），无法直接读取。

**两类明文入口可读**：
1. 剪映「**保存为模板**」导出的明文 `template.json`（顶层含 `mixed_track_model`、`tracks`、`materials` 等）
2. **第三方模板包**的明文 `draft_content.json`（如市面流通的 800 套模板，剪映旧版格式，开头 `{"canvas_config"`，顶层含 `canvas_config`/`tracks`/`materials`/`duration`/`fps`/`version`）

不读 `draft_info.json`（加密），不读 `draft_meta_info.json`（加密），**读明文 `template.json` 或 `draft_content.json`**。两者的 `canvas_config`/`tracks`/`materials` 结构高度相似，`scripts/analyze_template.py` 对两者通用。

---

## 加密草稿本地解密（Mac / Windows）

剪映 6.0+ 的 `draft_content.json` 默认加密（算法未公开，密钥在 `crypto_key_store.dat`）。上面要求用户「保存为模板」导出明文——但**实测 Mac/Windows 版剪映都没有「导出草稿」功能**（只有灰的「发布模板」用不了）。因此补充**本地解密方案**：借剪映自带的 `lvve::EncryptUtils` 解密，**纯本地、内容不外泄**，不用上传第三方。

### Mac 本地解密（推荐，内容不出本机）

脚本已内置：`scripts/decrypt_mac/`（含改造版 `main.cpp` + `EncryptUtil.h` + `build_and_decrypt.sh`，源自开源 jy-draftc-mac）

前置：
1. 安装剪映专业版 Mac 版（免费，提供解密用的 dylib）
2. 系统已装 clang（`xcode-select --install`，本机已具备）

用法：
```bash
cd skills/content-template-pack/scripts/decrypt_mac
./build_and_decrypt.sh <草稿目录或加密json>
# 产物: <输入>.dec.json （明文）
```
脚本自动：定位剪映.app → 复制 dylib → 编译 jydec → 解密。

### Windows 本地解密（GUI，双击即用）

工具：`JYDraftPort.exe`（github.com/zzz1999/jy-draft-port，自包含无需装 .NET）
1. 下载运行 → 选剪映版本目录（自动检测 videoeditor.dll）
2. 选草稿目录 → Decrypt 标签 → Decrypt Draft
3. 输出 `draft_content_xxx.dec.json` 明文，传给 Mac 端做模板

### 解密后怎么进模板库

明文 `*.dec.json` 需放回原草稿目录并命名为 `draft_content.json`（覆盖原加密文件；注意剪映 Mac 实际读 `draft_info.json`，覆盖 `draft_content.json` 不影响剪映打开），再交给抽取：
```bash
cp <输入>.dec.json <原草稿目录>/draft_content.json
python3 scripts/extract_template_pack.py <原草稿目录> templates/<模板包名>
```

---

## 做什么

输入一份剪映明文 `template.json`，输出模板包三件套：

| 产出 | 作用 |
|------|------|
| `template.draft/draft_content.json` | 从 template.json 复制骨架，在可变字段插入 `SLOT_*` 占位注释，保留所有模板级配置（画布/音量/转场/特效参数）原样 |
| `template_manifest.json` | 槽位契约：声明每个 SLOT 的语义、取值来源、约束 |
| `assets/` | 把 template.json 里 materials 引用的素材文件 copy 出来，路径规整 |

下游填槽由 `scripts/fill_template.py` 实现（jianying-editor 尚未成形前的可用版本）：读这份 draft_content.json + manifest，把主视频路径与口播文案填进 SLOT，输出可被剪映打开的工程。

---

## 输入 / 输出

**输入**：
- 剪映草稿目录路径（含明文 `template.json`）
- 模板包名（默认取草稿目录名）

**输出**（落在用户 cwd 下 `模板包_{模板名}/`）：
- `template.draft/draft_content.json`
- `template.draft/draft_meta_info.json`（从 template.json 的 canvas_config/fps/duration 抽取）
- `template_manifest.json`
- `assets/`（规整后的素材副本）

---

## 流程

### 第一步：定位并校验明文 template.json

1. 用户给草稿目录路径，先找明文 `template.json`
   - 优先找 `template.json`（不带后缀）
   - 退而找 `template.json.bak`（备份，可能明文）
2. 校验开头是否 `{"`（明文 JSON）；若开头是乱码（密文），提示用户：「请在剪映里对该草稿执行『保存为模板』，生成明文 template.json 后再调用本 skill」
3. 用 `scripts/analyze_template.py` 跑结构报告

### 第二步：识别轨道与槽位候选

基于分析报告，按 track type 识别槽位候选：

| track type | 候选槽位 | 取值来源 |
|-----------|---------|---------|
| `video`（主轨，attribute=0） | `SLOT_MAIN_VIDEO` | script.json 的 `main_video_path` + `scenes[].duration` |
| `text`（字幕轨） | `SLOT_SUBTITLES` | script.json 的 `scenes[].subtitle` + 时间戳 |
| `audio`（type=music） | `SLOT_BGM` | manifest 固定 path 或 script.json 声明 |
| `audio`（type=sound） | 一般是音效，锁死不抽槽 | — |
| `effect`/`sticker` | 模板级配置，锁死 | — |

**判别规则**：
- 一份模板里**主视频轨**取最早出现的 `type=video, attribute=0` track
- **字幕轨**取 segments 数 ≤ 20 的 `type=text` track（segments 太多的可能是花字/标题装饰，锁死）
- **BGM 轨**取 `materials.audios` 里 `type=music` 的素材所在 track

### 第三步：生成槽位报告，人工确认

输出一份槽位报告给用户确认（不直接改 template.json）：

```
模板名：xxx
画布：1080×1920 9:16  fps=30
时长：30s
主视频轨：track[0]  segments=1  → SLOT_MAIN_VIDEO
字幕轨：track[1]  segments=5   → SLOT_SUBTITLES
BGM轨：track[2]  audio type=music  → SLOT_BGM（固定 assets/bgm.mp3）
封面：materials.images[0]  → SLOT_COVER
锁死项：effect track×1（闪黑转场）、sticker track×2（标题装饰）
```

用户确认后进入第四步。

### 第四步：填槽生成 draft_content.json

1. 把 `template.json` 复制为 `template.draft/draft_content.json`
2. 在每个槽位字段插入占位（保留真实字段结构，只改值）：

| 槽位字段 | 占位值 |
|---------|--------|
| materials.videos[SLOT_MAIN_VIDEO].path | `"{{SLOT_MAIN_VIDEO_PATH}}"` |
| materials.videos[SLOT_MAIN_VIDEO].duration | `0`（运行时填 script.json duration） |
| track[主视频].segments[0].source_timerange | `{"duration":0,"offset":0}` |
| track[主视频].segments[0].target_timerange | `{"duration":0,"offset":0}` |
| track[字幕].segments | `[]`（运行时按 script.json scenes 生成 N 个 segment 填入） |
| materials.audios[BGM].path | `"assets/bgm.mp3"` |

3. 其他所有字段（画布、转场、特效参数、音量、动画）**原样保留**

### 第五步：抽素材到 assets/

1. 遍历 `materials.videos` / `materials.audios` / `materials.images`
2. 把 path 指向的文件 copy 到 `assets/`，重命名规整（main_video.mp4 / bgm.mp3 / cover.jpg）
3. 把 draft_content.json 里对应的 path 改成 `assets/xxx`

### 第六步：生成 manifest + meta_info

1. `template_manifest.json`：列槽位契约（参考 schema/script.json.md 的 manifest 格式）
2. `draft_meta_info.json`：从 template.json 抽 canvas_config / fps / duration / version

---

## 不做什么

- 不碰内容创作——字幕文本、口播全文来自 script.json，本 skill 只声明槽位
- 不读 draft_info.json（加密）——但加密的 draft_content.json 可用 `scripts/decrypt_mac/`（Mac）或 JYDraftPort（Windows）本地解密，见「加密草稿本地解密」章节，不再强制要求「保存为模板」
- 不渲染导出——导出是剪映 Desktop 的人工动作
- 不做素材匹配——assets 由本 skill 从 template.json 抽取固定，不跟 script.json 动态匹配（那是 content-material-matcher 的活，A 模式不需要）

---

## 与上下游的衔接

```
剪映草稿(明文 template.json)
        │
        ▼ content-template-pack
模板包三件套 (draft_content.json + manifest + assets)
        │
        ▼ jianying-editor
填好槽的剪映工程 (draft_content.json，路径全填实)
        │
        ▼ 剪映 Desktop 打开 → 人工微调 → 导出成片
```

---

## 容错

- **template.json 是密文**：停止，提示用户去剪映「保存为模板」生成明文
- **草稿时长 > 120s**：警告「这是长视频，抽出来的模板槽位会很多，建议先用 30-60s 简单草稿测试」
- **找不到 type=video 的 track**：停止，提示用户草稿里没有视频轨，无法做主视频槽
- **字幕轨 segments > 50**：警告「字幕段太多，可能是花字轨不是字幕轨，请确认」

---

## 实际执行脚本（scripts/）

流程的第三-六步 + 容错由脚本完成，AI 调用脚本而非手工改 JSON：

| 脚本 | 作用 | 用法 |
|------|------|------|
| `scripts/analyze_template.py` | 读明文 template.json/draft_content.json，输出结构报告（tracks/materials 按类别统计 + 槽位候选）。用于第二步识别 | `python3 analyze_template.py <draft路径>` |
| `scripts/extract_template_pack.py` | **核心抽取**：识别槽位 → 复制 draft 插 SLOT 占位 → 抽素材到 assets/ → 生成 manifest + meta_info。一气完成第三-六步 | `python3 extract_template_pack.py <原draft目录> <输出目录>` |
| `scripts/fill_template.py` | **填槽（下游 jianying-editor 的可用实现）**：读模板骨架 `.template.draft/draft_content.json` + 主视频路径 + 口播文案，按 slot 契约产出可被剪映打开的 `draft_content.json`。**两种风格模式**：`--style-mode minimal`（默认，只留主视频轨+字幕轨，裁掉多机位B滚等孤立素材避免缺失素材）`--style-mode keep-style`（**保留模板视觉风格**：保留装饰/特效轨+调色/转场/特效 material+填 BGM，机位素材轨段清空套到数字人视频不显示别人的脸）；字幕素材字体路径若为 Windows 绝对路径则清空改用默认字体（跨平台安全） | `python3 fill_template.py <template_draft.json> <主视频.mp4> "<口播文案>" <输出目录> [--style-mode keep-style] [--bgm <bgm.mp3>]` |
| `scripts/verify_extract.py` | **校验**：把 SLOT 填回原值生成还原版，跟原版 deep diff。差异应为 0，证明只动了槽位没破坏骨架 | `python3 verify_extract.py <原draft目录> <抽取的模板包目录>` |

**素材路径解析**：第三方模板 path 是占位符 `##_draftpath_placeholder_xxx_##\videos/xxx.jpg`，`extract_template_pack.py` 的 `resolve_material_path` 去占位符后从模板目录的 `videos/`/`audios/`（复数）子目录找实际文件。找不到则记"占位符/缺失"，A 模式主视频无需原片（填槽换数字人视频）。

**容错补充**：主视频轨可能放 `photo`（图片）而非 `video`——第三方相册类模板常见。抽取时仍标 SLOT_MAIN_VIDEO，填槽时由 jianying-editor 把 material `type` 从 `photo` 改成 `video`。

### scripts/fix_draft_for_local.py（导入本机剪映验证）

把第三方明文草稿（Windows/iOS 产出）适配到本机 Mac 剪映 10.x 可打开。**抽完模板包后，原草稿要想在剪映里实打开验证，必须先跑这个脚本**。

根因（2026-09-21 实测确认）：Mac 版剪映 10.x 一律通过 `draft_info.json` 打开草稿（root_meta_info.json 总索引里每条 draft_json_file 都指向 draft_info.json），只有旧版 draft_content.json 没有 draft_info.json 时报「草稿内容已损坏」；同时 draft_meta_info.json 的 Windows 路径 / 旧 draft_id / 旧 new_version 会被校验拦截。

```bash
python3 scripts/fix_draft_for_local.py <draft_dir> [--new-version 164.0.0]
```

做的事（不修改草稿的素材/字幕/轨道结构）：
1. `cp draft_content.json → draft_info.json`（补 Mac 版唯一认的草稿文件名）
2. `draft_meta_info.json`：补 draft_json_file 全路径 / draft_type=video / draft_new_version 对齐本机（默认 164.0.0）/ 重置 draft_fold_path 等 Mac 路径 / 生成新唯一 draft_id / 刷新 tm_draft_modified。**meta 是密文（剪映打开后加密）或不存在时从头生成明文版**（2026-09-28 实测坑：草稿打开失败会留下"meta已加密但info未加密"的不一致状态，下次打不开，删草稿目录重新 fill+fix 让 meta 从头生成明文版即可）
3. `root_meta_info.json` 总索引：找到条目更新，或自动追加新条目（先备份）
4. `draft_content.json` 内 id/new_version 同步（方便对照与回滚，draft_info.json 才是剪映打开的文件）
5. **draft_dir 规范化为绝对路径**（`os.path.abspath`，2026-09-28 实测坑：传相对路径导致占位符替换成相对路径，草稿复制到剪映根目录后路径多一层找不到素材）
6. **占位符+相对路径替换为绝对路径**：`##_draftpath_placeholder_<ID>_##/<subdir>/<file>` 占位符 → 草稿目录绝对路径；模板自带相对路径（`materials/audio/xxx.mp3`）→ 草稿目录绝对路径
7. **ghost 清理**：文件不存在的 material 引用的 segments 清空（避免剪映打开报错）。**有 resource_id 的 material 不清**（2026-09-28 实测坑：剪映内置音效/特效本机文件不存在但有 resource_id，能从云端资源库自动下载，清了会导致音效轨0段）

跑完 **Cmd+Q 完全退出剪映进程后重开**，草稿列表里就能正常打开。

---

## 模板库管理（templates/）

本 skill 不仅是"模板包制作工具"，还管理**默认模板库**（`templates/` 目录）。director（视频制作调度台）缺口检测③缺模板时，优先从库里选默认模板；库里没有才调本 skill 生成。

### 模板库结构

```
skills/content-template-pack/templates/
├── README.md                  ← 模板库说明（怎么加/结构/兼容性）
├── _模板索引.md                ← 所有模板的清单（手动维护）
└── <模板包名>/                 ← 每个模板一个子目录（三件套）
    ├── template.draft/
    │   ├── draft_content.json
    │   └── draft_meta_info.json
    ├── template_manifest.json
    └── assets/
```

### 往库里加模板的流程

1. 用户在剪映里做模板（画布/转场/特效/BGM/封面设好）→ 导出明文：
   - 剪映支持「保存为模板」→ 导出的明文 `template.json`
   - 别人/旧项目拷贝来的**加密草稿**（`draft_content.json` 是密文，开头乱码）→ 先按「加密草稿本地解密」章节本地解密得到明文，再走下面步骤
2. 用本 skill 抽取：`extract_template_pack.py <草稿目录> templates/<模板包名>`
3. 验证：`verify_extract.py <原草稿目录> templates/<模板包名>`，差异应为0
4. 在 `_模板索引.md` 追加一行（模板包名/画布/槽位/适用模式/默认）
5. 想设默认的模板，"默认"列标"是"

### director 怎么从库里选

- 缺口检测③发现没指定模板 → 查 `_模板索引.md` → 有标"默认"的 → 直接用其 `template.draft/` 路径
- 库为空 / 没有默认 → 提示用户先往库里加模板，或临时调本 skill 生成一个
- 用户指定 `--template <模板包名>` → 从库里找对应模板包

### 命名规范

- 目录名用英文ASCII（`default_9_16_v1`），不用中文（跨平台稳定）
- 版本号 v1/v2 区分同画布不同风格
- 与客户 skill 命名规范一致（目录英文ID + 中文显示名在 manifest 里）

---

## 待补

- B/C 模式扩展：B 模式需要 SLOT_TTS_AUDIO（口播音频轨），C 模式需要 SLOT_STOCK_CLIPS（多素材轨）。A 模式最小集只有 MAIN_VIDEO + SUBTITLES + BGM + COVER
- ~~多模板包匹配：未来按 script.json 的 video_type/platforms 自动选模板包（现在手工指定）~~ → 已通过模板库 + `_模板索引.md` 实现：director 查索引选默认，用户用 --template 覆盖
