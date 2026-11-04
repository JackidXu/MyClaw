# 渲染环境配置

本文档说明 render.js 渲染器的环境配置、环境变量、常见问题处理。

---

## 一、系统依赖

| 依赖                  | 用途             | 安装命令                                                                                                  |
| ------------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| **node ≥16**        | 运行 render.js   | macOS: `brew install node` / Ubuntu: `apt install nodejs` / Windows: 官网下载                             |
| **ffmpeg**          | 视频合成（帧序列→mp4）  | macOS: `brew install ffmpeg` / Ubuntu: `sudo apt install -y ffmpeg` / Windows: `choco install ffmpeg` |
| **Chromium**        | puppeteer 逐帧截图 | render.js 首次运行自动下载；或用系统 Chrome                                                                        |
| **Python + Kokoro** | TTS 语音生成       | `pip install kokoro misaki[zh] soundfile`                                                             |

如果是 Heyclaw 使用，检查技能库是否有 ffmpeg-tool / python-tool / kokoro-tool 进行离线安装。

### 字体（已打包，无需额外安装）

技能 `assets/fonts/` 目录只自带英文/装饰字体；**中文渲染依赖宿主系统字体兜底**，通过 `font-family` 兜底链实现：`'PingFang SC', 'Noto Sans CJK SC', 'Microsoft YaHei', system-ui, sans-serif`。

| 字体                        | 文件                                 | 用途                 | 来源     |
| ------------------------- | ---------------------------------- | ------------------ | ------ |
| 苹方 / Noto Sans CJK / 微软雅黑 | 系统字体                               | 中文主力字体（字幕、卡片文字、标题） | 宿主系统兜底 |
| Inter                     | Inter-400/700-latin.woff2（各 ~24K）  | 英文标签/数据/代码片段       | 技能自带   |
| Caveat                    | Caveat-400/700-latin.woff2（各 ~73K） | 英文手写装饰标注           | 技能自带   |
| Virgil                    | Virgil.woff2（~60K）                 | 英文草图/白板风格标注        | 技能自带   |

### ⚠️ 中文渲染环境前置（重要）

- **macOS**：自带苹方 PingFang SC，可直接渲染，无需任何额外操作。
- **Linux 容器/服务器**：默认通常**没有**中文字体，必须先装一个，否则中文会显示为豆腐方框□□□：
  ```bash
  # Debian/Ubuntu
  sudo apt install -y fonts-noto-cjk      # 推荐，字形全
  # 或轻量版
  sudo apt install -y fonts-wqy-zenhei
  ```
- **Windows**：自带微软雅黑，可直接渲染。
- **Heyclaw 等 AI 工具**：若渲染环境是 Linux 容器，需确认镜像内已装中文字体；如未装，渲染前先执行上面的 apt 命令。

render.js 在截图前会等待 `document.fonts.ready` 确保自带字体加载完成；系统字体由浏览器在渲染时直接调用，无需等待。ink 风格的楷体/宋体同样依赖系统字体，如环境无此字体会回退到兜底链首个可用字体。

---

## 二、环境变量

| 变量                              | 作用                                      | 设置方式                                                                                                                                                                             |
| ------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUPPETEER_EXECUTABLE_PATH`     | 指定 Chrome 路径（不用自动下载的 Chromium）          | macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`<br />Windows: `C:\Program Files\Google\Chrome\Application\chrome.exe`<br />Linux: `/usr/bin/google-chrome` |
| `PUPPETEER_DOWNLOAD_BASE_URL`   | 换 Chromium 下载镜像（下载卡住时用）                 | `https://npmmirror.com/mirrors/chromium-browser-snapshots`                                                                                                                       |
| `NODE_PATH`                     | 指定 node_modules 路径（puppeteer 不在 cwd 时用） | `NODE_PATH="$(pwd)/node_modules"`                                                                                                                                                |
| `CODEBUDDY_SAFE_DELETE_ENABLED` | 安全删除保护（渲染时删帧文件可能被拦截）                    | 设为 `0` 关闭                                                                                                                                                                        |

### 典型渲染命令

