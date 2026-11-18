# -*- coding: utf-8 -*-
"""素材工具：找片 → 下片 → 看片 → 挑入点 → 抽帧 → 剪原声。每一步都是看过才往下走。

  python footage.py search "NVIDIA Blackwell b-roll" [-n 8]        # YouTube 搜索：id | 时长 | 频道 | 标题（优先官方频道）
  python footage.py get <id或url> [--section 01:11:40-01:12:12] [--audio] [-o 名字]   # 1080p 下载；只要一段就 --section；--audio 只下音频
  python footage.py sheet <视频> [--step 2] [--from 0 --to 60]      # 带时间码的联系表 → sheets/<名>.jpg，用眼睛挑镜头
  python footage.py scenes <视频> [--from 0 --to 60] [--th .3]      # 镜头切点：入点出点都要落在同一个镜头里
  python footage.py extract clips.json [名字…]                      # 抽成 30fps 帧序列 film/assets/clips/<名>/0001.jpg，输出帧数
  python footage.py host <口播.mp4> [片子目录] [--fit auto|blur|cover|plain] [--interp]   # 一键抽整条口播帧（自动登记 counts.json），竖屏自动「中间完整 + 两侧虚化」
  python footage.py wave <音频或视频> <起秒> <止秒>                 # 每 50ms 的响度/峰值：找原声开口、句尾、数字静音、爆音

clips.json：{"out": "film/assets/clips", "clips": {"jensen_gtc": ["src.mp4", 59.6, 2.4], "bite": ["src.mp4", 101.6, 1.95, {"zoom": 1.2, "ax": .85, "ay": 0}]}}
  zoom/ax/ay：放大裁掉台标或角标，ax/ay 是保留的锚点（0 左/上，1 右/下）
  fit：auto（默认，竖屏/方屏自动走 blur，横屏保持原来的等比铺法）/ blur（强制中间完整 + 两侧虚化）
       / cover（等比放大铺满再裁，会切掉上下或左右）/ plain（旧行为，直接 scale=1920:1080，竖屏会被压扁）
  竖屏口播一定要用 auto 或 blur：直接 scale 会把人压扁，用 cover/zoom 会把人裁成大特写，身体和环境都没了。
  --interp / clips.json 里的 "interp": true：源片不是 30fps 时（常见 25fps），fps=30 靠重复帧补，
      每 0.2 秒左右有一帧和上一帧一模一样，口播快动作会看着「顿一下」。改用运动补偿插帧
      minterpolate=fps=30 生成中间帧；代价是抽帧慢很多，快速挥手有拖影，所以默认不开，
      只在确实觉得顿的时候重抽一次，抽完用片子目录的 --sheet / --stills 看一眼有没有拖影。

踩过的坑：
- yt-dlp 过 90 天就会被 YouTube 403，先 pip install -U yt-dlp。
- --section 下的片段偶尔音轨有解码错误（ffmpeg 报 aac decode_band_types），原声一定用 wave 查一遍；坏了就 --audio 单独再下。
- Whisper 给的词时间会提前或推后零点几秒，原声的入点出点以 wave 为准：开口前留 0.05 秒，句尾等最后一个字的能量落下去。
- 原片里可能有一段数字静音（-80dB 以下），截进去会突然“断电”，听着像异响。
- 抽帧的出点别压在镜头切点上，最后一帧会露出下一个镜头；停住时就停在这最后一帧上。
"""
import json, subprocess, sys
from pathlib import Path

def run(cmd, **kw): return subprocess.run(cmd, **kw)
def ffdur(f): return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(f)]))
def probe(f):
    s = subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                                 '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', str(f)], text=True).strip()
    w, h = (int(x) for x in s.split('x')[:2])
    return w, h
def probe_fps(f):
    try:
        s = subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                                     '-show_entries', 'stream=avg_frame_rate', '-of', 'csv=p=0', str(f)], text=True).strip()
        a, b = s.split('/')[:2]
        return float(a) / float(b)
    except Exception:
        return 0
def opt(name, default=None, cast=str):
    a = sys.argv
    return cast(a[a.index(name) + 1]) if name in a else default

