#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_default_template.py — 从「默认模版1」(香港人老得慢) 草稿的 Timelines 明文(template.json)做减法,
生成「默认模版1」模板包: 白边框 + 主视频轨 + 字幕轨(含重点词样式) + 主标题轨 + 音效/BGM轨.

减法规则(基于对原草稿的轨道分析):
  删除: 多机位B-roll轨 + 免责声明轨 + 分段标题轨 + 复合片段material
  保留: 白边框轨(shape) + 主视频轨(清空段,留美颜/调色refs) + 字幕轨(清空段,留2种样式模板) 
        + 主标题轨(清空段,留样式模板) + 音轨(清原声段,留BGM槽)

用法:
  python3 build_default_template.py <Timelines_template.json> <out_template_dir>
"""
import json, os, sys, uuid, shutil

def new_id():
    return str(uuid.uuid4()).upper()

def get_material_category(track, mats):
    """判断一条轨引用的主要 material 类别(按第一个 segment)."""
    segs = track.get("segments", [])
    if not segs:
        return "empty"
    mid = segs[0].get("material_id", "")
    for cat in ("videos", "texts", "audios", "shapes", "stickers", "effects", "drafts"):
        for it in mats.get(cat, []):
            if isinstance(it, dict) and it.get("id") == mid:
                return cat
    return "unknown"

def extract_subtitle_style_templates(mats, sub_track):
    """从字幕轨提取2种样式模板: 普通白色 + 重点词黄色.
    返回 {"normal": text_material, "highlight": text_material}
    """
    texts = mats.get("texts", [])
    id2text = {t["id"]: t for t in texts}
    normal = highlight = None
    for s in sub_track.get("segments", []):
        mid = s.get("material_id")
        tm = id2text.get(mid)
        if not tm:
            continue
        try:
            c = json.loads(tm.get("content", "{}"))
            st = c.get("styles", [{}])[0]
            fill = st.get("fill", {}).get("content", {}).get("solid", {}).get("color", [])
            if len(fill) >= 3:
                # [r,g,b] 0-1, 判断是否黄色(高亮)
                r, g, b = fill[0], fill[1], fill[2]
                is_yellow = g > 0.8 and r > 0.8 and b < 0.7  # 黄色: 高G高R低B
                if is_yellow and not highlight:
                    highlight = json.loads(json.dumps(tm))
                elif not is_yellow and not normal:
                    normal = json.loads(json.dumps(tm))
        except Exception:
            continue
    # 兜底: 如果没找到黄色, 用普通复制一份当highlight
    if not highlight and normal:
        highlight = json.loads(json.dumps(normal))
        # 改成黄色
        try:
            c = json.loads(highlight["content"])
            c["styles"][0]["fill"]["content"]["solid"]["color"] = [1.0, 0.957, 0.537]  # #FFF489
            highlight["content"] = json.dumps(c, ensure_ascii=False)
        except Exception:
            pass
    return {"normal": normal, "highlight": highlight}

def extract_title_template(mats, title_track):
    """从主标题轨提取1个样式模板."""
    texts = mats.get("texts", [])
    id2text = {t["id"]: t for t in texts}
    for s in title_track.get("segments", []):
        mid = s.get("material_id")
        tm = id2text.get(mid)
        if tm:
            return json.loads(json.dumps(tm))
    return None

def build(timeline_json_path, out_dir):
    with open(timeline_json_path, "r", encoding="utf-8") as f:
        d = json.load(f)
    
    mats = d.get("materials", {})
    tracks = d.get("tracks", [])
    
    print(f"[build] 源草稿: {timeline_json_path}")
    print(f"  画布={d.get('canvas_config')} dur={d.get('duration',0)/1e6:.1f}s tracks={len(tracks)}")
    
    # 1. 分类每条轨
    track_info = []
    for i, t in enumerate(tracks):
        cat = get_material_category(t, mats)
        segs = t.get("segments", [])
        track_info.append((i, t, cat, len(segs)))
        # 样本文本
        sample = ""
        if segs and cat == "texts":
            mid = segs[0].get("material_id")
            for tm in mats.get("texts", []):
                if tm.get("id") == mid:
                    try:
                        c = json.loads(tm.get("content", "{}"))
                        sample = c.get("text", "")[:16]
                    except Exception:
                        pass
                    break
        print(f"  track[{i:2d}] cat={cat:8s} segs={len(segs):3d} {sample!r}")
    
    # 2. 做减法: 确定保留/删除的轨
    # 删除: 安全区shape(1) + 多机位B-roll(2,3,4,8,9,11) + 免责声明(7) + 分段标题(10)
    #       + 机位原声轨(12) + 按空格键音效(17) + 多余BGM轨(15,16)
    # 保留: 主视频(0) + 白色字幕轨(5) + 黄色花字轨(6) + 音效轨(13) + BGM轨(14)
    DELETE_TRACK_INDICES = {1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 15, 16, 17}

    # 标记槽位
    SLOT_ASSIGN = {
        0: "SLOT_MAIN_VIDEO",            # 主视频轨(清空段,填数字人)
        5: "SLOT_SUBTITLES_NORMAL",       # 白色普通字幕轨(#FFFFFF, 清空段按文案重建)
        6: "SLOT_SUBTITLES_HIGHLIGHT",   # 黄色重点词花字轨(#FFF589, 清空段按重点词重建)
        13: "SLOT_SFX",                  # 音效轨(15段特效声, 保留素材, fill重排时间点)
        14: "SLOT_BGM",                  # BGM轨(用 assets/bgm.m4a 覆盖全程)
    }
    
    new_tracks = []
    kept_track_indices = []
    for i, t, cat, nseg in track_info:
        if i in DELETE_TRACK_INDICES:
            print(f"  [删除] track[{i}] cat={cat}")
            continue
        kept_track_indices.append(i)
        # 标记槽位
        if i in SLOT_ASSIGN:
            t["_SLOT"] = SLOT_ASSIGN[i]
            # 给轨道引用的 material 也加 SLOT 标记 (fill 时按 material 找)
            if t.get("segments") and SLOT_ASSIGN[i] == "SLOT_MAIN_VIDEO":
                slot_mid = t["segments"][0].get("material_id")
                for it in mats.get("videos", []):
                    if isinstance(it, dict) and it.get("id") == slot_mid:
                        it["_SLOT"] = "SLOT_MAIN_VIDEO"
                        it["_fill_instruction"] = "填数字人/口播视频 path + duration"
                        break
        # track[14] BGM 轨: 标记 material
        if i == 14 and t.get("segments"):
            bgm_mid = t["segments"][0].get("material_id")
            for au in mats.get("audios", []):
                if isinstance(au, dict) and au.get("id") == bgm_mid:
                    au["_SLOT"] = "SLOT_BGM"
                    au["_fill_instruction"] = "填 assets/bgm.m4a 覆盖全程"
                    break
        # track[13] 音效轨: 标记所有音效 material 为 SLOT_SFX (保留)
        if i == 13 and t.get("segments"):
            sfx_mids = {s.get("material_id") for s in t["segments"] if s.get("material_id")}
            for au in mats.get("audios", []):
                if isinstance(au, dict) and au.get("id") in sfx_mids:
                    au["_SLOT"] = "SLOT_SFX"
        new_tracks.append(t)
    
    print(f"\n[build] 保留 {len(new_tracks)} 条轨: {[i for i in kept_track_indices]}")
    
    # 3. 提取样式模板 (必须在清空 segments 之前!)
    sub_normal_track = next((t for t in new_tracks if t.get("_SLOT") == "SLOT_SUBTITLES_NORMAL"), None)
    sub_highlight_track = next((t for t in new_tracks if t.get("_SLOT") == "SLOT_SUBTITLES_HIGHLIGHT"), None)

    style_templates = {}
    if sub_normal_track:
        # 从白色字幕轨提取普通样式 (取第一个 segment 的 text material)
        texts = mats.get("texts", [])
        id2text = {t["id"]: t for t in texts}
        for s in sub_normal_track.get("segments", []):
            tm = id2text.get(s.get("material_id"))
            if tm:
                style_templates["subtitle_normal"] = json.loads(json.dumps(tm))
                break
        print(f"\n[build] 普通字幕样式(白): {'有' if style_templates.get('subtitle_normal') else '无'}")
    if sub_highlight_track:
        texts = mats.get("texts", [])
        id2text = {t["id"]: t for t in texts}
        for s in sub_highlight_track.get("segments", []):
            tm = id2text.get(s.get("material_id"))
            if tm:
                style_templates["subtitle_highlight"] = json.loads(json.dumps(tm))
                break
        print(f"[build] 重点词样式(黄): {'有' if style_templates.get('subtitle_highlight') else '无'}")

    # 4. 清空槽位轨的 segments (音效轨 SLOT_SFX 保留所有段, fill 时重排时间点)
    for t in new_tracks:
        slot = t.get("_SLOT")
        if slot in ("SLOT_MAIN_VIDEO", "SLOT_SUBTITLES_NORMAL", "SLOT_SUBTITLES_HIGHLIGHT"):
            # 保留第一个 segment 作为模板(用于 fill 时复用结构)
            first_seg = t["segments"][0] if t.get("segments") else {}
            t["segments"] = []  # 清空, fill 时重建
            t["_template_seg"] = json.loads(json.dumps(first_seg)) if first_seg else {}
        elif slot == "SLOT_BGM":
            # BGM 轨: 保留第一个 segment (保证 audio material 引用不被清理),
            # fill 时会覆盖成1段新BGM
            pass
        # SLOT_SFX: 保留所有 segments, fill 时重排时间点
    
    # 5. 清理 material: 删除未引用的
    # 收集保留轨引用的所有 material_id
    referenced = set()
    for t in new_tracks:
        for s in t.get("segments", []):
            mid = s.get("material_id")
            if mid:
                referenced.add(mid)
            for r in s.get("extra_material_refs", []):
                referenced.add(r)
        # 保留 _template_seg 的引用
        ts = t.get("_template_seg")
        if ts:
            mid = ts.get("material_id")
            if mid:
                referenced.add(mid)
            for r in ts.get("extra_material_refs", []):
                referenced.add(r)
    # 样式模板的 id 也要保留(虽然 fill 时会 clone 新 id, 但模板素材本身要保留)
    for cat in ("subtitle_normal", "subtitle_highlight"):
        tm = style_templates.get(cat)
        if tm:
            referenced.add(tm.get("id"))

    # 清理每个 material 类别
    clear_cats = {"drafts"}  # 复合片段一定删
    for cat in list(mats.keys()):
        if cat in clear_cats:
            mats[cat] = []
            continue
        items = mats.get(cat)
        if isinstance(items, list):
            before = len(items)
            mats[cat] = [it for it in items if isinstance(it, dict) and it.get("id") in referenced]
            after = len(mats[cat])
            if before != after:
                print(f"  [清理] {cat}: {before} -> {after}")

    # 6. 把样式模板 material 加入 texts (确保 fill 能找到)
    text_ids = {t.get("id") for t in mats.get("texts", [])}
    for key in ("subtitle_normal", "subtitle_highlight"):
        tm = style_templates.get(key)
        if tm and tm.get("id") not in text_ids:
            mats.setdefault("texts", []).append(tm)
            text_ids.add(tm["id"])
    
    # 7. 顶层 duration 保持原值(fill 时会改)
    d["tracks"] = new_tracks
    d["materials"] = mats
    
    # 8. 写模板包
    os.makedirs(out_dir, exist_ok=True)
    # template.draft 目录
    td = os.path.join(out_dir, "template.draft")
    os.makedirs(td, exist_ok=True)
    dc_path = os.path.join(td, "draft_content.json")
    with open(dc_path, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False)
    print(f"\n[build] 写出 draft_content.json -> {dc_path} ({os.path.getsize(dc_path)}B)")
    
    # draft_meta_info
    meta = {
        "draft_id": new_id(),
        "draft_name": os.path.basename(out_dir.rstrip("/")),
        "draft_type": "video",
        "draft_new_version": "164.0.0",
        "duration": d.get("duration", 0),
        "tm_duration": d.get("duration", 0),
        "tm_draft_create": 0,
        "tm_draft_modified": 0,
    }
    with open(os.path.join(td, "draft_meta_info.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    
    # manifest
    canvas = d.get("canvas_config", {})
    duration_us = d.get("duration", 0)
    manifest = {
        "template_name": os.path.basename(out_dir.rstrip("/")),
        "canvas": canvas,
        "duration_s": duration_us / 1000000,
        "fps": d.get("fps"),
        "version": d.get("version"),
        "source_platform": d.get("platform", {}),
        "slots": {
            "SLOT_MAIN_VIDEO": {"track_ref": "by _SLOT tag", "instruction": "填数字人/口播视频"},
            "SLOT_SUBTITLES_NORMAL": {"track_ref": "by _SLOT tag", "instruction": "白色普通字幕, 按文案分句"},
            "SLOT_SUBTITLES_HIGHLIGHT": {"track_ref": "by _SLOT tag", "instruction": "黄色重点词花字, AI识别关键词"},
            "SLOT_SFX": {"track_ref": "by _SLOT tag", "instruction": "音效轨, 保留原素材, fill按分句重排时间点"},
            "SLOT_BGM": {"track_ref": "by _SLOT tag", "instruction": "填 assets/bgm.m4a 覆盖全程"},
        },
        "style_tracks": {
            str(i): {"class": t.get("_STYLE_CLASS", ""), "slot": t.get("_SLOT", "")}
            for i, t in enumerate(new_tracks) if t.get("_STYLE_CLASS") or t.get("_SLOT")
        },
        "style_templates": {
            "subtitle_normal": "白色普通字幕(思源黑体Heavy, #FFFFFF, 阴影, 字号10)",
            "subtitle_highlight": "黄色重点词花字(思源黑体Heavy, #FFF589, 阴影, 字号10)",
        },
        "locked": ["effects(美颜/调色)", "material_colors", "material_animations", "sfx_audios(音效素材)"],
    }
    with open(os.path.join(out_dir, "template_manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print(f"[build] 写出 manifest -> {os.path.join(out_dir, 'template_manifest.json')}")

    # assets (BGM) - 用用户提供的 m4a
    assets_dir = os.path.join(out_dir, "assets")
    os.makedirs(assets_dir, exist_ok=True)
    src_bgm = "/Users/archerjim/Downloads/dbc65fd1ce8b1a4f7c43dc277459cc458e959f7e.m4a"
    if os.path.isfile(src_bgm):
        shutil.copy(src_bgm, os.path.join(assets_dir, "bgm.m4a"))
        print(f"[build] 复制 BGM -> {assets_dir}/bgm.m4a")
    else:
        print(f"[build][WARN] 找不到 BGM 源文件 {src_bgm}", file=sys.stderr)
    
    print(f"\n[build] 完成! 模板包: {out_dir}")
    print(f"  轨道: {len(new_tracks)} 条 (主视频+白边框+字幕+主标题+音轨)")
    print(f"  下一步: python3 fill_template.py {dc_path} <数字人.mp4> '<文案>' <输出> --style-mode keep-style")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("用法: python3 build_default_template.py <Timelines_template.json> <out_dir>")
        sys.exit(1)
    build(sys.argv[1], sys.argv[2])
