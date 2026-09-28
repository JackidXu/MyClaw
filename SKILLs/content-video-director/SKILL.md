---
name: 视频制作调度台
version: 1.0.0
description: 视频制作调度台（content-video-director）—— 视频制作总控调度台。接单后做缺口检测（缺script.json/素材库/模板/数字人视频分别调对应skill补齐），再决策视频模式（A数字人/B旁白/C纯素材），按模式调度组装链路（adapter→narrate_tts/超会AI→align→match→fill→fix），传递中间产物路径。作为总控能主动判断流程缺什么并调动其他skill补齐，不只被动传路径。脱离内容生产skill包也能独立运转（裸文案+素材库skill即可跑通）。当用户说「把脚本做成视频」「这条稿子怎么出片」「走模式A/B/C」「我有文案帮我出片」「批量出片」时调用。
compatibility: heyclaw
---

# 视频制作调度台（content-video-director）— 总控调度 skill

> 视频制作的总控调度台。不是被动传路径的"传令兵"，而是主动判断流程缺什么、调动对应skill补齐、再决策模式走组装的总控。脱离内容生产skill包也能独立运转。

---

## 做什么

本 skill 是视频制作的**总控调度台**。接单后做三件事：

1. **缺口检测**：检查4要素齐不齐——script.json？素材库？模板？数字人视频（仅模式A）？哪个缺就主动调对应skill补齐
2. **模式决策**：缺口补齐后，按决策树选模式A（数字人）/B（旁白）/C（纯素材）
3. **组装调度**：按模式串联 adapter→narrate_tts/超会AI→align→match→fill→fix，传递中间产物路径

**核心原则**：
- **总控而非传令兵**——主动检测缺什么、调skill补齐，不只被动传路径
- 只调度，不创作——选题/写稿/去AI味是内容生产skill的事
- 只调度，不组装——adapter/match/fill是组装skill的事
- 脱离内容生产skill包也能独立运转——裸文案+素材库skill即可跑通
- 4个对接接口的数据契约不变，两边流程各自迭代不互相干扰

---

## 触发词

- `把脚本做成视频`
- `这条稿子怎么出片`
- `走模式A` / `走模式B` / `走模式C`
- `组装视频`
- `批量出片`
- `这条脚本怎么拍完怎么变成视频`
- `我有脚本和素材，帮我出片`

---

## 输入（4个对接接口）

本 skill 的输入来自流程A的产出，通过4个接口接入：

| 接口 | 流程A来源 | 字段 | 必需性 |
|------|----------|------|--------|
| ① IP档案增强 | content-ip-manager | IP档案（三维定调/购买理由/风格定位） | 可选 |
| ② 脚本交接 | content-script-writer | 脚本 md 文件路径 | 必需 |
| ②补充 数字人视频 | 超会AI（外部） | 数字人视频文件路径 | 模式A必需 |
| ③ 素材库共享 | content-material-library / cutter | 素材库目录路径（含_索引表.csv） | B/C必需，A可选 |
| ④ 选题级匹配结果 | content-material-matcher | 选题卡+素材清单+缺口 | 可选（拍摄前做过就有） |

> **裸文案兼容**：如果用户没走流程A，直接给一段口播文案，也能接——走接口②的裸文案模式（adapter支持），只是跳过了去AI味/事实标注，质量提醒由adapter给出。

---

## 第一步：缺口检测（接单后必做）

接单后先别急着选模式，先检查4要素齐不齐。**缺什么就主动调对应skill补齐**，这是总控的核心职责：

| 要素 | 检查什么 | 缺了调谁补齐 | 必需性 |
|------|---------|-------------|--------|
| ① script.json | 用户给了md脚本/裸文案/已有script.json？ | 缺 → 调 **content-script-adapter** 结构化生成（支持裸文案，一句一段自动切分） | 必需 |
| ② 素材库 | 用户有素材库目录（含 `_索引表.csv`）？ | 缺 → 调 **content-material-library** 引导用户入库 + **content-video-cutter** 切片长素材 | B/C必需，A可选 |
| ③ 剪映模板 | 用户指定了模板？或模板库有标"默认"的？ | 缺 → 查模板库 `_模板索引.md` 选默认；库空 → 调 **content-template-pack** 生成 | 必需 |
| ④ 数字人视频 | 有超会AI生成的视频原片？ | 缺 → 仅模式A需要。提示用户去超会AI生成（**人工步骤，director停在这等回填**，不能代劳） | 模式A必需 |

