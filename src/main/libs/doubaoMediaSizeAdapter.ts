/**
 * 针对豆包 Seedream 系列模型（要求最低像素 3,686,400）的自适应尺寸加工算法
 * 严格保持大模型传入的原始宽高比（无论通过 size 还是 aspectRatio 传入），等比升档并对齐 32 步长
 */
export function adaptDoubaoSeedreamSize(args: { size?: unknown; aspectRatio?: unknown }): string {
  const MIN_PIXELS = 3_686_400; // 豆包 Seedream 最低像素要求 (1920x1920)
  const MAX_PIXELS = 4_194_304; // 豆包 Seedream 2K 常用上限 (2048x2048)
  const ALIGN_STEP = 32;        // 32 像素步长对齐，兼顾常见比例整除与扩散模型 VAE 编解码

  const rawSize = typeof args.size === 'string' ? args.size.trim() : '';
  const rawRatio = typeof args.aspectRatio === 'string' ? args.aspectRatio.trim() : '';

  let ratioW = 0;
  let ratioH = 0;

  // 1. 优先从 size 解析（例如 "768x1024", "1024x1024"）
  if (rawSize) {
    const match = rawSize.match(/^(\d+)[xX*:](\d+)$/);
    if (match) {
      const w = parseInt(match[1], 10);
      const h = parseInt(match[2], 10);
      if (w > 0 && h > 0) {
        const curPixels = w * h;
        // 如果原本就已经满足最低像素和最大像素限制，且为 16/32 的合理倍数，直接保留原样
        if (curPixels >= MIN_PIXELS && curPixels <= MAX_PIXELS && w % 16 === 0 && h % 16 === 0) {
          return `${w}x${h}`;
        }
        ratioW = w;
        ratioH = h;
      }
    }
  }

  // 2. 次选从 aspectRatio 解析（例如 "3:4", "16:9", "9:16", "1:1"）
  if ((!ratioW || !ratioH) && rawRatio) {
    const match = rawRatio.match(/^(\d+(?:\.\d+)?)[/:xX](\d+(?:\.\d+)?)$/);
    if (match) {
      const rw = parseFloat(match[1]);
      const rh = parseFloat(match[2]);
      if (rw > 0 && rh > 0) {
        ratioW = rw;
        ratioH = rh;
      }
    }
  }

  // 3. 缺省回退到标准 1:1
  if (!ratioW || !ratioH) {
    return '2048x2048';
  }

  // 4. 计算最大公约数简化整数比例（例如 768:1024 -> 3:4）
  function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b);
  }
  let baseW = ratioW;
  let baseH = ratioH;
  if (Number.isInteger(baseW) && Number.isInteger(baseH)) {
    const g = gcd(baseW, baseH);
    baseW /= g;
    baseH /= g;
  }

  // 5. 若为标准小整数比（如 3:4, 16:9, 1:1, 4:3, 9:16, 2:3），优先寻找比例严格不变且面积合格的倍数
  if (baseW <= 32 && baseH <= 32) {
    for (let m = 1; m < 5000; m++) {
      const w = baseW * m;
      const h = baseH * m;
      if (w % ALIGN_STEP === 0 && h % ALIGN_STEP === 0) {
        if (w * h >= MIN_PIXELS && w * h <= MAX_PIXELS + 200_000) {
          return `${w}x${h}`;
        }
      }
    }
  }

  // 6. 任意浮点/自定义比例几何缩放：令 W = ratioW * k, H = ratioH * k
  const idealK = Math.sqrt(MIN_PIXELS / (ratioW * ratioH));
  let wEst = Math.round((ratioW * idealK) / ALIGN_STEP) * ALIGN_STEP;
  let hEst = Math.round((ratioH * idealK) / ALIGN_STEP) * ALIGN_STEP;

  while (wEst * hEst < MIN_PIXELS) {
    if (wEst / ratioW <= hEst / ratioH) {
      wEst += ALIGN_STEP;
    } else {
      hEst += ALIGN_STEP;
    }
  }

  return `${wEst}x${hEst}`;
}
