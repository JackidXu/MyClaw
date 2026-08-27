---
name: ffmpeg-tool
description: 本地离线音视频处理工具。ffmpeg 静态二进制已预打包进 assets/，终端用户完全离线即可完成格式转换、压缩、提取音频、裁剪、合并、截图、GIF 等。当用户提到"视频转格式/压缩视频/提取音频/剪视频/合并视频/生成 GIF/ffmpeg/音视频处理/视频体积太大"时使用。适用于 macOS 与 Windows，运行时零联网、不依赖代理或外网，导入技能即自动就位。
license: CC-BY-4.0
compatibility: 需要 macOS 或 Windows；ffmpeg 二进制已预打包在 assets/（macOS arm64/x64 + Windows x64），导入技能后调用即自动设置可执行权限、在 macOS 上去掉 Gatekeeper 隔离标记，全程无需联网。如需升级 ffmpeg 版本或更换平台二进制，提供方可在有翻墙的机器上运行 scripts/download_deps.sh 重新拉取。
metadata:
  author: archerjim
  version: "1.1.0"
  target-platform: HeyClaw
allowed-tools: Bash
---

# ffmpeg-tool 使用说明

ffmpeg 静态二进制**已经预打包在技能目录的 `assets/` 中**。终端用户把本技能导入 HeyClaw 后，**不需要任何联网 / 代理**，即可离线处理音视频。所有参数都原样透传给 ffmpeg，所以 ffmpeg 能做的，本技能都能做。

## 离线 / 自动就位

- 二进制随技能一起分发，导入即自带，**完全不依赖外网**。
- 调用脚本（`scripts/run.sh` 或 `scripts/run.ps1`）在每次运行时会自动完成「安装」动作：按系统架构选择对应二进制 → 赋予可执行权限 → 在 macOS 上去除 Gatekeeper 隔离标记。即**调用即安装**，终端用户零手动步骤。

## 何时使用

- 视频 / 音频格式转换（mp4 / mov / mkv / webm / avi ↔ mp3 / m4a / wav / aac ...）
- 压缩体积、调整分辨率 / 码率 / 帧率
- 从视频提取音频、从音频截取片段
- 裁剪、合并、拼接多个片段
- 截图（抽取静帧）、生成 GIF、加简单水印

## 调用方式（跨平台包装脚本）

请让 Agent 用 Bash 运行：

- **macOS**：`bash <技能目录>/scripts/run.sh <ffmpeg 参数...>`
- **Windows**：`powershell -ExecutionPolicy Bypass -File <技能目录>/scripts/run.ps1 <ffmpeg 参数...>`

## 常见任务示例

> 下面以 macOS 写法为例，Windows 把 `run.sh` 换成 `run.ps1`、参数完全一致即可。

1. 视频转音频（mp4 → mp3）
   `bash scripts/run.sh -i input.mp4 -vn -acodec libmp3lame output.mp3`

2. 压缩视频（缩到 720p、1Mbps）
   `bash scripts/run.sh -i input.mp4 -vf scale=-2:720 -b:v 1M -c:a aac out.mp4`

3. 把 mkv 转成兼容性最好的 mp4
   `bash scripts/run.sh -i input.mkv -c:v libx264 -c:a aac out.mp4`

4. 截取 00:01:00 起 10 秒
   `bash scripts/run.sh -i input.mp4 -ss 00:01:00 -t 10 clip.mp4`

5. 合并多个片段（先建 list.txt：`file 'a.mp4'` 每行一个）
   `bash scripts/run.sh -f concat -safe 0 -i list.txt -c copy merged.mp4`

6. 抽一帧做封面
   `bash scripts/run.sh -i input.mp4 -ss 00:00:03 -frames:v 1 cover.jpg`

7. 生成 GIF
   `bash scripts/run.sh -i input.mp4 -t 3 -vf "fps=10,scale=480:-1" out.gif`

## 注意事项

- 二进制**已内置**在 `assets/`，终端用户无需再运行任何下载脚本；本技能开箱即用、零联网。
- 仅当你（提供方）想**升级 ffmpeg 版本**或**更换平台二进制**时，才需要在有翻墙的机器上运行
  `bash scripts/download_deps.sh`（脚本会自动探测本机翻墙代理、用断点续传拉取三端二进制）。
- Windows 端首次运行若被 SmartScreen 拦截，选择"仍要运行"即可（提供方对二进制做代码签名可彻底规避）。
