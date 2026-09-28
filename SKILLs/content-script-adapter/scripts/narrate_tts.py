#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
narrate_tts.py —— 模式B 旁白 TTS 合成（edge-tts 声音库 + macOS say fallback）

逐段把 script.json 的 subtitle_text 用 TTS 合成为独立音频文件，
按各段实际音频时长重排时间轴（前段结束 = 下段开始），
输出 aligned script + narration 目录（每段一个音频）。

【声音库】默认引擎 edge-tts（微软在线 TTS，音质接近真人），内置 4 种中文音色：
  - 晓晓  zh-CN-XiaoxiaoNeural  女声温暖，通用口播首选
  - 晓伊  zh-CN-XiaoyiNeural    女声甜美，生活/美业
  - 云希  zh-CN-YunxiNeural     男声年轻，品牌口播
  - 云扬  zh-CN-YunyangNeural   男声成熟，新闻主播感
生成时用 --voice 选音色（别名或完整 voice id）。
edge-tts 不可用（未安装/断网）时自动 fallback 到 macOS say（音色 Tingting 等）。

为什么分段而不是整段合成：
  - 每段独立音频，时长用 ffmpeg 精确读取，直接重排时间轴
  - 不需要 whisper 对齐（TTS 语速和预估不一致，整段合成会错位）
  - 段间停顿在旁白视频里是正常节奏，不突兀

用法：
  # 列出声音库
  python3 narrate_tts.py --list-voices

  # 用「晓晓」音色合成（默认）
  python3 narrate_tts.py --script script.json --output-dir narration/ --voice 晓晓

  # 直接传 edge-tts 完整 voice id
  python3 narrate_tts.py --script script.json --output-dir narration/ --voice zh-CN-YunyangNeural

  # 调语速：edge-tts 接受百分比（+0% ~ +20% 加快 / -20% 放慢）
  python3 narrate_tts.py --script script.json --output-dir narration/ --rate +5%

  # 断网时 fallback 到 macOS say
  python3 narrate_tts.py --script script.json --output-dir narration/ --engine say --voice Tingting

输出：
  narration/s01.mp3, s02.mp3, ...          （edge 引擎，剪映原生支持 mp3）
  narration/s01.m4a, s02.m4a, ...          （say 引擎）
  script_<原文件名>_narrated.json （时间轴已重排）
