#!/usr/bin/env python3
"""
align_scenes.py — 用 whisper 把 script.json 的估算时间轴校准到数字人视频实际时间轴

问题背景：
  adapter 按"字数÷4.5字/秒"估算每段时长，但超会AI用自己的语速生成数字人视频，
  实际时长与估算不一致（如估算30.6s vs 实际25.8s）→ 字幕/B-roll 与主轨画面错位。

解决：
  1. whisper 识别数字人口播音频，取字级时间戳（word_timestamps=True）
  2. 把识别文本与 script.json 的 voiceover_fulltext 做字符级对齐（difflib，容忍错字/漏字）
  3. 按每个 scene 在全文中的字符区间，映射回识别时间轴 → 回填真实 start_sec/end_sec
  4. 段落间无缝衔接（每段 end = 下一段 start，末段 end = 音频时长）

链路位置：
  裸文案 → adapter(估算时间轴) → 超会AI生成视频 → 【align_scenes.py 校准】→ match → fill

用法：
  python3 align_scenes.py \
    --media <数字人视频或口播音频> \
    --script <script.json> \
    --output <校准后script.json> \
    [--model small]
"""
import argparse
import difflib
import json
import os
import re
import subprocess
import sys
import tempfile

# 中英文标点+空白（对齐时全部剔除）
PUNCT_RE = re.compile(r'[，。！？、；：""\u201c\u201d\'\u2018\u2019「」『』（）《》〈〉\[\]（）【】\s,.!?:;()\[\]{}…·\-—_~"`／/]')


def log(msg):
    print(f"[align] {msg}")


def clean_text(t):
    """去标点去空白，只留实义字符。"""
    return PUNCT_RE.sub('', t or '')


def find_ffmpeg_exe():
    """找 ffmpeg 可执行文件（优先 imageio_ffmpeg 包内的）。"""
    try:
        import imageio_ffmpeg
        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if exe and os.path.exists(exe):
            return exe
    except ImportError:
        pass
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
        return "ffmpeg"
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return None


def extract_audio_16k(media_path):
    """把视频/音频抽成 16k 单声道 wav（whisper 最佳输入格式），返回 wav 路径。"""
    ffmpeg = find_ffmpeg_exe()
    if not ffmpeg:
        print("[ERROR] 找不到 ffmpeg，无法抽音频", file=sys.stderr)
        sys.exit(1)
    wav_path = os.path.join(tempfile.gettempdir(), f"align_{os.getpid()}.wav")
    result = subprocess.run(
        [ffmpeg, "-y", "-i", media_path, "-vn", "-ar", "16000", "-ac", "1", wav_path],
        capture_output=True, text=True, timeout=120
    )
    if result.returncode != 0 or not os.path.exists(wav_path):
        print(f"[ERROR] 抽音频失败：{result.stderr[-500:]}", file=sys.stderr)
        sys.exit(1)
    return wav_path


def whisper_transcribe(wav_path, model_name):
    """whisper 识别，返回 (字符时间流, 音频总时长)。

    字符时间流: [(char, start_sec, end_sec), ...]——每个中文字符对应的时间。
    """
    import whisper
    log(f"加载 whisper 模型 {model_name} ...")
    model = whisper.load_model(model_name)
    log("whisper 识别中（含字级时间戳）...")
    result = model.transcribe(wav_path, language="zh", word_timestamps=True)

    char_times = []
    audio_end = 0.0
    for seg in result.get("segments", []):
        audio_end = max(audio_end, seg.get("end", 0))
        for w in seg.get("words", []):
            word = w.get("word", "")
            w_start = w.get("start", 0)
            w_end = w.get("end", 0)
            for ch in word.replace(" ", "").replace(",", "").replace(".", ""):
                if ch.strip():
                    char_times.append((ch, w_start, w_end))
    return char_times, audio_end


def build_char_map(fulltext_clean, char_times):
    """把"文案全文的字符位置"映射到"识别字符流的字符位置"。

    用 difflib.SequenceMatcher 对齐（容忍识别错字/漏字/多字）。
    返回：列表 mapping[i] = fulltext_clean 第i个字符对应的识别流位置（或 None）。
    """
    recog_text = "".join(c for c, _, _ in char_times)
    sm = difflib.SequenceMatcher(None, fulltext_clean, recog_text, autojunk=False)
    n = len(fulltext_clean)
    mapping = [None] * n
    for a, b, size in sm.get_matching_blocks():
        for k in range(size):
            mapping[a + k] = b + k
    return mapping, recog_text


