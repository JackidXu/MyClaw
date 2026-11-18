# -*- coding: utf-8 -*-
"""镜头运动自检：逐帧光流量"画面死不死、平不平"，和参考片的 B-roll 区间比。
  python motion_check.py 片子.mp4 [另一版.mp4 ...] [--top 0.8] [--from 0 --to 999]
每帧：ffmpeg 解成 320 宽灰度（只看上面 80%，避开字幕）→ Farneback 光流 → 拟合整体平移/缩放；
拟合不了的那部分（残差）= 各处动得不一样（前后层视差、画里有东西在演）。
指标解释和参考值见 references/motion.md「量化目标」。数字过了不等于好看，没过一定有问题。"""
import sys, subprocess, numpy as np, cv2
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
a = sys.argv
vids = [x for x in a[1:] if not x.startswith('--') and not x.replace('.', '').isdigit()]
if not vids: sys.exit(__doc__)
opt = lambda k, d: float(a[a.index(k) + 1]) if k in a else d
TOP, T0, T1 = opt('--top', .8), opt('--from', 0), opt('--to', 1e9)
REF = {  # 三条参考片去掉整屏主持人后的 B-roll
 'still': (.149, .287, '画面完全不动的时间'), 'hold2': (.64, 1.0, '定住超过 2 秒（次/分）'), 'cam': (.213, .271, '镜头在动的时间'),
 'layer': (.09, .123, '有前后层的镜头运动'), 'nonuni': (.52, .62, '镜头动时各处动得不一样'), 'pushpull': (1.3, 2.9, '往里推 : 往外拉'),
 'zoom': (2.8, 3.6, '慢漂速度（缩放 %/秒）'), 'p75': (2.37, 3.03, '一镜时长 75 分位（秒）'), 'cutmin': (25.6, 32.3, '每分钟切点'),
}
def measure(src):
    W, H = 320, 180; h = int(H * TOP)
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-ss', str(T0), '-i', src] + (['-t', str(T1 - T0)] if T1 < 1e8 else []) +
                         ['-vf', f'scale={W}:{H},format=gray', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
    ys, xs = np.mgrid[6:h - 6:8, 6:W - 6:8]; X = (xs - W / 2).ravel().astype(np.float32); Y = (ys - h / 2).ravel().astype(np.float32)
    A = np.zeros((2 * len(X), 4), np.float32); A[0::2, 0] = X; A[0::2, 1] = -Y; A[0::2, 2] = 1; A[1::2, 0] = Y; A[1::2, 1] = X; A[1::2, 3] = 1
    rows = []; prev = None
    while True:
        b = p.stdout.read(W * H)
        if len(b) < W * H: break
        g = np.frombuffer(b, np.uint8).reshape(H, W)[:h]
        if prev is not None:
            diff = float(np.abs(g.astype(np.int16) - prev).mean())
            fl = cv2.calcOpticalFlowFarneback(prev, g, None, .5, 3, 15, 3, 5, 1.2, 0)
            u = fl[ys, xs, 0].ravel(); v = fl[ys, xs, 1].ravel()
            tex = np.hypot(cv2.Sobel(prev, cv2.CV_32F, 1, 0), cv2.Sobel(prev, cv2.CV_32F, 0, 1))[ys, xs].ravel() > 20
            mag = float(np.hypot(u, v)[tex].mean()) if tex.sum() > 20 else 0.
            if tex.sum() > 30:
                idx = np.where(tex)[0]; Ai = A.reshape(-1, 2, 4)[idx].reshape(-1, 4); bi = np.stack([u[idx], v[idx]], 1).ravel()
                Af, bf = Ai, bi
                for _ in range(3):
                    sol, *_ = np.linalg.lstsq(Ai, bi, rcond=None); rn = np.hypot(*(Ai @ sol - bi).reshape(-1, 2).T)
                    keep = rn < max(.3, np.percentile(rn, 70) * 2)
                    if keep.all(): break
                    Ai = Ai.reshape(-1, 2, 4)[keep].reshape(-1, 4); bi = bi.reshape(-1, 2)[keep].ravel()
                rn = np.hypot(*(Af @ sol - bf).reshape(-1, 2).T); res = float(rn.mean()); fit = float((rn < .5).mean()); z, _, tx, ty = sol
            else: z = tx = ty = res = 0.; fit = 1.
            rows.append((diff, z, np.hypot(tx, ty) * 6, mag, res, fit))
        prev = g.copy()
    r = np.array(rows); n = len(r); fps = 30
    diff, zoom, tr, mag, res, fit = r.T
    cut = np.zeros(n, bool); last = -9
    for i in range(n):
        nb = np.median(np.r_[diff[max(0, i - 6):i], diff[i + 1:i + 7]])
        if diff[i] > 6 and diff[i] > 3 * nb + 2 and fit[i] < .7 and i - last > 4: cut[i] = True; last = i
    cam = (fit > .5) & ~cut & ((np.abs(zoom) > .0007) | (tr > 1.2)); still = (mag < .04) & ~cut
    def runs(m):
        o = []; s = None
        for i, x in enumerate(np.r_[m, False]):
            if x and s is None: s = i
            if not x and s is not None: o.append((i - s) / fps); s = None
        return np.array(o)
    b = np.r_[0, np.where(cut)[0], n]; seg = np.diff(b) / fps; seg = seg[seg > .1]
    holds = runs(still); mins = n / fps / 60
    zin, zout = ((zoom > .0007) & cam).sum(), ((zoom < -.0007) & cam).sum()
    return {'still': still.mean(), 'hold2': (holds > 2).sum() / mins, 'cam': cam.mean(), 'layer': (cam & (res > .25)).mean(),
            'nonuni': float(np.median(res[cam] / np.maximum(mag[cam], 1e-3))) if cam.any() else 0, 'pushpull': zin / max(1, zout),
            'zoom': float(np.median(np.abs(zoom[cam]))) * fps * 100 if cam.any() else 0, 'p75': float(np.percentile(seg, 75)), 'cutmin': cut.sum() / mins,
            '_holds': sorted([(round(float(x), 1)) for x in holds if x > 2])}
res = {v: measure(v) for v in vids}
print('指标'.ljust(22), '参考片区间'.rjust(14), *[(v[-24:]).rjust(26) for v in vids])
for k, (lo, hi, name) in REF.items():
    cells = []
    for v in vids:
        x = res[v][k]; bad = (k in ('still', 'hold2', 'p75') and x > hi * 1.15) or (k in ('cam', 'layer', 'nonuni', 'pushpull') and x < lo * .85)
        cells.append((f'{x:.3f}' + (' ✗' if bad else '  ')).rjust(26))
    print(name.ljust(18), f'{lo:g}–{hi:g}'.rjust(14), *cells)
for v in vids:
    if res[v]['_holds']: print(v[-30:], '定住超过 2 秒的段（秒）:', res[v]['_holds'])
