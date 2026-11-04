# TTS 语音生成指南（火山豆包大模型 2.0 首选 / Kokoro & Edge-TTS 备选）

> **首选火山豆包语音合成 2.0（HeyClaw 系统内置工具）**：通过内置工具 `heyclaw_audio_tts` 直接生成高保真、带自然抑扬顿挫的 MP3 音频与字级别时间戳，无需本地配置复杂的 Python 模型环境与下载庞大模型权重。
>
> **本地离线备选 Kokoro TTS**：`zf_xiaoxiao`（温暖女声）等 8 个中文声线，整段一次性生成连续音频（见下方第四节）。
>
> **Edge-TTS 仅作最后兜底**：当环境无网络或无 API 时切到 Edge-TTS。

收到一段视频文案后，第一步是把文案切分为场景，然后为每个场景生成旁白语音。

---

## 一、首选：调用 HeyClaw 系统内置工具 `heyclaw_audio_tts`

在 HeyClaw Agent 运行环境中，直接调用内置工具：

```json
{
  "name": "heyclaw_audio_tts",
  "parameters": {
    "text": "你有没有发现，很多医生都会踩同一个误区。",
    "outputPath": "seg01.mp3",
    "speaker": "zh_female_vv_uranus_bigtts",
    "speedRatio": 1.08,
    "enableSubtitle": true
  }
}
```

- **音色支持**：
  - `zh_female_vv_uranus_bigtts`：高品质通用知性女声（默认推荐，温暖自然）
  - 支持火山引擎音色库与豆包声音复刻 2.0 音色
- **优势**：
  - 秒级完成合成，输出标准 24000Hz MP3 音频；
  - 自动携带字级别精确时间戳，便于后续做声画卡点对齐；
  - 无需任何额外 Python pip 依赖安装。

---

## 二、本地离线方案：Kokoro TTS

```bash
pip install kokoro misaki[zh] soundfile
```

- 首次运行下载模型约 330MB 到 `~/.cache/huggingface/`
- `misaki[zh]` 是中文 G2P（字素→音素）库，必须装
- `soundfile` 用于写入 wav
- 如果是 Heyclaw 使用，检查技能库是否有 python-tool 或 kokoro-tool 离线安装

验证安装：

```bash
python3 -c "from kokoro import KPipeline; p = KPipeline(lang_code='z'); print('ok')"
```

## 二、8 个中文声线

Kokoro v1.0 支持 8 个中文声线（`z` 前缀 = 中文，`f` = 女声，`m` = 男声）：

| 声线 ID           | 性别 | 特点            | 适合文案类型             | 推荐度      |
| --------------- | -- | ------------- | ------------------ | -------- |
| **zf_xiaoxiao** | 女  | 温暖、有情感、抑扬顿挫明显 | 痛点诊断 / 信任建立 / 专业讲解 | ★★★★★ 默认 |
| **zf_xiaobei**  | 女  | 活泼、有活力、偏年轻    | 生活化 / 教程 / 种草      | ★★★★☆    |
| **zf_xiaoni**   | 女  | 柔和、亲切、偏温柔     | 健康教育 / 情感叙事        | ★★★★☆    |
| **zf_xiaoyi**   | 女  | 清晰、知性、偏理性     | 产品介绍 / 数据说明        | ★★★☆☆    |
| **zm_yunxi**    | 男  | 沉稳、有磁性、偏成熟    | 专业讲解 / 品牌叙事        | ★★★★☆    |
| **zm_yunjian**  | 男  | 浑厚、有力、偏阳刚     | 强观点 / 钩子 / CTA     | ★★★☆☆    |
| **zm_yunxia**   | 男  | 温和、平实、偏中性     | 教程 / 流程说明          | ★★★☆☆    |
| **zm_yunyang**  | 男  | 开朗、明亮、偏阳光     | 轻松话题 / 产品种草        | ★★★☆☆    |

**选声线路径**：默认用 `zf_xiaoxiao`（温暖有情感，覆盖大多数场景）。如果文案偏活泼/年轻 → `zf_xiaobei`；偏沉稳专业男声 → `zm_yunxi`；偏强观点男声 → `zm_yunjian`。一个视频用一种声线贯穿全片。

## 三、Python API 调用

### 基本用法