def main():
    parser = argparse.ArgumentParser(description="script.json 时间轴校准（whisper 强制对齐）")
    parser.add_argument("--media", required=True, help="数字人视频或口播音频路径")
    parser.add_argument("--script", required=True, help="script.json 路径（估算时间轴）")
    parser.add_argument("--output", required=True, help="校准后 script.json 输出路径")
    parser.add_argument("--model", default="small", help="whisper 模型（tiny/base/small/medium），默认 small")
    args = parser.parse_args()

    for label, path in [("--media", args.media), ("--script", args.script)]:
        if not os.path.exists(path):
            print(f"[ERROR] {label} 不存在：{path}", file=sys.stderr)
            sys.exit(1)

    log("=" * 60)
    log("script.json 时间轴校准（whisper 强制对齐）")
    log("=" * 60)

    # 1. 读 script.json
    script = json.load(open(args.script, encoding="utf-8"))
    scenes = script.get("scenes", [])
    fulltext = script.get("voiceover_fulltext", "")
    if not scenes:
        print("[ERROR] script.json 的 scenes 为空", file=sys.stderr)
        sys.exit(1)

    old_total = scenes[-1].get("end_sec", 0)
    log(f"原估算时间轴：{len(scenes)} 段，总长 {old_total}s")

    # 2. 抽音频 + whisper 识别
    wav_path = extract_audio_16k(args.media)
    try:
        char_times, audio_end = whisper_transcribe(wav_path, args.model)
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)

    if not char_times:
        print("[ERROR] whisper 未识别到任何语音，无法校准", file=sys.stderr)
        sys.exit(1)
    recog_total = char_times[-1][2]
    log(f"whisper 识别：{len(char_times)} 个字符，语音总长 {recog_total:.2f}s（音频容器 {audio_end:.2f}s）")

    # 3. 字符级对齐
    fulltext_clean = clean_text(fulltext)
    # 校验 scenes 文本和 fulltext 一致性
    scenes_clean = [clean_text(s.get("voiceover_text", "")) for s in scenes]
    if "".join(scenes_clean) != fulltext_clean:
        log("⚠ scenes 口播拼接与 voiceover_fulltext 不完全一致，按 scenes 逐段单独对齐（兜底）")
        use_fulltext_align = False
    else:
        use_fulltext_align = True

    mapping, recog_text = build_char_map(fulltext_clean, char_times)
    mapped_n = sum(1 for m in mapping if m is not None)
    log(f"字符对齐：全文 {len(fulltext_clean)} 字，成功映射 {mapped_n} 字（{mapped_n*100//max(len(fulltext_clean),1)}%）")
    if mapped_n < len(fulltext_clean) * 0.6:
        log("⚠ 对齐率低于60%，校准结果可能不准，建议检查文案与视频语音是否一致")

    # 4. 逐段回填时间
    if use_fulltext_align:
        # 每段在 fulltext_clean 里的字符区间
        cursor = 0
        ranges = []
        for sc in scenes_clean:
            ranges.append((cursor, cursor + len(sc)))
            cursor += len(sc)
    else:
        # 兜底：每段单独在识别流里滑动窗口找最佳位置
        ranges = None

    new_times = []
    for idx, scene in enumerate(scenes):
        sc_clean = scenes_clean[idx]
        if not sc_clean:
            new_times.append((None, None))
            continue

        if use_fulltext_align:
            fs, fe = ranges[idx]
            # 段内字符 → 识别流位置
            recog_positions = [mapping[i] for i in range(fs, fe) if mapping[i] is not None]
        else:
            # 兜底：用 SequenceMatcher 在识别流里定位这段文本
            sm2 = difflib.SequenceMatcher(None, sc_clean, recog_text, autojunk=False)
            recog_positions = []
            for a, b, size in sm2.get_matching_blocks():
                if size > 0 and a < len(sc_clean):
                    recog_positions.extend(range(b, b + size))

        if not recog_positions:
            new_times.append((None, None))
            log(f"  {scene.get('segment_name',''):<8} ⚠ 未在语音中定位到该段，保留估算时间")
            continue

        start_pos = min(recog_positions)
        end_pos = max(recog_positions)
        start_t = char_times[start_pos][1]
        end_t = char_times[end_pos][2]
        new_times.append((start_t, end_t))

    # 5. 平滑处理：填补未定位段落 + 段间无缝衔接
    for idx, (st, et) in enumerate(new_times):
        if st is None:
            # 未定位：用相邻已定位段推算
            prev_end = next((new_times[j][1] for j in range(idx - 1, -1, -1) if new_times[j][1] is not None), None)
            next_start = next((new_times[j][0] for j in range(idx + 1, len(new_times)) if new_times[j][0] is not None), None)
            if prev_end is not None and next_start is not None:
                new_times[idx] = (prev_end, next_start)
            elif prev_end is not None:
                new_times[idx] = (prev_end, prev_end + 2.0)
            elif next_start is not None:
                new_times[idx] = (max(0, next_start - 2.0), next_start)

    # 段间无缝：每段 end = 下一段 start（消除微缝），首段 start=0，末段 end=语音总长
    for idx in range(len(scenes)):
        st, et = new_times[idx]
        if idx == 0 and st is not None:
            st = 0.0
        if idx < len(scenes) - 1:
            nxt = new_times[idx + 1][0]
            if nxt is not None:
                et = nxt
        else:
            et = max(et or 0, recog_total)
        new_times[idx] = (st, et)

    # 6. 写回 script.json
    changed = 0
    for idx, scene in enumerate(scenes):
        st, et = new_times[idx]
        if st is None or et is None:
            continue
        old_st = scene.get("start_sec")
        old_et = scene.get("end_sec")
        if abs((old_st or 0) - st) > 0.05 or abs((old_et or 0) - et) > 0.05:
            changed += 1
        scene["start_sec"] = round(st, 2)
        scene["end_sec"] = round(et, 2)
        scene["_time_aligned"] = True
        log(f"  {scene.get('segment_name',''):<8} {old_st}-{old_et} → {st:.2f}-{et:.2f}")

    new_total = scenes[-1].get("end_sec", 0)
    script["main_video_duration_sec"] = round(recog_total, 2)
    script["_time_aligned"] = True
    script["_time_aligned_with"] = args.media

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(script, f, ensure_ascii=False, indent=2)

    log(f"\n{'=' * 60}")
    log(f"校准完成：总时长 {old_total}s → {new_total}s（{changed} 段有调整）")
    log(f"输出 → {args.output}")
    print(f"\n{'=' * 60}")
    print(f"时间轴校准完成：{args.output}")
    print(f"  估算总长 {old_total}s → 实际 {new_total}s")
    print(f"下一步：用校准后的 script.json 重新跑 match_materials.py + fill_draft.py")


if __name__ == "__main__":
    main()
