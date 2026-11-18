# -*- coding: utf-8 -*-
"""抠像后处理（要 opencv）：
  1. 只留人：二值化取连通块，丢掉细线、小块（台上的线、话筒架）；
  2. --cut-left 0.16 / --cut-right 0.2：把画面左/右这一条整列抹掉（贴着人的椅背这类连通块去不掉时用）；
  3. 算每帧头肩（人物上部三成五）的水平中心，平滑后写进 box.json 的 cx、头顶写进 top。
     放人时按这一帧的 cx 对齐，人在原片里走动，画面里他就钉在你要的位置（stage25d.js 的 cutP track）。
  python matte_clean.py 抠像目录 [--cut-left 0.16] [--cut-right 0.2]"""
import sys, glob, json, os, cv2, numpy as np
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
a = sys.argv; d = a[1]
opt = lambda k, v: float(a[a.index(k) + 1]) if k in a else v
cl, cr = opt('--cut-left', 0), opt('--cut-right', 0)
b = json.load(open(os.path.join(d, 'box.json'))); cx, top = [], []
for f in sorted(glob.glob(os.path.join(d, '*.png'))):
    im = cv2.imread(f, cv2.IMREAD_UNCHANGED); al = im[:, :, 3].astype(np.float32) / 255
    m = (al > .5).astype(np.uint8); k, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    if k > 2:
        big = st[1:, cv2.CC_STAT_AREA].max(); keep = np.zeros(k, bool)
        for j in range(1, k):
            ar, hh, ww = st[j, cv2.CC_STAT_AREA], st[j, cv2.CC_STAT_HEIGHT], st[j, cv2.CC_STAT_WIDTH]
            keep[j] = ar > .2 * big and ar / max(1, ww * hh) > .12 and min(ww, hh) > 30
        km = cv2.dilate(keep[lab].astype(np.uint8), np.ones((7, 7), np.uint8))
        al = al * cv2.GaussianBlur(km.astype(np.float32), (7, 7), 0)
    W = b['src_w'] * b['scale']
    for frac, left in ((cl, True), (cr, False)):
        if frac <= 0: continue
        c = int(W * frac) - b['x'] if left else int(W * (1 - frac)) - b['x']
        c = max(0, min(al.shape[1], c)); r = np.linspace(0, 1, 16)
        if left: al[:, :c] = 0; al[:, c:c + 16] *= r[:al[:, c:c + 16].shape[1]]
        else: al[:, c:] = 0; al[:, max(0, c - 16):c] *= r[::-1][:al[:, max(0, c - 16):c].shape[1]]
    im[:, :, 3] = (np.clip(al, 0, 1) * 255).astype(np.uint8); cv2.imwrite(f, im)
    rows = np.where(al.max(axis=1) > .5)[0]
    if len(rows) == 0: cx.append(cx[-1] if cx else b['x'] + al.shape[1] / 2); top.append(top[-1] if top else b['y']); continue
    y0, y1 = rows.min(), rows.max(); band = al[y0:y0 + max(1, int((y1 - y0) * .35))]; w = band.sum(axis=0)
    cx.append(float((np.arange(al.shape[1]) * w).sum() / max(1, w.sum())) + b['x']); top.append(float(y0 + b['y']))
sm = np.convolve(np.pad(cx, 4, mode='edge'), np.ones(9) / 9, 'valid')
b['cx'] = [round(float(v), 1) for v in sm]; b['top'] = [round(v, 1) for v in top]
json.dump(b, open(os.path.join(d, 'box.json'), 'w'))
print('ok', d, '头肩中心', round(min(sm)), '~', round(max(sm)))
