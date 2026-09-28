#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
whisper_asr.py — 给 fill_template.py 用的 ASR 助手:
输出视频语音的逐词时间戳 JSON(到 stdout), 用于字幕精确对齐口播。

必须在装了 openai-whisper 的 python 里跑:
  <venv-python> whisper_asr.py <video_path> [model]
默认模型 small (中文够准, 26s 视频约 20s 跑完; 模型已缓存在 ~/.cache/whisper)
输出: [{"start":.., "end":.., "words":[{"w":..,"s":..,"e":..}, ...]}, ...]
"""
import json, sys

def main():
    path = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else "small"
    import whisper
    m = whisper.load_model(model_name)
    r = m.transcribe(path, language="zh", word_timestamps=True,
                     condition_on_previous_text=False)
    out = []
    for s in r.get("segments", []):
        out.append({
            "start": s.get("start", 0),
            "end": s.get("end", 0),
            "words": [{"w": w.get("word", ""), "s": w.get("start", 0), "e": w.get("end", 0)}
                      for w in s.get("words", [])],
        })
    json.dump(out, sys.stdout, ensure_ascii=False)

if __name__ == "__main__":
    main()
