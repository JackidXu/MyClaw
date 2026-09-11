/**
 * Ogg Opus 包装器
 *
 * 录音卡导出的音频数据为 80 字节/帧的裸 Opus 帧（采样率 16000Hz, 单声道, 20ms/帧, 码率 32kbps）。
 * 本模块严格对齐官方 Android SDK (d.a.class / d.f.class) 与 iOS SDK (OpusOggWrapper.swift) 的封装规范，
 * 将裸 Opus 音频流封装为符合 RFC 7845 标准的 Ogg Opus 文件（含 OpusHead、OpusTags 与 OggS 页面校验），
 * 供火山引擎 Doubao ASR（录音文件识别算子）及浏览器原生完美解码。
 */

// 标准 Ogg CRC32 查找表（多项式 0x04c11db7）
const OGG_CRC_TABLE = new Uint32Array(256);
(() => {
  for (let i = 0; i < 256; i++) {
    let r = (i << 24) >>> 0;
    for (let j = 0; j < 8; j++) {
      if ((r & 0x80000000) !== 0) {
        r = (((r << 1) ^ 0x04c11db7) >>> 0);
      } else {
        r = (r << 1) >>> 0;
      }
    }
    OGG_CRC_TABLE[i] = r >>> 0;
  }
})();

/** 计算 Ogg 页面 CRC32 校验码 */
function computeOggCrc(data: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    const byte = data[i]!;
    const idx = (((crc >>> 24) ^ byte) & 0xff) >>> 0;
    crc = (((crc << 8) ^ OGG_CRC_TABLE[idx]!) & 0xffffffff) >>> 0;
  }
  return crc >>> 0;
}

/** 生成 19 字节标准 OpusHead 头报文 (RFC 7845 Section 5.1) */
function createOpusHead(sampleRate = 16000, channels = 1): Uint8Array {
  const buf = new Uint8Array(19);
  const view = new DataView(buf.buffer);
  // 'OpusHead' (8 Bytes)
  buf.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0);
  // Version (1 Byte): 1
  buf[8] = 1;
  // Channels (1 Byte): 1
  buf[9] = channels;
  // Pre-skip (2 Bytes LE): 312 (对齐官方 SDK)
  view.setUint16(10, 312, true);
  // Input Sample Rate (4 Bytes LE): 16000
  view.setUint32(12, sampleRate, true);
  // Output Gain (2 Bytes LE): 0
  view.setInt16(16, 0, true);
  // Channel Mapping Family (1 Byte): 0 (单声道/立体声直接映射)
  buf[18] = 0;
  return buf;
}

/** 生成标准 OpusTags 注释头报文 (RFC 7845 Section 5.2) */
function createOpusTags(vendor = 'HeyClaw'): Uint8Array {
  const vendorBytes = new TextEncoder().encode(vendor);
  const totalLen = 8 + 4 + vendorBytes.length + 4;
  const buf = new Uint8Array(totalLen);
  const view = new DataView(buf.buffer);
  // 'OpusTags' (8 Bytes)
  buf.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0);
  // Vendor Length (4 Bytes LE)
  view.setUint32(8, vendorBytes.length, true);
  // Vendor String
  buf.set(vendorBytes, 12);
  // User Comment List Length (4 Bytes LE): 0
  view.setUint32(12 + vendorBytes.length, 0, true);
  return buf;
}

