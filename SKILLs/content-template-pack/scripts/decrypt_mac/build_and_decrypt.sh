#!/bin/bash
# build_and_decrypt.sh — Mac 本地解密剪映加密草稿（纯本地，内容不外泄）
#
# 原理: 剪映(VideoFusion/JianyingPro) 6.0+ 加密 draft_content.json，算法未公开，
#       只能借剪映自带的 lvve::EncryptUtils::decryptFile 解密。本脚本从已安装的
#       剪映.app 直接链接其 libvideoeditor.dylib（不复制，运行时 rpath 指向 app 内部
#       Frameworks，依赖完整），编译 jydec，再解密指定草稿。
#
# 前置: 已安装剪映/Videofusion Mac 版；系统已装 clang（xcode-select --install）
#
# 用法:
#   ./build_and_decrypt.sh                  # 仅编译 jydec
#   ./build_and_decrypt.sh <草稿目录>       # 编译 + 解密该目录的 draft_content.json
#   ./build_and_decrypt.sh <xxx.json>       # 编译 + 解密指定加密 json
#   ./build_and_decrypt.sh <x.json> <out.json> [keydir]   # 显式指定输出与 key 目录
#
# 解密产物: <输入>.dec.json （明文），随后交给 extract_template_pack.py 做模板

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARCH="$(uname -m)"   # arm64 / x86_64

# ---------- 1. 探测剪映/Videofusion app ----------
APP=""
for cand in "/Applications/VideoFusion-macOS.app" "/Applications/JianyingPro.app" "/Applications/剪映.app"; do
  [ -d "$cand" ] && APP="$cand" && break
done
if [ -z "$APP" ]; then
  APP=$(mdfind "kMDItemFSName == '*VideoFusion*' || kMDItemFSName == '*Jianying*' || kMDItemFSName == '*剪映*'" 2>/dev/null | grep -E '\.app$' | head -1)
fi
if [ -z "$APP" ] || [ ! -d "$APP" ]; then
  echo "❌ 未找到剪映/Videofusion app，请先安装剪映专业版 Mac 版"
  exit 1
fi
echo "✓ 找到剪映: $APP"

APP_FW="$APP/Contents/Frameworks"
[ -d "$APP_FW" ] || { echo "❌ Frameworks 目录不存在: $APP_FW"; exit 1; }

TARGET_LIB="$APP_FW/libvideoeditor.dylib"
[ -f "$TARGET_LIB" ] || { echo "❌ 未找到 libvideoeditor.dylib（该剪映版本可能不含解密库）"; exit 1; }
echo "✓ 解密库: $TARGET_LIB"

# ---------- 2. 编译 jydec（直接链接 app 内 dylib，rpath 指向 app Frameworks）----------
echo "→ 编译 jydec (arch=$ARCH) ..."
clang++ -arch "$ARCH" "$SCRIPT_DIR/main.cpp" -o "$SCRIPT_DIR/jydec" \
  -L"$APP_FW" -lvideoeditor \
  -Wl,-rpath,"$APP_FW" -std=c++17
if [ ! -x "$SCRIPT_DIR/jydec" ]; then
  echo "❌ 编译失败"
  exit 1
fi
echo "✓ jydec 编译完成: $SCRIPT_DIR/jydec"

# ---------- 3. 若无路径参数，仅编译结束 ----------
if [ -z "$1" ]; then
  echo ""
  echo "编译完成。解密用法:"
  echo "  $0 <草稿目录>          解密该目录的 draft_content.json"
  echo "  $0 <xxx.json>          解密指定加密 json（key 目录默认=文件所在目录）"
  echo "  $0 <x.json> <out.json> [keydir]   显式指定输出与 key 目录"
  echo "产物: <输入>.dec.json"
  exit 0
fi

# ---------- 4. 解密 ----------
INPUT="$1"
if [ -d "$INPUT" ]; then
  INPUT="$INPUT/draft_content.json"
fi
if [ ! -f "$INPUT" ]; then
  echo "❌ 输入文件不存在: $INPUT"
  exit 1
fi

if [ -n "$2" ]; then
  OUTPUT="$2"
else
  OUTPUT="${INPUT%.json}.dec.json"
fi
KEYDIR="${3:-$(dirname "$INPUT")}"

echo "→ 解密: $INPUT"
echo "  key 目录: $KEYDIR"
"$SCRIPT_DIR/jydec" "$INPUT" "$OUTPUT" "$KEYDIR"
RC=$?
if [ $RC -ne 0 ]; then
  echo "❌ 解密失败 (rc=$RC)"
  exit $RC
fi

# 验证输出是合法 JSON
PYTHON_BIN="/Users/archerjim/.workbuddy/binaries/python/envs/default/bin/python3"
if [ -x "$PYTHON_BIN" ]; then
  if "$PYTHON_BIN" -c "import json,sys; json.load(open('$OUTPUT')); print('✓ 明文 JSON 校验通过')" 2>/dev/null; then
    :
  else
    echo "⚠️  输出文件不是合法 JSON，可能解密失败或参数不对"
  fi
fi
echo "✅ 解密完成: $OUTPUT"
