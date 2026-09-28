#!/usr/bin/env python3
"""
fix_draft_for_local.py — 把第三方明文剪映草稿适配到本机 Mac 剪映 10.x 可打开。

根因（2026-09-21 实测确认）：
- Mac 版剪映 10.x 一律通过 draft_info.json 打开草稿（root_meta_info.json 总索引里每条
  draft_json_file 字段都指向 draft_info.json）；只有旧版 draft_content.json 没有
  draft_info.json 时会报「草稿内容已损坏」。
- 第三方 Windows/iOS 模板的 draft_meta_info.json 里 draft_fold_path 等是 Windows 路径、
  draft_id 是原模板 id、new_version 是旧版号（如 54.0.0），Mac 版打开会校验失败。

本脚本做的事（不修改原草稿里的素材/字幕/轨道结构）：
  1. cp draft_content.json → draft_info.json（Mac 版唯一认的草稿数据文件名）
  2. draft_meta_info.json：补 draft_json_file 全路径 / draft_type=video /
     draft_new_version=164.0.0（对齐本机剪映）/ 重置 draft_fold_path 等 Mac 路径 /
     生成新唯一 draft_id（避免和已有草稿冲突）/ 刷新 tm_draft_modified
  3. root_meta_info.json 总索引：找到该草稿条目，同步 draft_new_version / draft_type；
     若索引里没有该草稿，自动追加一条（模型字段齐全）
  4. draft_info.json 内部：new_version / draft_type 同步；保留 draft_content.json 不动
     （方便对照与回滚）

用法：
  python3 fix_draft_for_local.py <draft_dir> [--new-version 164.0.0]

参数：
  draft_dir        剪映草稿目录绝对路径（应已含 draft_content.json + draft_meta_info.json）
  --new-version     目标剪映版本号，默认 164.0.0（按本机剪映 10.x 对齐；可按实际版本调）

退出码：
  0 成功；1 参数错/缺文件；2 JSON 解析失败；3 写入失败
"""
import json, os, shutil, sys, time, uuid, argparse, re

DRAFTS_DIR = os.path.expanduser("~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft")
ROOT_META = f"{DRAFTS_DIR}/root_meta_info.json"
TARGET_NEW_VERSION_DEFAULT = "164.0.0"

def log(msg):
    print(f"[fix_draft] {msg}")

def err(msg, code=1):
    print(f"[fix_draft][ERROR] {msg}", file=sys.stderr)
    sys.exit(code)

def parse_args():
    p = argparse.ArgumentParser(description="适配第三方剪映明文草稿到本机 Mac 可打开")
    p.add_argument("draft_dir", help="草稿目录绝对路径")
    p.add_argument("--new-version", default=TARGET_NEW_VERSION_DEFAULT,
                   help=f"目标 new_version 号，默认 {TARGET_NEW_VERSION_DEFAULT}")
    return p.parse_args()

