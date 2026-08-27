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

download_file() {
  local url="$1" out="$2"
  mkdir -p "$(dirname "$out")"
  echo ">>> [ffmpeg-tool] 正在下载 ffmpeg 二进制组件..."
  local proxy_url="https://gh-proxy.com/$url"
  if curl -sL --retry 3 --retry-delay 2 --max-time 180 -C - -o "$out.tmp" "$proxy_url" || \
     curl -sL --retry 3 --retry-delay 2 --max-time 180 -C - -o "$out.tmp" "$url"; then
    mv "$out.tmp" "$out"
    echo ">>> [ffmpeg-tool] 下载完成！"
    return 0
  fi
  rm -f "$out.tmp"
  return 1
}

TAG="b6.1.1"
if [ ! -f "$BIN" ]; then
  if [ "$OS" = "Darwin" ]; then
    if [ "$ARCH" = "arm64" ]; then
      download_file "https://github.com/eugeneware/ffmpeg-static/releases/download/$TAG/ffmpeg-darwin-arm64" "$BIN" || {
        echo "ffmpeg 二进制下载失败，请检查网络后重试。" >&2; exit 2;
      }
    else
      download_file "https://github.com/eugeneware/ffmpeg-static/releases/download/$TAG/ffmpeg-darwin-x64" "$BIN" || {
        echo "ffmpeg 二进制下载失败，请检查网络后重试。" >&2; exit 2;
      }
    fi
  fi
fi

chmod +x "$BIN" 2>/dev/null || true
exec "$BIN" "$@"
