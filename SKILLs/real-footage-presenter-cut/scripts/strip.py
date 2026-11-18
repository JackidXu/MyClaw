# -*- coding: utf-8 -*-
"""连续帧拼图：python strip.py 视频 起秒 止秒 张数 输出.jpg [列数] [--w 480]
每格左上角标原片秒数（帧号精确 seek）。"""
import sys, numpy as np, cv2
if len(sys.argv) < 6: sys.exit(__doc__)
v, a, b, n, out = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
cols = int(sys.argv[6]) if len(sys.argv) > 6 and not sys.argv[6].startswith('--') else 4
w = int(sys.argv[sys.argv.index('--w') + 1]) if '--w' in sys.argv else 480
cap = cv2.VideoCapture(v); fps = cap.get(cv2.CAP_PROP_FPS)
ts = np.linspace(a, b, n); tiles = []
for t in ts:
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(round(t * fps))); ok, fr = cap.read()
    if not ok: fr = np.zeros((1080, 1920, 3), np.uint8)
    h = int(fr.shape[0] * w / fr.shape[1]); fr = cv2.resize(fr, (w, h), interpolation=cv2.INTER_AREA)
    cv2.rectangle(fr, (0, 0), (92, 22), (0, 0, 0), -1)
    cv2.putText(fr, f'{t:.2f}', (4, 17), cv2.FONT_HERSHEY_SIMPLEX, .55, (255, 255, 255), 1, cv2.LINE_AA)
    tiles.append(fr)
while len(tiles) % cols: tiles.append(np.zeros_like(tiles[0]))
rows = [np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)]
cv2.imwrite(out, np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 88])
