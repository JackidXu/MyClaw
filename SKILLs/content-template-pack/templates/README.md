# 模板库（templates/）

本目录是视频制作链路的**默认模板库**。director（视频制作调度台）缺口检测③缺模板时，优先从这里选默认模板；库里没有才调 content-template-pack 生成。

---

## 目录结构

每个模板包是一个子目录，含三件套：

```
templates/
├── README.md                        ← 本文件
├── <模板包名>/                        ← 每个模板一个子目录
│   ├── template.draft/
│   │   ├── draft_content.json       ← 填好 SLOT 占位的骨架
│   │   └── draft_meta_info.json     ← 画布/fps/duration
│   ├── template_manifest.json       ← 槽位契约
│   └── assets/                       ← 模板级固定素材（BGM/封面/特效素材）
├── <另一个模板包名>/
│   └── ...
└── _模板索引.md                       ← 所有模板的清单（手动维护）
```

---

## 怎么往库里加模板

### 步骤

1. **在剪映里做模板**：按你要的画布比例（9:16竖屏/16:9横屏/1:1方形）、转场、特效、BGM、封面都设好
2. **拿到明文草稿目录 / 明文 template.json**（⚠️ 关键前提）：
   - 剪映 macOS 主 `draft_content.json`（6.0+）**是加密的**，本机**无法离线手解**：密钥藏在钥匙串的 `"<UUID> - Local Crypto Key Data"` 里，而该 blob 本身又被设备级/安全隔区加密，离线取不到；直连剪映 dylib 的 `ICryptoKeyStore::create` 在独立进程必 SIGSEGV（依赖 App 全局态）。**不要试图自己解密主文件**。
   - ✅ **正路（纯本地、无需 VIP、无第三方API）**：剪映打开/同步过的草稿，会在 `~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft/<草稿名>/Timelines/<UUID>/template.json` **自动落地一份明文主时间轴**（含完整 `tracks`/`materials`/`canvas_config`，即剪映模板格式）。这是最稳的来源——剪映自己用设备密钥解密后把明文留在了磁盘上。把这份 `template.json` 复制为 `draft_content.json` 即可抽取（见下）。
   - 其他明文来源（按可靠性）：
     1. **回收站明文稿**：`~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft/.recycle_bin/<草稿名>/draft_content.json` 多为明文（首字符 `{`），但是否为整片需甄别。
     2. **subdraft 明文**：`<草稿目录>/subdraft/*/draft_content.json` 是明文，但仅为嵌套子片段（数字人片段等），不是完整合成，仅当模板本身就是单片段时有用。
     3. **剪映「发布模板」/「导出为模板文件」**：会生成明文，但**需 VIP 会员**，非会员不可用。
3. **用 content-template-pack 抽取**：
   ```bash
   # 若来源是 Timelines/<UUID>/template.json，先复制为 draft_content.json 放入临时源目录
   mkdir -p /tmp/tpl_src && cp <明文template.json路径> /tmp/tpl_src/draft_content.json
   python3 skills/content-template-pack/scripts/extract_template_pack.py \
     /tmp/tpl_src \
     skills/content-template-pack/templates/<模板包名>
   ```
4. **验证**：
   ```bash
   python3 skills/content-template-pack/scripts/verify_extract.py \
     <原草稿目录> skills/content-template-pack/templates/<模板包名>
   ```
   差异应为 0（只动了槽位没破坏骨架）
5. **更新 `_模板索引.md`**：在索引里加一行（模板包名/画布/槽位/适用模式），并把"默认"列按需标"是"

### 命名规范

- 目录名用英文ASCII：`default_9_16_v1` / `product_16_9_v1` / `square_1_1_v1`
- 不要用中文目录名（跨平台不稳定）
- 版本号 v1/v2 区分同画布不同风格

---

## 默认模板

director 缺口检测③缺模板时，默认选 `_模板索引.md` 里标"默认"的模板包。当前默认：

> **`hk_slow_aging_v1`** —— 8.11-ming-香港人老得慢 实拍口播模板（9:16 竖屏 / 18 轨 / 44段主视频+52段字幕+45段原声）。**keep-style 模式下**保留3条装饰特效轨+调色/转场/特效 material + 自带 BGM（`assets/bgm.mp3`，1:23，剪映通用音乐，可替换）；12条机位素材/原声轨段清空（套到数字人视频不显示别人的脸）。

需要在 `_模板索引.md` 里把它的"默认"列标"是"（已标）。替换默认模板时，把另一份的"默认"改"否"即可。

---

## 模板与模式的兼容性

| 模板槽位 | 模式A（数字人） | 模式B（旁白+素材） | 模式C（纯素材） |
|---------|----------------|-------------------|----------------|
| SLOT_MAIN_VIDEO | 必需（填数字人视频） | 必需（填素材片段） | 必需（填素材片段） |
| SLOT_SUBTITLES | 必需 | 必需 | 必需 |
| SLOT_BGM | 必需 | 必需 | 必需 |
| SLOT_COVER | 可选 | 可选 | 可选 |
| SLOT_TTS_AUDIO | 不需要 | 必需（填旁白mp3） | 不需要 |
| SLOT_STOCK_CLIPS | 不需要 | 可选（多素材轨） | 可选（多素材轨） |

> A模式模板最小集：MAIN_VIDEO + SUBTITLES + BGM + COVER
> B/C模式需要的额外槽位（TTS_AUDIO/STOCK_CLIPS）在模板里没有时，fill_draft 会自动追加轨，不强求模板预置
