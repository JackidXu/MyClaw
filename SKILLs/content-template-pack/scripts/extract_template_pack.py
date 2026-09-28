# -*- coding: utf-8 -*-
"""
content-template-pack / scripts / extract_template_pack.py
从明文 draft_content.json 抽取模板包三件套。
通用脚本，适配任意明文剪映 draft_content.json（含第三方模板）。
"""
import json, os, shutil, sys, re, glob

def find_track_by_type(d, ttype, prefer_attr=None, max_segs=None):
    """按 type 找轨道，优先 attribute，可选 segments 数上限"""
    candidates = []
    for i, t in enumerate(d.get("tracks", [])):
        if t.get("type") != ttype:
            continue
        segs = len(t.get("segments", []))
        if max_segs is not None and segs > max_segs:
            continue
        candidates.append((i, t, segs))
    if not candidates:
        return None
    if prefer_attr is not None:
        for c in candidates:
            if c[1].get("attribute") == prefer_attr:
                return c
    return candidates[0]

def find_material_index_by_id(d, mat_id, category="videos"):
    """通过 material_id 在 materials[category] 里找 index"""
    items = (d.get("materials") or {}).get(category, [])
    for i, it in enumerate(items):
        if it.get("id") == mat_id or it.get("material_id") == mat_id:
            return i
    return None

# ---- mixed 轨（剪映 9.x+ 新格式：单轨内含多类素材）识别 ----
_MIXED_CATS = ("videos", "texts", "audios", "effects", "stickers",
               "images", "digital_humans", "transitions")

def build_id2cat(d):
    """建立 material_id -> 素材类别 映射，用于判断 mixed 轨片段的真实类型"""
    id2cat = {}
    for c in _MIXED_CATS:
        for it in (d.get("materials") or {}).get(c, []):
            if it.get("id"):
                id2cat[it["id"]] = c
            if it.get("material_id"):
                id2cat[it["material_id"]] = c
    return id2cat

def classify_mixed(track, id2cat):
    """返回某 mixed 轨占多数的素材类别（无则 None）"""
    cats = {}
    for sg in track.get("segments", []):
        c = id2cat.get(sg.get("material_id"))
        if c:
            cats[c] = cats.get(c, 0) + 1
    return max(cats, key=cats.get) if cats else None

def find_mixed_track(d, cat):
    """在 mixed 轨里找占多数素材类别为 cat 的那条（取片段数最多者），返回 (i,track,segs) 或 None"""
    id2cat = build_id2cat(d)
    best, best_segs = None, -1
    for i, t in enumerate(d.get("tracks", [])):
        if t.get("type") != "mixed":
            continue
        if classify_mixed(t, id2cat) == cat:
            segs = len(t.get("segments", []))
            if segs > best_segs:
                best_segs, best = segs, (i, t, segs)
    return best

