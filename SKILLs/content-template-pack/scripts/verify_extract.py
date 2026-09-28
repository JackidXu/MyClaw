# -*- coding: utf-8 -*-
"""
content-template-pack / scripts / verify_extract.py
校验抽取质量：把 SLOT 填回原值生成还原版，跟原版 deep diff。
差异应为 0（或仅路径细节），证明抽取只动了该动的槽位，没破坏骨架。
"""
import json, os, sys, copy

def deep_diff(a, b, path=""):
    """递归比较，返回差异列表"""
    diffs = []
    if type(a) != type(b):
        diffs.append(f"{path}: 类型不同 {type(a).__name__} vs {type(b).__name__}")
        return diffs
    if isinstance(a, dict):
        keys = set(a) | set(b)
        for k in keys:
            if k.startswith("_"):  # 跳过 _SLOT/_fill_instruction 等抽取标记
                continue
            if k not in a:
                diffs.append(f"{path}.{k}: 原版有/还原版缺")
            elif k not in b:
                diffs.append(f"{path}.{k}: 还原版有/原版缺")
            else:
                diffs += deep_diff(a[k], b[k], f"{path}.{k}")
    elif isinstance(a, list):
        if len(a) != len(b):
            diffs.append(f"{path}: 长度不同 {len(a)} vs {len(b)}")
        for i in range(min(len(a), len(b))):
            diffs += deep_diff(a[i], b[i], f"{path}[{i}]")
    else:
        if a != b:
            diffs.append(f"{path}: 值不同 {a!r} vs {b!r}")
    return diffs

def restore(orig, extracted):
    """把 extracted 的 SLOT 填回 orig 的原值，生成还原版"""
    r = copy.deepcopy(extracted)
    # tracks：按 index 从 orig 复制（去掉 _SLOT 字段）
    for i, t in enumerate(r.get("tracks", [])):
        if i < len(orig.get("tracks", [])):
            ot = orig["tracks"][i]
            # 去掉抽取加的 _SLOT/_fill_instruction
            t.pop("_SLOT", None)
            t.pop("_fill_instruction", None)
            # segments 从 orig 恢复
            t["segments"] = copy.deepcopy(ot.get("segments", []))
            # segment 里的 _SLOT 也去掉
            for seg in t["segments"]:
                seg.pop("_SLOT", None)
                seg.pop("_fill_instruction", None)
    # materials.videos / audios：按 index 从 orig 恢复
    for cat in ("videos", "audios", "texts"):
        ritems = (r.get("materials") or {}).get(cat, [])
        oitems = (orig.get("materials") or {}).get(cat, [])
        for i, it in enumerate(ritems):
            if i < len(oitems):
                # 去掉 _SLOT，从 orig 复制原值字段
                it.pop("_SLOT", None)
                it.pop("_fill_instruction", None)
                for k in ("path", "duration", "type", "name", "width", "height", "source"):
                    if k in oitems[i]:
                        it[k] = copy.deepcopy(oitems[i][k])
    return r

def verify(orig_dir, pack_dir):
    orig = json.load(open(os.path.join(orig_dir, "draft_content.json"), encoding='utf-8'))
    extracted = json.load(open(os.path.join(pack_dir, "template.draft", "draft_content.json"), encoding='utf-8'))

    # 1. 结构校验
    checks = []
    for k in ("canvas_config", "tracks", "materials", "duration", "fps", "version"):
        checks.append((k, k in extracted))

    # 2. SLOT 标记位置
    slot_marks = []
    for i, t in enumerate(extracted.get("tracks", [])):
        if "_SLOT" in t:
            slot_marks.append(f"trk[{i}] {t.get('type')} → {t['_SLOT']}")
        for j, seg in enumerate(t.get("segments", [])):
            if "_SLOT" in seg:
                slot_marks.append(f"trk[{i}].seg[{j}] → {seg['_SLOT']}")
    for cat in ("videos", "audios"):
        for i, it in enumerate((extracted.get("materials") or {}).get(cat, [])):
            if "_SLOT" in it:
                slot_marks.append(f"materials.{cat}[{i}] → {it['_SLOT']}")

    # 3. 还原 + diff
    restored = restore(orig, extracted)
    diffs = deep_diff(restored, orig)

    print("=== 结构校验 ===")
    for k, ok in checks:
        print(f"  {k}: {'✓' if ok else '✗ 缺失'}")
    print(f"\n=== SLOT 标记位置（{len(slot_marks)} 处）===")
    for s in slot_marks:
        print(f"  {s}")
    print(f"\n=== 还原 diff（还原版 vs 原版）===")
    if not diffs:
        print("  ✓ 差异为 0 —— 抽取完美，只动了槽位，骨架完整无损")
    else:
        print(f"  共 {len(diffs)} 处差异（前20条）：")
        for d in diffs[:20]:
            print(f"  {d}")
    # 写还原版到 pack 目录供剪映验证
    out = os.path.join(pack_dir, "restored_for_check.json")
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(restored, f, ensure_ascii=False, indent=2)
    print(f"\n还原版已写: {out}")
    return len(diffs)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: verify_extract.py <原draft目录> <抽取的模板包目录>")
        sys.exit(1)
    n = verify(sys.argv[1], sys.argv[2])
    sys.exit(0 if n == 0 else 1)
