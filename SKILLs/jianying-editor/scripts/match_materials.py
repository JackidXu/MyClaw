#!/usr/bin/env python3
"""
match_materials.py — 素材决策引擎（多素材拼接）

模式A = 选择性插入（有原数字人口播视频基底）
  - 文案性质三分类：ip_direct/narrative → 保留原视频；visual_aid → 配素材
  - visual_aid 段内：多素材按时长拼接铺满，铺不满的尾部露原视频

模式C = 全覆盖（纯素材整合，无原视频）
  - 每段都配素材，多素材拼接铺满，铺不满标缺口

三层决策：
  第1层 文案性质三分类（内容驱动，看subtitle_text）：
    - ip_direct（IP直视镜头型）：开头钩子/CTA/情感共鸣 → 保留原视频
    - visual_aid（画面可佐证型）：产品/数据/场景/流程 → 需要配素材
    - narrative（口播叙事型）：观点/道理 → 保留原视频（原视频是默认）
  第2层 素材能否承接（只对visual_aid段匹配素材）：
    - 文件存在性验证
    - ffprobe/ffmpeg 实测时长
    - 内容相关性（关键词匹配+证据强度，低于阈值不硬凑→保留原视频）
    - 利用索引表"可用片段"黄金片段截取
    - 多素材拼接：按时长累加铺满段落，素材够长截取，不够用下一个
  第3层 输出决策：每段带 use_original 标记 + clips 数组
    - use_original=true → fill_draft 不插 B-roll
    - use_original=false + clips=[素材1,素材2,...] → fill_draft 按时间偏移连续插多个 segment
    - 模式A 铺不满 → 尾部露原视频（clips 只到铺满处）
    - 模式C 铺不满 → 标 gap

继承 content-material-matcher 理念：
  - 不硬凑（低质量匹配不如保留原视频）
  - 文件存在性验证（不存在则跳过+标记）
  - 可用片段利用（不从素材开头盲截）
  - 照片不参与视频段匹配（视觉表达力弱，有原视频兜底）

用法：
  python3 match_materials.py \
    --script <script.json> \
    --library <素材库目录> \
    --output <assets.json> \
    [--mode A|C]
"""
import argparse
import csv
import json
import os
import re
import subprocess
import sys

# ============================================================
# 1. 文案性质三分类规则（内容驱动）
# ============================================================

# IP直视镜头型关键词（命中→保留原视频，不配素材）
IP_DIRECT_KEYWORDS = [
    "我是", "我叫", "我是做", "今天我", "我跟你", "我跟大家", "我跟你说",
    "你发现", "你有没有发现", "你想想", "你知道", "你见过",
    "关注", "扣", "评论区", "留言", "私信", "链接", "主页", "下单",
    "试试", "体验", "领取", "记得", "别忘", "记住", "收藏", "转发",
    "点赞", "评论", "扫码", "回复",
    "说实话", "讲真", "坦白说", "老实说", "说真的", "老实讲",
    "其实我", "坦白讲",
]

# 画面可佐证型关键词（命中→需要配素材）
# ⚠️ 漏报词排查(2026-09-28): 9月23日用户验证时发现段"请编导一万一个月…"因"编导"未在词表被判 narrative→保留原视频, 漏配素材。
#    补全方向: 编导/砸钱/开店/探店/打卡/犹豫/放弃/方案/演示/编导团队/办公/工位/会议室/办公区/团队开会
VISUAL_AID_KEYWORDS = [
    "界面", "系统", "平台", "工具", "AI", "数字人", "生成", "操作",
    "演示", "录屏", "后台", "功能", "一键", "批量", "模板", "软件",
    "小程序", "APP", "效果", "脚本生成", "口播", "矩阵", "分发",
    "数据", "播放量", "涨粉", "转化率", "成本", "对比", "增长",
    "结果", "案例", "客户说", "成交", "线索", "获客", "流量",
    "投产比", "ROI", "爆款", "反馈",
    "工厂", "办公室", "门店", "现场", "流程", "步骤", "怎么做的",
    "展示", "拍摄", "录制", "服务", "交付", "合作", "团队", "会议",
    # —— 2026-09-28 补全漏报词 ——
    "编导",          # 编导相关画面（团队/会议/讨论方案）
    "编导团队",
    "砸钱",          # 砸钱做X的画面（投资/施工/装修展示）
    "开店",          # 开店画面（场地/装修/营业展示）
    "探店",          # 探店达人画面
    "打卡",          # 打卡地画面
    "犹豫",          # 客户犹豫画面（人像+决策纠结）
    "方案",          # 方案文件/对比画面
    "放弃",          # 放弃动作画面
    "会议室",        # 会议室讨论画面
    "办公区",        # 办公场景画面
    "工位",          # 工位办公画面
    "评论区",        # 评论区互动画面（与 ip_direct "扣"区别: 此处泛指评论列表/管理界面）
    "笔记",          # 笔记/种草内容画面
    "客户",          # 客户相关画面（C系列素材）
    "趋势",          # 趋势图画面
    "饼图",          # 饼图数据画面
    "折线",          # 折线图画面
    "柱状",          # 柱状图画面
    "卖点",          # 卖点讲解画面（产品演示）
    "搞定",          # 结果展示画面
    "日更",          # 日更内容生产画面
    "出海",          # 出海分发画面
    "分发",          # 分发界面（多平台一键发）
]