> **Kokoro 0.7.x+ 接口变化（重要）**：旧版 `pipeline.generate(text, ...)` 在 0.7.x 已移除；新接口是**直接调用 pipeline 实例** `pipeline(text, voice=, speed=)`。两者都返回一个**按句分块的生成器**，每次 `yield` 一小段 `(graphemes, phonemes, audio)`。**必须把所有块遍历出来并用 `np.concatenate` 拼成完整音频**——只取第一块（如 `next()` 或循环里 `break`）会把整段音频截断到约 0.45 秒（一个分块的长度），这是最常见的"音频被截断"根因。

```python
from kokoro import KPipeline
import soundfile as sf
import numpy as np

pipeline = KPipeline(lang_code='z')  # z = 中文

text = "你有没有发现，很多医生都会踩同一个误区。"
# 新接口：直接调用 pipeline，遍历【全部】分块再拼接
chunks = [audio for _, _, audio in pipeline(text, voice='zf_xiaoxiao')]
audio  = np.concatenate(chunks)
sf.write('seg01.wav', audio, 24000)  # 24kHz 采样率
```

### 语速控制

Kokoro 通过 `speed` 参数控制语速（`speed=1.0` 为引擎默认值）：

```python
# 新接口：直接调用 pipeline（0.7.x 已移除旧版 generate()），遍历全部分块再拼接
chunks = [a for _, _, a in pipeline(text, voice='zf_xiaoxiao', speed=1.08)]
audio  = np.concatenate(chunks)
```

- `0.9` = 慢速情感段
- `1.0` = 引擎默认（约 4 字/秒，偏慢）
- `1.08` = **本技能旁白默认语速**（约 4.3 字/秒，自然舒展、保留气口）
- `1.15` = 快节奏钩子段（约 4.7 字/秒）
- `1.25` = 强观点 / 重音段

**本技能生成脚本固定用 `speed=1.08`**：比引擎默认 1.0 稍快、比 1.15 更从容，旁白自然不拖沓，同时保留句间自然呼吸。不要为了"紧凑"调到 1.15 以上——会把气口压没。

## 四、完整生成脚本（整段录音 + 估算切割）

**核心思路（解决"没气口 / 段落停顿 / 时长对不上"三个老问题）**：

1. **整段文案一次性生成**：把所有场景旁白拼成一个整段文本，Kokoro **一次性**生成"一整条"连续音频。自然呼吸、句间停顿全部留在一条录音里，不会被"分段录音"切碎。
2. **按估算边界切割**：用"字数 + 标点停顿"估算每段场景时长，累加得到每段切割点；用 ffmpeg 把整条音频切成 `seg01.mp3` / `seg02.mp3` …——纯切割、**不逐段剥静音**、**不加 crossfade**，切出来的段拼回去就是原来的连续音频。
3. **最后一段切到真实结尾**：总时长 = 整条音频真实时长，音视频零漂移，不再出现"对不上的假对齐"。

> 旧做法逐段录音 + 逐段 `silenceremove` 剥静音，正是吞掉气口、在段落交接处造出死区的元凶。本脚本**只**在整条录音上做一次首尾引擎静音剥离（不碰内部），其余全靠"一条录完再切"。