**缺口补齐原则**：
- ①②③ 能调skill补的**主动调**，不让用户自己去找skill——总控的价值就在这
- ④ 数字人视频是外部SaaS+人工步骤，director只能提示并停下等回填，不能代劳
- 模式A无素材库 → **可跑**（全程数字人画面，无B-roll覆盖），不强求补齐素材库
- 模式B/C无素材库 → **阻断**，必须先调library建素材库，否则主轨铺不满
- ③模板优先从模板库选默认（查 `skills/content-template-pack/templates/_模板索引.md`），库空才调template-pack生成
- 补齐后进入第二步模式决策

---

## 第二步：决策：视频模式怎么选

缺口补齐后（或确认要素齐全后），按决策树选模式：

```
有数字人视频 / 要真人出镜？
├─ 是 → 模式A（数字人主轨 + B-roll覆盖）
│        有素材库？→ 选择性插入B-roll（match_materials --mode A）
│        无素材库？→ 全程数字人画面，无B-roll（可跑，不强求素材库）
└─ 否 → 有素材库吗？（模式B/C必需）
    ├─ 有素材库 → 要旁白配音吗？
    │   ├─ 是 → 模式B（素材主轨 + AI旁白音轨）
    │   │        音色选择：晓晓(女声温暖默认)/晓伊(女声甜美)/云希(男声年轻)/云扬(男声成熟)
    │   │        内容定位驱动：通用口播→晓晓；美业生活→晓伊；品牌→云希；企业实力→云扬
    │   └─ 否 → 模式C（纯素材主轨 + 字幕，无配音）
    └─ 无素材库 → 阻断：提示用户先建素材库，或降级模式A（需数字人视频）
```

**模板选择**：默认 `default_9_16_v1`；用户指定则用指定的模板包（由 content-template-pack 产出）。

**模式与内容形式的对应**（参考流程A的11种内容形式）：
- 旁白视频（narration）→ 模式B 或 C
- 场景口播（scene-talk）/ VLOG → 模式A（真人出镜）
- 场景切片（scene-slice）→ 模式C

---

## 第三步：组装调度（按模式）

缺口补齐（第一步）+ 模式决策（第二步）后，按模式依次调度组装 skill，传递中间产物路径：

### 模式A（数字人出镜）

```
1. adapter：脚本md → script.json（估算时间轴）
   → content-script-adapter
2. 超会AI生成数字人视频（人工，外部）
   → 回填 main_video_path
3. align_scenes：校准时间轴（必做）
   → content-script-adapter/scripts/align_scenes.py
4. match_materials：段落级素材匹配（--mode A，选择性B-roll）
   → jianying-editor/scripts/match_materials.py
   → 有素材库：跑match，选择性插入B-roll覆盖
   → 无素材库：跳过match，fill_draft不传--assets，全程保留数字人画面
5. fill_draft：组装剪映工程（--mode A）
   → jianying-editor/scripts/fill_draft.py
6. fix_draft_for_local：本机剪映适配
   → content-template-pack/scripts/fix_draft_for_local.py
7. 剪映Desktop导出（人工）
```

### 模式B（素材+AI旁白）

```
1. adapter：脚本md → script.json（估算时间轴）
2. narrate_tts：edge-tts合成旁白 + 重排时间轴（选音色）
   → content-script-adapter/scripts/narrate_tts.py --voice <音色>
   → 输出 script_narrated.json + narration/
3. match_materials：段落级素材匹配（--mode C，按旁白时间轴满铺）
4. fill_draft：组装剪映工程（--mode B，素材主轨+旁白音轨）
5. fix_draft_for_local：本机剪映适配
6. 剪映Desktop导出（人工）
```

