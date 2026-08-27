# assets 目录

本目录存放运行 whisper 所需的全部离线依赖（默认不随仓库提交，体积较大）：

```
assets/
├── macos-universal/whisper-cli     # 本地编译的 macOS 通用二进制（arm64 + x86_64）
├── windows-x64/
│   ├── whisper-cli.exe            # Windows 预编译二进制
│   └── *.dll                      # 运行所需动态库
├── ffmpeg/                        # 内置 ffmpeg，用于非 wav 输入的音频抽取
│   ├── macos-arm64/ffmpeg
│   ├── macos-x64/ffmpeg
│   └── windows-x64/ffmpeg.exe
└── models/
    └── ggml-base.bin              # 多语言模型（含中文，约 140MB）
```

## 发布前准备（提供方，需代理）

在 macOS 上运行（推荐，可同时产出 mac + win 两端）：

```bash
bash scripts/download_deps.sh
```

若你只服务 Windows 用户，也可在 Windows 上运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/download_deps.ps1
```

脚本执行完毕后，把整个技能目录压缩成 zip 分发给终端用户即可；终端用户运行时完全离线。

## 换更大模型（可选）

`ggml-base.bin` 是体积/精度折中。若要更高精度，把 `assets/models/` 换成
`ggml-small.bin`（约 240MB）或 `ggml-medium.bin`（约 1.5GB），并修改
`scripts/run.sh` 里的 `MODEL` 变量指向新文件即可。模型下载地址：
`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-<型号>.bin`