# segment_name 辅助信号（走完整流程时有结构化标签，可提升判断精度）
SEGMENT_NAME_BOOST = {
    "钩子": "ip_direct",
    "CTA": "ip_direct",
    "开头": "ip_direct",
    "结尾": "ip_direct",
    "收口": "ip_direct",
}

# 不硬凑阈值：单个素材匹配分低于此值 → 不用这个素材
SCORE_THRESHOLD = 3

# 段落尾部"露原视频/缺口"判定阈值：剩余空间 > 此值才算没铺满
TAIL_THRESHOLD = 0.5

# ============================================================
# 2. 分类映射：文案性质 → 素材库候选一级分类
# ============================================================
SEGMENT_CATEGORY_MAP = {
    "钩子": ["场景环境", "人物形象"],
    "痛点": ["客户相关", "数据证据", "场景环境"],
    "方案": ["产品服务"],
    "分发卖点": ["产品服务", "场景环境"],
    "CTA": ["数据证据", "人物形象"],
    "开头": ["场景环境", "人物形象"],
    "结尾": ["数据证据", "人物形象"],
    "正文": ["产品服务", "场景环境", "客户相关"],
}

# 关键词权重（subtitle_text 含这些词时优先匹配含这些词的素材描述）
KEYWORD_WEIGHTS = {
    "AI": ["AI", "人工智能", "数字人", "脚本"],
    "数字人": ["数字人", "口播", "人像"],
    "脚本": ["脚本", "文案", "brief"],
    "分发": ["分发", "平台", "全平台", "一键"],
    "抖音": ["抖音", "短视频", "播放"],
    "小红书": ["小红书", "笔记", "种草"],
    "矩阵号": ["矩阵", "多账号", "账号"],
    "编导": ["编导", "团队", "会议"],
    "成本": ["成本", "饼图", "趋势图", "数据"],
    "客户": ["客户", "犹豫", "方案", "对比"],
    "办公": ["办公", "工位", "忙碌"],
    "数据": ["数据", "播放量", "爆款", "分析"],
    # —— 2026-09-28 补全漏报权重 ——
    "放弃": ["放弃", "撑不到", "团队", "会议", "讨论"],  # 关联 C-03~06 团队讨论画面
    "编导团队": ["编导", "团队", "会议", "工位"],
    "卖点": ["卖点", "产品", "演示", "效果"],
    "搞定": ["搞定", "结果", "完成", "效果展示"],
    "日更": ["日更", "内容", "生产", "批量"],
    "出海": ["出海", "多语种", "海外", "国际"],
    "一键发": ["分发", "平台", "一键", "多平台"],
}


def log(msg):
    print(f"[match] {msg}")


# ============================================================
# 3. 工具函数
# ============================================================

def parse_duration_to_sec(dur_str):
    """把 '0:30' / '1:05' / '7:00' 转成秒。"""
    if not dur_str or dur_str == "-":
        return 0
    parts = str(dur_str).split(":")
    try:
        if len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        elif len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    except ValueError:
        return 0
    return 0


