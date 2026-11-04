# 紧凑化指南（Tighten Guide）

渲染完成后**必须**跑紧凑化。目标：场景之间只剩 0.3–0.5 秒自然气口，听感连续、没有"停顿感"。

---

## 一、根因：不要相信 `ffprobe` 的段时长

edge-tts / Kokoro 生成的每段 `segNN.mp3`，句尾自带 **0.8–1.5 秒静默**，`ffprobe` 的 `format.duration` 把这个静默算进去了。

如果直接用「段时长」拼时间轴，每个场景之间会出现 **1.2–1.7 秒空白**——这就是"停顿感"的来源。**必须用波形检测真实语音起止**，不能按 ffprobe 时长切。

---

## 二、标准流程（渲染后执行，不需要重新渲染画面）

### 步骤 1：合成整条旁白

```bash
ffmpeg -y $(for i in 01 02 03 04 05 06 07 08 09 10; do echo -n "-i audio/seg$i.mp3 "; done) \
  -filter_complex "[0:a][1:a][2:a][3:a][4:a][5:a][6:a][7:a][8:a][9:a]concat=n=10:v=0:a=1[a]" \
  -map "[a]" -c:a aac -b:a 192k narration.m4a
```

### 步骤 2：检测每条场景边界的静默区间

```bash
python3 - <<'PY'
import subprocess, re, json
r = subprocess.run('ffmpeg -i narration.m4a -af "silencedetect=noise=-38dB:d=0.25" -f null -',
                   shell=True, capture_output=True, text=True).stderr
starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', r)]
ends   = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', r)]
plan = json.load(open('scene-plan.json'))
bounds = []
for s in plan['scenes'][1:]:
    cand = [(a, b) for a, b in zip(starts, ends)
            if a - 0.08 <= s['start'] <= b + 0.08 and b - a > 0.6]
    assert cand, f"no boundary silence near {s['id']} {s['start']}"
    bounds.append(cand[0])
print(len(bounds), 'boundaries')
PY
```

注意：**不要**在 subprocess 命令里写 `2>&1`，否则 stderr 被重定向到 stdout，正则抓不到。

### 步骤 3：按语音边界生成剪切表

保留规则（实测最顺手）：

- 每个场景结尾：`silence_start + 0.10`（句尾只留 0.1 秒）
- 下一个场景开头：`silence_end - 0.38`（语音前留 0.38 秒，让入场动画走完）
- 净间隔 = 0.10 + 0.38 ≈ **0.48 秒**

```bash
python3 - <<'PY'
import subprocess, re, json
r = subprocess.run('ffmpeg -i narration.m4a -af "silencedetect=noise=-38dB:d=0.25" -f null -',
                   shell=True, capture_output=True, text=True).stderr
starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', r)]
ends   = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', r)]
plan = json.load(open('scene-plan.json'))
bounds = [[(a, b) for a, b in zip(starts, ends)
           if a - 0.08 <= s['start'] <= b + 0.08 and b - a > 0.6][0]
          for s in plan['scenes'][1:]]
keep = []
for i, s in enumerate(plan['scenes']):
    st = 0.0 if i == 0 else bounds[i-1][1] - 0.38
    en = plan['total'] if i == len(plan['scenes']) - 1 else bounds[i][0] + 0.10
    keep.append((st, en))
parts, ins = [], []
for i, (st, en) in enumerate(keep):
    parts.append(f"[0:v]trim=start={st:.3f}:end={en:.3f},setpts=PTS-STARTPTS[v{i}]")
    parts.append(f"[1:a]atrim=start={st:.3f}:end={en:.3f},asetpts=PTS-STARTPTS[a{i}]")
    ins.append(f"[v{i}][a{i}]")
f = ";".join(parts) + f";{''.join(ins)}concat=n={len(keep)}:v=1:a=1[vout][aout]"
open('tighten2.txt', 'w').write(f)
print('new total', round(sum(e - s for s, e in keep), 2))
PY
```

### 步骤 4：直接切已渲染好的画面 + 旁白（不重渲染）

```bash
ffmpeg -y -i .render-frames/_silent.mp4 -i narration.m4a \
  -filter_complex "$(cat tighten2.txt)" \
  -map "[vout]" -map "[aout]" \
  -c:v libx264 -pix_fmt yuv420p -crf 18 -preset medium \
  -c:a aac -b:a 192k -movflags +faststart output-tight.mp4
```

**关键**：画面和音频用同一组 trim 区间，音画同步不会漂。不需要重新逐帧渲染。

### 步骤 5：剪掉结尾静默

```bash
ffmpeg -y -i output-tight.mp4 -t <最后一句语音结束 + 0.25s> -c copy output-final.mp4
```

### 步骤 6：验收

```bash
ffmpeg -i output-final.mp4 -af "silencedetect=noise=-38dB:d=0.25" -f null - 2>&1 \
  | grep silence_duration
```

合格标准：

- 场景之间最大静默 **≤ 0.65 秒**
- 没有 ≥ 1.0 秒的静默
- 全片时长比原始拼接短 **10–20%**（TTS 尾静默越多，压缩越多）

不达标就调 `-38dB` 到 `-35dB` 重新检测，或把 tail 从 0.10 收到 0.06。

---

## 三、动画时间必须配合切点

紧凑化会切掉场景开头的前 0.8–1.2 秒，如果入场动画排得太晚，会被切没。

硬性规则（写 timeline.js 时就要遵守）：

1. 场景容器淡入：**0–0.30 秒**内完成
2. 主视觉（标题/主卡/主图）：**0.10–0.55 秒**内到位
3. 子元素级联：**0.20–0.90 秒**内完成
4. 所有入场动画在语音开始前（切点后 0.38 秒）至少完成 80%
5. 持续动效（浮动/呼吸/推拉）从 0 秒就开始，不受切点影响

违反第 4 条时，观众会看到"画面还没出来，人已经开口了"。

---

## 四、编码参数

| 参数 | 值 | 说明 |
|---|---|---|
| CRF | 18 | 视觉丰富（实拍 + UI + 纹理）必须 18，23 会糊 |
| preset | medium / slow | 质量优先 |
| 音频 | aac 192k | 旁白清晰 |
| pix_fmt | yuv420p | 兼容性 |

**禁止**对成片二次压缩到 1Mbps 以下——实拍 b-roll 会明显掉细节。
