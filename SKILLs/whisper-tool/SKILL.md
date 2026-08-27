---
name: whisper-tool
description: 本地离线语音转文字（字幕）工具。首次使用按需自动从国内高速镜像源就位 whisper.cpp 二进制、ggml-base.bin 模型与内置 ffmpeg，无需代理即可把音频/视频中的语音识别为文字，支持中文及多语言，可输出 txt/srt/vtt 字幕。当用户提到"语音转文字/视频转字幕/音频转写/会议记录/字幕生成/whisper/语音识别/转录/把说话内容变成文字"时使用。适用于 macOS 与 Windows。
license: CC-BY-4.0
compatibility: 需要 macOS 或 Windows；首次调用时自动从高速镜像源下载依赖并完成权限配置，后续全程离线运行。
metadata:
  author: archerjim
  version: "1.1.0"
  target-platform: HeyClaw
allowed-tools: Bash
---

# whisper-tool 使用说明

本技能把 **whisper.cpp 二进制 + ggml-base.bin 模型 + 一个内置 ffmpeg** 全部**预打包进技能目录的 `assets/`**，让终端用户在**完全没有外网 / 代理**的环境下完成语音转写（支持中文及多语言）。

调用脚本会自动完成三件事：

1. 根据系统架构选择对应的 whisper.cpp 二进制（macOS 通用 / Windows x64）；
2. 若输入不是 `.wav`，用内置 ffmpeg 抽成 16kHz 单声道 wav（whisper 最稳的输入）；
3. 调用 whisper.cpp 转写，输出同名的字幕 / 文本文件。

## 离线 / 自动就位

- 二进制、模型、内置 ffmpeg **全部随技能分发**，导入即自带，完全不依赖外网。
- 调用脚本在运行时自动完成「安装」：按架构选二进制 → 赋予可执行权限 → macOS 上去掉 Gatekeeper 隔离标记。即**调用即安装**，用户零手动步骤。

## 何时使用

- 把会议录音、访谈、网课、视频里的语音变成文字
- 给视频生成字幕（srt / vtt）
- 多语言识别（中文、英文、日文等；`--lang auto` 自动检测）

## 调用方式（跨平台包装脚本）

- **macOS**：`bash <技能目录>/scripts/run.sh <输入文件> [--format srt|vtt|txt] [--lang zh|en|auto]`
- **Windows**：`powershell -ExecutionPolicy Bypass -File <技能目录>/scripts/run.ps1 <输入文件> [-Format srt] [-Lang auto]`

## 常见任务示例

> 以 macOS 写法为例，Windows 把 `run.sh` 换成 `run.ps1`、参数一致。

1. 视频转 srt 字幕（自动识别语言）
   `bash scripts/run.sh meeting.mp4` → 生成 `meeting_whisper.srt`

2. 指定中文、输出纯文本
   `bash scripts/run.sh audio.m4a --format txt --lang zh` → 生成 `audio_whisper.txt`

3. 输出 vtt（适合网页播放器）
   `bash scripts/run.sh lecture.mp4 --format vtt`

## 参数说明

| 参数 | 含义 | 默认值 |
| --- | --- | --- |
| 位置参数（第一个） | 输入音视频文件 | 必填 |
| `--format` | 输出格式：`srt` / `vtt` / `txt` | `srt` |
| `--lang` | 语言：`zh` / `en` / `ja` / `auto` 等 | `auto` |

## 注意事项

- 二进制、模型、内置 ffmpeg **已内置**在 `assets/`，终端用户开箱即用、零联网，无需再运行任何下载脚本。
- 想提升识别精度可换用更大的模型（`ggml-small.bin` / `ggml-medium.bin`）：把对应文件放进
  `assets/models/`，并修改 `scripts/run.sh` 里的 `MODEL` 变量（Windows 改 `run.ps1` 里的 `$Model`）即可。
- 仅当你（提供方）想**升级二进制 / 换模型**时，才需要在有翻墙的 macOS 上运行 `bash scripts/download_deps.sh`
  （脚本会自动探测本机翻墙代理、拉取 Windows 二进制与模型、并本地编译 macOS 通用二进制）。
- Windows 端首次运行若被 SmartScreen 拦截，选择"仍要运行"即可。