```python
#!/usr/bin/env python3
"""
gen_tts.py — 整段文案一次性生成旁白，再按估算场景边界切割成 segXX.mp3
"""
import json, os, sys, re, subprocess, time
from kokoro import KPipeline
import soundfile as sf
import numpy as np

VOICE = 'zf_xiaoxiao'      # 默认声线
SPEED  = 1.08              # 默认语速（本技能固定）
SR     = 24000             # 采样率
MAX_RETRY = 4

def estimate_duration(text):
    """按字数 + 标点停顿估算该段旁白时长（秒）。speed=1 时约 0.25s/字。"""
    n      = len(re.findall(r'[一-鿿]', text))            # 只数汉字
    strong = len(re.findall(r'[。！？!?]', text))          # 句末强停顿 ~0.35s
    weak   = len(re.findall(r'[,，、；：;:]', text))        # 句中弱停顿 ~0.12s
    char_t = 0.25 / SPEED
    return max(n * char_t + strong * 0.35 + weak * 0.12, 1.0)

def gen_full(pipeline, full_text, wav_path):
    """整段一次性生成，4 次重试。
    Kokoro 新接口：直接调用 pipeline 实例 `pipeline(text, voice=, speed=)` 返回生成器，
    按句分块 yield (gs, ps, audio)；旧版 `pipeline.generate()` 在 0.7.x 已移除。
    关键：必须遍历【全部】分块并 np.concatenate——只取第一块会把音频截断到约 0.45s。
    用 try/except 兼容两种接口。返回真实音频时长（秒）。"""
    for attempt in range(1, MAX_RETRY + 1):
        try:
            # 优先用新接口（可调用）；旧版 generate() 缺失时回退
            # split_pattern=r'\n+'：场景用 \n 拼接，每个场景是一个干净分块，避免超长文本跨场景被切坏
            try:
                gen = pipeline(full_text, voice=VOICE, speed=SPEED, split_pattern=r'\n+')
            except (AttributeError, TypeError):
                gen = pipeline.generate(full_text, voice=VOICE, speed=SPEED, split_pattern=r'\n+')
            chunks = [audio for _, _, audio in gen]
            if not chunks:
                raise Exception('未生成任何音频')
            audio = np.concatenate(chunks) if len(chunks) > 1 else chunks[0]
            sf.write(wav_path, audio, SR)
            if os.path.getsize(wav_path) < 2000:
                raise Exception('生成失败或文件过小')
            # 防御：若只取到首分块（约 0.45s）会直接报错重试，不把截断音频当成品
            if len(audio) < SR * 0.5:
                raise Exception(f'音频过短（{len(audio)/SR:.2f}s），疑似只取到首分块，请检查生成器是否完整遍历')
            return len(audio) / SR
        except Exception as e:
            print(f'  整段生成 attempt {attempt} 失败 — {e}')
            time.sleep(1)
    raise Exception('整段旁白生成失败')

def trim_head_tail(wav_in, wav_out):
    """只剥整条录音的首尾引擎静音（不碰内部），保留所有自然气口。"""
    subprocess.check_call(
        f'ffmpeg -y -i "{wav_in}" '
        f'-af "silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.1:start_duration=0.1,'
        f'silenceremove=stop_periods=1:stop_threshold=-40dB:stop_silence=0.5:stop_duration=0.5" '
        f'"{wav_out}" -loglevel quiet', shell=True)

def cut(wav_path, out_dir, ests):
    """按累计估算边界切割；最后一段延伸到真实结尾。返回 [(mp3, 实际时长)]。"""
    full_dur = float(subprocess.check_output(
        ['ffprobe','-v','error','-show_entries','format=duration',
         '-of','default=nw=1:nk=1', wav_path]).decode().strip())
    cuts, cum = [], 0.0
    for i, d in enumerate(ests):
        start = cum
        end   = cum + d if i < len(ests) - 1 else full_dur   # 末段延伸到真实结尾
        cuts.append((start, end)); cum = end
    segs = []
    for i, (s, e) in enumerate(cuts, 1):
        mp3 = os.path.join(out_dir, f'seg{i:02d}.mp3')
        subprocess.check_call(
            f'ffmpeg -y -ss {s:.3f} -i "{wav_path}" -t {e - s:.3f} '
            f'-c:a libmp3lame -b:a 128k "{mp3}" -loglevel quiet', shell=True)
        segs.append((mp3, e - s))
    return segs

def main():
    plan_path = sys.argv[1] if len(sys.argv) > 1 else 'scene-plan.json'
    out_dir   = sys.argv[2] if len(sys.argv) > 2 else 'audio'
    os.makedirs(out_dir, exist_ok=True)
    plan   = json.load(open(plan_path))
    scenes = plan['scenes']

    full_text = '\n'.join(s['narration'] for s in scenes)   # 拼整段
    print(f'初始化 Kokoro（lang=z, voice={VOICE}, speed={SPEED}）...')
    pipeline = KPipeline(lang_code='z')

    wav_raw  = os.path.join(out_dir, '_full_raw.wav')
    wav_trim = os.path.join(out_dir, '_full.wav')
    gen_full(pipeline, full_text, wav_raw)
    trim_head_tail(wav_raw, wav_trim)                       # 只剥首尾
    os.remove(wav_raw)

    ests = [estimate_duration(s['narration']) for s in scenes]
    print('  估算各段时长：', [f'{d:.1f}s' for d in ests])
    segs = cut(wav_trim, out_dir, ests)
    os.remove(wav_trim)

    total = 0.0
    for i, s in enumerate(scenes):
        mp3, d = segs[i]
        s['audio']    = f'audio/seg{i+1:02d}.mp3'
        s['duration'] = round(d, 3)
        total += d
    plan['total_duration'] = round(total, 3)
    plan['speed'] = SPEED
    json.dump(plan, open(plan_path, 'w'), ensure_ascii=False, indent=2)
    print(f'\n完成：{len(scenes)} 段，总时长 {total:.1f}s（= 整条音频真实时长）')

if __name__ == '__main__':
    main()
```

