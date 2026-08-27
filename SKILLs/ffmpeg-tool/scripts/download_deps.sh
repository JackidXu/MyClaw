#!/usr/bin/env bash
# ffmpeg-tool 提供方专用：在有翻墙的机器上重新拉取/更新 ffmpeg 静态二进制，内嵌进 assets/。
# 终端用户无需运行本脚本（二进制已预打包）。脚本会自动探测本机翻墙代理并使用断点续传。
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
cd "$SKILL_DIR"
log(){ echo "[$(date +%H:%M:%S)] $*"; }

# 代理自动探测：优先用环境 https_proxy/http_proxy；否则扫描常见本机翻墙端口
if [ -z "${https_proxy:-}" ] && [ -z "${HTTPS_PROXY:-}" ]; then
  for p in 7890 1087 1080 8118 8080 60069; do
    if curl -sL --max-time 5 -x "http://127.0.0.1:$p" -o /dev/null "https://github.com" 2>/dev/null; then
      export HTTPS_PROXY="http://127.0.0.1:$p" HTTP_PROXY="http://127.0.0.1:$p"
      log "未设代理，自动使用本机翻墙端口 $p"
      break
    fi
  done
else
  log "使用环境代理 https_proxy=${https_proxy:-$HTTPS_PROXY}"
fi

dl() { # url out
  local url="$1" out="$2"
  mkdir -p "$(dirname "$out")"
  for i in $(seq 1 40); do
    if curl -sL --retry 3 --retry-delay 3 --max-time 590 -C - -o "$out" "$url"; then
      local sz; sz=$(wc -c <"$out" 2>/dev/null || echo 0)
      if [ "${sz:-0}" -gt 1000 ]; then log "OK  $out ($sz bytes)"; return 0; fi
    fi
    log "retry $i for $out"; sleep 3
  done
  log "FAIL $out"; return 1
}

TAG=b6.1.1
log "=== 下载 ffmpeg 静态二进制 (macOS arm64 / x64 + Windows x64) ==="
dl "https://github.com/eugeneware/ffmpeg-static/releases/download/$TAG/ffmpeg-darwin-arm64" "assets/macos-arm64/ffmpeg"
dl "https://github.com/eugeneware/ffmpeg-static/releases/download/$TAG/ffmpeg-darwin-x64"   "assets/macos-x64/ffmpeg"
dl "https://github.com/eugeneware/ffmpeg-static/releases/download/$TAG/ffmpeg-win32-x64"    "assets/windows-x64/ffmpeg.exe"

# 赋予可执行权限（mac/linux）
chmod +x assets/macos-arm64/ffmpeg assets/macos-x64/ffmpeg 2>/dev/null || true

log "=== ffmpeg-tool 二进制更新完成 ==="
du -sh assets/macos-arm64/ffmpeg assets/macos-x64/ffmpeg assets/windows-x64/ffmpeg.exe 2>/dev/null
