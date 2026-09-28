# -*- coding: utf-8 -*-
"""
content-template-pack / scripts / analyze_template.py
读取剪映「保存为模板」导出的明文 template.json，输出结构化报告。
AI 基于报告做槽位决策（哪些是可变槽，哪些是模板级配置）。
"""
import json, sys, os

def analyze(path):
    with open(path, 'r', encoding='utf-8') as f:
        d = json.load(f)

    report = {}
    report["top_keys"] = sorted(d.keys())
    report["duration_us"] = d.get("duration")
    report["duration_s"] = (d.get("duration") or 0) / 1000000
    report["fps"] = d.get("fps")
    report["version"] = d.get("version")
    report["platform"] = d.get("platform")
    report["canvas_config"] = d.get("canvas_config")
    report["mixed_track_mode_on"] = d.get("mixed_track_mode_on")

    # tracks 分析
    tracks_info = []
    for i, t in enumerate(d.get("tracks", [])):
        segs = t.get("segments", [])
        ti = {
            "index": i,
            "type": t.get("type"),
            "attribute": t.get("attribute"),
            "segments_count": len(segs),
        }
        if segs:
            s0 = segs[0]
            ti["seg0_has_material_id"] = "material_id" in s0
            ti["seg0_target_timerange"] = s0.get("target_timerange")
            ti["seg0_source_timerange"] = s0.get("source_timerange")
            # text segment 的内容
            if t.get("type") == "text":
                ti["seg0_text_key"] = s0.get("text_key")
        tracks_info.append(ti)
    report["tracks"] = tracks_info

    # materials 分析（按类别统计 + 列路径）
    mats = d.get("materials", {})
    mats_report = {}
    # 重点关注：videos / audios / texts
    for key in ("videos", "audios", "texts", "images", "stickers"):
        items = mats.get(key, [])
        if not items:
            continue
        lst = []
        for j, it in enumerate(items):
            entry = {
                "idx": j,
                "type": it.get("type") or it.get("material_type"),
                "name": it.get("name"),
                "path": it.get("path") or it.get("mat_path"),
                "duration_us": it.get("duration") or it.get("mat_duration"),
                "material_id": it.get("id") or it.get("material_id"),
            }
            lst.append(entry)
        mats_report[key] = {"count": len(items), "samples": lst[:8]}
    # 其他类别只计数
    for k, v in mats.items():
        if k in mats_report:
            continue
        if isinstance(v, list) and v:
            mats_report[k] = {"count": len(v), "note": "non-core"}
        elif isinstance(v, dict):
            mats_report[k] = {"count": len(v), "note": "dict"}
    report["materials"] = mats_report

    return report

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: analyze_template.py <template.json path>")
        sys.exit(1)
    r = analyze(sys.argv[1])
    print(json.dumps(r, ensure_ascii=False, indent=2))
