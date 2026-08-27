#!/usr/bin/env bash
# ffmpeg-tool 包装脚本（macOS / Linux）
# 自动选择对应架构的静态 ffmpeg 二进制，并透传所有参数。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSETS="$SCRIPT_DIR/../assets"

OS="$(uname -s)"
ARCH="$(uname -m)"

if [ "$OS" = "Darwin" ]; then
  if [ "$ARCH" = "arm64" ]; then
    BIN="$ASSETS/macos-arm64/ffmpeg"
  else
    BIN="$ASSETS/macos-x64/ffmpeg"
  fi
elif [ "$OS" = "Linux" ]; then
  echo "ffmpeg-tool 不支持 Linux（HeyClaw 仅 macOS / Windows）。" >&2
  exit 1
else
  echo "未知操作系统: $OS" >&2
  exit 1
fi

# macOS 下载的二进制带 quarantine 标记，运行时去掉，避免被 Gatekeeper 拦截
if [ "$OS" = "Darwin" ] && command -v xattr >/dev/null 2>&1; then
  xattr -d com.apple.quarantine "$BIN" 2>/dev/null || true
fi

if [ ! -f "$BIN" ]; then
  echo "未找到 ffmpeg 二进制: $BIN" >&2
  echo "发布前请提供方在有代理的机器上运行: bash scripts/download_deps.sh" >&2
  exit 2
fi

chmod +x "$BIN" 2>/dev/null || true
exec "$BIN" "$@"