```bash
# macOS：用系统 Chrome 渲染
PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
node render.js . -o output.mp4 --fps 30

# Windows（cmd）：用系统 Chrome 渲染
set PUPPETEER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
node render.js . -o output.mp4 --fps 30

# Windows（PowerShell）：用系统 Chrome 渲染
$env:PUPPETEER_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
node render.js . -o output.mp4 --fps 30

# Linux：用系统 Chrome 渲染
PUPPETEER_EXECUTABLE_PATH="/usr/bin/google-chrome" \
node render.js . -o output.mp4 --fps 30

# 任意系统：用自动下载的 Chromium 渲染（默认，无需设环境变量）
node render.js . -o output.mp4 --fps 30
```

> render.js 已内置跨平台 Chrome 路径自动探测（macOS/Linux/Windows 的 64 位、32 位、用户安装目录都会尝试），多数情况下无需手动设 `PUPPETEER_EXECUTABLE_PATH`；只有自动下载 Chromium 失败时才需要手动指定。

---

## 三、渲染命令

```bash
node render.js <composition目录> -o <输出路径> --fps 30
```

render.js 用 puppeteer 逐帧截图 + ffmpeg 合成。首次运行自动安装 puppeteer + 下载 Chromium。

抽帧验证布局：

```bash
node render.js <composition目录> --snapshot --at 5,15,25 --output <dir>
```

---

## 四、lock 文件清理

render.js 的 lock 文件在 composition 目录下，渲染前清理避免卡住：

```bash
rm -f .render.lock
```

**什么时候需要清理**：

- 渲染前（预防性清理）
- 渲染中断后（残留 lock 会卡住下次渲染）
- 渲染报错 "lock already exists" 时

---

## 五、puppeteer 安装问题

### 问题：Chromium 下载卡住

**解决方案**：

1. 换镜像：

```bash
export PUPPETEER_DOWNLOAD_BASE_URL="https://npmmirror.com/mirrors/chromium-browser-snapshots"
node render.js . -o output.mp4 --fps 30
```

1. 用系统 Chrome：

```bash
export PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
node render.js . -o output.mp4 --fps 30
```

1. 手动装 Chromium 后指定路径：

```bash
# 下载 Chromium 后
export PUPPETEER_EXECUTABLE_PATH="/path/to/chrome"
```

### 问题：puppeteer 未安装

render.js 首次运行时自动安装 puppeteer。如果自动安装失败：

```bash
cd <技能目录>
npm install puppeteer
```

---

## 六、渲染常见问题

### 渲染报 "failed" 但视频已生成

渲染任务标记 failed，但 output.mp4 已成功写出。这通常是因为渲染完成后清理临时帧文件时被安全删除保护拦截。

**处理**：以视频文件为准，忽略 failed 状态。检查 `renders/output.mp4` 存在且大小合理（通常 10-50MB）。如频繁遇到，设 `CODEBUDDY_SAFE_DELETE_ENABLED=0` 后重渲。

### 渲染后视频黑屏

可能原因：

1. heavy overlay ≥40 → 用 box-shadow 替代 radial-gradient/blur/backdrop-filter（见 `layout-rules.md`）
2. GSAP `from()` + CSS `opacity:0` = 0→0 → 全改 `fromTo()`（见 `motion-patterns.md` 规则 1）
3. video 背景未播放 → 加 GSAP `call()` 重置 currentTime（见 `background-assets.md`）

### 渲染后视频卡顿

可能原因：

1. 视频背景关键帧稀疏 → 重新编码视频加密集关键帧：

```bash
ffmpeg -y -i raw.mp4 -ss 0 -t 8 \
  -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30" \
  -an -preset fast -crf 28 -g 30 -keyint_min 30 \
  output-bg.mp4
```

（`-g 30 -keyint_min 30` 每 30 帧一个关键帧）

1. 元素过多导致逐帧截图慢 → 每场景元素控制在 10-12 个

### 渲染后字幕被盖住

字幕 rail 不是 DOM 最后元素 → 把字幕 rail 移到 DOM 最后 + z-index:50（见 `subtitle-spec.md`）

---

## 七、渲染性能参考

| 视频时长 | 帧数（30fps） | 渲染时间  | 视频大小  |
| ---- | --------- | ----- | ----- |
| 15s  | 450       | ~30s  | ~10MB |
| 30s  | 900       | ~60s  | ~20MB |
| 45s  | 1350      | ~90s  | ~28MB |
| 60s  | 1800      | ~120s | ~38MB |

渲染时间取决于 CPU 性能和元素数量。视频背景比图片背景渲染慢（需提取视频帧）。
