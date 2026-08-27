# whisper-tool 使用参考

## 支持的语言（--lang 取值示例）
`auto`（自动检测）、`zh`（中文）、`en`（英文）、`ja`（日文）、`ko`、`fr`、`de`、`es` 等。
中文场景建议显式传 `--lang zh`，可略微提升准确率与速度。

## 输出格式（--format）
| 格式 | 用途 |
| --- | --- |
| `srt` | 影视/剪辑软件字幕（默认） |
| `vtt` | 网页 `<track>` 字幕 |
| `txt` | 纯文本记录 / 会议纪要 |

## 输入格式
- 直接支持：`.wav`（最稳，16k 单声道）
- 其他（`.mp4` `.mov` `.m4a` `.mp3` `.wav` `.ogg` `.flac` 等）：脚本自动用内置 ffmpeg 抽音频
- 长文件建议先切成片段，或调大 `--lang` 明确语言以提速

## 性能提示
- base 模型在 Apple Silicon / 现代 CPU 上，几分钟音频通常数十秒转完
- 如需更快：换用带 BLAS 的二进制，或更小模型；如需更准：换 small / medium
- 第一次运行会加载模型（约 1~2 秒），之后复用

## 常见问题
- **提示缺少二进制 / 模型**：提供方还没跑过 `download_deps.sh`，见 assets/README.md
- **中文识别成英文**：加 `--lang zh`
- **Windows 被 SmartScreen 拦截**：选择"仍要运行"（提供方可对 exe 做签名彻底规避）
