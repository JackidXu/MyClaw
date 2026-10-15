#!/usr/bin/env bash
# 视频制作（VideoMaker）一键安装脚本 —— 全程国内镜像，无需翻墙
# 用法: bash setup.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PIP_MIRROR="https://pypi.tuna.tsinghua.edu.cn/simple"
NPM_MIRROR="https://registry.npmmirror.com"
FFMPEG_BASE="https://registry.npmmirror.com/-/binary/ffmpeg-static/b6.0"
LOCAL_BIN="$ROOT/.local-bin"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[警告]${NC} $1"; }
fail() { echo -e "${RED}[失败]${NC} $1"; }

echo "======================================"
echo " 视频制作（VideoMaker）环境安装"
echo " 全程使用国内镜像，无需翻墙"
echo "======================================"

failures=0

# ---------- 1. Python 虚拟环境 ----------
echo ""
echo "→ [1/4] Python 依赖"
if command -v python3 >/dev/null 2>&1; then
    PYVER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || echo "0")
    PYOK=$(python3 -c 'import sys; print(1 if sys.version_info >= (3, 10) else 0)' 2>/dev/null || echo 0)
    if [ "$PYOK" = "1" ]; then
        if [ ! -d "$ROOT/.venv" ]; then
            python3 -m venv "$ROOT/.venv" || { fail "创建虚拟环境失败"; failures=$((failures+1)); }
        fi
        if "$ROOT/.venv/bin/pip" install -q -i "$PIP_MIRROR" -r "$ROOT/requirements.txt"; then
            ok "Python 依赖安装完成（$(echo $PYVER)，清华镜像）"
        else
            fail "Python 依赖安装失败"; failures=$((failures+1))
        fi
    else
        fail "需要 Python 3.10+（当前 $PYVER），请先安装新版 Python"
        failures=$((failures+1))
    fi
else
    fail "未找到 python3，请先安装 Python 3.10+"
    failures=$((failures+1))
fi

# ---------- 2. ffmpeg / ffprobe ----------
echo ""
echo "→ [2/4] ffmpeg / ffprobe"
mkdir -p "$LOCAL_BIN"
need_ffmpeg=0; need_ffprobe=0
command -v ffmpeg >/dev/null 2>&1 || need_ffmpeg=1
command -v ffprobe >/dev/null 2>&1 || need_ffprobe=1

OS=$(uname -s); ARCH=$(uname -m)
case "$OS:$ARCH" in
    Darwin:arm64) PLATFORM="darwin-arm64" ;;
    Darwin:*)     PLATFORM="darwin-x64" ;;
    Linux:aarch64) PLATFORM="linux-arm64" ;;
    Linux:*)      PLATFORM="linux-x64" ;;
    *)            PLATFORM="" ;;
esac

fetch_binary() {
    local name="$1"
    local url="$FFMPEG_BASE/$name.gz"
    local dest="$LOCAL_BIN/$name"
    if curl -fsSL --retry 3 --max-time 300 -o "$dest.gz" "$url" && \
       gunzip -f "$dest.gz" && chmod +x "$dest"; then
        ok "$name 已下载到 .local-bin/"
    else
        fail "$name 下载失败（$url）"
        return 1
    fi
}

if [ "$need_ffmpeg" = "1" ] || [ "$need_ffprobe" = "1" ]; then
    if [ -n "$PLATFORM" ]; then
        [ "$need_ffmpeg" = "1" ] && { fetch_binary "ffmpeg-$PLATFORM" || failures=$((failures+1)); }
        [ "$need_ffprobe" = "1" ] && { fetch_binary "ffprobe-$PLATFORM" || failures=$((failures+1)); }
        # 放入 PATH 的提示
        if [ -x "$LOCAL_BIN/ffmpeg-$PLATFORM" ]; then
            warn "首次使用前，请把内置 ffmpeg 加入 PATH："
            echo "    export PATH=\"$LOCAL_BIN:\$PATH\""
            echo "  （建议追加到 ~/.zshrc 或 ~/.bashrc）"
        fi
    else
        warn "未识别的平台（$OS $ARCH），且系统无 ffmpeg。请手动安装 ffmpeg 后重试。"
        failures=$((failures+1))
    fi
else
    ok "ffmpeg / ffprobe 已就绪（系统）"
fi

# ---------- 3. Node 依赖（remotion-composer） ----------
echo ""
echo "→ [3/4] Remotion 合成引擎（Node 依赖）"
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    if [ -f "$ROOT/remotion-composer/package.json" ]; then
        if (cd "$ROOT/remotion-composer" && npm install --no-audit --no-fund --registry "$NPM_MIRROR" >/dev/null 2>&1); then
            ok "Remotion 依赖安装完成（淘宝镜像）"
        else
            fail "Remotion 依赖安装失败"
            failures=$((failures+1))
        fi
    else
        warn "未找到 remotion-composer/package.json，跳过"
    fi
else
    warn "未安装 Node.js（可选，仅影响 Remotion 高级合成）。不影响基础视频制作。"
fi

# ---------- 4. 免费能力自检 ----------
echo ""
echo "→ [4/4] 零配置能力自检"
if [ -d "$ROOT/.venv" ] && [ -x "$ROOT/.venv/bin/python" ]; then
    if "$ROOT/.venv/bin/python" -m edge_tts --list-voices >/dev/null 2>&1; then
        ok "Edge TTS（免费配音）：可用"
    else
        warn "Edge TTS 包已装但连接微软服务失败（部分网络出口会被 403）。可换网络重试，或在 .env 配置其他 TTS Key。"
    fi
else
    warn "Python 环境未就绪，跳过自检"
fi
[ -f "$ROOT/assets/默认背景音.m4a" ] && ok "内置背景音乐：已打包（assets/默认背景音.m4a）" || warn "内置背景音乐缺失"

echo ""
echo "======================================"
if [ $failures -eq 0 ]; then
    echo -e "${GREEN}安装完成！${NC}可直接对 AI 说你想做什么视频。"
else
    echo -e "${YELLOW}安装完成，但有 $failures 项失败，请按上方提示处理。${NC}"
fi
echo "======================================"
