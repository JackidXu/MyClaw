#!/usr/bin/env bash
# whisper-tool 包装脚本（macOS / Linux）
# 自动选择 whisper.cpp 二进制与内置 ffmpeg，抽取音频（如需）后调用 whisper 转写。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSETS="$SCRIPT_DIR/../assets"

OS="$(uname -s)"
ARCH="$(uname -m)"

if [ "$OS" = "Darwin" ]; then
  WH="$ASSETS/macos-universal/whisper-cli"
  if [ "$ARCH" = "arm64" ]; then
    FF="$ASSETS/ffmpeg/macos-arm64/ffmpeg"
  else
    FF="$ASSETS/ffmpeg/macos-x64/ffmpeg"
  fi
elif [ "$OS" = "Linux" ]; then
  echo "whisper-tool 不支持 Linux（HeyClaw 仅 macOS / Windows）。" >&2
  exit 1
else
  echo "未知操作系统: $OS" >&2
  exit 1
fi

MODEL="$ASSETS/models/ggml-base.bin"

# 去掉 macOS 隔离标记 + 确保可执行
if [ "$OS" = "Darwin" ] && command -v xattr >/dev/null 2>&1; then
  xattr -d com.apple.quarantine "$WH" 2>/dev/null || true
  xattr -d com.apple.quarantine "$FF" 2>/dev/null || true
fi
chmod +x "$WH" "$FF" 2>/dev/null || true

# 依赖检查
[ -f "$WH" ]    || { echo "缺少 whisper-cli: $WH ，请提供方运行 download_deps.sh" >&2; exit 2; }
[ -f "$FF" ]    || { echo "缺少内置 ffmpeg: $FF ，请提供方运行 download_deps.sh" >&2; exit 2; }
[ -f "$MODEL" ] || { echo "缺少模型 ggml-base.bin: $MODEL ，请提供方运行 download_deps.sh" >&2; exit 2; }

# 解析参数
INPUT=""; FMT="srt"; LANG="auto"
while [ $# -gt 0 ]; do
  case "$1" in
    --format) FMT="$2"; shift 2;;
    --lang)   LANG="$2"; shift 2;;
    --*)      echo "未知选项: $1" >&2; exit 1;;
    *)        if [ -z "$INPUT" ]; then INPUT="$1"; else echo "多余参数: $1" >&2; exit 1; fi; shift;;
  esac
done

[ -n "$INPUT" ] || { echo "用法: run.sh <输入文件> [--format srt|vtt|txt] [--lang zh|en|auto]" >&2; exit 1; }
[ -f "$INPUT" ] || { echo "输入文件不存在: $INPUT" >&2; exit 1; }

ORIGINAL="$INPUT"
EXT="${INPUT##*.}"
LOWER_EXT="$(printf '%s' "$EXT" | tr '[:upper:]' '[:lower:]')"

TMPWAV=""
if [ "$LOWER_EXT" != "wav" ]; then
  TMPWAV="$(mktemp -t whisper.XXXXXX).wav"
  if ! "$FF" -y -i "$INPUT" -ar 16000 -ac 1 -c:a pcm_s16le "$TMPWAV" >/dev/null 2>&1; then
    echo "音频抽取失败（ffmpeg 无法解码该文件）。" >&2
    [ -n "$TMPWAV" ] && rm -f "$TMPWAV"
    exit 3
  fi
  INPUT="$TMPWAV"
fi

OUT_BASE="${ORIGINAL%.*}_whisper"

# 把 --format 映射到 whisper.cpp 的布尔开关（b4938 起为 -osrt/-ovtt/-otxt 等）
case "$FMT" in
  srt)  OFLAG="-osrt";;
  vtt)  OFLAG="-ovtt";;
  txt)  OFLAG="-otxt";;
  lrc)  OFLAG="-olrc";;
  csv)  OFLAG="-ocsv";;
  json) OFLAG="-oj";;
  *)    echo "不支持的格式: $FMT （支持 srt/vtt/txt/lrc/csv/json）" >&2; exit 1;;
esac

"$WH" -m "$MODEL" -f "$INPUT" $OFLAG -of "$OUT_BASE" -l "$LANG"
echo "已生成: ${OUT_BASE}.${FMT}"

[ -n "$TMPWAV" ] && rm -f "$TMPWAV"
