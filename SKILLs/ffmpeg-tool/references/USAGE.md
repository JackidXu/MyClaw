# ffmpeg 常用参数速查（给 Agent / 用户参考）

本技能的包装脚本会把参数**原样透传**给 ffmpeg，所以下面任何命令都可以直接套用：
`bash scripts/run.sh <参数>`（Windows 用 `run.ps1`）。

## 输入 / 输出
| 目的 | 参数 |
| --- | --- |
| 指定输入 | `-i input.mp4` |
| 覆盖输出 | 末尾写输出文件名（`-y` 强制覆盖） |
| 复制不重编码（最快） | `-c copy` |

## 格式转换
| 目的 | 参数 |
| --- | --- |
| mp4 → mp3（仅音频） | `-i in.mp4 -vn -acodec libmp3lame out.mp3` |
| mkv → mp4 | `-i in.mkv -c:v libx264 -c:a aac out.mp4` |
| 任意 → wav(16k 单声道) | `-i in.x -ar 16000 -ac 1 -c:a pcm_s16le out.wav` |

## 压缩 / 画质
| 目的 | 参数 |
| --- | --- |
| 限定视频码率 | `-b:v 1M` |
| 限定分辨率（高自动） | `-vf scale=-2:720` |
| 限定帧率 | `-r 24` |
| CRF 质量控制（18~28） | `-crf 23 -preset medium` |

## 剪辑 / 合并
| 目的 | 参数 |
| --- | --- |
| 从某时刻起 10 秒 | `-ss 00:01:00 -t 10 out.mp4` |
| 合并列表（list.txt 每行 `file 'x.mp4'`） | `-f concat -safe 0 -i list.txt -c copy merged.mp4` |

## 截图 / GIF
| 目的 | 参数 |
| --- | --- |
| 抽一帧 | `-ss 00:00:03 -frames:v 1 cover.jpg` |
| 生成 3 秒 GIF | `-t 3 -vf "fps=10,scale=480:-1" out.gif` |

> 提示：处理大文件时若只想要片段，优先用 `-ss` 放在 `-i` **之前**（输入seek），速度更快。