### 模式C（纯素材+字幕）

```
1. adapter：脚本md → script.json（估算时间轴）
2. match_materials：段落级素材匹配（--mode C，满铺+通用兜底）
3. fill_draft：组装剪映工程（--mode C，素材主轨+字幕，无旁白）
4. fix_draft_for_local：本机剪映适配
5. 剪映Desktop导出（人工）
```

> **调度原则**：缺口检测阶段主动调skill补齐（总控职责），组装阶段每步只传上一步产物的路径给下一步（传令兵职责）。两个阶段两种角色，不混淆——缺口补齐时总控主动出手，组装串联时只传路径不做数据转换。

---

## 4个对接接口详解

### 接口① IP档案增强（可选）

- **来源**：流程A的 content-ip-manager
- **作用**：传给流程B的 match_materials 做素材匹配的风格参考（如IP三维定调影响素材选择倾向）
- **数据契约**：IP档案结构（道/一/二/三 + 购买理由 + 风格定位 + 拍摄配置）
- **没有时**：match_materials 用通用框架匹配，不影响链路跑通

### 接口② 脚本交接（必需）

- **来源**：流程A的 content-script-writer（含去AI味后的终稿）
- **作用**：交 content-script-adapter 结构化成 script.json
- **数据契约**：符合 script-writer 输出格式（含连读版/脚本正文/事实标注/补录清单）
- **裸文案**：用户直接给口播文案也走此接口，adapter裸文案模式处理（提醒质量可能打折）

### 接口③ 素材库共享（B/C必需）

- **来源**：流程A的 content-material-library（含 cutter 切片入库）
- **作用**：流程B的 match_materials 只读索引表做段落级匹配
- **数据契约**：素材库目录含 `_索引表.csv`（第13列子片段标注 + 第23列通用素材标记）
- **关键**：两个流程读写同一份索引表，本 skill 确保路径一致

### 接口④ 匹配分阶段（可选）

- **来源**：流程A的 content-material-matcher（选题级，拍摄前做）
- **作用**：选题级匹配在拍摄前判断"缺什么素材补拍"；拍完入库后，流程B的 match_materials 做段落级匹配（组装时每段配画面）
- **两级关系**：选题级（拍摄前/缺什么补拍）→ 段落级（组装时/每段配画面）。**两级都要，按阶段调，不是二选一**
- **没做过选题级匹配**：直接走段落级匹配，素材不够的段模式A露原视频/模式C标缺口或通用兜底

---

## 互通 skill 路由规则

3个互通 skill（从原包复制到工作目录）的处理：

| 互通 skill | 流程A里干啥 | 流程B里干啥 | 本 skill 怎么路由 |
|-----------|------------|------------|------------------|
| content-script-writer | 写脚本（含去AI味第五步） | 不用，B从adapter接script.json | A写完→交B，不重复调writer |
| content-material-library | 唯一管理者，入库标注 | 只读索引表 | 共享同一份，确保路径一致 |
| content-video-cutter | 长视频切片入库 | 不用 | A切片→入库→B读，不重复调cutter |

> **matcher 分两级**：原包 content-material-matcher（选题级/拍摄前）vs 工作目录 match_materials.py（段落级/组装时）。两者都存在，本 skill 按阶段调，不混淆。

---

## 边界（不做什么）

1. **不做内容创作**：选题、写稿、去AI味、钩子设计是流程A的职责
2. **不做拍摄规划**：content-production-planner（制作策划/分镜）是流程A，分镜表在流程B是参考非必需（match_materials 已内容驱动，读 subtitle_text）
3. **不做视频组装技术**：adapter（结构化）、match_materials（匹配）、fill_draft（填槽）是流程B的职责
4. **不做最终渲染**：剪映Desktop导出是人工步骤
5. **只做**：缺口检测 + 主动调度补齐 + 决策（模式A/B/C + 模板 + 音色）+ 组装调度传递路径 + 互通路由

---

## 批量出片（后续迭代）

