#!/usr/bin/env python3
"""
fill_draft.py — A 模式通用填槽（固化版）

把数字人视频 + 口播字幕 + BGM + 封面填进剪映模板的 draft_content.json，
输出本地可编辑的剪映工程目录。固化自 fill_draft_a_mode_v2.py（v7 跑通版），
含全部 7 轮调试修复经验。

用法：
  python3 fill_draft.py \
    --template <模板草稿目录> \
    --script <script.json路径> \
    --video <数字人视频.mp4> \
    --output <输出草稿目录> \
    [--voice <口播音频.m4a>]      # 不传则自动从视频抽取
    [--cover <封面图.jpg/png>]    # 不传则保留模板原封面
    [--bgm-volume 0.3]             # BGM 音量，默认 0.3（旁白视频背景用，不盖人声）
    [--narration-volume 2.0]       # 旁白音轨增益，默认 2.0（模式B，压过 BGM；剪映里仍可手动微调）
    [--no-voice-track]            # 跳过口播独立音轨（主轨音频未剥离时用）

关键修复经验（已固化）：
  1. 占位符 path 格式必须 ##_draftpath_placeholder_<ID>_##/<dir>/<file>（单下划线+正斜杠）
  2. 主轨 volume=0.0 → 1.0；speed=0.8 → 1.0；extra_material_refs 引用的 speeds material 同步改 1.0
  3. BGM 短于视频时用多 segment 拼接循环（每段 speed=1.0），不用变速铺满
  4. 主轨音频被"音频分离"剥离时，口播必须走独立 audio track（extract material + 关联 video_id）
  5. 所有 material path 反斜杠→正斜杠（Windows 模板兼容）
  6. 删复制来的 draft_meta_info.json，让 fix_draft_for_local 从头生成明文版
  7. draft_content.json 填完后 cp 为 draft_info.json（Mac 版剪映 10.x 只认 draft_info.json 打开）
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import uuid


# ============================================================
# 工具函数
# ============================================================

# 关键词词库(按优先级排序, 命中即用): 营销获客 + 养生两类
# 用 --keyword-mode off 可关闭行内高亮; 词库可由调用方扩展(后续可做成外部 csv)
KEYWORD_LEXICON = [
    "超会AI", "数字人", "评论区扣「超会」", "一键发", "矩阵号", "多语种", "出海",
    "日更", "出脚本", "口播", "一万一个月", "头疼", "撑不到", "放弃", "评论区",
    "喝茶", "散步", "煲汤", "糖水", "睡眠", "控糖", "防晒", "保湿",
]
MAX_KEYWORDS = 6  # 行内高亮关键词上限

# 对齐时两侧都剔除的标点/空白(ASR 识别文本和原文标点常有差异, 只按实义字对齐)
_STRIP_CHARS = set("，。！？、；：「」『』（）()【】[]{}《》<>…—·,.!?;: \n\r\t\"'“”‘’")

TITLE_SIZE = 15  # 标题字号(模板素材原始 size=10, 标题 scale 归一为 1.0 后用字号放大)
CANVAS_W, CANVAS_H = 1080, 1920  # 9:16 竖屏画布(B-roll scale 适配用)

# whisper ASR 助手脚本 + venv python(本机已装 openai-whisper + 全系模型缓存)
_ASR_PYTHON_DEFAULT = "/Users/archerjim/.workbuddy/binaries/python/envs/default/bin/python"
_ASR_HELPER_DEFAULT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "whisper_asr.py")
_FFMPEG_DEFAULT = "/Users/archerjim/.local/bin/ffmpeg"


def log(msg):
    print(f"[fill] {msg}")

def err(msg, code=1):
    print(f"[ERROR] {msg}", file=sys.stderr)
    sys.exit(code)


def tr(start, duration):
    """时间段: 新版剪映 10.x 用 start, 旧版用 offset — 两个都写, 值一致。
    不写 start 会被剪映丢弃 offset 导致素材堆到第0秒(实测坑)。"""
    return {"duration": int(duration), "start": int(start), "offset": int(start)}


def new_id():
    return str(uuid.uuid4()).upper()


# ---- 关键词识别 + 行内高亮 ----

def find_keyword_ranges(line, max_hits=3):
    """找出行内所有关键词的字符区间 [(start, end), ...] (行内变色用, 不重叠)。"""
    ranges = []
    taken = []
    for kw in KEYWORD_LEXICON:
        idx = line.find(kw)
        while idx >= 0:
            s, e = idx, idx + len(kw)
            if not any(not (e <= ts or s >= te) for ts, te in taken):
                ranges.append((s, e))
                taken.append((s, e))
                if len(ranges) >= max_hits:
                    return sorted(ranges)
            idx = line.find(kw, idx + 1)
    return sorted(ranges)


def _clean_font(style):
    """字体路径若本机不存在(如 Windows 路径), 清空让剪映用默认字体。"""
    f = style.get("font")
    if isinstance(f, dict):
        fp = f.get("path", "")
        if fp and not os.path.isfile(fp):
            f["path"] = ""
            f["id"] = ""


# ---- 字幕切分(细切, 短句合并避免碎行) ----

def split_subtitles(text):
    """把口播文案切成字幕行。先按句末标点断句(保留标点), 过长再按逗号切。
    过短片段(<6字, 如"第一，")与相邻片段合并, 避免碎行。
    返回 [行1, 行2, ...]"""
    parts = re.split(r'(?<=[。！？])', text)
    lines = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if len(p.rstrip('。！？，、：；')) > 16 and '，' in p:
            sub = re.split(r'(?<=[，])', p)
            buf = ""
            for s in sub:
                s = s.strip()
                if not s:
                    continue
                buf += s
                if len(buf.rstrip('，、')) >= 6:
                    lines.append(buf)
                    buf = ""
            if buf:
                if lines and len(buf.rstrip('，、')) < 4:
                    lines[-1] += buf
                else:
                    lines.append(buf)
        else:
            lines.append(p)
    merged = []
    for ln in lines:
        if ln.startswith("而是") and merged:
            merged[-1] += ln
        else:
            merged.append(ln)
    return merged


# ---- ASR 字幕对齐(whisper + 停顿DP + 字数均分 三级兜底) ----

def probe_duration_us(path, ffmpeg=_FFMPEG_DEFAULT):
    """用 ffmpeg 探测音视频时长(微秒), 失败返回 0。"""
    import subprocess
    try:
        out = subprocess.run([ffmpeg, "-hide_banner", "-i", path],
                             stderr=subprocess.PIPE, text=True).stderr
        m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", out)
        if m:
            h, mi, s = m.groups()
            return int((int(h) * 3600 + int(mi) * 60 + float(s)) * 1_000_000)
    except Exception:
        pass
    return 0


def probe_video_hw(path, ffmpeg=_FFMPEG_DEFAULT):
    """探测视频宽高, 返回 (w, h), 失败返回 (1920, 1080) 默认横屏。"""
    import subprocess
    try:
        out = subprocess.run([ffmpeg, "-hide_banner", "-i", path],
                             stderr=subprocess.PIPE, text=True).stderr
        m = re.search(r"(\d+)x(\d+)[,\s]", out)
        if m:
            return int(m.group(1)), int(m.group(2))
    except Exception:
        pass
    return 1920, 1080


def broll_scale_for_fit(w, h, canvas_w=CANVAS_W, canvas_h=CANVAS_H):
    """横屏素材塞竖屏画布: 高度填满画布, 左右裁掉(短视频审美)。
    返回 (scale_x, scale_y) — 剪映 scale 是相对素材原始尺寸的倍数。"""
    if h <= 0 or w <= 0:
        return 1.0, 1.0
    k = canvas_h / h
    return k, k


def char_proportional(lines, start_us, dur_us):
    """按字数比例切分 [start_us, dur_us]。字幕对齐三级兜底之末。"""
    chars = [max(1, len(ln)) for ln in lines]
    total = sum(chars)
    out, cur = [], start_us
    for c in chars:
        d = int(dur_us * c / total)
        out.append((cur, d))
        cur += d
    return out


def detect_line_timings(video_path, lines, ffmpeg=_FFMPEG_DEFAULT):
    """字幕对齐二级兜底: ffmpeg silencedetect 找语音停顿 -> DP 选 N-1 边界最小化语速方差。
    失败退化为按字数比例均分。返回 ([(start_us, dur_us), ...], method_str)"""
    import subprocess
    dur_us = probe_duration_us(video_path, ffmpeg)
    if not dur_us:
        return char_proportional(lines, 0, 0), "even(时长未知)"
    try:
        out = subprocess.run(
            [ffmpeg, "-hide_banner", "-i", video_path,
             "-af", "silencedetect=noise=-35dB:d=0.25", "-f", "null", "-"],
            stderr=subprocess.PIPE, text=True, timeout=120).stderr
    except Exception:
        out = ""
    ss = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", out)]
    se = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", out)]
    dur_s = dur_us / 1e6
    pauses = sorted((s + e) / 2 for s, e in zip(ss, se) if 0.3 < s < dur_s - 0.3)
    n = len(lines)
    if len(pauses) < n - 1:
        return char_proportional(lines, 0, dur_us), f"char-proportional(停顿{len(pauses)}<{n-1})"

    silence_total = sum(e - s for s, e in zip(ss, se))
    chars = [max(1, len(ln.rstrip('，。！？、；：'))) for ln in lines]
    total_chars = sum(chars)
    speech_s = max(1.0, dur_s - silence_total)
    rate0 = total_chars / speech_s

    INF = float("inf")
    def cost(i, t0, t1):
        d = t1 - t0
        if d < 0.4:
            return INF
        r = chars[i] / d
        return (r - rate0) ** 2 * chars[i]

    m = len(pauses)
    f = [[INF] * m for _ in range(n)]
    bk = [[-1] * m for _ in range(n)]
    for j in range(m):
        f[0][j] = cost(0, 0.0, pauses[j])
    for i in range(1, n):
        for j in range(m):
            best, bestj = INF, -1
            for jp in range(j):
                if f[i - 1][jp] < best:
                    c = cost(i, pauses[jp], pauses[j])
                    if f[i - 1][jp] + c < best:
                        best, bestj = f[i - 1][jp] + c, jp
            f[i][j] = best
            bk[i][j] = bestj
    j = min(range(m), key=lambda x: f[n - 1][x])
    if f[n - 1][j] == INF:
        return char_proportional(lines, 0, dur_us), "char-proportional(DP无解)"
    bounds = [0.0] * (n + 1)
    bounds[n] = dur_s
    for i in range(n - 1, -1, -1):
        bounds[i] = pauses[j] if i > 0 else 0.0
        if i > 0:
            j = bk[i][j]
    intervals = [(int(bounds[i] * 1e6), int((bounds[i + 1] - bounds[i]) * 1e6))
                 for i in range(n)]
    return intervals, f"silence-DP({len(pauses)}个停顿选{n-1})"


def asr_line_timings(video_path, lines, asr_python=_ASR_PYTHON_DEFAULT,
                     asr_model="small", asr_helper=_ASR_HELPER_DEFAULT,
                     ffmpeg=_FFMPEG_DEFAULT):
    """字幕对齐主策略: whisper 逐词时间戳 + SequenceMatcher 实义字对齐。
    每行首字时刻即该行起点; 行终点=下一行起点(字幕驻留到切换), 末行到片尾。
    对齐质量差(识别匹配率<40%)或 ASR 失败时返回 None, 由调用方走停顿探测兜底。"""
    import subprocess
    from difflib import SequenceMatcher
    if not (asr_python and os.path.isfile(asr_python) and asr_helper and os.path.isfile(asr_helper)):
        return None
    try:
        p = subprocess.run([asr_python, asr_helper, video_path, asr_model],
                           stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                           text=True, timeout=600)
        segs = json.loads(p.stdout)
    except Exception as e:
        log(f"ASR 失败({e}), 走停顿探测兜底")
        return None
    if not segs:
        return None

    stream = []
    for seg in segs:
        for w in seg.get("words", []):
            t = (w.get("w") or "").strip()
            if not t:
                continue
            ws, we = w.get("s", 0), w.get("e", 0)
            cs = list(t)
            span = (we - ws) / max(1, len(cs))
            for k, ch in enumerate(cs):
                if ch not in _STRIP_CHARS:
                    stream.append((ch, ws + k * span, ws + (k + 1) * span))

    script, line_of = [], []
    for li, ln in enumerate(lines):
        for ch in ln:
            if ch not in _STRIP_CHARS:
                script.append(ch)
                line_of.append(li)
    if not script or not stream:
        return None

    sm = SequenceMatcher(None, "".join(script), "".join(c for c, _, _ in stream),
                         autojunk=False)
    tstart = [None] * len(script)
    tend = [None] * len(script)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                _, s, e = stream[j1 + k]
                tstart[i1 + k] = s
                tend[i1 + k] = e
    matched = sum(1 for t in tstart if t is not None)
    if matched < max(4, 0.4 * len(script)):
        log(f"ASR 对齐率过低({matched}/{len(script)}), 走停顿探测兜底")
        return None

    known = [i for i in range(len(script)) if tstart[i] is not None]
    for i in range(len(script)):
        if tstart[i] is not None:
            continue
        prev_k = next((k for k in reversed(known) if k < i), None)
        next_k = next((k for k in known if k > i), None)
        if prev_k is None:
            tstart[i], tend[i] = tstart[next_k], tend[next_k]
        elif next_k is None:
            tstart[i], tend[i] = tend[prev_k], tend[prev_k]
        else:
            frac = (i - prev_k) / (next_k - prev_k)
            tstart[i] = tstart[prev_k] + (tstart[next_k] - tstart[prev_k]) * frac
            tend[i] = tend[prev_k] + (tend[next_k] - tend[prev_k]) * frac

    bounds = []
    first = 0
    for li in range(len(lines)):
        cnt = sum(1 for x in line_of if x == li)
        if cnt == 0:
            bounds.append(None)
            continue
        last = first + cnt - 1
        bounds.append((tstart[first], tend[last]))
        first = last + 1

    dur_us = probe_duration_us(video_path, ffmpeg)
    dur_s = dur_us / 1e6 if dur_us else (stream[-1][2] + 1.0)
    starts = [b[0] for b in bounds if b]
    intervals = []
    for li in range(len(lines)):
        b = bounds[li]
        if not b:
            intervals.append(None)
            continue
        st = b[0]
        nxt = next((bounds[j][0] for j in range(li + 1, len(lines))
                    if bounds[j]), dur_s)
        intervals.append((st, max(0.3, nxt - st)))
    prev_end = 0.0
    fixed = []
    for st, du in intervals:
        if st is None:
            st = prev_end
        st2 = max(st, prev_end)
        fixed.append((int(st2 * 1e6), int(max(0.3, du) * 1e6)))
        prev_end = st2 + max(0.3, du)
    log(f"ASR 对齐: 识别匹配 {matched}/{len(script)} 实义字")
    return fixed


# ---- 标题(置顶展示, 不拉伸, 长标题拆两行) ----

def title_two_lines(title):
    """把传入标题拆行: 超 8 字居中换行, 上限 14 字, 不拆断英文/数字词。"""
    raw = title.strip()[:14]
    if len(raw) > 8:
        mid = (len(raw) + 1) // 2
        while mid < len(raw) - 1 and re.match(r'[A-Za-z0-9]', raw[mid]) \
                and re.match(r'[A-Za-z0-9]', raw[mid - 1]):
            mid += 1
        raw = raw[:mid] + "\n" + raw[mid:]
    return raw


def generate_title(script_text):
    """兜底标题: 第一句的第一个逗号前内容。
    ⚠️ 标题应该是独立的「视频主题标题」(如"香港人老得慢""超会AI"),
    优先用 --title 显式传入; 本函数只在未传时兜底。"""
    first_sentence = re.split(r'[。！？\n]', script_text)[0].strip()
    first_clause = re.split(r'[，,、]', first_sentence)[0].strip()
    first_clause = re.sub(r'^[，,、]+', '', first_clause)
    if len(first_clause) >= 3:
        raw = first_clause[:14]
    elif len(first_sentence) >= 4:
        raw = first_sentence[:14]
    else:
        raw = script_text[:14]
    return title_two_lines(raw)


def _apply_title_size(tm, size=TITLE_SIZE):
    """把标题 material 的字号调大(所有 styles + base_content 同步)。"""
    for key in ("content", "base_content"):
        try:
            c = json.loads(tm.get(key, "{}"))
        except Exception:
            continue
        for st in c.get("styles", []):
            st["size"] = size


# ============================================================
# 原 fill_draft 工具函数(保留旧版兼容)
# ============================================================

def get_video_duration_us(video_path):
    """用 macOS 自带 afinfo 读视频音频流时长，返回微秒。afinfo 读不了时用 mdls 兜底。"""
    # 方法1: afinfo（macOS 自带，读音频流 duration）
    try:
        r = subprocess.run(["afinfo", video_path], capture_output=True, text=True, timeout=10)
        for line in r.stdout.split("\n"):
            if "duration" in line.lower() and "sec" in line.lower():
                # 匹配 "duration: 25.85 sec"
                m = re.search(r'duration:\s*([\d.]+)\s*sec', line, re.I)
                if m:
                    return int(float(m.group(1)) * 1000000)
    except Exception:
        pass

    # 方法2: mdls（macOS 元数据）
    try:
        r = subprocess.run(
            ["mdls", "-name", "kMDItemDurationSeconds", video_path],
            capture_output=True, text=True, timeout=10
        )
        m = re.search(r'kMDItemDurationSeconds\s*=\s*([\d.]+)', r.stdout)
        if m:
            return int(float(m.group(1)) * 1000000)
    except Exception:
        pass

    err(f"无法读取视频时长：{video_path}（afinfo 和 mdls 都失败）", 2)

def extract_audio_m4a(video_path, output_path):
    """用 macOS 自带 afconvert 从视频抽取音频为 m4a（AAC）。"""
    try:
        r = subprocess.run(
            ["afconvert", "-f", "m4af", "-d", "aac", video_path, output_path],
            capture_output=True, text=True, timeout=60
        )
        if r.returncode != 0:
            err(f"afconvert 抽取音频失败：{r.stderr}", 3)
        if not os.path.exists(output_path) or os.path.getsize(output_path) < 1000:
            err(f"抽取的音频文件异常：{output_path}", 3)
        log(f"口播音频自动抽取 → {output_path}")
        return output_path
    except FileNotFoundError:
        err("afconvert 未找到（仅 macOS 支持），请手动用 --voice 参数传入口播音频", 4)

def replace_text_content(old_content, new_text):
    """替换富文本 content 里的文字。支持 <size=8>文字</size> 和 <useLetterColor>[文字] 两种格式。"""
    if not old_content:
        return new_text
    # 格式1: <size=8>文字</size>
    if re.search(r'<size=[\d.]+>.*?</size>', old_content):
        return re.sub(r'(<size=[\d.]+>).*?(</size>)', rf'\1{new_text}\2', old_content, count=1)
    # 格式2: <useLetterColor>[文字]</useLetterColor>
    if re.search(r'<useLetterColor>.*?</useLetterColor>', old_content):
        return re.sub(r'(<useLetterColor>).*?(</useLetterColor>)', rf'\1{new_text}\2', old_content, count=1)
    # 兜底：纯文本
    return new_text

def clone_text_material(tpl_text, new_text, hl_ranges=None, hl_style=None):
    """以模板 text material 为基底克隆一个独立 material, 替换文案 + 同步 styles[].range。
    fill_draft 原逻辑所有字幕段共享一个 material_id → N 段显示同一段文字, 此函数修复该 bug。
    同步 styles[].range 是新版剪映 10.x 必需, 否则超出原 range 的字符无样式 → 竖排堆叠。
    hl_ranges: [(start, end), ...] 行内高亮区间 — 追加高亮样式(如黄色)只盖这些区间,
    实现「关键词换颜色」而不是单独叠一条花字(用户明确要求)。"""
    m = json.loads(json.dumps(tpl_text))  # 深拷贝
    try:
        c = json.loads(m.get("content", "{}")) if isinstance(m.get("content"), str) else (m.get("content") or {})
    except Exception:
        c = {"text": new_text, "styles": []}
    c["text"] = new_text
    styles = c.get("styles", [])
    if styles:
        first = styles[0]
        first["range"] = [0, len(new_text)]
        _clean_font(first)
        c["styles"] = [first]
        # 行内高亮: 在白色全行样式之上, 追加高亮样式只覆盖关键词区间
        if hl_ranges and hl_style is not None:
            for s, e in hl_ranges:
                hs = json.loads(json.dumps(hl_style))
                hs["range"] = [s, e]
                _clean_font(hs)
                c["styles"].append(hs)
    m["content"] = json.dumps(c, ensure_ascii=False)
    # words 字段也同步
    if "words" in m:
        m["words"] = [{"text": new_text, "range": [0, len(new_text)]}]
    # base_content 同步
    if "base_content" in m:
        try:
            bc = json.loads(m["base_content"]) if isinstance(m["base_content"], str) else (m["base_content"] or {})
            bc["text"] = new_text
            bstyles = bc.get("styles", [])
            if bstyles:
                bstyles[0]["range"] = [0, len(new_text)]
            m["base_content"] = json.dumps(bc, ensure_ascii=False)
        except Exception:
            pass
    m["id"] = new_id()
    m["type"] = "subtitle"
    return m

def classify_track(t):
    """识别 track 用途, 返回 ('main'|'subtitle'|'bgm'|'sfx'|'highlight'|'other')。
    优先看 _SLOT 标记(新版 default_v1 模板), 兜底看 type+attribute(旧版剪映 V1-V7)。"""
    slot = t.get("_SLOT")
    if slot == "SLOT_MAIN_VIDEO":
        return "main"
    if slot == "SLOT_SUBTITLES_NORMAL":
        return "subtitle"
    if slot == "SLOT_BGM":
        return "bgm"
    if slot == "SLOT_SFX":
        return "sfx"
    if slot == "SLOT_SUBTITLES_HIGHLIGHT":
        return "highlight"
    # 旧版兼容: type+attribute
    ttype = t.get("type")
    attr = t.get("attribute")
    if ttype == "video" and attr == 1:
        return "main"
    if ttype == "text":
        return "subtitle"
    if ttype == "audio" and attr == 1:
        return "bgm"
    if ttype == "audio":
        return "sfx"
    return "other"

def get_template_seg(track):
    """从 track 取模板 segment 的深拷贝: segments[0] 优先, 空时用 _template_seg 兜底。
    新版 default_v1 模板的轨道 segments 为空, 模板段存在 _template_seg 字段。"""
    segs = track.get("segments", [])
    if segs:
        return json.loads(json.dumps(segs[0]))
    ts = track.get("_template_seg")
    if ts:
        return json.loads(json.dumps(ts))
    return None

def get_placeholder_id(d):
    """从模板 draft_content.json 里读已有的占位符 id（path 里的 placeholder_xxx）。"""
    for cat_items in d.get("materials", {}).values():
        if not isinstance(cat_items, list):
            continue
        for item in cat_items:
            if isinstance(item, dict):
                path = item.get("path", "")
                m = re.search(r'placeholder[_]?([A-F0-9-]+)', path, re.I)
                if m:
                    return m.group(1).lstrip("_")
    # 兜底：生成一个
    return str(uuid.uuid4()).upper()

def get_video_subdir(d):
    """从模板现有 path 判断素材子目录名是 video/ 还是 videos/。"""
    for v in d.get("materials", {}).get("videos", []):
        path = v.get("path", "")
        if "/video/" in path:
            return "video"
        if "/videos/" in path:
            return "videos"
    return "video"  # 默认

def get_audio_subdir(d):
    """从模板现有 path 判断音频子目录名是 audio/ 还是 audios/。"""
    for a in d.get("materials", {}).get("audios", []):
        path = a.get("path", "")
        if "/audio/" in path:
            return "audio"
        if "/audios/" in path:
            return "audios"
    return "audio"


# ============================================================
# 兼容检查
# ============================================================

def check_template_compatibility(d):
    """fill 前检查模板结构是否兼容 A 模式。返回 (main_track_found, issues)。
    兼容: 旧版 type=video+attribute=1 / 新版 _SLOT=SLOT_MAIN_VIDEO(空 segments+有 _template_seg)。"""
    issues = []

    # 必需顶层字段
    required_top = ["canvas_config", "tracks", "materials", "duration"]
    for k in required_top:
        if k not in d:
            issues.append(f"缺顶层字段 {k}")

    # 必需 track: 用新分类函数识别
    tracks = d.get("tracks", [])
    has_main = False
    has_subtitle = False
    has_bgm = False
    for t in tracks:
        kind = classify_track(t)
        if kind == "main":
            has_main = True
            # 主轨可用性: 有 segments 或 有 _template_seg
            if not t.get("segments") and not t.get("_template_seg"):
                issues.append("主轨无可用模板 segment（segments 空 且 无 _template_seg）")
        elif kind == "subtitle":
            has_subtitle = True
            if not t.get("segments") and not t.get("_template_seg"):
                issues.append("字幕轨无可用模板 segment")
        elif kind == "bgm":
            has_bgm = True
            if not t.get("segments") and not t.get("_template_seg"):
                issues.append("BGM 轨无可用模板 segment")

    if not has_main:
        issues.append("缺主轨：没有 attribute=1 的 video track 或 _SLOT=SLOT_MAIN_VIDEO")
    if not has_subtitle:
        issues.append("缺字幕轨：没有 text track 或 _SLOT=SLOT_SUBTITLES_NORMAL（字幕将无法填入）")
    if not has_bgm:
        issues.append("缺 BGM 轨：没有 audio track 或 _SLOT=SLOT_BGM（BGM 将无法填入）")

    # 主轨 material type 检查（仅旧版有 segments 时检查; 新版 _template_seg 不检查避免误报）
    if has_main:
        for t in tracks:
            if classify_track(t) == "main":
                segs = t.get("segments", [])
                if segs:
                    mat_id = segs[0].get("material_id")
                    for v in d.get("materials", {}).get("videos", []):
                        if v.get("id") == mat_id:
                            if v.get("type") == "photo":
                                issues.append("主轨 material type=photo（图片模板），填 video 可能特效不兼容——建议换视频模板")
                            break
                break

    return has_main, issues


# ============================================================
# audio 自检：判断主轨音频是否被"分离"剥离
# ============================================================

def check_main_track_audio(d, main_track):
    """检测主轨音频状态，返回 (need_independent_voice_track, reason)。

    判断依据：
    - volume=0.0 → 主轨被静音（可能音频分离过）
    - extra_material_refs 引用了 type=video_original_sound 的 audio material → 音频已分离到独立轨
    - 主轨 material 的 has_audio=False 或 type 不含 audio → 音频缺失
    """
    # 检查1: volume=0.0
    seg0 = get_template_seg(main_track)
    if seg0 is None:
        return False, "主轨无可用模板 segment, 跳过 audio 自检"
    volume = seg0.get("volume", 1.0)
    if volume == 0.0 or volume == 0:
        return True, f"主轨 volume={volume}（静音，音频可能被分离剥离）"

    # 检查2: extra_material_refs 引用了 video_original_sound
    refs = seg0.get("extra_material_refs", [])
    for ref in refs:
        for a in d.get("materials", {}).get("audios", []):
            if a.get("id") == ref and a.get("type") == "video_original_sound":
                return True, "主轨引用了 video_original_sound 素材（音频已分离到独立轨，主轨哑的）"

    # 检查3: 主轨 material 是否声明 has_audio=False
    mat_id = seg0.get("material_id")
    for v in d.get("materials", {}).get("videos", []):
        if v.get("id") == mat_id:
            has_audio = v.get("has_audio", True)
            if has_audio is False or has_audio == 0:
                return True, "主轨 material has_audio=False（音频被标记为无）"
            break

    # 默认：主轨音频正常，不需要独立音轨
    return False, "主轨音频正常（volume>0, 无分离标记）"


# ============================================================
# 填槽步骤
# ============================================================

def fill_main_track(d, main_track, video_path, video_duration_us, placeholder_id, video_subdir, video_filename):
    """填主轨：path + duration + 宽高 + volume + speed + speeds material 同步。
    兼容: segments[0] 有内容直接改; segments 空 + 有 _template_seg 时从模板段新建。"""
    main_seg = get_template_seg(main_track)
    if main_seg is None:
        err("主轨无可用模板 segment（segments 空 且 无 _template_seg），无法填槽")

    # segments 空时把新建的 seg 放进去（让 track 有 1 段可被剪映渲染）
    if not main_track.get("segments"):
        main_track["segments"] = [main_seg]
        log("主轨 segments 空, 从 _template_seg 新建 1 段")
    else:
        main_track["segments"][0] = main_seg

    main_mat_id = main_seg.get("material_id")

    # 如果主轨 material_id 不在 materials.videos 里（新版模板用占位 id）, 新建一个 video material
    found_mat = False
    for v in d["materials"]["videos"]:
        if v["id"] == main_mat_id:
            v["type"] = "video"
            v["duration"] = video_duration_us
            # 从视频文件读真实宽高（mdls）
            w, h = get_video_resolution(video_path)
            v["width"] = w
            v["height"] = h
            v["path"] = f"##_draftpath_placeholder_{placeholder_id}_##/{video_subdir}/{video_filename}"
            log(f"主轨 material: path→{video_filename}, dur={video_duration_us}, {w}x{h}")
            found_mat = True
            break

    if not found_mat:
        # 新建 video material
        w, h = get_video_resolution(video_path)
        new_mat = {
            "id": main_mat_id,
            "type": "video",
            "duration": video_duration_us,
            "width": w,
            "height": h,
            "path": f"##_draftpath_placeholder_{placeholder_id}_##/{video_subdir}/{video_filename}",
            "material_name": "数字人主视频",
            "has_audio": True,
        }
        d["materials"]["videos"].append(new_mat)
        main_seg["material_id"] = main_mat_id
        log(f"主轨 material 新建: path→{video_filename}, dur={video_duration_us}, {w}x{h}")

    main_seg["target_timerange"] = {"duration": video_duration_us, "start": 0}
    main_seg["source_timerange"] = {"duration": video_duration_us, "start": 0}

    # 修复1: volume=0.0 → 1.0
    old_vol = main_seg.get("volume", "未设置")
    main_seg["volume"] = 1.0

    # 修复2: speed → 1.0
    old_spd = main_seg.get("speed", "未设置")
    main_seg["speed"] = 1.0

    # 修复3: extra_material_refs 引用的 speeds material 同步改 1.0
    for ref in main_seg.get("extra_material_refs", []):
        for sp in d["materials"].get("speeds", []):
            if sp.get("id") == ref:
                old_ref_spd = sp.get("speed")
                sp["speed"] = 1.0
                sp["mode"] = 0
                sp["curve_speed"] = None
                log(f"  主轨 speeds material {ref[:8]}: speed {old_ref_spd} → 1.0")

    log(f"主轨 seg[0]: target/source → 0~{video_duration_us}")
    log(f"  volume: {old_vol} → 1.0")
    log(f"  speed: {old_spd} → 1.0")

def get_video_resolution(video_path):
    """用 mdls 读视频分辨率，返回 (width, height)。"""
    try:
        r = subprocess.run(
            ["mdls", "-name", "kMDItemPixelWidth", "-name", "kMDItemPixelHeight", video_path],
            capture_output=True, text=True, timeout=10
        )
        w_m = re.search(r'kMDItemPixelWidth\s*=\s*(\d+)', r.stdout)
        h_m = re.search(r'kMDItemPixelHeight\s*=\s*(\d+)', r.stdout)
        if w_m and h_m:
            return int(w_m.group(1)), int(h_m.group(1))
    except Exception:
        pass
    return 1080, 1920  # 默认值

def fill_subtitle_track(d, subtitle_track, scenes, video_path=None, script_text=None,
                        keyword_mode="on", asr_python=_ASR_PYTHON_DEFAULT,
                        asr_model="small", asr_helper=_ASR_HELPER_DEFAULT,
                        ffmpeg=_FFMPEG_DEFAULT):
    """填字幕轨: ASR 对齐 + 行内关键词高亮 + 每段独立 material + tr() 双写 start+offset。
    字幕切分: 优先用 split_subtitles 细切(11 段+短句合并), 比 adapter 的 5 段更适合短视频字幕。
    时间对齐: whisper ASR 逐词时间戳 + SequenceMatcher 实义字对齐(主), 停顿DP(二级), 字数均分(末)。
    行内高亮: 关键词词库命中后, 在白色全行样式上追加黄色样式只盖关键词区间(用户要求)。
    hl_style: 从模板花字段(SLOT_SUBTITLES_HIGHLIGHT)抽取黄色样式, 没有则跳过高亮。"""
    tmpl_seg = get_template_seg(subtitle_track)
    if tmpl_seg is None:
        log("字幕轨无模板 segment（segments 空 且 无 _template_seg），跳过")
        return

    # 找模板字幕 text material
    tpl_text_mat_id = tmpl_seg.get("material_id")
    tpl_text_mat = None
    for t in d["materials"]["texts"]:
        if t.get("id") == tpl_text_mat_id:
            tpl_text_mat = t
            break
    if tpl_text_mat is None:
        log(f"字幕轨模板 material_id {tpl_text_mat_id} 在 materials.texts 中找不到, 跳过")
        return

    # 字幕切分: 优先 split_subtitles 细切(更适短视频), 兜底用 scenes
    if script_text:
        lines = split_subtitles(script_text)
        log(f"字幕细切(split_subtitles): {len(lines)} 行")
    else:
        # 退回 adapter scenes 粒度
        lines = [s.get("subtitle_text", "") for s in scenes]
        log(f"字幕用 scenes 粒度: {len(lines)} 行")

    # 时间对齐: ASR → 停顿DP → 字数均分 三级
    timings = None
    method = "未对齐"
    if video_path and len(lines) > 0:
        # 主策略: whisper ASR
        timings = asr_line_timings(video_path, lines, asr_python, asr_model, asr_helper, ffmpeg)
        if timings:
            method = "whisper ASR"
        else:
            # 二级: 停顿DP
            timings, method = detect_line_timings(video_path, lines, ffmpeg)
    if not timings:
        # 末级: 字数均分(用 scenes 末段时长)
        dur_us = int(scenes[-1].get("end_sec", 0) * 1000000) if scenes else 0
        timings = char_proportional(lines, 0, dur_us)
        method = "char-proportional(无视频/ASR失败)"
    log(f"字幕对齐方式: {method}")

    # 抽取高亮样式(从花字段 SLOT_SUBTITLES_HIGHLIGHT 的 text material 取黄色 styles[0])
    hl_style = None
    if keyword_mode == "on":
        hl_track = next((t for t in d["tracks"] if classify_track(t) == "highlight"), None)
        if hl_track:
            hl_seg = get_template_seg(hl_track)
            if hl_seg:
                hl_mat_id = hl_seg.get("material_id")
                for t in d["materials"]["texts"]:
                    if t.get("id") == hl_mat_id:
                        try:
                            hc = json.loads(t.get("content", "{}")) if isinstance(t.get("content"), str) else (t.get("content") or {})
                            if hc.get("styles"):
                                hl_style = json.loads(json.dumps(hc["styles"][0]))
                                log(f"抽取高亮样式: color={hc['styles'][0].get('fill',{}).get('content',{}).get('solid',{}).get('color','?')}")
                        except Exception:
                            pass
                        break

    new_segs = []
    new_text_mats = []
    for i, line in enumerate(lines):
        # 行内高亮区间
        hl_ranges = find_keyword_ranges(line) if (keyword_mode == "on" and hl_style is not None) else None
        if hl_ranges:
            kws = [line[s:e] for s, e in hl_ranges]
            log(f"  字幕[{i+1}] 高亮: {kws}")

        # 克隆独立 material(行内高亮版)
        new_text_mat = clone_text_material(tpl_text_mat, line, hl_ranges=hl_ranges, hl_style=hl_style)
        new_text_mats.append(new_text_mat)

        # 时间区间
        start_us, dur_us = timings[i] if i < len(timings) else (0, 0)

        # 克隆模板 segment
        seg = json.loads(json.dumps(tmpl_seg))
        seg["id"] = new_id()
        seg["material_id"] = new_text_mat["id"]
        seg["target_timerange"] = tr(start_us, dur_us)
        # source_timerange 不变(文字 material 不需要源时间)

        log(f"  字幕[{i+1}] {start_us/1e6:5.2f}s +{dur_us/1e6:.2f}s {line[:20]}")
        new_segs.append(seg)

    d["materials"]["texts"].extend(new_text_mats)
    subtitle_track["segments"] = new_segs
    log(f"字幕轨: {len(new_segs)}段重建, {len(new_text_mats)} 个独立 material, 对齐={method}")


# ---- 标题轨(置顶展示, 不拉伸, 长标题拆两行) ----

def fill_title_track(d, title_track, title_text, video_duration_us):
    """填标题轨: 用花字段槽位 SLOT_SUBTITLES_HIGHLIGHT, 标题置顶不拉伸。
    - 位置: y=+0.72(本版剪映 y 正值=向上, hk 顶部分段标题 y=+0.73)
    - 大小: scale 归一 1.0/1.0(花字原 scale 1.33/1.556 是给短关键词放大用的, 套长标题会拉变形),
            改用字号放大 TITLE_SIZE=15(模板原 size=10)
    - 时长: 默认 min(12s, 45%片长), 让标题持续展示一段时间(不是字幕闪过)
    - 长标题: 超 8 字居中拆两行, 不拆断英文/数字词(如 '超会AI')
    """
    tmpl_seg = get_template_seg(title_track)
    if tmpl_seg is None:
        log("标题轨无模板 segment, 跳过标题")
        return

    tpl_text_mat_id = tmpl_seg.get("material_id")
    tpl_text_mat = None
    for t in d["materials"]["texts"]:
        if t.get("id") == tpl_text_mat_id:
            tpl_text_mat = t
            break
    if tpl_text_mat is None:
        log(f"标题轨模板 material_id {tpl_text_mat_id} 找不到, 跳过标题")
        return

    # 标题文案处理: 拆两行
    title_processed = title_two_lines(title_text) if len(title_text) > 8 else title_text
    log(f"标题: {title_text!r} → {title_processed!r}")

    # 克隆 material + 应用标题字号
    title_tm = clone_text_material(tpl_text_mat, title_processed)
    _apply_title_size(title_tm)
    d["materials"]["texts"].append(title_tm)

    # 时长: min(12s, 45%片长)
    title_dur_us = min(12_000_000, int(video_duration_us * 0.45))

    # 克隆 segment + scale 归一 + 置顶位置
    seg = json.loads(json.dumps(tmpl_seg))
    seg["id"] = new_id()
    seg["material_id"] = title_tm["id"]
    seg["target_timerange"] = tr(0, title_dur_us)
    # scale 归一为 1.0/1.0(不拉伸), 位置置顶 y=+0.72
    clip = seg.get("clip", {})
    clip["scale"] = {"x": 1.0, "y": 1.0}
    clip.setdefault("transform", {})
    clip["transform"]["y"] = 0.72
    seg["clip"] = clip

    title_track["segments"] = [seg]
    log(f"标题轨: 1段 0-{title_dur_us/1e6:.1f}s, scale 1.0/1.0, y=+0.72, size={TITLE_SIZE}")


# ---- 音效轨(保留模板素材 + 重排到分句切换点) ----

def fill_sfx_track(d, sfx_track, scenes, video_duration_us):
    """音效轨: 保留模板音效素材(materials.audios), segments 重排到分句切换点。
    原 fill_draft 把音效轨当 other_tracks 清空了, 没音效; 现在保留并重排。"""
    if not sfx_track:
        return
    orig_segs = sfx_track.get("segments", [])
    if not orig_segs:
        log("音效轨无原 segments, 跳过")
        return

    # 收集原音效素材 material_id(去重, 保留顺序)
    sfx_mids, seen = [], set()
    for s in orig_segs:
        mid = s.get("material_id")
        if mid and mid not in seen:
            sfx_mids.append(mid)
            seen.add(mid)
    if not sfx_mids:
        log("音效轨无可用素材 material_id, 跳过")
        return

    # 切换点: 每个 scene 起点(从第2段开始, 第1段开头不加音效避免压口播第一句)
    # 用 scenes 的 start_sec (align_scenes 已校准为 ASR 真实时间)
    switch_points = [int(s.get("start_sec", 0) * 1000000) for s in scenes[1:] if s.get("start_sec", 0) > 0]
    sfx_count = len(sfx_mids)

    # 重排: 用模板音效素材按顺序铺到切换点, 不够循环用
    new_segs = []
    for k, sp in enumerate(switch_points):
        if k >= sfx_count:
            break
        mid = sfx_mids[k % sfx_count]
        # 找原 seg 拿 source_timerange + clip
        orig_seg = next((s for s in orig_segs if s.get("material_id") == mid), orig_segs[0])
        seg = json.loads(json.dumps(orig_seg))
        seg["id"] = new_id()
        seg["material_id"] = mid
        # source 保留原(音效素材本身的截取范围)
        # target 改为切换点
        src_dur = orig_seg.get("source_timerange", {}).get("duration", 500000)
        seg["target_timerange"] = tr(sp, src_dur)
        new_segs.append(seg)

    sfx_track["segments"] = new_segs
    log(f"音效轨: {len(orig_segs)}段原素材 → {len(new_segs)}段重排到分句切换点")


def fill_bgm_track(d, bgm_track, video_duration_us, placeholder_id, audio_subdir, bgm_volume, bgm_src=None, out_dir=None):
    """填 BGM 轨：多段拼接循环（speed=1.0 避免变速）+ 反斜杠→正斜杠。
    兼容: segments 空 + 有 _template_seg 时用模板段; material_id 不在 materials.audios 时新建。
    bgm_src 传入时: 复制 BGM 源文件到草稿 audio 目录 + 改 BGM material path 为占位符(由 fix 替换为绝对路径)。"""
    bgm_seg_template = get_template_seg(bgm_track)
    if bgm_seg_template is None:
        log("BGM 轨无模板 segment（segments 空 且 无 _template_seg），跳过")
        return

    bgm_mat_id = bgm_seg_template.get("material_id")
    bgm_orig_duration = 0
    found_audio_mat = False

    # 如果传入了 BGM 源文件, 复制它到草稿 audio 子目录 + 改 BGM material path
    if bgm_src and os.path.isfile(bgm_src) and out_dir:
        bgm_filename = "bgm" + os.path.splitext(bgm_src)[1]
        dst_audio_path = f"{out_dir}/{audio_subdir}/{bgm_filename}"
        os.makedirs(os.path.dirname(dst_audio_path), exist_ok=True)
        shutil.copy2(bgm_src, dst_audio_path)
        # probe BGM 真实时长
        bgm_real_us = get_video_duration_us(bgm_src)
        bgm_orig_duration = bgm_real_us
        # 找 BGM material 改 path, 找不到就新建
        for a in d["materials"]["audios"]:
            if a["id"] == bgm_mat_id:
                a["path"] = f"##_draftpath_placeholder_{placeholder_id}_##/{audio_subdir}/{bgm_filename}"
                a["duration"] = bgm_real_us
                a["material_name"] = bgm_filename
                a["type"] = "extract_music"
                found_audio_mat = True
                log(f"BGM material: 用 --bgm 源文件 {bgm_filename}, dur={bgm_real_us}, path 改为占位符")
                break
        if not found_audio_mat:
            # 新建 audio material
            new_audio = {
                "id": bgm_mat_id,
                "type": "extract_music",
                "duration": bgm_real_us,
                "path": f"##_draftpath_placeholder_{placeholder_id}_##/{audio_subdir}/{bgm_filename}",
                "material_name": bgm_filename,
            }
            d["materials"]["audios"].append(new_audio)
            found_audio_mat = True
            log(f"BGM material 新建: 用 --bgm 源文件 {bgm_filename}, dur={bgm_real_us}")

    if not found_audio_mat:
        # 没传 bgm_src 或找不到 material: 沿用模板原 path
        for a in d["materials"]["audios"]:
            if a["id"] == bgm_mat_id:
                bgm_orig_duration = a.get("duration", 0)
                # 反斜杠→正斜杠
                old_path = a.get("path", "")
                if "\\" in old_path:
                    filename = old_path.split("/")[-1]
                    a["path"] = f"##_draftpath_placeholder_{placeholder_id}_##/{audio_subdir}/{filename}"
                    log(f"BGM path 修复: 反斜杠→正斜杠")
                log(f"BGM material: 保留模板原 duration={bgm_orig_duration}, path={a['path']}")
                found_audio_mat = True
                break

    if not found_audio_mat:
        log(f"BGM material_id {bgm_mat_id} 不在 materials.audios, 新建占位 material")
        new_audio = {
            "id": bgm_mat_id,
            "type": "extract_music",
            "duration": 0,
            "path": "",
            "material_name": "BGM",
        }
        d["materials"]["audios"].append(new_audio)
        bgm_orig_duration = 0

    if bgm_orig_duration > 0 and bgm_orig_duration < video_duration_us:
        # BGM 短于视频：多 segment 拼接循环
        new_bgm_segs = []
        cur_target_start = 0
        seg_idx = 0
        while cur_target_start < video_duration_us:
            remaining = video_duration_us - cur_target_start
            chunk = min(remaining, bgm_orig_duration)
            seg = json.loads(json.dumps(bgm_seg_template))
            seg["id"] = new_id()
            seg["source_timerange"] = tr(0, chunk)
            seg["target_timerange"] = tr(cur_target_start, chunk)
            seg["speed"] = 1.0
            seg["volume"] = bgm_volume
            new_bgm_segs.append(seg)
            log(f"  BGM seg[{seg_idx}]: source=0+{chunk}, target={cur_target_start}+{chunk}")
            cur_target_start += chunk
            seg_idx += 1
        bgm_track["segments"] = new_bgm_segs
        log(f"BGM 轨: {len(new_bgm_segs)}段拼接（每段 speed=1.0，循环铺满 {video_duration_us}）")
    elif bgm_orig_duration >= video_duration_us:
        # BGM 够长：单段
        bgm_seg_template["source_timerange"] = tr(0, video_duration_us)
        bgm_seg_template["target_timerange"] = tr(0, video_duration_us)
        bgm_seg_template["speed"] = 1.0
        bgm_seg_template["volume"] = bgm_volume
        bgm_track["segments"] = [bgm_seg_template]
        # 同时清掉 attribute=1 静音标记(从 hk 模板继承的坑)
        bgm_track["attribute"] = 0
        log(f"BGM seg[0]: source/target=0+{video_duration_us}（BGM 够长，单段, attribute 清 0）")
    else:
        # fallback: BGM 时长未知（0）→ 单段铺满
        bgm_seg_template["source_timerange"] = tr(0, video_duration_us)
        bgm_seg_template["target_timerange"] = tr(0, video_duration_us)
        bgm_seg_template["speed"] = 1.0
        bgm_seg_template["volume"] = bgm_volume
        bgm_track["segments"] = [bgm_seg_template]
        bgm_track["attribute"] = 0
        log(f"BGM seg[0]: fallback source/target → 0+{video_duration_us}, attribute 清 0")

def add_voice_track(d, main_track, video_duration_us, placeholder_id, audio_subdir, voice_filename, voice_m4a_path, out_dir):
    """新增数字人口播独立音频轨（照抄 308 的音频分离模式）。"""
    voice_mat_id = str(uuid.uuid4()).upper()
    voice_speed_id = str(uuid.uuid4()).upper()
    voice_seg_id = str(uuid.uuid4()).upper()
    voice_track_id = str(uuid.uuid4()).upper()

    # 复制口播 m4a 到草稿 audio 子目录
    dst_voice = f"{out_dir}/{audio_subdir}/{voice_filename}"
    os.makedirs(os.path.dirname(dst_voice), exist_ok=True)
    shutil.copy2(voice_m4a_path, dst_voice)
    log(f"口播音频复制 → {audio_subdir}/{voice_filename}")

    # 主视频 material id（extract 素材的 video_id 要指向它）
    main_mat_id = None
    if main_track:
        main_mat_id = main_track["segments"][0]["material_id"]

    # 加 audio material（type=extract = 音频分离产物）
    voice_material = {
        "app_id": 0, "category_id": "", "category_name": "", "check_flag": 1,
        "duration": video_duration_us, "effect_id": "", "formula_id": "",
        "id": voice_mat_id, "intensifies_path": "", "music_id": "",
        "name": "数字人口播",
        "path": f"##_draftpath_placeholder_{placeholder_id}_##/{audio_subdir}/{voice_filename}",
        "resource_id": "", "source_platform": 0, "team_id": "", "text_id": "",
        "tone_speaker": "", "tone_type": "", "type": "extract",
        "video_id": main_mat_id or "", "wave_points": []
    }
    d["materials"].setdefault("audios", []).append(voice_material)
    log(f"materials.audios + extract素材: id={voice_mat_id[:8]} video_id={(main_mat_id or '?')[:8]}")

    # 加 speed material
    voice_speed = {
        "curve_speed": None, "id": voice_speed_id, "mode": 0, "speed": 1.0, "type": "speed"
    }
    d["materials"].setdefault("speeds", []).append(voice_speed)
    log(f"materials.speeds + speed素材: id={voice_speed_id[:8]} speed=1.0")

    # 造新 audio track（1 segment 0~video_duration_us）
    voice_seg = {
        "cartoon": False, "clip": None, "enable_adjust": False,
        "enable_color_curves": True, "enable_color_wheels": True, "enable_lut": False,
        "extra_material_refs": [voice_speed_id], "group_id": "",
        "hdr_settings": None, "id": voice_seg_id,
        "intensifies_audio": False, "is_placeholder": False, "is_tone_modify": False,
        "keyframe_refs": [], "last_nonzero_volume": 1.0,
        "material_id": voice_mat_id, "render_index": 0, "reverse": False,
        "source_timerange": {"duration": video_duration_us, "start": 0},
        "speed": 1.0,
        "target_timerange": {"duration": video_duration_us, "start": 0},
        "track_attribute": 0, "track_render_index": 0, "visible": True, "volume": 1.0
    }
    voice_track = {
        "attribute": 0, "flag": 0, "id": voice_track_id,
        "is_default_name": True, "name": "", "type": "audio",
        "segments": [voice_seg]
    }
    d.setdefault("tracks", []).append(voice_track)
    log(f"新增口播音频轨: 1段 0~{video_duration_us}, volume=1.0, speed=1.0")


def add_narration_track(d, scenes, script_path, out_dir, placeholder_id, audio_subdir, narration_volume=2.0):
    """模式B 旁白音轨：TTS 合成的分段旁白，按 scene 时间偏移连续拼接。

    读 script.json 里每段的 narration_audio 字段（相对 script.json 所在目录），
    每段复制到草稿 audio 子目录，加 audio material + speed material + segment，
    target_timerange 按 scene.start_sec → scene.end_sec 排布。
    narration_volume: 旁白音轨增益（默认 2.0=200%，压过 BGM；剪映里仍可手动微调）。
    """
    script_dir = os.path.dirname(os.path.abspath(script_path))
    narration_segs = []
    added = 0
    for scene in scenes:
        rel = scene.get("narration_audio", "")
        if not rel:
            continue
        full = os.path.join(script_dir, rel) if not os.path.isabs(rel) else rel
        if not os.path.exists(full):
            log(f"  ⚠ 旁白音频不存在：{full}，跳过")
            continue

        scene_id = scene.get("scene_id", "")
        seg_name = scene.get("segment_name", "")
        start_us = int(scene.get("start_sec", 0) * 1000000)
        end_us = int(scene.get("end_sec", 0) * 1000000)
        dur_us = end_us - start_us
        if dur_us <= 0:
            continue

        # 复制到草稿 audio 子目录
        filename = os.path.basename(full)
        dst = f"{out_dir}/{audio_subdir}/{filename}"
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(full, dst)

        mat_id = str(uuid.uuid4()).upper()
        speed_id = str(uuid.uuid4()).upper()
        seg_id = str(uuid.uuid4()).upper()

        # audio material（type=extract_music，本地音频文件标准类型，剪映可调音量）
        mat = {
            "app_id": 0, "category_id": "", "category_name": "", "check_flag": 1,
            "duration": dur_us, "effect_id": "", "formula_id": "",
            "id": mat_id, "intensifies_path": "", "music_id": "",
            "name": f"旁白_{seg_name or scene_id}",
            "path": f"##_draftpath_placeholder_{placeholder_id}_##/{audio_subdir}/{filename}",
            "resource_id": "", "source_platform": 0, "team_id": "", "text_id": "",
            "tone_speaker": "", "tone_type": "",
            "type": "extract_music",
            "video_id": "", "wave_points": [],
            "audio": {
                "duration": dur_us,
                "source_timerange": {"duration": dur_us, "start": 0},
                "type": "extract_music"
            },
            "source": 2
        }
        d["materials"].setdefault("audios", []).append(mat)

        # speed material
        sp = {"curve_speed": None, "id": speed_id, "mode": 0, "speed": 1.0, "type": "speed"}
        d["materials"].setdefault("speeds", []).append(sp)

        # segment
        seg = {
            "cartoon": False, "clip": None, "enable_adjust": False,
            "enable_color_curves": True, "enable_color_wheels": True, "enable_lut": False,
            "extra_material_refs": [speed_id], "group_id": "",
            "hdr_settings": None, "id": seg_id,
            "intensifies_audio": False, "is_placeholder": False, "is_tone_modify": False,
            "keyframe_refs": [], "last_nonzero_volume": narration_volume,
            "material_id": mat_id, "render_index": 0, "reverse": False,
            "source": "segmentsourcenormal",
            "source_timerange": {"duration": dur_us, "start": 0},
            "speed": 1.0,
            "target_timerange": {"duration": dur_us, "start": start_us},
            "track_attribute": 0, "track_render_index": 0, "visible": True, "volume": narration_volume
        }
        narration_segs.append(seg)
        added += 1
        log(f"  旁白 {seg_name or scene_id:<8} → {filename} @{start_us/1000000:.2f}-{end_us/1000000:.2f}s vol={narration_volume}")

    if not narration_segs:
        log("无有效旁白段，跳过旁白音轨")
        return

    track_id = str(uuid.uuid4()).upper()
    track = {
        "attribute": 0, "flag": 0, "id": track_id,
        "is_default_name": True, "name": "", "type": "audio",
        "segments": narration_segs
    }
    d.setdefault("tracks", []).append(track)
    log(f"新增旁白音轨: {added} 段拼接，volume={narration_volume}，全程连续")

def fix_paths_globally(d):
    """全局兜底：所有 materials 里的 path 反斜杠 → 正斜杠。"""
    fixed_n = 0
    for cat, items in d.get("materials", {}).items():
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict) and isinstance(item.get("path"), str) and "\\" in item["path"]:
                item["path"] = item["path"].replace("\\", "/")
                fixed_n += 1
    if fixed_n:
        log(f"全局 path 反斜杠修正: {fixed_n} 处")


def add_broll_track(d, assets_path, scenes, out_dir, placeholder_id, video_subdir, is_main=False):
    """新增素材视频轨（多素材拼接）。

    模式A（is_main=False）：B-roll 覆盖轨（attribute=0），选择性覆盖主轨画面，口播音频走主轨/独立音轨。
    模式C（is_main=True）：主轨（attribute=1），纯素材拼接，无数字人视频。

    读 assets.json 的 b_rolls：
      - use_original=true 的段保留原视频（模式A），不插素材
      - use_original=false 的段：遍历 clips 数组，每个 clip 生成一个 segment
        - segment.target_timerange.start = scene.start_us + clip.target_offset_us
        - segment.target_timerange.duration = clip.seg_duration_us
        - segment.source_timerange = clip 的素材内截取范围
      - 多个 clip 在段落内按 target_offset 连续拼接，铺不满的尾部主轨画面露出（模式A）
    """
    assets = json.load(open(assets_path, encoding="utf-8"))
    b_rolls = assets.get("b_rolls", [])
    if not b_rolls:
        log("assets.json 无 b_rolls，跳过素材轨")
        return

    log(f"assets.json: {len(b_rolls)} 个段落决策（含 {assets.get('total_clips',0)} 个素材片段）")

    # 按 scene_id 建索引
    scene_map = {s.get("scene_id", ""): s for s in scenes}

    broll_segs = []
    original_count = 0  # 保留原视频的段数（模式A）
    gap_count = 0       # 缺口段数（模式C）

    for b_roll in b_rolls:
        # use_original=true 的段保留原视频画面，不插素材
        if b_roll.get("use_original", False):
            original_count += 1
            log(f"  {b_roll.get('segment_name',''):<8} → 保留原视频（{b_roll.get('reason','IP出镜段')}）")
            continue

        # 模式C缺口段（无素材）
        if b_roll.get("nature") == "gap" and not b_roll.get("clips"):
            gap_count += 1
            log(f"  {b_roll.get('segment_name',''):<8} → ❌ 缺口（{b_roll.get('reason','无达标素材')}）")
            continue

        clips = b_roll.get("clips", [])
        if not clips:
            log(f"  {b_roll.get('segment_name',''):<8} → 无 clips，跳过")
            continue

        scene_id = b_roll.get("scene_id", "")
        scene = scene_map.get(scene_id)
        if not scene:
            log(f"  ⚠ 段 {b_roll.get('segment_name','')} 的 scene_id={scene_id} 在 script.json 找不到，跳过")
            continue

        # scene 全局起点（微秒）
        scene_start_us = int(scene.get("start_sec", 0) * 1000000)

        seg_names_str = b_roll.get("segment_name", "")
        clips_summary = []

        for clip in clips:
            # 段落内偏移 + 这段时长（微秒）
            offset_us = int(clip.get("target_offset_sec", 0) * 1000000)
            seg_dur_us = int(clip.get("seg_duration_sec", 0) * 1000000)
            if seg_dur_us <= 0:
                continue

            # 素材内截取范围（微秒）
            clip_start_us = int(clip.get("clip_start_sec", 0) * 1000000)
            clip_end_us = int(clip.get("clip_end_sec", 0) * 1000000)
            clip_dur_us = clip_end_us - clip_start_us
            if clip_dur_us <= 0:
                clip_dur_us = seg_dur_us

            # 全局时间轴起点 = scene起点 + 段落内偏移
            target_start_us = scene_start_us + offset_us
            source_dur = min(seg_dur_us, clip_dur_us)

            # 复制素材到草稿 video/ 子目录
            material_fullpath = clip.get("material_fullpath", "")
            if not os.path.exists(material_fullpath):
                log(f"  ⚠ 素材文件不存在：{material_fullpath}，跳过该 clip")
                continue
            material_filename = clip.get("material_name", os.path.basename(material_fullpath))
            dst_path = f"{out_dir}/{video_subdir}/{material_filename}"
            os.makedirs(os.path.dirname(dst_path), exist_ok=True)
            shutil.copy2(material_fullpath, dst_path)

            # 生成唯一 id
            mat_id = str(uuid.uuid4()).upper()
            speed_id = str(uuid.uuid4()).upper()
            seg_id = str(uuid.uuid4()).upper()

            # 读素材宽高(优先用 ffmpeg probe, mdls 兜底)
            if material_fullpath.endswith((".mp4", ".mov", ".MP4", ".MOV")):
                w, h = probe_video_hw(material_fullpath)
                if w == 1920 and h == 1080:
                    w, h = get_video_resolution(material_fullpath)
            else:
                w, h = 1920, 1080
            # B-roll scale 适配: 横屏素材塞竖屏画布裁左右
            sx, sy = broll_scale_for_fit(w, h)

            # 加 video material
            video_material = {
                "id": mat_id,
                "type": "video" if material_fullpath.endswith((".mp4", ".mov", ".MP4", ".MOV")) else "photo",
                "duration": clip_dur_us,
                "width": w,
                "height": h,
                "path": f"##_draftpath_placeholder_{placeholder_id}_##/{video_subdir}/{material_filename}",
                "name": clip.get("material_id", ""),
                "source_platform": 0,
                "check_flag": 1,
            }
            d["materials"].setdefault("videos", []).append(video_material)

            # 加 speed material
            speed_material = {
                "id": speed_id, "type": "speed", "speed": 1.0, "mode": 0, "curve_speed": None
            }
            d["materials"].setdefault("speeds", []).append(speed_material)

            # 造 segment — 用 tr() 双写 start+offset, clip.scale 用 broll_scale_for_fit
            seg = {
                "id": seg_id,
                "material_id": mat_id,
                "extra_material_refs": [speed_id],
                "target_timerange": tr(target_start_us, seg_dur_us),
                "source_timerange": tr(clip_start_us, source_dur),
                "speed": 1.0,
                "volume": 0.0,  # B-roll 静音(不抢数字人口播)
                "clip": {
                    "flip": {},
                    "scale": {"x": sx, "y": sy},
                    "transform": {"x": 0.0, "y": 0.0},
                },
                "source": "segmentsourcenormal",
                "cartoon": False,
                "enable_adjust": False,
                "enable_color_curves": False,
                "enable_color_wheels": False,
                "enable_lut": False,
                "hdr_settings": None,
                "intensifies_audio": False,
                "is_placeholder": False,
                "is_tone_modify": False,
                "keyframe_refs": [],
                "last_nonzero_volume": 0.0,
                "render_index": 100,
                "reverse": False,
                "track_attribute": 0,
                "track_render_index": 1,
                "visible": True,
            }
            broll_segs.append(seg)
            clip_target_end = (target_start_us + seg_dur_us) / 1000000
            clips_summary.append(f"{clip.get('material_id','')}@{target_start_us/1000000:.1f}-{clip_target_end:.1f}s")

        if clips_summary:
            tail_info = ""
            if b_roll.get("tail_original"):
                tail_info = f" +尾部露原视频{b_roll.get('remaining_sec',0)}s"
            elif b_roll.get("gap"):
                tail_info = f" +缺口{b_roll.get('gap_duration_sec',0)}s"
            log(f"  {seg_names_str:<8} → {len(clips)}个素材: {' '.join(clips_summary)}{tail_info}")

    if not broll_segs:
        if original_count > 0:
            log(f"无素材段需插入，{original_count} 段保留原视频画面（模式A）")
        elif gap_count > 0:
            log(f"无素材段需插入，{gap_count} 段缺口（模式C无原视频兜底）")
        else:
            log("无有效素材 segment，跳过素材轨")
        return

    # 新增素材轨（模式A=attribute=0覆盖轨，模式C=attribute=1主轨）
    broll_track_id = str(uuid.uuid4()).upper()
    broll_track = {
        "attribute": 1 if is_main else 0,
        "flag": 0,
        "id": broll_track_id,
        "is_default_name": True,
        "name": "",
        "type": "video",
        "segments": broll_segs,
    }
    # 模式B/C 主轨加 _SLOT 标记——剪映按 _SLOT 识别轨道角色，
    # 新建主轨无标记会被当普通视频轨，字幕/标题轨可能不渲染（2026-09-28 实测坑）
    if is_main:
        broll_track["_SLOT"] = "SLOT_MAIN_VIDEO"
    # 轨道顺序 = 剪映层级：数组越靠后层级越高。
    # 模式B/C 主轨必须 insert 到数组开头（原模板主轨的位置，最底层），
    # 否则 append 到末尾会跑到最上层，盖住字幕轨/标题轨（2026-09-28 实测坑）
    if is_main:
        d.setdefault("tracks", []).insert(0, broll_track)
    else:
        d.setdefault("tracks", []).append(broll_track)
    track_type = "主轨" if is_main else "B-roll覆盖轨"
    extra = ""
    if original_count > 0:
        extra = f" + {original_count} 段保留原视频（模式A选择性插入）"
    elif gap_count > 0:
        extra = f" + {gap_count} 段缺口（模式C需补拍）"
    log(f"新增 {track_type}: {len(broll_segs)} 个素材 segment（多素材拼接）{extra}")


# ============================================================
# 主流程
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="通用填槽（A模式数字人+选择性插入 / C模式纯素材整合）")
    parser.add_argument("--template", required=True, help="模板草稿目录路径（含 draft_content.json）")
    parser.add_argument("--script", required=True, help="script.json 路径")
    parser.add_argument("--video", default=None, help="数字人视频文件路径（模式A必需，模式C不需要）")
    parser.add_argument("--output", required=True, help="输出草稿目录路径")
    parser.add_argument("--voice", default=None, help="口播音频 m4a 路径（不传则自动从视频抽取）")
    parser.add_argument("--cover", default=None, help="封面图路径（不传则保留模板原封面）")
    parser.add_argument("--bgm-volume", type=float, default=0.3, help="BGM 音量（0.0-1.0），默认 0.3（旁白视频需 BGM 作背景不盖人声）")
    parser.add_argument("--narration-volume", type=float, default=2.0, help="旁白音轨增益（默认 2.0=200%，压过 BGM；剪映里仍可手动微调）")
    parser.add_argument("--no-voice-track", action="store_true", help="跳过口播独立音轨（主轨音频未剥离时用）")
    parser.add_argument("--bgm", default=None, help="BGM 音频文件路径；不传则自动用模板根 assets/bgm.m4a（模板自带的），找不到才保留模板原 BGM material path")
    parser.add_argument("--assets", default=None, help="assets.json 路径（素材匹配结果）")
    parser.add_argument("--mode", default="A", choices=["A", "B", "C"], help="A=数字人+选择性插入素材，B=纯素材整合+AI旁白音轨（TTS），C=纯素材整合（无旁白）")
    parser.add_argument("--title", default=None, help="主标题文本（画面顶部展示, 非字幕）；不传则从文案第一句兜底提取")
    parser.add_argument("--keyword-mode", default="on", choices=["on", "off"],
                        help="字幕行内关键词高亮开关（默认 on, 用 KEYWORD_LEXICON 词库识别）")
    parser.add_argument("--asr-model", default="small",
                        help="whisper ASR 模型: tiny/base/small/medium（默认 small, 字幕对齐用）")
    parser.add_argument("--ffmpeg", default=_FFMPEG_DEFAULT,
                        help=f"ffmpeg 路径(时长探测+ASR+素材宽高 probe 用, 默认 {_FFMPEG_DEFAULT})")
    args = parser.parse_args()

    # 0. 参数校验
    for label, path in [("模板目录", args.template), ("script.json", args.script)]:
        if not os.path.exists(path):
            err(f"{label}不存在：{path}")
    if not os.path.isdir(args.template):
        err(f"模板目录不是目录：{args.template}")
    if args.mode == "A":
        if not args.video or not os.path.isfile(args.video):
            err(f"模式A需要数字人视频：{args.video}")
    if args.mode in ("C", "B") and not args.assets:
        err(f"模式{args.mode}需要 --assets（素材匹配结果）")
    if args.assets and not os.path.exists(args.assets):
        err(f"assets.json 不存在：{args.assets}")

    log("=" * 60)
    log(f"模式{args.mode} 填槽")
    log("=" * 60)

    # 1. 读 script.json
    script = json.load(open(args.script, encoding="utf-8"))
    scenes = script.get("scenes", [])
    if not scenes:
        err("script.json 的 scenes 为空")
    log(f"script.json: {len(scenes)} 段字幕: {[s.get('segment_name','') for s in scenes]}")

    # 2. 读视频时长（模式A从数字人视频读，模式C/B从 scenes 末段算）
    if args.mode == "A":
        video_duration_us = get_video_duration_us(args.video)
        log(f"数字人视频时长: {video_duration_us} us = {video_duration_us/1000000:.1f}s")
    else:
        video_duration_us = int(scenes[-1].get("end_sec", 0) * 1000000)
        log(f"模式{args.mode}：无数字人视频，总时长从 scenes 末段 = {video_duration_us/1000000:.1f}s")

    # 3. 复制模板全目录到输出
    if os.path.exists(args.output):
        shutil.rmtree(args.output)
    shutil.copytree(args.template, args.output)
    log(f"复制模板 -> {args.output}")

    # 3.5 自动探测并复制模板根目录的 assets/bgm.*（--template 指向 template.draft/ 子目录时，assets 在上一级）
    template_root = args.template
    # 若 --template 指向 template.draft/ 子目录，模板根 = 上一级
    if os.path.basename(template_root.rstrip("/")) == "template.draft":
        template_root = os.path.dirname(template_root.rstrip("/"))
    template_assets_dir = f"{template_root}/assets"
    if os.path.isdir(template_assets_dir):
        for bgm_candidate in ("bgm.m4a", "bgm.mp3"):
            template_bgm_path = f"{template_assets_dir}/{bgm_candidate}"
            if os.path.isfile(template_bgm_path):
                # 复制到草稿 audio 子目录
                os.makedirs(f"{args.output}/audio", exist_ok=True)
                dst_bgm = f"{args.output}/audio/{bgm_candidate}"
                if not os.path.exists(dst_bgm):
                    shutil.copy2(template_bgm_path, dst_bgm)
                    log(f"模板自带 BGM 复制 → audio/{bgm_candidate}（未传 --bgm 时自动用）")
                # 如果用户没传 --bgm，自动用模板自带的
                if not args.bgm:
                    args.bgm = dst_bgm
                    log(f"--bgm 未传，自动用模板自带 BGM: {dst_bgm}")
                break

    # 4. 删复制来的 draft_meta_info.json（让 fix 从头生成明文版）
    meta_old = f"{args.output}/draft_meta_info.json"
    if os.path.exists(meta_old):
        os.remove(meta_old)
        log("删除复制来的 draft_meta_info.json（让 fix 从头生成明文）")

    # 5. 复制数字人视频到草稿 video 子目录
    dc_path = f"{args.output}/draft_content.json"
    d = json.load(open(dc_path, encoding="utf-8"))

    video_subdir = get_video_subdir(d)
    audio_subdir = get_audio_subdir(d)
    placeholder_id = get_placeholder_id(d)
    video_filename = "digital_human.mp4"

    os.makedirs(f"{args.output}/{video_subdir}", exist_ok=True)
    if args.mode == "A":
        shutil.copy2(args.video, f"{args.output}/{video_subdir}/{video_filename}")
        log(f"复制数字人视频 -> {video_subdir}/{video_filename}")

    # 6. 替换封面
    if args.cover and os.path.exists(args.cover):
        shutil.copy2(args.cover, f"{args.output}/draft_cover.jpg")
        shutil.copy2(args.cover, f"{args.output}/draft_local_cover.jpg")
        log("替换封面 draft_cover.jpg + draft_local_cover.jpg")

    # 7. 兼容检查
    has_main, issues = check_template_compatibility(d)
    if issues:
        log("兼容检查发现以下问题：")
        for iss in issues:
            log(f"  ⚠ {iss}")
        if not has_main:
            err("主轨缺失，无法填槽——请换有 attribute=1 的 video track 的模板")
    else:
        log("兼容检查通过")

    # 8. 分类 tracks（用新分类函数, 兼容 _SLOT 标记 + 旧版 type+attribute）
    tracks = d.get("tracks", [])
    main_track = None
    subtitle_track = None
    bgm_track = None
    sfx_track = None
    highlight_track = None
    other_tracks = []

    for t in tracks:
        kind = classify_track(t)
        if kind == "main" and main_track is None:
            main_track = t
        elif kind == "subtitle" and subtitle_track is None:
            subtitle_track = t
        elif kind == "bgm" and bgm_track is None:
            bgm_track = t
        elif kind == "sfx" and sfx_track is None:
            sfx_track = t
        elif kind == "highlight" and highlight_track is None:
            highlight_track = t
        else:
            other_tracks.append(t)

    log(f"主轨: {main_track is not None}, 字幕轨: {subtitle_track is not None}, BGM轨: {bgm_track is not None}, 音效轨: {sfx_track is not None}, 花字轨: {highlight_track is not None}, 其他轨: {len(other_tracks)}")

    # 8.5 audio 自检（模式C跳过——无数字人主轨音频）
    need_voice_track = False
    voice_reason = "无主轨"
    if args.mode == "A" and main_track and not args.no_voice_track:
        need_voice_track, voice_reason = check_main_track_audio(d, main_track)
        log(f"audio 自检: {voice_reason}")
    elif args.no_voice_track:
        log("用户指定 --no-voice-track，跳过口播独立音轨")
    elif args.mode in ("C", "B"):
        log(f"模式{args.mode}：无数字人主轨音频，跳过 audio 自检")

    # 9. 填主轨（模式A填数字人视频，模式C清空模板主轨让素材做主轨）
    if args.mode == "A" and main_track:
        fill_main_track(d, main_track, args.video, video_duration_us, placeholder_id, video_subdir, video_filename)
    elif args.mode in ("C", "B") and main_track:
        d["tracks"] = [t for t in d["tracks"] if t is not main_track]
        log(f"模式{args.mode}：移除模板主轨（素材将做成新主轨）")

    # 10. 填字幕轨（合并版: ASR 对齐 + 行内高亮 + 细切 + 每段独立 material）
    if subtitle_track:
        # 提取口播全文(split_subtitles 细切用)
        script_text = script.get("voiceover_fulltext", "") or " ".join(s.get("subtitle_text", "") for s in scenes)
        # 视频路径(模式A才有, 模式B/C无视频无法 ASR)
        video_for_asr = args.video if args.mode == "A" else None
        fill_subtitle_track(d, subtitle_track, scenes, video_path=video_for_asr,
                            script_text=script_text, keyword_mode=args.keyword_mode,
                            asr_model=args.asr_model, ffmpeg=args.ffmpeg)

    # 10.5 填标题轨（用花字段槽位 SLOT_SUBTITLES_HIGHLIGHT, 置顶不拉伸）
    if highlight_track:
        # 标题文本: 优先 --title, 兜底用 generate_title
        title_text = args.title or generate_title(script.get("voiceover_fulltext", "") or scenes[0].get("subtitle_text", ""))
        if not args.title:
            log(f"⚠ 未传 --title, 兜底从文案提取: {title_text!r}")
        fill_title_track(d, highlight_track, title_text, video_duration_us)

    # 11. 填 BGM 轨
    if bgm_track:
        fill_bgm_track(d, bgm_track, video_duration_us, placeholder_id, audio_subdir, args.bgm_volume, bgm_src=args.bgm, out_dir=args.output)

    # 11.5 填音效轨（保留模板素材 + 重排到分句切换点）
    # 模式A/B: 切换点=分句起点（画面=数字人+素材插入点）; 模式C: 切换点=素材段起点（素材主轨每段=一个scene，同一组时间点）
    # 不重排则保留模板原始音效位置（按模板原视频节奏排的，与当前文案/素材无关——2026-09-28 实测坑）
    if sfx_track:
        fill_sfx_track(d, sfx_track, scenes, video_duration_us)

    # 12. 清空其他轨（音效轨/花字轨已分别处理, 不在这里再清）
    for t in other_tracks:
        t["segments"] = []
        log(f"清空其他轨 type={t.get('type')} attr={t.get('attribute')}")

    # 13. 口播独立音轨（模式C跳过——无数字人主轨音频）
    if args.mode == "A" and need_voice_track and main_track:
        voice_filename = "digital_human_voice.m4a"
        if args.voice and os.path.exists(args.voice):
            voice_path = args.voice
            log(f"使用用户传入的口播音频: {voice_path}")
        else:
            voice_path = f"/tmp/fill_draft_voice_{os.getpid()}.m4a"
            extract_audio_m4a(args.video, voice_path)
        add_voice_track(d, main_track, video_duration_us, placeholder_id, audio_subdir, voice_filename, voice_path, args.output)
    elif args.mode == "A" and main_track and not need_voice_track:
        log("主轨音频正常，跳过口播独立音轨（可用 --no-voice-track 强制跳过）")

    # 13.5 素材轨（模式A=B-roll覆盖轨attribute=0，模式C/B=主轨attribute=1）
    if args.assets:
        is_main = (args.mode in ("C", "B"))
        add_broll_track(d, args.assets, scenes, args.output, placeholder_id, video_subdir, is_main=is_main)

    # 13.6 旁白音轨（模式B：TTS合成的分段旁白，按时间偏移连续拼接）
    if args.mode == "B":
        add_narration_track(d, scenes, args.script, args.output, placeholder_id, audio_subdir, args.narration_volume)

    # 14. 顶层 duration
    d["duration"] = video_duration_us
    log(f"顶层 duration → {video_duration_us}")

    # 15. 全局 path 反斜杠修正
    fix_paths_globally(d)

    # 16. 写回 + cp draft_info.json
    json.dump(d, open(dc_path, "w", encoding="utf-8"), ensure_ascii=False)
    di_path = f"{args.output}/draft_info.json"
    shutil.copy2(dc_path, di_path)
    log(f"写回 draft_content.json + 复制 draft_info.json")

    print(f"\n{'=' * 60}")
    print(f"填槽完成：{args.output}")
    print(f"{'=' * 60}")
    print(f"下一步：python3 fix_draft_for_local.py {args.output}")
    print(f"然后 Cmd+Q 退出剪映 → 重开 → 打开草稿")

if __name__ == "__main__":
    main()
