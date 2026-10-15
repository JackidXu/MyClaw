# 视频制作（VideoMaker）

一套开源的 AI 视频生产系统：从创意、脚本、分镜、素材生成，到配音、配乐、合成、字幕，全流程由 AI Agent 编排完成。

> 本项目基于 AGPL-3.0 开源许可证发布，详见 [LICENSE](LICENSE)。

## 能做什么

内置 13 条视频生产流水线，覆盖主流视频形态：

| 流水线 | 适用场景 |
|---|---|
| talking-head | 真人口播 / 数字人讲解 |
| avatar-spokesperson | 数字人发言人（产品介绍、品牌宣讲） |
| explainer | 产品/概念解说动画 |
| animation | 动画短片 |
| character-animation | 角色动画 |
| cinematic | 电影感短片 |
| documentary-montage | 纪录片式蒙太奇 |
| screen-demo | 屏幕录制演示（软件教学） |
| clip-factory | 短视频切片批量生产 |
| podcast-repurpose | 播客切片二次分发 |
| localization-dub | 多语言本地化配音 |
| hybrid | 混合形态（实拍+生成） |
| music-to-video | 音乐驱动视频 |

## 快速开始

### 第一步：安装环境

```bash
bash setup.sh
```

安装脚本全程使用国内镜像（清华 PyPI / 淘宝 npm），**无需翻墙**。它会自动完成：

1. 创建 Python 虚拟环境并安装依赖
2. 安装 remotion-composer 的 Node 依赖
3. 检查 ffmpeg（缺失时从国内镜像下载）
4. 安装免费 Edge TTS（无需任何 API Key）

### 第二步：配置能力（可选）

本系统按「三级路由」自动选择生成能力，**零配置即可使用**：

| 能力 | 优先级 1 | 优先级 2（无 Key 默认） | 优先级 3（兜底） |
|---|---|---|---|
| 图片生成 | `.env` 中配置的图片 API | **Heyclaw 内置** `heyclaw_image_generate`（Doubao-Seedream-4.5） | — |
| 视频片段生成 | `.env` 中配置的视频 API | **Heyclaw 内置** `heyclaw_video_generate`（Doubao-Seedance-2.5） | — |
| TTS 配音 | `.env` 中配置的 TTS API | **Edge TTS**（微软免费接口，国内可直连） | 等 Heyclaw 内置 TTS 上线后切换 |
| 背景音乐 | 网络下载可商用 BGM（Pixabay 等） | 用户自备音乐文件 | **内置默认背景音**（循环拼接至视频时长） |

如需接入自己的 API Key，复制 `.env.example` 为 `.env` 并填写，支持的服务见 `docs/PROVIDERS.md`。

### 第三步：开始制作

直接对 AI 说你想做什么，例如：

- 「帮我做一条 60 秒的产品介绍视频，主题是……」
- 「把我的播客第 3 期切成 5 条短视频」
- 「参考这个视频的风格，做一条类似的」

## 核心文档

| 文档 | 内容 |
|---|---|
| `SKILL.md` | Skill 主入口：能力路由规则与工作流 |
| `AGENT_GUIDE.md` | Agent 完整操作指南（运行契约） |
| `PROJECT_CONTEXT.md` | 架构与关键文件说明 |
| `docs/PROVIDERS.md` | 支持的第三方服务与配置方法 |
| `skills/INDEX.md` | 全部技能索引 |

## 目录结构

```
├── SKILL.md               # Skill 主入口
├── setup.sh               # 一键安装（国内镜像）
├── assets/                # 内置素材（默认背景音.m4a）
├── skills/                # 13 条流水线 + 核心/创意/元技能
├── tools/                 # Python 工具链（生成、剪辑、音频、字幕…）
├── lib/                   # 配置与公共库
├── pipeline_defs/         # 流水线定义
├── remotion-composer/     # Remotion 合成引擎（网页级动效）
├── schemas/               # 数据结构校验
├── backlot/               # 本地分镜预览服务
└── docs/                  # 文档
```