def _find_ffmpeg():
    """找到可用的 ffmpeg 可执行文件路径。优先系统 ffprobe，其次 imageio_ffmpeg 包带的 ffmpeg。"""
    try:
        subprocess.run(["ffprobe", "-version"], capture_output=True, timeout=5)
        return "ffprobe"
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
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


def get_video_duration(filepath, tool=None):
    """读视频时长（秒）。优先 ffprobe，不可用则用 ffmpeg 解析 Duration 输出。失败返回 None。"""
    if tool is None:
        tool = _find_ffmpeg()

    if tool == "ffprobe":
        try:
            result = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "default=noprint_wrappers=1:nokey=1", filepath],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0 and result.stdout.strip():
                return float(result.stdout.strip())
        except (subprocess.TimeoutExpired, ValueError):
            pass

    if tool and tool != "ffprobe":
        ffmpeg_cmd = tool if os.path.exists(tool) else "ffmpeg"
        try:
            result = subprocess.run(
                [ffmpeg_cmd, "-i", filepath],
                capture_output=True, text=True, timeout=10
            )
            m = re.search(r"Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d+)", result.stderr or "")
            if m:
                h, mi, s = m.groups()
                return int(h) * 3600 + int(mi) * 60 + float(s)
        except (subprocess.TimeoutExpired, ValueError, FileNotFoundError):
            pass

    return None


def parse_sub_clips(usable_str):
    """解析索引表"可用片段"字段，返回子片段列表 [(start_sec, end_sec, desc), ...] 或 None。

    支持格式：
    - 多子片段：00:00-00:08(后台打开) | 00:08-00:25(脚本生成动画) | 00:25-00:40(效果展示)
    - 单黄金片段（旧格式兼容）：00:30-01:15(面料对比演示)
    - 整段可用 / 整张可用 → None
    """
    if not usable_str or usable_str in ("整段可用", "整张可用"):
        return None

    sub_clips = []
    parts = usable_str.split("|")
    for part in parts:
        part = part.strip()
        # 匹配 起止时间(描述)
        m = re.match(r"(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*\((.+)\)", part)
        if m:
            start = parse_duration_to_sec(m.group(1))
            end = parse_duration_to_sec(m.group(2))
            desc = m.group(3).strip()
            sub_clips.append((start, end, desc))
        else:
            # 匹配 起止时间（无描述）
            m2 = re.match(r"(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)", part)
            if m2:
                start = parse_duration_to_sec(m2.group(1))
                end = parse_duration_to_sec(m2.group(2))
                sub_clips.append((start, end, ""))

    return sub_clips if sub_clips else None


def match_best_sub_clip(subtitle, sub_clips, used_end_map, m_id):
    """按句子内容匹配最合适的子片段，返回 (start_sec, end_sec) 或 None。

    used_end_map: {m_id: last_used_end_sec}，用于顺延——同一素材被相邻句子选中时，
    第二句从第一句截取点之后开始，避免画面重复。
    """
    if not sub_clips:
        return None

    last_used_end = used_end_map.get(m_id, -1)

    best = None
    best_score = -1
    for sc_start, sc_end, sc_desc in sub_clips:
        # 顺延：子片段起始点 < 上次用到的结束点 → 降分（避免画面重复）
        if sc_start < last_used_end:
            score = -10
        else:
            score = 0

        # 子片段描述与句子的关键词匹配
        if sc_desc:
            for i in range(len(sc_desc)):
                for j in range(i + 2, min(i + 5, len(sc_desc) + 1)):
                    kw = sc_desc[i:j]
                    if kw in subtitle:
                        score += 1

        if score > best_score:
            best = (sc_start, sc_end)
            best_score = score

    # 所有子片段匹配分都<=0（没匹配上且都被用过）→ 取第一个未用过的
    if best_score <= 0:
        for sc_start, sc_end, sc_desc in sub_clips:
            if sc_start >= last_used_end:
                return (sc_start, sc_end)
        # 全都用过了，退回最后一个
        if sub_clips:
            return (sub_clips[-1][0], sub_clips[-1][1])

    return best


# ============================================================
# 4. 文案性质三分类（内容驱动）
# ============================================================