"""
import argparse
import asyncio
import json
import os
import re
import subprocess
import sys

# ---------------------------------------------------------------------------
# 声音库
# ---------------------------------------------------------------------------
VOICE_LIBRARY = {
    "晓晓": {"id": "zh-CN-XiaoxiaoNeural", "desc": "女声温暖，通用口播首选", "gender": "F"},
    "晓伊": {"id": "zh-CN-XiaoyiNeural", "desc": "女声甜美，生活/美业", "gender": "F"},
    "云希": {"id": "zh-CN-YunxiNeural", "desc": "男声年轻，品牌口播", "gender": "M"},
    "云扬": {"id": "zh-CN-YunyangNeural", "desc": "男声成熟，新闻主播感", "gender": "M"},
}


def resolve_voice(voice_arg, engine):
    """把 --voice 参数解析为引擎实际用的音色名。
    edge 引擎：别名 → edge-tts voice id；或直接接受 zh-CN-* 完整 id。
    say  引擎：直接用 macOS say 语音名（如 Tingting / Sinji）。
    """
    if engine == "say":
        return voice_arg or "Tingting"
    # edge 引擎
    if not voice_arg:
        return VOICE_LIBRARY["晓晓"]["id"], "晓晓"
    # 别名命中
    if voice_arg in VOICE_LIBRARY:
        entry = VOICE_LIBRARY[voice_arg]
        return entry["id"], voice_arg
    # 完整 id（zh-CN-xxxNeural）
    if voice_arg.lower().startswith("zh-") or voice_arg.lower().endswith("neural"):
        return voice_arg, voice_arg
    # 未识别
    print(f"[ERROR] 未识别的音色 '{voice_arg}'，可用别名：{', '.join(VOICE_LIBRARY.keys())}", file=sys.stderr)
    print(f"        或直接传 edge-tts 完整 id（如 zh-CN-XiaoxiaoNeural）", file=sys.stderr)
    sys.exit(1)


def normalize_rate(rate_arg):
    """把 --rate 归一为 edge-tts 的百分比字符串。
    接受：'+10%' '-5%' '0' '10' '-5' 等。
    """
    if not rate_arg:
        return "+0%"
    s = str(rate_arg).strip()
    if s.endswith("%"):
        return s if s[0] in "+-" else ("+" + s)
    # 纯数字 → 百分比
    try:
        n = int(s)
        return ("+" if n >= 0 else "") + str(n) + "%"
    except ValueError:
        return "+0%"


def normalize_volume(vol_arg):
    """把 --volume 归一为 edge-tts 的百分比字符串（如 '+50%'）。"""
    if not vol_arg:
        return "+0%"
    s = str(vol_arg).strip()
    if s.endswith("%"):
        return s if s[0] in "+-" else ("+" + s)
    try:
        n = int(s)
        return ("+" if n >= 0 else "") + str(n) + "%"
    except ValueError:
        return "+0%"


def list_voices():
    print(f"\n{'=' * 64}")
    print(f"  声音库（edge-tts 中文音色，音质接近真人）")
    print(f"{'=' * 64}")
    print(f"  {'别名':<6} {'voice id':<32} {'性别':<4} 说明")
    print(f"  {'-'*6} {'-'*32} {'-'*4} {'-'*20}")
    for alias, v in VOICE_LIBRARY.items():
        print(f"  {alias:<6} {v['id']:<32} {v['gender']:<4} {v['desc']}")
    print(f"\n  用法：--voice 晓晓   或   --voice zh-CN-XiaoxiaoNeural")
    print(f"  默认：晓晓（女声温暖）")
    print(f"  断网 fallback：--engine say --voice Tingting\n")


# ---------------------------------------------------------------------------
# 时长读取
# ---------------------------------------------------------------------------
def get_audio_duration_sec(filepath):
    """用 ffmpeg 读音频时长（秒）。"""
    try:
        r = subprocess.run(
            ["ffmpeg", "-i", filepath],
            capture_output=True, text=True, timeout=10
        )
        m = re.search(r"Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)", r.stderr)
        if m:
            h, mi, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
            return h * 3600 + mi * 60 + s
    except Exception as e:
        print(f"[warn] 读时长失败 {filepath}: {e}", file=sys.stderr)
    return None


# ---------------------------------------------------------------------------
# 合成引擎
# ---------------------------------------------------------------------------
async def _edge_synth(text, voice_id, out_path, rate_str, volume_str="+0%"):
    """edge-tts 合成一段到 mp3。"""
    communicate = __import__("edge_tts").Communicate(text, voice_id, rate=rate_str, volume=volume_str)
    await communicate.save(out_path)
    return out_path


def synth_edge(text, out_path, voice_id, rate_str, volume_str="+50%"):
    """edge-tts 同步封装。volume_str 提升输出响度（默认 +50%，旁白视频需要清晰）。"""
    clean = " ".join(text.split())
    if not clean:
        return None
    try:
        asyncio.run(_edge_synth(clean, voice_id, out_path, rate_str, volume_str))
        return out_path
    except Exception as e:
        print(f"[err] edge-tts 合成失败: {e}", file=sys.stderr)
        return None


def synth_say(text, out_path, voice="Tingting", rate=180):
    """macOS say 合成一段 → ffmpeg 转 m4a（断网 fallback）。"""
    clean = " ".join(text.split())
    if not clean:
        return None
    aiff_path = out_path.replace(".m4a", ".aiff")
    try:
        subprocess.run(
            ["say", "-v", voice, "-r", str(rate), "-o", aiff_path, clean],
            check=True, capture_output=True, timeout=120
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        print(f"[err] say 合成失败: {e}", file=sys.stderr)
        return None
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", aiff_path, "-c:a", "aac", "-b:a", "128k", out_path],
            check=True, capture_output=True, timeout=30
        )
        os.remove(aiff_path)
        return out_path
    except subprocess.CalledProcessError as e:
        print(f"[err] ffmpeg 转 m4a 失败: {e.stderr[:200] if hasattr(e,'stderr') else e}", file=sys.stderr)
        return None


def synth_segment(text, out_path, engine, voice_id, rate_str, say_rate=180, volume_str="+50%"):
    """统一入口：按引擎选合成方式。返回成功路径或 None。"""
    if engine == "say":
        return synth_say(text, out_path, voice=voice_id, rate=say_rate)
    # edge
    return synth_edge(text, out_path, voice_id, rate_str, volume_str)


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="模式B 旁白 TTS 合成（edge-tts 声音库）")
    ap.add_argument("--script", help="script.json 路径")
    ap.add_argument("--output-dir", help="输出音频目录（narration/）")
    ap.add_argument("--voice", default="晓晓",
                    help="音色：别名（晓晓/晓伊/云希/云扬）或 edge-tts id；say 引擎填 say 语音名")
    ap.add_argument("--engine", default="edge", choices=["edge", "say"],
                    help="合成引擎：edge（默认，在线音质好）/ say（macOS 本地 fallback）")
    ap.add_argument("--rate", default="+0%",
                    help="语速：edge 用百分比 +10%/-10%；say 用整数（默认180）；'0'=默认")
    ap.add_argument("--volume", default="+50%",
                    help="edge-tts 音量增益（默认 +50%，旁白视频需清晰可辨）；如 +0%/+100%/+150%")
    ap.add_argument("--start-id", default="s01", help="第一段 scene_id 起点（默认 s01）")
    ap.add_argument("--list-voices", action="store_true", help="列出声音库后退出")
    args = ap.parse_args()

    if args.list_voices:
        list_voices()
        return

    if not args.script or not args.output_dir:
        ap.error("--script 和 --output-dir 必填（或用 --list-voices 查看音色）")

    if not os.path.exists(args.script):
        print(f"[ERROR] script.json 不存在：{args.script}", file=sys.stderr)
        sys.exit(1)
    os.makedirs(args.output_dir, exist_ok=True)

    # 解析音色
    if args.engine == "say":
        voice_id = args.voice if args.voice else "Tingting"
        voice_label = voice_id
        rate_str = args.rate
        say_rate = int(args.rate) if str(args.rate).lstrip("-+").isdigit() else 180
        ext = ".m4a"
    else:
        # edge 引擎：检查 edge-tts 是否可用
        try:
            import edge_tts  # noqa
        except ImportError:
            print("[ERROR] edge-tts 未安装，自动 fallback 到 say 引擎。", file=sys.stderr)
            print("        安装：pip install edge-tts", file=sys.stderr)
            print("        或直接用：--engine say --voice Tingting", file=sys.stderr)
            args.engine = "say"
            voice_id = args.voice if args.voice else "Tingting"
            voice_label = voice_id + "(fallback say)"
            rate_str = args.rate
            say_rate = int(args.rate) if str(args.rate).lstrip("-+").isdigit() else 180
            ext = ".m4a"
        else:
            voice_id, voice_label = resolve_voice(args.voice, args.engine)
            rate_str = normalize_rate(args.rate)
            volume_str = normalize_volume(args.volume)
            say_rate = 180
            ext = ".mp3"

    script = json.load(open(args.script, encoding="utf-8"))
    scenes = script.get("scenes", [])
    if not scenes:
        print("[ERROR] script.json 的 scenes 为空", file=sys.stderr)
        sys.exit(1)

    print(f"[narrate] {'=' * 60}")
    print(f"[narrate] 模式B 旁白 TTS 合成")
    print(f"[narrate] 引擎={args.engine} 音色={voice_label}({voice_id}) 语速={rate_str} 音量={volume_str} 段数={len(scenes)}")
    print(f"[narrate] {'=' * 60}")

    # narration_audio 字段用 output-dir 的 basename 作相对目录前缀，
    # 必须和实际输出目录名一致，否则 fill_draft 的 add_narration_track 找不到音频文件
    audio_subdir = os.path.basename(os.path.normpath(args.output_dir)) or "narration"
    new_scenes = []
    cursor = 0.0
    for i, scene in enumerate(scenes):
        scene_id = scene.get("scene_id", f"s{i+1:02d}")
        text = scene.get("subtitle_text") or scene.get("voiceover_text") or ""
        if not text:
            print(f"[narrate] {scene_id} 空文案，跳过")
            new_scenes.append({**scene, "start_sec": round(cursor, 2), "end_sec": round(cursor, 2), "narration_audio": ""})
            continue

        out_audio = os.path.join(args.output_dir, f"{scene_id}{ext}")
        print(f"[narrate] {scene_id} 合成中: {text[:30]}...")
        ok = synth_segment(text, out_audio, args.engine, voice_id, rate_str, say_rate, volume_str)
        if not ok:
            print(f"[narrate] {scene_id} 合成失败，跳过")
            new_scenes.append({**scene, "start_sec": round(cursor, 2), "end_sec": round(cursor, 2), "narration_audio": ""})
            continue

        dur = get_audio_duration_sec(out_audio) or 0
        start = cursor
        end = cursor + dur
        cursor = end

        new_scenes.append({
            **scene,
            "scene_id": scene_id,
            "start_sec": round(start, 2),
            "end_sec": round(end, 2),
            "subtitle_text": text,
            "narration_audio": f"{audio_subdir}/{scene_id}{ext}",
            "narration_duration_sec": round(dur, 2),
        })
        print(f"[narrate] {scene_id} ✓ {dur:.2f}s @{start:.2f}-{end:.2f}s")

    total_dur = cursor
    print(f"\n[narrate] 总时长: {total_dur:.2f}s")

    new_script = {
        **script,
        "scenes": new_scenes,
        "total_duration_sec": round(total_dur, 2),
        "narration_voice": voice_label,
        "narration_voice_id": voice_id,
        "narration_engine": args.engine,
        "narration_rate": rate_str,
    }

    base = os.path.basename(args.script)
    name, e = os.path.splitext(base)
    out_script = os.path.join(os.path.dirname(args.script) or ".", f"{name}_narrated{e}")
    json.dump(new_script, open(out_script, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    print(f"[narrate] 输出 script: {out_script}")
    print(f"[narrate] 输出音频目录: {args.output_dir}/ ({len(new_scenes)} 段)")
    print(f"\n下一步：")
    print(f"  match: python3 match_materials.py --script {out_script} --library <素材库> --output assets.json --mode C")
    print(f"  fill:  python3 fill_draft.py --template <模板> --script {out_script} --assets assets.json --output <草稿> --mode B")


if __name__ == "__main__":
    main()