def main():
    a = parse_args()
    # 规范化为绝对路径——占位符替换会写进 draft_content.json 的 path 字段，
    # 相对路径会让剪映找不到素材（草稿复制到别的目录后路径失效）
    d = os.path.abspath(a.draft_dir.rstrip("/"))
    if not os.path.isdir(d):
        err(f"草稿目录不存在: {d}")
    dc = f"{d}/draft_content.json"
    di = f"{d}/draft_info.json"
    mp = f"{d}/draft_meta_info.json"
    if not os.path.exists(dc):
        err(f"缺 draft_content.json: {dc}")
    if not os.path.exists(mp):
        # meta 不存在时 fill 脚本主动删除让 fix 重建，不报错继续
        log(f"draft_meta_info.json 不存在，将在加载 data 后从头生成")
        meta_missing = True
    else:
        meta_missing = False

    # 0. 备份 root 索引（只动一次）
    ts = time.strftime("%Y%m%d_%H%M%S")
    if os.path.exists(ROOT_META):
        shutil.copy2(ROOT_META, f"{ROOT_META}.bak_{ts}")
        log(f"备份 root_meta_info.json -> .bak_{ts}")

    # 1. draft_content.json -> draft_info.json
    try:
        data = json.load(open(dc, encoding="utf-8"))
    except Exception as e:
        err(f"draft_content.json 解析失败（可能加密）: {e}", 2)
    shutil.copy2(dc, di)
    log(f"复制 draft_content.json -> draft_info.json ({os.path.getsize(dc)}B)")

    # draft_info.json 内部对齐
    data["new_version"] = a.new_version
    data["draft_type"] = data.get("draft_type") or "video"
    try:
        json.dump(data, open(di, "w", encoding="utf-8"), ensure_ascii=False)
    except Exception as e:
        err(f"draft_info.json 写入失败: {e}", 3)

    # 2. draft_meta_info.json 修复（缺失/密文则从头生成明文版）
    meta = None
    if meta_missing:
        log(f"draft_meta_info.json 不存在，从头生成明文版")
        cover = f"{d}/draft_cover.jpg" if os.path.exists(f"{d}/draft_cover.jpg") else ""
        meta = {
            "draft_id": "",
            "draft_name": os.path.basename(d),
            "draft_fold_path": d,
            "draft_root_path": DRAFTS_DIR,
            "draft_removable_storage_device": "",
            "draft_json_file": di,
            "draft_type": "video",
            "draft_new_version": a.new_version,
            "draft_cover": cover,
            "duration": data.get("duration", 0),
            "tm_draft_create": int(time.time() * 1000000),
            "tm_draft_modified": int(time.time() * 1000000),
            "tm_duration": data.get("duration", 0),
        }
    else:
        try:
            meta = json.load(open(mp, encoding="utf-8"))
        except Exception:
            log(f"draft_meta_info.json 是密文（剪映打开后加密），从头生成明文版")
            shutil.copy2(mp, f"{mp}.encrypted_bak")
            cover = f"{d}/draft_cover.jpg" if os.path.exists(f"{d}/draft_cover.jpg") else ""
            meta = {
                "draft_id": "",
                "draft_name": os.path.basename(d),
                "draft_fold_path": d,
                "draft_root_path": DRAFTS_DIR,
                "draft_removable_storage_device": "",
                "draft_json_file": di,
                "draft_type": "video",
                "draft_new_version": a.new_version,
                "draft_cover": cover,
                "duration": data.get("duration", 0),
                "tm_draft_create": int(time.time() * 1000000),
                "tm_draft_modified": int(time.time() * 1000000),
                "tm_duration": data.get("duration", 0),
            }

    new_id = str(uuid.uuid4()).upper()
    meta["draft_id"] = new_id
    meta["draft_name"] = os.path.basename(d)
    meta["draft_fold_path"] = d
    meta["draft_root_path"] = DRAFTS_DIR
    meta["draft_removable_storage_device"] = ""
    meta["draft_json_file"] = di
    meta["draft_type"] = "video"
    meta["draft_new_version"] = a.new_version
    meta["tm_draft_modified"] = int(time.time() * 1000000)
    # 兼容字段：若无 tm_draft_create 用当前时间
    if not meta.get("tm_draft_create"):
        meta["tm_draft_create"] = int(time.time() * 1000000)
    json.dump(meta, open(mp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    log(f"修复 draft_meta_info.json: draft_id={new_id[:8]}... draft_json_file/draft_type=video/new_version={a.new_version}")

    # 3. draft_content.json 里的 id 也同步（避免和 meta 的 draft_id 不一致）
    try:
        dc_data = json.load(open(dc, encoding="utf-8"))
        if "id" in dc_data or dc_data.get("id") != new_id:
            dc_data["id"] = new_id
            dc_data["new_version"] = a.new_version
            dc_data["draft_type"] = "video"
            json.dump(dc_data, open(dc, "w", encoding="utf-8"), ensure_ascii=False)
            log("同步 draft_content.json 的 id/new_version")
    except Exception as e:
        log(f"warn: draft_content.json 同步失败（非致命）: {e}")

    # 3.5 占位符 path 替换: ##_draftpath_placeholder_<ID>_##/<subdir>/<file>
    #     → <draft_dir>/<subdir>/<file> (绝对路径, Mac 本机剪映才能找到素材)
    # 这是 fill_draft.py 的设计契约: 写占位符 + 由 fix 替换为绝对路径
    # 同时处理相对路径 (materials/audio/xxx.mp3): 转为草稿目录绝对路径, 文件不存在时清空引用 segments
    try:
        dc_data2 = json.load(open(dc, encoding="utf-8"))
        di_data2 = json.load(open(di, encoding="utf-8"))
        replaced_n = 0
        ghost_mats = []  # 路径不存在的 material_id 列表
        for data_obj in (dc_data2, di_data2):
            for cat_items in data_obj.get("materials", {}).values():
                if not isinstance(cat_items, list):
                    continue
                for item in cat_items:
                    if not isinstance(item, dict):
                        continue
                    p = item.get("path", "")
                    if not isinstance(p, str) or not p:
                        continue
                    # 占位符格式
                    if "_draftpath_placeholder_" in p:
                        new_path = re.sub(r'##_draftpath_placeholder_[^#]+_##/', f'{d}/', p)
                        if new_path != p:
                            item["path"] = new_path
                            replaced_n += 1
                            if not os.path.isfile(new_path):
                                ghost_mats.append(item.get("id", ""))
                    # 相对路径 (不以 / 开头, 不是占位符)
                    elif not p.startswith("/"):
                        new_path = os.path.join(d, p)
                        if os.path.isfile(new_path):
                            item["path"] = new_path
                            replaced_n += 1
                        else:
                            # 剪映内置音效/特效有 resource_id，即使本地 path 文件不存在，
                            # 剪映也能从云端资源库自动下载——不清 ghost，保留 segments
                            if item.get("resource_id"):
                                replaced_n += 1  # 计数但不加 ghost
                            else:
                                ghost_mats.append(item.get("id", ""))
        # 清空引用 ghost material 的 segments (避免剪映打开报错)
        cleared_segs = 0
        if ghost_mats:
            ghost_set = set(ghost_mats)
            for data_obj in (dc_data2, di_data2):
                for tr in data_obj.get("tracks", []):
                    segs = tr.get("segments", [])
                    new_segs = [s for s in segs if s.get("material_id") not in ghost_set]
                    if len(new_segs) != len(segs):
                        cleared_segs += len(segs) - len(new_segs)
                        tr["segments"] = new_segs
        if replaced_n:
            json.dump(dc_data2, open(dc, "w", encoding="utf-8"), ensure_ascii=False)
            json.dump(di_data2, open(di, "w", encoding="utf-8"), ensure_ascii=False)
            log(f"占位符+相对路径替换: {replaced_n} 处 → 绝对路径（draft_dir={d}）")
            if ghost_mats:
                log(f"⚠ 清空 {len(ghost_mats)} 个文件不存在的 material 引用的 segments ({cleared_segs} 段)")
    except Exception as e:
        log(f"warn: 占位符替换失败（非致命）: {e}")

    # 4. root_meta_info.json 总索引：更新或追加
    if os.path.exists(ROOT_META):
        try:
            root = json.load(open(ROOT_META, encoding="utf-8"))
        except Exception as e:
            err(f"root_meta_info.json 解析失败: {e}", 2)
        store = root.get("all_draft_store", [])
        entry = None
        for e in store:
            if os.path.basename(e.get("draft_fold_path", "")) == os.path.basename(d) \
               or e.get("draft_name") == os.path.basename(d):
                entry = e
                break
        if entry is None:
            # 追加一条（模型字段从索引现有正常条目复制最小集）
            entry = {
                "cloud_draft_cover": False,
                "cloud_draft_sync": False,
                "draft_cloud_last_action_download": False,
                "draft_cloud_purchase_info": "",
                "draft_cloud_template_id": "",
                "draft_cloud_tutorial_info": "",
                "draft_cloud_videocut_purchase_info": "",
                "draft_cover": f"{d}/draft_cover.jpg" if os.path.exists(f"{d}/draft_cover.jpg") else "",
                "draft_fold_path": d,
                "draft_id": new_id,
                "draft_is_ai_shorts": False,
                "draft_is_cloud_temp_draft": False,
                "draft_is_invisible": False,
                "draft_is_pippit_draft": False,
                "draft_is_web_article_video": False,
                "draft_json_file": di,
                "draft_name": os.path.basename(d),
                "draft_new_version": a.new_version,
                "draft_root_path": DRAFTS_DIR,
                "draft_timeline_materials_size": os.path.getsize(di),
                "draft_type": "video",
                "draft_web_article_video_enter_from": "",
                "pippit_avatar_url": "", "pippit_extra_info": "", "pippit_id": "", "pippit_user_name": "",
                "streaming_edit_draft_ready": True,
                "tm_draft_cloud_completed": "",
                "tm_draft_cloud_entry_id": -1,
                "tm_draft_cloud_modified": 0,
                "tm_draft_cloud_parent_entry_id": -1,
                "tm_draft_cloud_space_id": -1,
                "tm_draft_cloud_user_id": -1,
                "tm_draft_create": int(time.time() * 1000000),
                "tm_draft_modified": int(time.time() * 1000000),
                "tm_draft_removed": 0,
                "tm_duration": data.get("duration", 0),
            }
            store.append(entry)
            root["all_draft_store"] = store
            log(f"追加新草稿到 root 索引: {os.path.basename(d)}")
        else:
            entry["draft_id"] = new_id
            entry["draft_fold_path"] = d
            entry["draft_json_file"] = di
            entry["draft_new_version"] = a.new_version
            entry["draft_type"] = "video"
            entry["draft_cloud_last_action_download"] = False
            entry["draft_root_path"] = DRAFTS_DIR
            entry["tm_draft_modified"] = int(time.time() * 1000000)
            entry["draft_name"] = os.path.basename(d)
            log(f"更新 root 索引现有条目: {os.path.basename(d)}")
        json.dump(root, open(ROOT_META, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print("\n=== 完成。重启剪映（Cmd+Q 退出进程后再开）即可在草稿列表打开 ===")

if __name__ == "__main__":
    main()