def classify_scene_nature(subtitle_text, segment_name=""):
    """判断这段文案的性质：ip_direct / visual_aid / narrative。"""
    text = subtitle_text or ""

    if SEGMENT_NAME_BOOST.get(segment_name) == "ip_direct":
        return "ip_direct"

    ip_hits = sum(1 for kw in IP_DIRECT_KEYWORDS if kw in text)
    aid_hits = sum(1 for kw in VISUAL_AID_KEYWORDS if kw in text)

    if ip_hits > 0 and ip_hits >= aid_hits:
        return "ip_direct"
    if aid_hits > 0 and aid_hits > ip_hits:
        return "visual_aid"
    return "narrative"


NATURE_REASON = {
    "ip_direct": "IP直视镜头段，保留口播画面",
    "narrative": "口播叙事段，保留口播画面",
    "no_match": "无可用素材（时长/内容不达标），保留原视频",
    "low_score": "素材匹配分低，保留原视频（不硬凑）",
}


# ============================================================
# 5. 素材匹配（多素材拼接）
# ============================================================

def load_index(library_dir):
    """加载素材库索引表 CSV，返回素材列表。"""
    csv_path = os.path.join(library_dir, "_索引表.csv")
    if not os.path.exists(csv_path):
        print(f"[ERROR] 素材库索引表不存在：{csv_path}", file=sys.stderr)
        sys.exit(1)

    materials = []
    with open(csv_path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("状态", "active") != "active":
                continue
            if row.get("可用性", "强") == "弱":
                continue
            materials.append(row)
    log(f"加载索引表：{len(materials)} 个有效素材")
    return materials


def collect_candidates(scene, materials, library_dir, duration_tool):
    """收集候选素材（文件验证+实测时长+评分），返回 [(score, m, fullpath, real_dur), ...]。"""
    seg_name = scene.get("segment_name", "")
    subtitle = scene.get("subtitle_text", "")
    candidate_cats = SEGMENT_CATEGORY_MAP.get(seg_name, ["产品服务", "场景环境", "客户相关"])

    candidates = []
    for m in materials:
        cat = m.get("一级分类", "")
        if cat not in candidate_cats:
            continue
        mtype = m.get("素材类型", "")
        if mtype != "视频":
            continue

        # 文件存在性验证
        rel_path = m.get("文件路径", "")
        fullpath = os.path.join(library_dir, rel_path)
        if not os.path.exists(fullpath):
            log(f"  ⚠ 素材 {m.get('编号','')} 文件不存在：{fullpath}，跳过")
            continue

        # 实测时长
        real_dur = None
        if duration_tool:
            real_dur = get_video_duration(fullpath, duration_tool)
        if real_dur is None:
            real_dur = float(parse_duration_to_sec(m.get("时长", "0")))
        if real_dur <= 0:
            continue

        # 内容相关性评分
        desc = m.get("内容描述", "")
        score = 0
        for kw, related in KEYWORD_WEIGHTS.items():
            if kw in subtitle:
                for r in related:
                    if r in desc:
                        score += 3
                        break
        strength = m.get("证据强度", "中")
        if strength == "强":
            score += 2
        elif strength == "中":
            score += 1

        candidates.append((score, m, fullpath, real_dur))

    return candidates


def match_visual_aid_scene(scene, materials, library_dir, duration_tool, mode="A", used_end_map=None):
    """给 visual_aid 型段匹配素材（多素材拼接）。

    返回 dict：
      - clips: 素材片段列表（可能为空）
      - covered_sec: 已铺秒数
      - remaining_sec: 未铺秒数
      - tail_original: 模式A尾部露原视频（remaining > TAIL_THRESHOLD）
      - gap: 模式C尾部缺口（remaining > TAIL_THRESHOLD）
      - gap_duration_sec: 缺口秒数
    或 None（无候选/候选都不达标 → 保留原视频或标缺口）
    """
    seg_name = scene.get("segment_name", "")
    subtitle = scene.get("subtitle_text", "")
    scene_start = scene.get("start_sec", 0)
    scene_end = scene.get("end_sec", 0)
    scene_dur = scene_end - scene_start

    if scene_dur <= 0:
        return None

    # 1. 收集候选
    candidates = collect_candidates(scene, materials, library_dir, duration_tool)
    if not candidates:
        return None

    # 2. 按分数降序排序
    candidates.sort(key=lambda x: -x[0])

    # 3. 拼接：从高分开始累加时长铺满段落
    remaining = scene_dur
    clips = []
    used_ids = set()
    if used_end_map is None:
        used_end_map = {}

    for score, m, fullpath, real_dur in candidates:
        if remaining <= TAIL_THRESHOLD:
            break
        # 不硬凑：分数低于阈值的素材不用
        if score < SCORE_THRESHOLD:
            continue

        m_id = m.get("编号", "")
        if m_id in used_ids:
            continue

        # 解析子片段标注
        sub_clips = parse_sub_clips(m.get("可用片段", ""))
        if sub_clips:
            # 有子片段标注：按句子匹配最合适的子片段（含顺延）
            best_sub = match_best_sub_clip(subtitle, sub_clips, used_end_map, m_id)
            if best_sub:
                mat_start = best_sub[0]
                mat_end = best_sub[1]
                mat_avail = mat_end - mat_start
            else:
                mat_start = 0
                mat_end = real_dur
                mat_avail = real_dur
        else:
            # 无子片段标注：退回从头截
            mat_start = 0
            mat_end = real_dur
            mat_avail = real_dur

        if mat_avail <= 0:
            continue

        # 这段铺多少：素材够长截取到剩余空间，不够用满素材
        if mat_avail >= remaining:
            seg_dur = remaining
            mat_clip_end = mat_start + seg_dur
        else:
            seg_dur = mat_avail
            mat_clip_end = mat_end

        offset = scene_dur - remaining  # 段落内偏移

        clips.append({
            "material_id": m_id,
            "material_name": m.get("文件名", ""),
            "material_path": m.get("文件路径", ""),
            "material_fullpath": fullpath,
            "material_type": m.get("素材类型", ""),
            "clip_start_sec": round(mat_start, 2),
            "clip_end_sec": round(mat_clip_end, 2),
            "target_offset_sec": round(offset, 2),
            "seg_duration_sec": round(seg_dur, 2),
            "real_duration_sec": round(real_dur, 2),
            "sub_clips": m.get("可用片段", ""),
            "score": score,
        })
        used_ids.add(m_id)
        used_end_map[m_id] = mat_clip_end  # 记录已用截取点（顺延用）
        remaining -= seg_dur

    if not clips:
        return None  # 有候选但分数都不达标

    covered = scene_dur - remaining
    tail_original = mode == "A" and remaining > TAIL_THRESHOLD
    gap = mode == "C" and remaining > TAIL_THRESHOLD

    return {
        "clips": clips,
        "covered_sec": round(covered, 2),
        "remaining_sec": round(remaining, 2),
        "tail_original": tail_original,
        "gap": gap,
        "gap_duration_sec": round(remaining, 2) if gap else 0,
    }


def make_original_entry(scene, nature, reason_key):
    """生成"保留原视频"的决策条目。"""
    return {
        "scene_id": scene.get("scene_id", ""),
        "segment_name": scene.get("segment_name", ""),
        "use_original": True,
        "nature": nature,
        "clips": [],
        "reason": NATURE_REASON.get(reason_key, "保留原视频"),
    }


def fallback_scene(scene, generic_pool, library_dir, duration_tool, used_end_map, mode="C"):
    """模式C/B兜底：精准匹配不到的段，从通用素材池填充（人物口播/场景空镜）。

    选择规则：
      1. 按文案性质选分类偏好：
         - 模式A/B（口播视频）：ip_direct性质（钩子/CTA收口）→ 人物形象类（口播画面）优先
         - 模式C（展示类视频）：不优先口播画面，ip_direct性质→场景环境类优先（展示类钩子/CTA多是产品/场景不是人对镜头）
      2. 从偏好分类里选：文件存在 + 实测时长 ≥ 段落时长×70%
      3. clip 截取点顺延（同素材被相邻段用过则接着用，用完回头截）
      4. 输出带 fallback: true 标记（提示用户可人工替换为更贴切素材）
    """
    seg_name = scene.get("segment_name", "")
    subtitle = scene.get("subtitle_text", "")
    scene_dur = scene.get("end_sec", 0) - scene.get("start_sec", 0)
    if scene_dur <= 0 or not generic_pool:
        return None

    # 文案性质 → 分类偏好
    # 模式A/B（口播视频）：ip_direct→人物形象优先（钩子/CTA是老板对镜头说话）
    # 模式C（展示类视频）：统一场景环境优先（展示类钩子/CTA多是产品/场景，不是人对镜头）
    nature = classify_scene_nature(subtitle, seg_name)
    if mode == "C":
        prefer_dir = "02_场景环境"
    else:
        prefer_dir = "01_人物形象" if nature == "ip_direct" else "02_场景环境"
    ordered = ([m for m in generic_pool if prefer_dir in m.get("文件路径", "")]
               + [m for m in generic_pool if prefer_dir not in m.get("文件路径", "")])

    for m in ordered:
        fullpath = os.path.join(library_dir, m.get("文件路径", ""))
        if not os.path.exists(fullpath):
            continue
        m_id = m.get("编号", "")
        real_dur = get_video_duration(fullpath, duration_tool)
        if real_dur is None:
            try:
                real_dur = float(parse_duration_to_sec(m.get("时长", "0")))
            except (ValueError, TypeError):
                continue
        if real_dur < scene_dur * 0.7:
            continue

        # 截取点顺延：同素材被相邻段用过则接着用；剩余不够整段则回头截
        last_end = used_end_map.get(m_id, -1)
        mat_start = last_end if 0 <= last_end < real_dur - 0.5 else 0
        if real_dur - mat_start < scene_dur:
            mat_start = 0
        seg_dur = min(scene_dur, real_dur - mat_start)
        mat_clip_end = mat_start + seg_dur

        clip = {
            "material_id": m_id,
            "material_name": m.get("文件名", ""),
            "material_path": m.get("文件路径", ""),
            "material_fullpath": fullpath,
            "material_type": m.get("素材类型", "视频"),
            "clip_start_sec": round(mat_start, 2),
            "clip_end_sec": round(mat_clip_end, 2),
            "target_offset_sec": 0,
            "seg_duration_sec": round(seg_dur, 2),
            "real_duration_sec": round(real_dur, 2),
            "sub_clips": m.get("可用片段", ""),
            "score": 1,
            "fallback": True,
        }
        used_end_map[m_id] = mat_clip_end
        return {
            "clips": [clip],
            "covered_sec": round(seg_dur, 2),
            "remaining_sec": round(scene_dur - seg_dur, 2),
            "gap": seg_dur < scene_dur - TAIL_THRESHOLD,
            "gap_duration_sec": round(scene_dur - seg_dur, 2),
            "nature": nature,
            "fallback": True,
        }
    return None


def make_gap_entry(scene, reason):
    """生成"缺口"的决策条目（模式C无原视频兜底）。"""
    return {
        "scene_id": scene.get("scene_id", ""),
        "segment_name": scene.get("segment_name", ""),
        "use_original": False,
        "nature": "gap",
        "clips": [],
        "reason": reason,
    }


# ============================================================
# 6. 主流程
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="素材决策引擎（多素材拼接，模式A选择性/模式C全覆盖）")
    parser.add_argument("--script", required=True, help="script.json 路径")
    parser.add_argument("--library", required=True, help="素材库目录路径（含 _索引表.csv）")
    parser.add_argument("--output", required=True, help="输出 assets.json 路径")
    parser.add_argument("--mode", default="A", choices=["A", "C"], help="A=选择性插入（有原视频基底），C=全覆盖（纯素材整合，无原视频）")
    args = parser.parse_args()

    if not os.path.exists(args.script):
        print(f"[ERROR] script.json 不存在：{args.script}", file=sys.stderr)
        sys.exit(1)
    if not os.path.isdir(args.library):
        print(f"[ERROR] 素材库目录不存在：{args.library}", file=sys.stderr)
        sys.exit(1)

    log("=" * 60)
    if args.mode == "A":
        log("模式A素材决策引擎（选择性插入，多素材拼接，尾部不够露原视频）")
    else:
        log("模式C素材决策引擎（全覆盖，多素材拼接，不够标缺口）")
    log("=" * 60)

    # 检测时长工具
    duration_tool = _find_ffmpeg()
    if duration_tool == "ffprobe":
        log("ffprobe 可用 → 实测素材时长")
    elif duration_tool:
        log(f"ffmpeg 可用（无 ffprobe）→ 用 ffmpeg 解析 Duration 读时长")
    else:
        log("⚠ ffprobe/ffmpeg 都不可用 → 降级用索引表时长值（精度降级）")

    # 1. 读 script.json
    script = json.load(open(args.script, encoding="utf-8"))
    scenes = script.get("scenes", [])
    log(f"script.json: {len(scenes)} 段 scene")

    # 2. 加载索引表
    materials = load_index(args.library)

    # 2.5 收集通用素材池（索引表"通用素材"=是 且 视频）——模式C兜底用
    generic_pool = [m for m in materials if m.get("通用素材", "").strip() == "是" and m.get("素材类型", "") == "视频"]
    if args.mode == "C":
        log(f"通用素材池: {len(generic_pool)} 个（缺口段兜底用）")

    # 3. 逐段决策
    b_rolls = []
    ip_direct_n = 0
    narrative_n = 0
    visual_aid_n = 0
    matched_n = 0
    original_n = 0
    gap_n = 0
    total_clips = 0
    used_end_map = {}  # 素材顺延映射：{m_id: last_used_end_sec}，同素材被相邻句选中时截取点顺延

    for scene in scenes:
        seg_name = scene.get("segment_name", "")
        subtitle = scene.get("subtitle_text", "")
        scene_dur = scene.get("end_sec", 0) - scene.get("start_sec", 0)

        # 模式C：全覆盖，每段都配素材，不判断文案性质
        if args.mode == "C":
            visual_aid_n += 1
            result = match_visual_aid_scene(scene, materials, args.library, duration_tool, mode="C", used_end_map=used_end_map)
            if result and result.get("clips"):
                clips = result["clips"]
                total_clips += len(clips)
                entry = {
                    "scene_id": scene.get("scene_id", ""),
                    "segment_name": seg_name,
                    "use_original": False,
                    "nature": "visual_aid",
                    "clips": clips,
                    "covered_sec": result["covered_sec"],
                    "remaining_sec": result["remaining_sec"],
                    "reason": f"匹配{len(clips)}个素材，覆盖{result['covered_sec']}/{scene_dur:.1f}s",
                }
                if result.get("gap"):
                    entry["gap"] = True
                    entry["gap_duration_sec"] = result["gap_duration_sec"]
                    entry["reason"] += f"，尾部缺口{result['gap_duration_sec']}s"
                    gap_n += 1
                b_rolls.append(entry)
                matched_n += 1
                mats = " + ".join(f"{c['material_id']}({c['seg_duration_sec']}s)" for c in clips)
                log(f"  {seg_name:<8} → {len(clips)}个素材: {mats}")
            else:
                # 模式C兜底：精准匹配不到 → 从通用素材池填充（场景空镜优先，展示类不用口播画面）
                fb = fallback_scene(scene, generic_pool, args.library, duration_tool, used_end_map, mode=args.mode)
                if fb:
                    clips = fb["clips"]
                    total_clips += len(clips)
                    matched_n += 1
                    c = clips[0]
                    entry = {
                        "scene_id": scene.get("scene_id", ""),
                        "segment_name": seg_name,
                        "use_original": False,
                        "nature": "fallback",
                        "clips": clips,
                        "covered_sec": fb["covered_sec"],
                        "remaining_sec": fb["remaining_sec"],
                        "reason": f"通用兜底素材 {c['material_id']}（精准匹配不到，建议人工替换为更贴切素材）",
                    }
                    if fb.get("gap"):
                        entry["gap"] = True
                        entry["gap_duration_sec"] = fb["gap_duration_sec"]
                        entry["reason"] += f"，尾部缺口{fb['gap_duration_sec']}s"
                    b_rolls.append(entry)
                    log(f"  {seg_name:<8} → 🔧 通用兜底: {c['material_id']}({c['seg_duration_sec']}s) [{fb['nature']}]")
                else:
                    gap_n += 1
                    b_rolls.append(make_gap_entry(scene, "模式C缺口：精准匹配和通用兜底都无可用素材，需补拍"))
                    log(f"  {seg_name:<8} → ❌ 缺口（兜底也无可用素材）")
            continue

        # 模式A第1层：文案性质三分类
        nature = classify_scene_nature(subtitle, seg_name)

        if nature == "ip_direct":
            ip_direct_n += 1
            b_rolls.append(make_original_entry(scene, "ip_direct", "ip_direct"))
            original_n += 1
            log(f"  {seg_name:<8} → 保留原视频 [ip_direct]")
            continue

        if nature == "narrative":
            narrative_n += 1
            b_rolls.append(make_original_entry(scene, "narrative", "narrative"))
            original_n += 1
            log(f"  {seg_name:<8} → 保留原视频 [narrative]")
            continue

        # nature == "visual_aid" → 多素材拼接
        visual_aid_n += 1
        result = match_visual_aid_scene(scene, materials, args.library, duration_tool, mode="A", used_end_map=used_end_map)
        if result and result.get("clips"):
            clips = result["clips"]
            total_clips += len(clips)
            entry = {
                "scene_id": scene.get("scene_id", ""),
                "segment_name": seg_name,
                "use_original": False,
                "nature": "visual_aid",
                "clips": clips,
                "covered_sec": result["covered_sec"],
                "remaining_sec": result["remaining_sec"],
                "reason": f"匹配{len(clips)}个素材，覆盖{result['covered_sec']}/{scene_dur:.1f}s",
            }
            if result.get("tail_original"):
                entry["tail_original"] = True
                entry["reason"] += f"，尾部{result['remaining_sec']}s露原视频"
            b_rolls.append(entry)
            matched_n += 1
            mats = " + ".join(f"{c['material_id']}({c['seg_duration_sec']}s)" for c in clips)
            log(f"  {seg_name:<8} → {len(clips)}个素材: {mats}" + (f" +尾部露原视频{result['remaining_sec']}s" if result.get('tail_original') else ""))
        else:
            gap_n += 1
            original_n += 1
            b_rolls.append(make_original_entry(scene, "visual_aid", "no_match"))
            log(f"  {seg_name:<8} → 保留原视频 [无达标素材]")

    log(f"\n{'=' * 60}")
    log(f"模式{args.mode}决策结果：")
    if args.mode == "A":
        log(f"  文案性质分布：ip_direct={ip_direct_n} / visual_aid={visual_aid_n} / narrative={narrative_n}")
        log(f"  素材插入：{matched_n} 段（共 {total_clips} 个素材片段）")
        log(f"  保留原视频：{original_n} 段（含 {gap_n} 段无达标素材）")
    else:
        log(f"  素材插入：{matched_n} 段（共 {total_clips} 个素材片段）/ 缺口：{gap_n} 段")
    log(f"{'=' * 60}")

    # 4. 输出 assets.json
    assets = {
        "script_id": script.get("script_id", ""),
        "material_library": args.library,
        "mode": args.mode,
        "total_scenes": len(scenes),
        "matched": matched_n,
        "total_clips": total_clips,
        "original_kept": original_n,
        "gaps": gap_n,
        "nature_stats": {
            "ip_direct": ip_direct_n,
            "visual_aid": visual_aid_n,
            "narrative": narrative_n,
        },
        "duration_tool": duration_tool or "none",
        "b_rolls": b_rolls,
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(assets, f, ensure_ascii=False, indent=2)

    log(f"输出 assets.json → {args.output}")
    print(f"\n{'=' * 60}")
    print(f"模式{args.mode}素材决策完成：{args.output}")
    if args.mode == "A":
        print(f"  插入素材 {matched_n} 段（{total_clips} 个素材片段）/ 保留原视频 {original_n} 段")
    else:
        print(f"  插入素材 {matched_n} 段（{total_clips} 个素材片段）/ 缺口 {gap_n} 段")
    print(f"{'=' * 60}")
    print(f"下一步：python3 fill_draft.py ... --assets {args.output} --mode {args.mode}")
    if args.mode == "A":
        print(f"  （fill_draft 读到 use_original=true 的段不插 B-roll；clips 数组按时间偏移连续拼接）")
    else:
        print(f"  （模式C：素材做主轨，多素材拼接，clips 按时间偏移连续）")


if __name__ == "__main__":
    main()