def resolve_material_path(raw_path, draft_dir):
    """把占位符路径 ##_draftpath_placeholder_xxx_##\\video/xxx.mp4 解析成实际文件路径"""
    if not raw_path:
        return None
    # 去掉占位符前缀
    p = re.sub(r'^##_draftpath_placeholder_[^#]+_##[\\/]*', '', raw_path)
    p = p.replace('\\', '/')
    # 在 draft_dir 下找
    candidates = [
        os.path.join(draft_dir, p),
        os.path.join(draft_dir, os.path.basename(p)),
        os.path.join(draft_dir, "video", os.path.basename(p)),
        os.path.join(draft_dir, "audio", os.path.basename(p)),
        os.path.join(draft_dir, "materials", p),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    return None  # 文件缺失，仅记文件名

def classify_track_for_style(track, id2cat, slot_track_indices):
    """对非槽位轨做风格保留分类（keep-style 模式用）。
    返回: 'KEEP' (装饰/特效轨, 保留) | 'CLEAR_SEGS' (机位/原声素材轨, 清空段保留轨) | 'DROP' (删整轨)
    
    判别:
    - segments 引用 videos/photo material 的 mixed 轨 → CLEAR_SEGS (机位B滚, 套到数字人视频会变成别人的脸)
    - audio 轨 (type=audio) → CLEAR_SEGS (原声/音效, 随主视频替换失效)
    - segments 引用 effects/video_effects/stickers 但无 video 引用的 mixed 轨 → KEEP (装饰特效, 不绑定具体素材)
    - 空 segments 的 mixed 轨 → KEEP (空轨, 保留无害)
    - 已标 SLOT 的轨 (主视频/字幕/BGM) → 不在此处理
    """
    segs = track.get("segments", [])
    if not segs:
        return "KEEP"  # 空轨保留无害
    
    # 统计各类素材引用
    cats = {}
    for sg in segs:
        c = id2cat.get(sg.get("material_id"))
        if c:
            cats[c] = cats.get(c, 0) + 1
    
    # audio 轨: 原声/音效, 清空段
    if track.get("type") == "audio":
        return "CLEAR_SEGS"
    
    # mixed 轨: 看引用的素材类别
    video_refs = cats.get("videos", 0)
    effect_refs = cats.get("effects", 0) + cats.get("video_effects", 0)
    sticker_refs = cats.get("stickers", 0)
    text_refs = cats.get("texts", 0)
    
    # 引用 video material (机位素材) → 清空段 (套到数字人视频会显示别人的脸)
    if video_refs > 0 and video_refs >= max(effect_refs, sticker_refs, text_refs):
        return "CLEAR_SEGS"
    
    # 纯特效/贴纸/文字轨 (无 video 引用) → 保留
    if video_refs == 0 and (effect_refs > 0 or sticker_refs > 0 or text_refs > 0):
        return "KEEP"
    
    # 混合但 video 占多数 → 清空段 (机位素材为主)
    if video_refs > 0:
        return "CLEAR_SEGS"
    
    # 无法判断 (material_id 找不到对应素材) → 保守清空段
    return "CLEAR_SEGS"


def extract(draft_dir, out_dir):
    dc_path = os.path.join(draft_dir, "draft_content.json")
    # 若 draft_content.json 不存在或是密文 (首字符非{), 退而找 Timelines/*/template.json (剪映打开过的草稿自动落地明文)
    use_timeline = False
    if not os.path.isfile(dc_path):
        use_timeline = True
    else:
        with open(dc_path, 'rb') as fb:
            head = fb.read(1)
        if head != b'{':
            use_timeline = True  # 密文, 用 Timelines 明文兜底
    if use_timeline:
        tl_dirs = [d for d in glob.glob(os.path.join(draft_dir, "Timelines", "*")) if os.path.isdir(d)]
        found = None
        for td in tl_dirs:
            cand = os.path.join(td, "template.json")
            if os.path.isfile(cand):
                # 确认是明文
                with open(cand, 'rb') as fb:
                    if fb.read(1) == b'{':
                        found = cand
                        break
        if found:
            dc_path = found
            print(f"[extract] draft_content.json 缺失/密文, 用 Timelines 明文: {dc_path}", file=sys.stderr)
        else:
            raise FileNotFoundError(f"找不到明文 draft_content.json 或 Timelines/*/template.json in {draft_dir}")
    with open(dc_path, 'r', encoding='utf-8') as f:
        d = json.load(f)

    name = os.path.basename(draft_dir)
    canvas = d.get("canvas_config", {})
    duration_us = d.get("duration") or 0

    # 1. 识别槽位（先老式分轨，再 mixed 新格式兜底）
    main = find_track_by_type(d, "video", prefer_attr=1)
    sub = find_track_by_type(d, "text", max_segs=20)
    bgm = find_track_by_type(d, "audio")
    if main is None:
        main = find_mixed_track(d, "videos")
    if sub is None:
        sub = find_mixed_track(d, "texts")
    if bgm is None:
        bgm = find_mixed_track(d, "audios")

    report = {"name": name, "canvas": canvas, "duration_s": duration_us/1000000,
              "fps": d.get("fps"), "version": d.get("version")}

    # 1.5 模板复杂度检测: 复杂模板的"风格"绑死在素材上(多机位/复合片段/逐句花字),
    #     套用到数字人视频无法继承风格, 不建议做套用模板
    mats0 = d.get("materials") or {}
    complexity = {
        "subdraft_count": len(mats0.get("drafts", [])),   # 复合片段嵌套数
        "video_seg_count": sum(len(t.get("segments", [])) for t in d.get("tracks", [])
                               if t.get("type") in ("video", "mixed")),
        "track_count": len(d.get("tracks", [])),
    }
    warnings = []
    if complexity["subdraft_count"] > 0:
        warnings.append(f"含 {complexity['subdraft_count']} 个复合片段(嵌套工程), 套用后素材引用易丢失")
    if complexity["video_seg_count"] > 10:
        warnings.append(f"视频轨共 {complexity['video_seg_count']} 段(多机位混剪), 风格绑死在原素材上, 无法迁移到数字人视频")
    if warnings:
        report["complexity"] = complexity
        report["WARN_NOT_RECOMMENDED"] = "⚠️ 此草稿结构复杂, 不适合做套用模板: " + "; ".join(warnings) + "。建议换结构简单的模板(主轨1-2段+1条常规字幕轨+BGM)"
        print(f"[extract][WARN] {report['WARN_NOT_RECOMMENDED']}", file=sys.stderr)

    slots = {}
    if main:
        mi, mt, msegs = main
        # 找主轨第一个 segment 的 material_id
        seg0 = mt.get("segments", [{}])[0]
        mat_id = seg0.get("material_id") or seg0.get("material_name")
        mat_idx = find_material_index_by_id(d, mat_id, "videos") if mat_id else 0
        if mat_idx is None:
            mat_idx = 0
        slots["SLOT_MAIN_VIDEO"] = {"track_index": mi, "segments": msegs,
                                     "material_index": mat_idx,
                                     "fill": "script.json main_video_path + duration; material type photo→video"}
        report["main_video_track"] = f"trk[{mi}] attr={mt.get('attribute')} segs={msegs} mat_idx={mat_idx}"
    if sub:
        si, st, ssegs = sub
        slots["SLOT_SUBTITLES"] = {"track_index": si, "segments": ssegs,
                                   "fill": "script.json scenes[].subtitle + 时间戳; segments 清空重建"}
        report["subtitle_track"] = f"trk[{si}] segs={ssegs}"
    if bgm:
        bi, bt, bsegs = bgm
        # 找BGM的material
        bseg = bt.get("segments", [{}])[0]
        bmat_id = bseg.get("material_id")
        bmat_idx = find_material_index_by_id(d, bmat_id, "audios") if bmat_id else 0
        if bmat_idx is None:
            bmat_idx = 0
        slots["SLOT_BGM"] = {"track_index": bi, "material_index": bmat_idx,
                             "fill": "assets/bgm 文件; 音量锁死"}
        report["bgm_track"] = f"trk[{bi}] segs={bsegs} mat_idx={bmat_idx}"

    # 2. 准备输出目录
    os.makedirs(out_dir, exist_ok=True)
    draft_out = os.path.join(out_dir, "template.draft")
    assets_out = os.path.join(out_dir, "assets")
    os.makedirs(draft_out, exist_ok=True)
    os.makedirs(assets_out, exist_ok=True)

    # 3. 复制 draft，插占位
    d2 = json.loads(json.dumps(d))  # deep copy
    if "SLOT_MAIN_VIDEO" in slots:
        s = slots["SLOT_MAIN_VIDEO"]
        vids = d2.get("materials", {}).get("videos", [])
        if s["material_index"] < len(vids):
            vmat = vids[s["material_index"]]
            vmat["_SLOT"] = "SLOT_MAIN_VIDEO"
            vmat["_fill_instruction"] = "path←script.json main_video_path; duration←main_video_duration_us; type: photo→video"
            vmat["path"] = "{{SLOT_MAIN_VIDEO_PATH}}"
            vmat["duration"] = 0
        # 主轨 segment timerange 清零
        seg0 = d2["tracks"][s["track_index"]]["segments"][0]
        seg0["_SLOT"] = "SLOT_MAIN_VIDEO seg0"
        seg0["source_timerange"] = {"duration": 0, "start": 0}
        seg0["target_timerange"] = {"duration": 0, "start": 0}
        # 多余 segment 删除，只留1段
        if len(d2["tracks"][s["track_index"]]["segments"]) > 1:
            d2["tracks"][s["track_index"]]["segments"] = d2["tracks"][s["track_index"]]["segments"][:1]
    if "SLOT_SUBTITLES" in slots:
        s = slots["SLOT_SUBTITLES"]
        d2["tracks"][s["track_index"]]["_SLOT"] = "SLOT_SUBTITLES"
        d2["tracks"][s["track_index"]]["_fill_instruction"] = "segments 清空，按 script.json scenes 生成 N 个 text segment"
        d2["tracks"][s["track_index"]]["segments"] = []
    if "SLOT_BGM" in slots:
        s = slots["SLOT_BGM"]
        auds = d2.get("materials", {}).get("audios", [])
        if s["material_index"] < len(auds):
            bmat = auds[s["material_index"]]
            bmat["_SLOT"] = "SLOT_BGM"
            amtype = bmat.get("type", "")
            # 原声轨（video_original_sound）随主视频替换而失效，不复制、仅占位提示
            if amtype == "video_original_sound":
                bmat["_fill_instruction"] = "此为原声轨(video_original_sound)，随主视频替换而清除；若需BGM请另行填 assets/bgm"
                bmat["path"] = "assets/bgm.m4a"
                bmat["duration"] = 0
            else:
                bmat["_fill_instruction"] = "path←assets/bgm 文件; duration←总时长"
                raw = bmat.get("path", "")
                real = resolve_material_path(raw, draft_dir)
                AUDIO_EXT = (".m4a", ".mp3", ".wav", ".aac", ".flac", ".ogg")
                if real and os.path.splitext(real)[1].lower() in AUDIO_EXT:
                    ext = os.path.splitext(real)[1]
                    dst = os.path.join(assets_out, "bgm" + ext)
                    shutil.copy2(real, dst)
                    bmat["path"] = "assets/bgm" + ext
                else:
                    bmat["path"] = "assets/bgm.m4a"
                bmat["duration"] = 0

    # 3.5 风格保留分类 (keep-style 模式用): 对非槽位轨标 KEEP/CLEAR_SEGS
    id2cat = build_id2cat(d2)
    slot_indices = {s["track_index"] for s in slots.values()}
    style_tracks = {}  # track_index -> {class, segments, reason}
    for i, t in enumerate(d2.get("tracks", [])):
        if i in slot_indices:
            continue  # 槽位轨已处理
        cls = classify_track_for_style(t, id2cat, slot_indices)
        segs_cnt = len(t.get("segments", []))
        t["_STYLE_CLASS"] = cls  # 标到轨上, 供 fill_template.py 读取
        reason = {
            "KEEP": "装饰/特效轨, 无机位素材引用, 保留",
            "CLEAR_SEGS": "机位素材/原声轨, 清空段保留轨 (套到数字人视频不显示别人的脸)",
            "DROP": "未分类, 待 fill 决定",
        }.get(cls, "")
        style_tracks[i] = {"class": cls, "segments": segs_cnt, "reason": reason}
    report["style_tracks"] = style_tracks

    # 4. 写 draft_content.json（带 SLOT + STYLE 注释）
    with open(os.path.join(draft_out, "draft_content.json"), 'w', encoding='utf-8') as f:
        json.dump(d2, f, ensure_ascii=False, indent=2)

    # 5. 抽主视频原素材（参考用，A模式会换成数字人视频）
    if "SLOT_MAIN_VIDEO" in slots:
        s = slots["SLOT_MAIN_VIDEO"]
        vids = d.get("materials", {}).get("videos", [])
        if s["material_index"] < len(vids):
            raw = vids[s["material_index"]].get("path", "")
            real = resolve_material_path(raw, draft_dir)
            report["main_video_source_file"] = os.path.basename(raw) if raw else None
            report["main_video_source_found"] = "YES" if real else "NO (占位符/缺失，A模式无需原片)"

    # 6. meta_info
    meta = {
        "canvas_config": canvas, "fps": d.get("fps"),
        "duration": duration_us, "version": d.get("version"),
        "platform": d.get("platform"), "draft_name": name,
    }
    with open(os.path.join(draft_out, "draft_meta_info.json"), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    # 7. manifest
    manifest = {
        "template_name": name, "canvas": canvas,
        "duration_s": duration_us/1000000, "fps": d.get("fps"),
        "slots": {k: {kk: vv for kk, vv in v.items()} for k, v in slots.items()},
        "style_tracks": style_tracks,  # keep-style 模式用: 非槽位轨分类
        "locked": ["effect_tracks", "sticker_tracks", "transitions", "调色参数"],
        "source_platform": d.get("platform", {}),
    }
    with open(os.path.join(out_dir, "template_manifest.json"), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    report["slots"] = list(slots.keys())
    report["out_dir"] = out_dir
    return report

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: extract_template_pack.py <draft_dir> <out_dir>")
        sys.exit(1)
    r = extract(sys.argv[1], sys.argv[2])
    print(json.dumps(r, ensure_ascii=False, indent=2))
