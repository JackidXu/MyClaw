# -*- coding: utf-8 -*-
"""抠像去色边（要 opencv）：原片背景的颜色渗进了软边（比如会场的蓝幕），人一放到别的底上就是一圈蓝光，很廉价。
  1. 软边换色：边上的半透明像素改用离它最近的实心像素的颜色（从里往外推），背景色就不在了；
  2. 收边：alpha 往里收 choke 像素再羽化一点，去掉最外面那圈最脏的；比 --thin 细的部分（耳麦、发丝）不收，免得变成鬼影；
  3. 压溢色：整个人 B 通道不超过 max(R,G)+spill（蓝幕反到脸上、衣服上的那层蓝也压掉）。--spill-ch g 换成压绿。
不覆盖原图：写到 输出目录，box.json 一起拷过去。先看 --check 单帧，再全量跑。
  python matte_despill.py assets/cut/musk_a assets/cut/musk_a_dsp [--choke 2] [--feather 1.5] [--spill 6] [--spill-ch b] [--check 100]
看是不是这个问题：软边平均色和实心平均色差很多（musk_a：软边 40,45,124，实心 39,33,41）。"""
import sys, glob, json, os, shutil, cv2, numpy as np
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
a = sys.argv; src, dst = a[1], a[2]
opt = lambda k, v, f=float: f(a[a.index(k) + 1]) if k in a else v
CH, FE, SP, CK = opt('--choke', 2, int), opt('--feather', 1.5), opt('--spill', 6), opt('--check', 0, int)
TH = opt('--thin', 11, int)   # 比这个宽度（像素）细的部分不收边；0 = 全收
SC = {'b': 0, 'g': 1, 'r': 2}[opt('--spill-ch', 'b', str)]   # OpenCV 是 BGR


def fix(im):
    bgr = im[:, :, :3].astype(np.float32); al = im[:, :, 3].astype(np.float32) / 255; a0 = al.copy(); org = bgr.copy()
    # 细的东西（耳麦、发丝、话筒杆）：不换色、不收边，只压溢色。换色会被涂成旁边脸的颜色（发灰），收边会变成半透明的鬼影
    tw = np.zeros_like(al)
    if TH > 0:
        m = (a0 > .5).astype(np.uint8); k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (TH, TH))
        thick = cv2.dilate(cv2.morphologyEx(m, cv2.MORPH_OPEN, k), np.ones((5, 5), np.uint8))
        tw = np.clip(cv2.GaussianBlur(((a0 > .02) & (thick == 0)).astype(np.float32), (0, 0), 2) * 2, 0, 1)
    # 1. 软边换色：实心区域（alpha>0.95，再往里收 2 像素保险）的颜色往外推，用逐级模糊 + 归一化填满软边
    solid = cv2.erode((al > .95).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32)
    acc, w = bgr * solid[..., None], solid.copy(); out = bgr.copy(); need = (al > 0) & (al <= .95)
    for r in (3, 7, 15, 31, 63):
        A = cv2.GaussianBlur(acc, (0, 0), r); W = cv2.GaussianBlur(w, (0, 0), r)
        ok = need & (W > 1e-3); out[ok] = A[ok] / W[ok][:, None]; need &= ~ok
        if not need.any(): break
    edge = (al > 0) & (al <= .95); bgr[edge] = out[edge]
    bgr = bgr * (1 - tw[..., None]) + org * tw[..., None]
    # 2. 收边 + 羽化（细的部分保留原 alpha）
    if CH > 0: al = cv2.erode(al, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * CH + 1, 2 * CH + 1)))
    if FE > 0: al = cv2.GaussianBlur(al, (0, 0), FE)
    al = al * (1 - tw) + a0 * tw
    # 3. 压溢色
    oth = [c for c in range(3) if c != SC]; lim = np.maximum(bgr[:, :, oth[0]], bgr[:, :, oth[1]]) + SP
    bgr[:, :, SC] = np.minimum(bgr[:, :, SC], lim)
    return np.dstack([np.clip(bgr, 0, 255), np.clip(al * 255, 0, 255)]).astype(np.uint8)


def stats(im):
    al = im[:, :, 3]; e = (al > 25) & (al < 200); s = al > 240
    return im[e][:, :3][:, ::-1].mean(0).round(0), im[s][:, :3][:, ::-1].mean(0).round(0)


os.makedirs(dst, exist_ok=True)
fs = sorted(glob.glob(os.path.join(src, '*.png')))
if CK:
    f = fs[CK - 1]; im = cv2.imread(f, cv2.IMREAD_UNCHANGED); o = fix(im)
    print('改前 软边/实心 RGB', *stats(im)); print('改后 软边/实心 RGB', *stats(o))
    # 放在红底上对比（左改前，右改后），看边
    def on(x, c=(40, 40, 150)):
        bg = np.zeros_like(x[:, :, :3], np.float32); bg[:] = c; al = x[:, :, 3:4].astype(np.float32) / 255
        return (x[:, :, :3] * al + bg * (1 - al)).astype(np.uint8)
    cv2.imwrite(os.path.join(dst, '_check.jpg'), np.hstack([on(im), on(o)])); print('对比图', os.path.join(dst, '_check.jpg'))
    sys.exit()
for i, f in enumerate(fs):
    cv2.imwrite(os.path.join(dst, os.path.basename(f)), fix(cv2.imread(f, cv2.IMREAD_UNCHANGED)))
    if i % 50 == 0: print(i, '/', len(fs))
shutil.copy(os.path.join(src, 'box.json'), os.path.join(dst, 'box.json'))
print('done', len(fs), '帧 →', dst)
