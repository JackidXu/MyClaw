# 真实素材口播剪辑（real-footage-presenter-cut）

把一条真人口播视频剪成有证据、有节奏的解读短片：口播原声就是配音，真素材（实拍帧序列、官网/新闻截图、产品图、原文刷黄）原样呈现；原技能的场景画法全部保留，只有没有真素材、且这一屏内容确实少的时候，才换成元素更丰富的整屏构图。

## 能做什么

- 围着口播的人做：证据挂在她身后的墙上，讲细节时她缩到角上的圆窗或右侧竖窗。
- 真素材镜头一个像素不改，**原技能处理素材的动效（荧光笔刷黄、推近放大、挂墙、圆窗）必须写足参数才会出现**：每镜按 `says` 选一个主动效族并写齐参数，**一镜一个动作、别全片只用荧光笔**（同族不连用三镜，带素材 ≥5 镜至少分散到 3 族）；`--check` 既查覆盖也查重复。配比、机制和使用时机见 `references/footage-effects.md`。非素材镜头不给固定构图、不给图标顺序、不给占位文案，按 `references/semantic-thinking.md` 的四步自己在 `art.js` 里按语义画；`semantic` 字段已废弃，**运行时不会自动替你替换画面**。
- 素材自己去视频网站找、自己抽帧，新闻网页自己截、关键句刷黄；数字和关系用图形演出来。
- **原版处理素材的特效一个没删**：荧光笔刷原文、界面框选推近、实拍慢推 / 快切、画框推满屏、窗口撑开。写法与可复制片段在 `references/footage-effects.md`，可视化菜单 `kit/effects.html` —— 两份都是纯文本 / HTML，不依赖任何图片，AI 读源码就能学会，人打开浏览器能看到 CSS 画的示意和动效。
- 逐帧确定性渲染，同一个时刻永远画出同一帧。
- **竖屏口播自动做成「中间完整人像 + 两侧同源虚化」**：`python scripts/footage.py host 口播.mp4 <片子目录>` 一键抽帧，不会把人压扁或裁成大特写。信息画面每镜至少停 2.6 秒（元素多 3.0 秒、带推近刷黄 3.4 秒），素材动效按语义分散到多族、不会全片刷黄；卡片内部垂直居中成簇、不留大空白；`host.zoom` 档位不密集反向、`popup` 底层跟着时间走且看完就缩回（不会抖一下或突然定住），这几条 `--check` 会直接拦或提醒。

## 安装

把本目录放进 AI 工具的 skills 目录即可。依赖：ffmpeg、yt-dlp、Python（numpy、opencv-python、Pillow、faster-whisper；抠像另需 onnxruntime 与 rembg 模型）、Node 与 Playwright。

```bash
pip install -r requirements.txt
npm install && npx playwright install chromium
```

字体要自己下，放进 `fonts/`：MiSans、阿里妈妈数黑体、Bebas Neue、Montserrat、Noto Sans SC，文件名和 `kit/kit.css` 里的 `@font-face` 对上。也支持在 `scripts/local.json` 里写 `fonts_dir`。

## 使用

先准备一条口播视频（一个机位、中间不切）和这条片要用的真素材，然后对 AI 说：

> 用真实素材口播剪辑，把这条口播做成 1 分钟的解读片

流程、配比和自检见 `SKILL.md`；触发条件与画层参数见 `references/semantic-scenes.md`。

## 目录

| 位置 | 内容 |
|---|---|
| `SKILL.md` | AI 读的入口 |
| `references/` | 做片的方法和规矩 |
| `scripts/` | 下片、截图、抽帧、抠像、口播对齐、渲染、混音 |
| `kit/` | 30+ 现成场景模板 + 仅按需启用的非素材画层 |
| `starter/` | 新片起点（真人口播片） |
| `examples/` | 真人口播片的写法参考 |

## 版权

素材只用于评论和解读，每条片要写清出处。代码和文档为 MIT，见 `LICENSE`；样片里的第三方画面、截图、logo 和人物不在 MIT 范围内。