运行：

```bash
python3 gen_tts.py scene-plan.json audio/
```

> **切割精度说明**：切割边界用估算（字数+标点），不强制逐词对齐。因为整条录音是连续的、句间本就有自然停顿，估算点通常落在停顿附近；偶有几十毫秒偏差属于可接受范围（用户确认"用估算就行了"）。如需更准可换 forced-alignment，但默认不需要。

## 五、scene-plan.json 格式

```json
{
  "project": "my-video-project",
  "style": "editorial",
  "voice": "zf_xiaoxiao",
  "speed": 1.08,
  "scenes": [
    {
      "id": "s1",
      "title": "开场钩子",
      "narration": "你有没有发现，很多医生都会踩同一个误区——技术好并不等于患者觉得你好。",
      "keywords": ["误区", "技术好", "患者觉得你好"],
      "elements": ["kicker", "masthead标题", "背景视频"]
    },
    {
      "id": "s2",
      "title": "医生视角",
      "narration": "医生很清楚自己的专业功底有多扎实，但患者看到的只有沟通。",
      "keywords": ["专业功底", "沟通"],
      "elements": ["kicker", "数据chip", "印章", "背景图片"]
    }
  ]
}
```

## 六、备选 TTS 方案

以下为备选 / 兜底方案——**仅当 Kokoro 不可用**（环境无 Python、模型下载失败、或输出异常空白）时使用，按推荐度排序：

| 方案            | 费用           | 安装                     | 特点                           | 调用方式                                                                                       |
| ------------- | ------------ | ---------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| **edge-tts**  | 免费           | `pip install edge-tts` | 微软神经网络声，30+ 中文声线，质量接近 Kokoro | 命令行：`edge-tts --voice zh-CN-XiaoxiaoNeural --rate +15% --text "..." --write-media out.mp3` |
| **ChatTTS**   | 免费           | `pip install ChatTTS`  | 对话风格自然，有情感，但需 GPU 更佳         | Python API                                                                                 |
| **火山引擎 TTS**  | 免费额度 50 万字/月 | 注册火山引擎 API             | 字节高质量声线                      | HTTP API                                                                                   |
| **阿里云 TTS**   | 免费额度         | 注册阿里云 API              | 阿里高质量声线                      | HTTP API                                                                                   |
| **macOS say** | 免费           | 系统自带                   | 机械感强，仅 macOS，仅作最后兜底          | `say -v Tingting "..." -o out.aiff`                                                        |

**替换要点**：无论用哪个 TTS，产出格式统一为 `audio/segXX.mp3`，并在 scene-plan.json 里记录每段时长。composition 里用 `<audio id="segXX" src="audio/segXX.mp3">` 引用（audio 标签必须加 id，否则渲染静音）。

**时长来源（单一真相）**：`gen_tts.py` 把整条录音按估算边界切成各 `segXX.mp3`，每段的实际时长 = 切割长度；最后一段切到整条录音真实结尾，所以 **Σ各段时长 ≡ 整条音频真实时长 ≡ 视频总时长**。scene-plan.json 记录的 `duration`、场景时间轴、project.json 的 `duration` 全部以此为准，三处天然一致，不再有"对不上的假对齐"。

**字幕对齐（场景粒度，无需逐词时间戳）**：本技能的每条字幕对应一个场景，显示窗口 = 该场景的切割窗口（场景开始淡入、场景结束淡出），本身就跟该场景旁白同步，不需要逐词强制对齐，也不会出现"字幕比人声晚 0.3 秒"的错位。若某场景内部要再细分字幕，其 cue 时间也直接取该场景窗口内的相对偏移，不按"字数÷语速"估算整段时间轴。

## 七、时长估算

中文旁白时长估算（**speed=1.08** 时）：

- 每字约 0.231 秒（约 4.3 字/秒）
- 句末强停顿（。！？）每处约 +0.35 秒，句中弱停顿（，、；：）每处约 +0.12 秒
- 一句 20 字、2 个句末标点的文案 ≈ 20×0.231 + 2×0.35 ≈ 5.3 秒
- 总时长 = 整条音频真实时长（由各段切割长度求和得到，段落过渡由画面动效重叠实现，不额外占用音频时间）

阶段 1 规划场景时，用上面的"字数 + 标点"公式预估每段时长，即可提前算出总时长；最终以 `gen_tts.py` 切出来的真实时长为准回填 scene-plan.json。
