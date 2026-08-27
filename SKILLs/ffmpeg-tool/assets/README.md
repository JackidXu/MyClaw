# assets 目录

本目录用于存放**静态编译的 ffmpeg 二进制**。为防止技能包过大，二进制默认不随仓库提交，
发布前请提供方在有代理的机器上运行：

- macOS / Linux 提供方：`bash scripts/download_deps.sh`
- Windows 提供方：`powershell -ExecutionPolicy Bypass -File scripts/download_deps.ps1`

脚本执行后，本目录结构应如下：

```
assets/
├── macos-arm64/ffmpeg        # Apple Silicon
├── macos-x64/ffmpeg          # Intel Mac
└── windows-x64/ffmpeg.exe    # Windows x64
```

之后把整个技能目录压缩成 zip 分发给终端用户即可；终端用户运行时完全离线，不依赖代理或外网。
