/**
 * 音频时长解析与格式化工具
 */

/**
 * 格式化音频秒数 (mm:ss 或 hh:mm:ss)
 */
export function formatAudioDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(rem)}`;
  }
  return `${pad(m)}:${pad(rem)}`;
}

/**
 * 从 File 或 Blob 中解析音频时长（秒）
 * 采用 Audio 标签 metadata + AudioContext 双重解析，兼容绝大多数常见音频格式
 */
export async function getAudioBlobDuration(blob: Blob): Promise<number> {
  // 1. 优先通过 Audio 元素快速读取 metadata
  const audioDuration = await new Promise<number>(resolve => {
    try {
      const url = URL.createObjectURL(blob);
      const audio = new Audio();
      audio.preload = 'metadata';

      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        resolve(0);
      }, 2500);

      audio.onloadedmetadata = () => {
        clearTimeout(timer);
        const d = audio.duration;
        URL.revokeObjectURL(url);
        if (Number.isFinite(d) && d > 0) {
          resolve(d);
        } else {
          resolve(0);
        }
      };

      audio.onerror = () => {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
        resolve(0);
      };

      audio.src = url;
    } catch {
      resolve(0);
    }
  });

  if (audioDuration > 0) {
    return audioDuration;
  }

  // 2. 若 Audio 标签未能成功解析（如部分流式格式），回退使用 Web AudioContext decodeAudioData
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      const ctx = new AudioContextClass();
      const arrayBuf = await blob.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
      const dur = decoded.duration;
      void ctx.close();
      if (Number.isFinite(dur) && dur > 0) {
        return dur;
      }
    }
  } catch (err) {
    console.debug('[getAudioBlobDuration] AudioContext decode fallback failed:', err);
  }

  return 0;
}
