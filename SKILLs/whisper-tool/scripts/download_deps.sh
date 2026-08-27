#!/usr/bin/env bash
# whisper-tool 提供方专用：在有翻墙的机器上重新拉取/更新所有依赖，内嵌进 assets/。
# 会自动探测本机翻墙代理、断点续传下载 ffmpeg(三端)/Windows whisper 二进制/ggml 模型，
# 若本机是 macOS 还会本地编译通用(arm64;x86_64) whisper-cli。终端用户无需运行本脚本（已预打包）。
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
cd "$SKILL_DIR"
PY="${PY:-python3}"
log(){ echo "[$(date +%H:%M:%S)] $*"; }

# 代理自动探测
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

WH_TAG=b4938
FF_TAG=b6.1.1

log "=== 1) 内置 ffmpeg (三端) ==="
dl "https://github.com/eugeneware/ffmpeg-static/releases/download/$FF_TAG/ffmpeg-darwin-arm64" "assets/ffmpeg/macos-arm64/ffmpeg"
dl "https://github.com/eugeneware/ffmpeg-static/releases/download/$FF_TAG/ffmpeg-darwin-x64"   "assets/ffmpeg/macos-x64/ffmpeg"
dl "https://github.com/eugeneware/ffmpeg-static/releases/download/$FF_TAG/ffmpeg-win32-x64"    "assets/ffmpeg/windows-x64/ffmpeg.exe"

log "=== 2) whisper Windows 二进制 ==="
dl "https://github.com/ggml-org/whisper.cpp/releases/download/$WH_TAG/whisper-bin-x64.zip" "/tmp/whisper-bin-x64.zip"
rm -rf /tmp/whisper-win && mkdir -p /tmp/whisper-win
unzip -o -q /tmp/whisper-bin-x64.zip -d /tmp/whisper-win
WINEXE=$(find /tmp/whisper-win -iname 'whisper-cli.exe' -o -iname 'whisper.exe' 2>/dev/null | head -1)
if [ -n "$WINEXE" ]; then
  mkdir -p assets/windows-x64
  cp "$WINEXE" assets/windows-x64/whisper-cli.exe
  log "win whisper -> $WINEXE"
else
  log "WARN: 未找到 windows whisper exe，zip 内容:"; find /tmp/whisper-win -maxdepth 2 -type f | head
fi

log "=== 3) ggml-base.bin 模型 (hf-mirror 优先, hf 直连兜底) ==="
mkdir -p assets/models
dl "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-base.bin" "assets/models/ggml-base.bin" || \
dl "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin" "assets/models/ggml-base.bin"

# macOS 通用二进制编译（仅本机是 macOS 且尚不存在时）
if [ "$(uname -s)" = "Darwin" ] && [ ! -f assets/macos-universal/whisper-cli ]; then
  log "=== 4) 编译 macOS 通用 whisper-cli ==="
  CMAKE=""
  command -v cmake >/dev/null 2>&1 && CMAKE=$(command -v cmake)
  if [ -z "$CMAKE" ]; then
    "$PY" -m pip install --quiet cmake 2>/dev/null && \
      CMAKE="$("$PY" -c 'import cmake,os;print(os.path.join(os.path.dirname(cmake.__file__),"bin","cmake"))' 2>/dev/null)"
  fi
  if [ -z "$CMAKE" ] || [ ! -x "$CMAKE" ]; then
    log "pip cmake 失败, 改从 github 下载 cmake 通用包"
    curl -sL --retry 5 --max-time 590 -C - -o /tmp/cmake.tar.gz "https://github.com/Kitware/CMake/releases/download/v3.30.5/cmake-3.30.5-macos-universal.tar.gz"
    tar -xzf /tmp/cmake.tar.gz -C /tmp
    CMAKE=$(find /tmp/cmake-3.30.5-macos-universal -name cmake -type f 2>/dev/null | head -1)
  fi
  if [ -x "$CMAKE" ]; then
    "$CMAKE" --version | head -1
    rm -rf /tmp/whisper.cpp
    if git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git /tmp/whisper.cpp 2>/dev/null; then
      (cd /tmp/whisper.cpp && git submodule update --init --recursive --depth 1)
    else
      log "github 直连失败, 改用 gitclone.com 镜像"
      git clone --depth 1 https://gitclone.com/github.com/ggml-org/whisper.cpp.git /tmp/whisper.cpp
      (cd /tmp/whisper.cpp && git config submodule.ggml.url https://gitclone.com/github.com/ggml-org/ggml.git \
        && git submodule update --init --recursive --depth 1)
    fi
    mkdir -p /tmp/whisper.cpp/build && cd /tmp/whisper.cpp/build
    "$CMAKE" -DCMAKE_OSX_ARCHITECTURES="arm64;x86_64" -DCMAKE_BUILD_TYPE=Release \
      -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_EXAMPLES=ON .. >/tmp/cfg.log 2>&1
    "$CMAKE" --build . --config Release -j"$(sysctl -n hw.ncpu)" >/tmp/build.log 2>&1
    BIN=$(find /tmp/whisper.cpp/build -type f \( -name 'whisper-cli' -o -name 'whisper' \) 2>/dev/null | head -1)
    if [ -n "$BIN" ]; then
      mkdir -p "$SKILL_DIR/assets/macos-universal"
      cp "$BIN" "$SKILL_DIR/assets/macos-universal/whisper-cli"
      log "mac whisper -> $BIN"
    else
      log "BUILD FAIL"; tail -25 /tmp/build.log
    fi
  else
    log "cmake 不可用, 跳过 mac 编译；可手动编译后放入 assets/macos-universal/whisper-cli"
  fi
fi

# 权限
chmod +x assets/ffmpeg/macos-arm64/ffmpeg assets/ffmpeg/macos-x64/ffmpeg assets/macos-universal/whisper-cli 2>/dev/null || true
log "=== whisper-tool 依赖更新完成 ==="
du -sh assets/models/ggml-base.bin assets/windows-x64/whisper-cli.exe assets/macos-universal/whisper-cli 2>/dev/null