# ---------- 画幅适配：竖屏素材不裁人 ----------
# 目标帧一律 1920×1080（口播层 host.js 按这个尺寸取机位、抠像、开圆窗）。
# 竖屏（宽高比 < 1.45）默认走 blur：中间放完整的竖屏原片（等比缩到 1080 高，人物全身和环境都在），
# 两侧用同一帧放大铺满 + 高斯模糊 + 压暗，再压一层极淡网格（不是糊一片，也不放大裁人脸）。
# fit.json 记下 portrait / scale，host.js 用它把按原片量出来的 faceY 换算到合成帧上。
def fit_vf(src, o):
    w, h = probe(src)
    ratio = w / max(1, h)
    fit = o.get('fit', 'auto')
    if fit == 'auto':
        fit = 'blur' if ratio < 1.45 else 'plain'
    zoom, ax, ay = o.get('zoom', 1), o.get('ax', .5), o.get('ay', .5)
    crop = f'crop=iw/{zoom}:ih/{zoom}:(iw-iw/{zoom})*{ax}:(ih-ih/{zoom})*{ay},' if zoom != 1 else ''
    # 源片不是 30fps 时，fps=30 只会重复帧；--interp 改成运动补偿生成中间帧（慢，默认不开）
    fpsf = ('minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1'
            if o.get('interp') else 'fps=30')
    meta = {'src': [w, h], 'fit': fit, 'portrait': ratio < 1.45, 'scale': 1080 / max(1, h)}
    if fit == 'blur':
        # fps 放在最前，split 出来的两路都是 30fps；blur 模式忽略 zoom（已经重新构图，再裁会切到人）
        bg = ('scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,'
              'gblur=sigma=30,eq=brightness=-0.18:saturation=0.62,'
              'drawgrid=w=120:h=120:t=1:c=white@0.022')
        # 中间清晰区和两侧虚化之间压两道极淡的亮边：看起来是刻意的分层，不是硬拼
        fw = max(2, round(1080 * w / max(1, h) / 2) * 2)
        x0 = (1920 - fw) // 2
        edge = (f'drawbox=x={x0}:y=0:w=2:h=ih:color=white@0.10:t=fill,'
                f'drawbox=x={x0 + fw - 2}:y=0:w=2:h=ih:color=white@0.10:t=fill')
        vf = (f'{fpsf},split=2[bg][fg];[bg]{bg}[bgb];'
              f'[fg]scale=-2:1080:flags=lanczos[fg2];'
              f'[bgb][fg2]overlay=(W-w)/2:(H-h)/2:eval=init,{edge},format=yuv420p')
        return vf, meta, 'boxblur=20:2'
    if fit == 'cover':
        vf = crop + f'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,{fpsf},format=yuv420p'
        return vf, meta, None
    vf = crop + f'scale=1920:1080:flags=lanczos,{fpsf}'
    return vf, meta, None

def ffextract(src, out, vf, start=None, dur=None, fallback=None):
    args = ['ffmpeg', '-v', 'error', '-y']
    if start: args += ['-ss', f'{start:.3f}']
    args += ['-i', str(src)]
    if dur: args += ['-t', f'{dur:.3f}']
    cmd = args + ['-vf', vf, '-q:v', '3', str(out / '%04d.jpg')]
    r = run(cmd, capture_output=True, text=True)
    if r.returncode and fallback:
        # 老 ffmpeg 没有 gblur：换成 boxblur 再来一次，效果一样，只是边缘更柔
        cmd = args + ['-vf', vf.replace('gblur=sigma=30', fallback), '-q:v', '3', str(out / '%04d.jpg')]
        r = run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError('ffmpeg 抽帧失败：' + (r.stderr or '')[-800:] + '\n命令：' + ' '.join(cmd))

def merge_counts(reg, counts, fits=None):
    # reg = 帧序列的上级目录（assets/clips）：counts.json / fit.json 和 FB.init、host.js 读的是同一层
    cp = reg / 'counts.json'
    old = json.loads(cp.read_text()) if cp.exists() else {}
    old.update(counts)
    cp.write_text(json.dumps(old, indent=1))
    if fits:
        fp = reg / 'fit.json'
        fo = json.loads(fp.read_text()) if fp.exists() else {}
        fo.update(fits)
        fp.write_text(json.dumps(fo, indent=1))
    return cp, reg / 'fit.json'

cmd = sys.argv[1] if len(sys.argv) > 1 else ''
if cmd == 'search':
    q, n = sys.argv[2], opt('-n', 8, int)
    run(['yt-dlp', '--flat-playlist', '--no-warnings', '--print', '%(id)s | %(duration_string)s | %(channel)s | %(title)s', f'ytsearch{n}:{q}'])
elif cmd == 'get':
    vid = sys.argv[2]; url = vid if vid.startswith('http') else f'https://www.youtube.com/watch?v={vid}'
    name = opt('-o', vid if not vid.startswith('http') else 'clip')
    fmt = 'bestaudio[ext=m4a]/bestaudio' if '--audio' in sys.argv else 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080]'
    c = ['yt-dlp', '-f', fmt, '-o', f'{name}.%(ext)s', '--no-warnings']
    if opt('--section'): c += ['--download-sections', '*' + opt('--section')]
    run(c + [url])
elif cmd == 'sheet':
    f = Path(sys.argv[2]); a, b = opt('--from', 0.0, float), opt('--to', None, float); d = (b or ffdur(f)) - a
    step = opt('--step', max(1.0, round(d / 48, 1)), float); n = int(d / step) + 1; cols = 8; rows = (n + cols - 1) // cols
    Path('sheets').mkdir(exist_ok=True); out = Path('sheets') / f'{f.stem}_{int(a)}.jpg'
    run(['ffmpeg', '-v', 'error', '-y', '-ss', str(a), '-t', str(d), '-i', str(f), '-vf',
         f"fps=1/{step},scale=320:-2,drawtext=text='%{{pts\\:hms}}':x=4:y=4:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.6,tile={cols}x{rows}",
         '-frames:v', '1', str(out)], stderr=subprocess.DEVNULL)
    print(out, f'（时间码从 {a} 秒起算）')
