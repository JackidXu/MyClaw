---
name: 视频制作
description: 视频制作（video-maker）—— 开源 AI 视频生产系统 Skill：13 条流水线（口播/数字人/解说/动画/纪录片/切片/本地化配音等），零配置可用（Heyclaw 内置模型生图生视频 + 免费 Edge TTS 配音 + 内置兜底背景音乐），全流程含脚本、分镜、素材、合成、字幕，支持国内镜像安装无需翻墙。Video production skill with 13 pipelines, zero-config by default.
version: "1.0.0"
---

# 视频制作（VideoMaker）— AI 视频生产 Skill

一套完整的 AI 视频生产系统：创意 → 脚本 → 分镜 → 素材生成 → 配音 → 配乐 → 合成 → 字幕，由你（AI Agent）全程编排。

## 第零步：必读运行契约

**在任何制作任务开始前，先读本目录下的 `AGENT_GUIDE.md`**（完整的 Agent 操作指南与流水线契约），并按 `skills/INDEX.md` 索引加载对应流水线的技能文件。首次接触用户时按 `skills/meta/onboarding.md` 引导。

环境未就绪时（缺依赖 / 缺 ffmpeg），先引导用户运行：

```bash
bash setup.sh
```

安装全程走国内镜像（清华 PyPI / 淘宝 npm / npmmirror 二进制），**不需要翻墙**。

## 核心路由规则：三级能力选择（必读）

本 Skill 设计为**零配置可用**：用户没有任何 API Key 也能完成完整视频。你在选择生成能力时，**必须按以下优先级路由**：

### 1. 图片生成

| 优先级 | 通道 | 条件 |
|---|---|---|
| ① | `.env` 中配置的图片 API（见 `docs/PROVIDERS.md`） | 用户已配 Key |
| ② | **Heyclaw 内置工具 `heyclaw_image_generate`（Doubao-Seedream-4.5）** | 默认（无 Key 时） |

### 2. 视频片段生成

| 优先级 | 通道 | 条件 |
|---|---|---|
| ① | `.env` 中配置的视频 API | 用户已配 Key |
| ② | **Heyclaw 内置工具 `heyclaw_video_generate`（Doubao-Seedance-2.5）** | 默认（无 Key 时） |

### 3. TTS 配音

| 优先级 | 通道 | 条件 |
|---|---|---|
| ① | `.env` 中配置的 TTS API（ElevenLabs / 火山豆包 / Azure…） | 用户已配 Key |
| ② | **`edge_tts`（微软 Edge 免费接口，无需 Key，国内一般可直连）** | 默认（无 Key 时） |
| ③ | Heyclaw 内置 TTS（平台上线后切换为默认） | 未来 |

### 4. 背景音乐

| 优先级 | 通道 | 条件 |
|---|---|---|
| ① | 网络下载可商用 BGM（`pixabay_music` 等免费渠道） | 网络可用 |
| ② | 用户自备音乐（`music_library`，项目根 `music_library/` 目录） | 用户提供了文件 |
| ③ | **`builtin_music` 内置兜底（`assets/默认背景音.m4a`，自动循环拼接至视频时长并淡出）** | 永远可用 |

### 路由硬约束

1. **禁止**在用户无 Key 时尝试调用需要 Key 的付费 provider 并报错终止——直接降级到 ② 级通道。
2. 使用 Heyclaw 内置工具生成图片/视频后，**必须把生成文件登记进项目资产清单**（`projects/<project-id>/` 下的 asset manifest），下游合成（remotion / ffmpeg）只消费本地文件路径，与生成来源无关。
3. Edge TTS 若遇 403（个别网络出口被微软风控）：提示用户换网络重试，或传入 `proxy` 参数；仍不行则告知用户配置任一 TTS Key。
4. 背景音乐走 ③ 级兜底时，用 `builtin_music` 的 `prepare` 操作指定 `target_duration`（等于视频时长），它会自动循环拼接并尾部淡出，输出可直接混音的文件。
5. **音频先行原则（HARD RULE）**：在任何含配音的视频中，必须先生成完整 TTS 音频，测量每句实际时长，再根据音频时长分配/裁剪视频片段。禁止先生成视频再贴音频——音画不同步的最大根因就是视频先行、音频后贴。
6. **逐句 TTS 对齐**：含多句旁白的视频，必须逐句生成 TTS（每句一个独立音频文件），逐句测量实际时长，逐段分配视频片段时长以匹配对应句子的音频时长，逐段 mux 音视频，最后拼接全部片段。禁止用整段 TTS 一次性贴到拼接好的视频上——不同句子的语速差异会导致累计偏移。
7. **禁止用 `-shortest` 做音视频混合**：FFmpeg 的 `-shortest` 标志会以最短流为准截断输出，在音视频合成场景中极易意外截断音频或视频。必须用 `-t <duration>` 显式指定输出时长， duration 取音频和视频中较短者。

## 13 条视频流水线

按用户需求选择流水线，加载 `skills/pipelines/<名称>/` 下的技能文件：

| 流水线 | 适用场景 |
|---|---|
| `talking-head` | 真人口播 / 数字人讲解 |
| `avatar-spokesperson` | 数字人发言人（产品介绍、品牌宣讲） |
| `explainer` | 产品/概念解说动画 |
| `animation` | 动画短片 |
| `character-animation` | 角色动画 |
| `cinematic` | 电影感短片 |
| `documentary-montage` | 纪录片式蒙太奇 |
| `screen-demo` | 屏幕录制演示（软件教学） |
| `clip-factory` | 短视频切片批量生产 |
| `podcast-repurpose` | 播客切片二次分发 |
| `localization-dub` | 多语言本地化配音 |
| `hybrid` | 混合形态（实拍+生成） |
| `music-to-video` | 音乐驱动视频 |

用户提供参考视频时，先读 `skills/meta/video-reference-analyst.md` 走参考分析流程。

## 用户配置（可选）

想接入付费服务的用户，可将 `.env.example` 复制为 `.env` 填写 Key，支持的服务与获取方式见 `docs/PROVIDERS.md`。**没有 `.env` 也能完成全部流程。**

## 目录速查

| 路径 | 用途 |
|---|---|
| `AGENT_GUIDE.md` | 运行契约（必读） |
| `setup.sh` | 一键安装（国内镜像） |
| `skills/` | 13 条流水线 + 核心/创意/元技能 |
| `tools/` | Python 工具链（生成、剪辑、音频、字幕…） |
| `tools/audio/edge_tts.py` | 免费 TTS provider |
| `tools/audio/builtin_music.py` | 内置 BGM 兜底（循环拼接） |
| `assets/默认背景音.m4a` | 内置兜底背景音乐 |
| `remotion-composer/` | Remotion 合成引擎 |
| `pipeline_defs/` | 流水线定义 |
| `backlot/` | 本地分镜预览服务 |
| `docs/` | 进阶文档 |