单条调度跑通后，本 skill 可扩展批量模式：
- 输入一批选题卡/脚本 → 逐条决策模式 → 逐条调度B链路 → 汇总产出清单
- 状态管理：每条视频的生产状态（待出片/进行中/已完成/失败）
- 失败重跑：单条失败不影响其他条，可单独重跑

> 批量模式待单条链路稳定后封装，当前优先把单条调度跑通。

---

## 与流程A的衔接点

流程A的11步闭环（IP建档→营销规划→选题→写脚本→去AI味→拍摄方案/素材匹配→素材入库←切片→数据复盘）跑到"拍摄方案+素材库"这一步，**本 skill 接单**：

```
流程A：①IP建档→②营销规划→③选题→④写脚本→⑤去AI味→⑥质量审查→⑦拍摄方案→⑧素材匹配→⑨素材入库←⑩切片
                                                                                              ↓
                                                                                    【本 skill 接单】
                                                                                              ↓
流程B：adapter→[A:超会AI视频/B:narrate_tts]→align→match_materials→fill_draft→fix→剪映导出
                                                                                              ↓
流程A：⑪数据复盘（发布后反哺①②③④）
```

> 流程A的⑪数据复盘在成片发布后做，反哺选题/脚本/规划，形成闭环。本 skill 产出剪映工程→人工导出→发布→回到流程A复盘。

---

## 专家自包含性（脱离流程A独立运转）

本 skill 支持脱离内容生产skill包（流程A）独立运转。新专家只需包含以下skill即可跑通"已有文案→视频"：

**必需skill（6项）**：

| skill | 职责 | 在链路中的位置 |
|-------|------|---------------|
| content-video-director（本skill） | 总控：缺口检测+模式决策+组装调度 | 接单入口 |
| content-script-adapter | 裸文案/标准md → script.json | 缺口①补齐 + 组装第1步 |
| content-material-library | 素材库管理+入库标注 | 缺口②补齐（B/C必需） |
| content-video-cutter | 长视频切片入库 | 缺口②补齐（有长素材时） |
| content-template-pack | 剪映模板生成+本机适配 | 缺口③补齐 + 组装fix步骤 |
| jianying-editor | match_materials+fill_draft组装 | 组装第4-5步 |

**可选skill**：

| skill | 何时用 |
|-------|--------|
| content-material-matcher（选题级） | 想在组装前先判断"缺什么素材补拍"时调；已有文案场景非必需 |
| content-script-writer | 想从选题写脚本时调；已有文案场景跳过 |

**独立运转的最小路径**：
- 用户给一段裸文案 → director 检测缺script.json → 调adapter生成 → 检测模式
- 模式A：用户去超会AI生成数字人视频 → director续跑align→fill→fix
- 模式B：director调narrate_tts合成旁白 → 检测缺素材库→调library引导入库 → match→fill→fix
- 模式C：director检测缺素材库→调library引导入库 → match→fill→fix

**关键**：用户不需要先走IP建档/选题/写脚本/去AI味等流程A步骤，有文案就能跑。流程A的skill（IP档案/选题引擎/脚本撰稿/去AI味等）是上游增强可选——走了质量更高，不走链路也能跑通。

---

## 注意事项

1. **本 skill 是总控已落地**：缺口检测+主动调度+模式决策+组装串联四项职责已定义清晰，专家里的AI按本SKILL指令执行即可运转。组装阶段的具体脚本命令见各组装skill的SKILL.md（adapter/align/narrate_tts/match/fill/fix各有命令行接口）
2. **数据契约是稳定锚**：4个接口的数据格式（脚本md格式/索引表格式/IP档案结构/匹配输入输出）不变，两边流程各自迭代不互相干扰
3. **互通 skill 更新由用户自行操作**：3个互通 skill（script-writer/library/cutter）的更新由用户统一维护，本 skill 不改它们
4. **模式决策可被用户覆盖**：决策树是默认建议，用户明确指定模式时以用户为准
5. **产物不落 skill 目录**：调度产生的中间产物（script.json/narration/assets.json/剪映草稿）落在用户工作区，不落本 skill 目录