/** 构建一个完整的 OggS 页面 */
function buildOggPage(
  headerType: number, // 0x02 = BOS (头页), 0x00 = 常规页, 0x04 = EOS (尾页)
  granulePos: bigint, // 48kHz 样本基准累积位置
  serialNo: number,
  pageSeq: number,
  segments: Uint8Array[]
): Uint8Array {
  const segmentCount = segments.length;
  let payloadLength = 0;
  for (let i = 0; i < segmentCount; i++) {
    payloadLength += segments[i]!.length;
  }

  // OggS 头部大小：27 + segmentCount
  const headerSize = 27 + segmentCount;
  const pageSize = headerSize + payloadLength;
  const pageBuf = new Uint8Array(pageSize);
  const view = new DataView(pageBuf.buffer);

  // 1. 'OggS' 标识 (4 Bytes)
  pageBuf.set([0x4f, 0x67, 0x67, 0x53], 0);
  // 2. Stream structure version: 0
  pageBuf[4] = 0;
  // 3. Header type flag: BOS / 普通 / EOS
  pageBuf[5] = headerType;
  // 4. Granule Position (8 Bytes LE)
  view.setBigInt64(6, granulePos, true);
  // 5. Bitstream Serial Number (4 Bytes LE)
  view.setUint32(14, serialNo, true);
  // 6. Page Sequence Number (4 Bytes LE)
  view.setUint32(18, pageSeq, true);
  // 7. Page Checksum 预置 0 (4 Bytes LE)
  view.setUint32(22, 0, true);
  // 8. Number of page segments
  pageBuf[26] = segmentCount;

  // 9. Segment table
  let currentOffset = headerSize;
  for (let i = 0; i < segmentCount; i++) {
    const seg = segments[i]!;
    pageBuf[27 + i] = seg.length;
    pageBuf.set(seg, currentOffset);
    currentOffset += seg.length;
  }

  // 10. 计算全页 CRC32 并回填至偏移 22 处
  const checksum = computeOggCrc(pageBuf);
  view.setUint32(22, checksum, true);

  return pageBuf;
}

/**
 * 将录音卡裸 Opus 数据封装为标准 Ogg Opus 格式
 *
 * @param rawData 录音卡下载下来的原始音频字节流
 * @returns 具备合法 Ogg 容器头、支持直接播放与转写的标准 Ogg Opus 字节流
 */
export function wrapRawOpusToOgg(rawData: Uint8Array): Uint8Array {
  // 1. 检查是否已经带有 'OggS' 容器头（0x4F, 0x67, 0x67, 0x53）
  if (
    rawData.length >= 4 &&
    rawData[0] === 0x4f &&
    rawData[1] === 0x67 &&
    rawData[2] === 0x67 &&
    rawData[3] === 0x53
  ) {
    return rawData;
  }

  const FRAME_SIZE = 80; // 升迈录音卡硬件固定 80 字节/包 (16kHz, 20ms, 32kbps)
  const SAMPLES_PER_FRAME = 960n; // RFC 7845 规定 Ogg Opus 时间戳基准恒定为 48kHz (48000 * 0.02s = 960)
  const FRAMES_PER_PAGE = 48; // 每页约 48 帧 (~960ms 音频数据，对齐官方 SDK)

  // 截断非完整包尾数
  const validLength = Math.floor(rawData.length / FRAME_SIZE) * FRAME_SIZE;
  const frameCount = validLength / FRAME_SIZE;

  // 随机流序列号
  const serialNo = (Math.random() * 0xffffffff) >>> 0;
  const pages: Uint8Array[] = [];
  let pageSeq = 0;

  // Page 0: OpusHead (BOS, granule=0)
  const opusHeadPayload = createOpusHead(16000, 1);
  pages.push(buildOggPage(0x02, 0n, serialNo, pageSeq++, [opusHeadPayload]));

  // Page 1: OpusTags (常规页, granule=0)
  const opusTagsPayload = createOpusTags('HeyClaw');
  pages.push(buildOggPage(0x00, 0n, serialNo, pageSeq++, [opusTagsPayload]));

  // 数据页打包
  let currentGranule = 0n;
  for (let i = 0; i < frameCount; i += FRAMES_PER_PAGE) {
    const endFrame = Math.min(i + FRAMES_PER_PAGE, frameCount);
    const count = endFrame - i;
    const isLastPage = endFrame >= frameCount;

    const segments: Uint8Array[] = [];
    for (let f = 0; f < count; f++) {
      const offset = (i + f) * FRAME_SIZE;
      segments.push(rawData.subarray(offset, offset + FRAME_SIZE));
    }

    currentGranule += BigInt(count) * SAMPLES_PER_FRAME;
    const headerType = isLastPage ? 0x04 : 0x00; // EOS 标识
    pages.push(buildOggPage(headerType, currentGranule, serialNo, pageSeq++, segments));
  }

  // 合并所有 OggS 页面
  let totalBytes = 0;
  for (const page of pages) {
    totalBytes += page.length;
  }

  const result = new Uint8Array(totalBytes);
  let writePos = 0;
  for (const page of pages) {
    result.set(page, writePos);
    writePos += page.length;
  }

  return result;
}