elif cmd == 'scenes':
    f = sys.argv[2]; a, b, th = opt('--from', 0.0, float), opt('--to', None, float), opt('--th', .3, float)
    c = ['ffmpeg', '-hide_banner', '-ss', str(a)] + (['-t', str(b - a)] if b else []) + ['-i', f, '-vf', f"scale=320:-2,select='gt(scene,{th})',showinfo", '-an', '-f', 'null', '-']
    err = subprocess.run(c, capture_output=True, text=True, errors='replace').stderr
    ts = [a + float(x.split('pts_time:')[1].split()[0]) for x in err.splitlines() if 'pts_time:' in x]
    print('切点：', ' '.join(f'{t:.2f}' for t in ts) or '（这段里没有切点，是一整个镜头）')
elif cmd == 'extract':
    cfg = json.loads(Path(sys.argv[2]).read_text('utf-8')); base = Path(sys.argv[2]).parent; out = base / cfg.get('out', 'film/assets/clips')
    only = sys.argv[3:]; counts = {}; fits = {}
    for name, spec in cfg['clips'].items():
        if only and name not in only: continue
        src, t, d = spec[:3]; o = dict(spec[3] if len(spec) > 3 else {})
        if '--interp' in sys.argv: o['interp'] = True
        srcp = base / src
        vf, meta, fb = fit_vf(srcp, o)
        dst = out / name; dst.mkdir(parents=True, exist_ok=True)
        for p in dst.glob('*.jpg'): p.unlink()
        ffextract(srcp, dst, vf, start=t, dur=d, fallback=fb)
        counts[name] = len(list(dst.glob('*.jpg')))
        if meta['fit'] != 'plain': fits[name] = meta
        print(name, counts[name], '帧', f"[fit:{meta['fit']} · 源 {meta['src'][0]}×{meta['src'][1]}]")
    merge_counts(out, counts, fits)
elif cmd == 'host':
    # 整条口播一键抽帧：竖屏自动「中间完整 + 两侧虚化」，帧数和画幅信息自动登记
    src = Path(sys.argv[2])
    film = Path(sys.argv[3]) if len(sys.argv) > 3 and not sys.argv[3].startswith('--') else Path('.')
    out = film / 'assets/clips/host'; out.mkdir(parents=True, exist_ok=True)
    for p in out.glob('*.jpg'): p.unlink()
    interp = '--interp' in sys.argv
    vf, meta, fb = fit_vf(src, {'fit': opt('--fit', 'auto'), 'interp': interp})
    ffextract(src, out, vf, dur=ffdur(src), fallback=fb)
    n = len(list(out.glob('*.jpg')))
    cp, fp = merge_counts(out.parent, {'host': n}, {'host': meta})
    print(f'host {n} 帧（{n / 30:.1f} 秒）→ {out}，源 {meta["src"][0]}×{meta["src"][1]}，fit:{meta["fit"]}'
          + ('，运动补偿插帧' if interp else ''))
    sfps = probe_fps(src)
    if sfps and abs(sfps - 30) > .01 and not interp:
        gap = 1 / abs(30 - sfps) if abs(30 - sfps) > .01 else 0
        print(f'源片 {sfps:g}fps → 帧序列 30fps：约每 {gap:.2f} 秒会有一帧和上一帧重复（快动作看着像顿一下）。'
              f'确实觉得顿就用 --interp 重抽一次（慢，抽完看一眼有没有拖影）。')
    if meta['fit'] == 'blur':
        print('竖屏口播已按「中间完整竖屏画面 + 两侧同源虚化」抽帧：人物和身体、环境都在，不会被裁成大特写。')
        print(f'faceY 按原片量：原片里脸的 y 乘 {meta["scale"]:.4f} 就是合成帧里的 y（host.js 会自动换算，直接写原片的值即可）。')
        print('挂墙 items / 抠像坐标按合成帧 1920×1080 写；要抠像请对 assets/clips/host 重跑 matte.py。')
    print(f'帧数已写进 {cp}，画幅信息在 {fp}。')
elif cmd == 'wave':
    import numpy as np
    f, a, b = sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(a), '-t', str(b - a), '-i', f, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.int16).astype(float) / 32768; w = 800
    for i in range(0, len(x) - w, w):
        s = x[i:i + w]; r = 20 * np.log10(np.sqrt((s ** 2).mean()) + 1e-9); p = 20 * np.log10(np.abs(s).max() + 1e-9)
        tag = '  数字静音' if r < -75 else '  爆音?' if p > -3 else ''
        print(f'{a + i / 16000:7.2f}  rms {r:6.1f}  pk {p:6.1f}  ' + '#' * max(0, int((r + 60) / 2)) + tag)
else:
    print(__doc__)
