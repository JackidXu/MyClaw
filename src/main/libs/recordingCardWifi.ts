/**
 * 录音卡 Wi-Fi TCP Socket 通信服务（升迈 T240/M2 协议）
 *
 * 协议文档：设备对接协议文档.md
 * 设备 IP：192.168.1.1  端口：32769
 * 帧格式：[头 14B "MeChoWifiStart"][CMD_L][CMD_H][排序L][排序H][帧长 4B LE][CRCL][CRCH][data][尾 12B "MeChoWifiEnd"]
 */
import { WebContents } from 'electron';
import * as net from 'net';

import {
  type DownloadInterruptedData,
  type DownloadProgressData,
  RecordingCardWifiIpc,
} from '../../shared/recordingCard/constants';

// ─────────────────────────────────────────────
// 协议常量
// ─────────────────────────────────────────────
const WIFI_HEADER = Buffer.from('MeChoWifiStart');  // 14 字节
const WIFI_FOOTER = Buffer.from('MeChoWifiEnd');    // 12 字节
const FRAME_OVERHEAD = 14 + 2 + 2 + 4 + 2 + 12;   // 头 + CMD(2) + 排序(2) + 帧长(4) + CRC(2) + 尾 = 36B

const DEVICE_IP = '192.168.1.1';
const DEVICE_PORT = 32769;
const CONNECT_TIMEOUT_MS = 15_000;
const CMD_TIMEOUT_MS = 8_000;
const SOCKET_READY_TIMEOUT_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 3_000;
const DOWNLOAD_IDLE_TIMEOUT_MS = 15_000;

// ─────────────────────────────────────────────
// 对外暴露的类型
// ─────────────────────────────────────────────
export interface WifiAudioFile {
  file: string;
  size: number;
  creat_time: number;
  duration_ms: number;
  index: number;
}

interface WifiFrame {
  cmdL: number;
  cmdH: number;
  seq: number;
  data: Buffer;
  crcL: number;
  crcH: number;
}

// ─────────────────────────────────────────────
// CRC-16（严格对齐协议文档第一章第1节 C 语言无查表位运算实现）
// ─────────────────────────────────────────────
function crc16compute(data: Buffer, initCrc = 0xffff): number {
  let crc = initCrc & 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc = ((crc >> 8) & 0xff) | ((crc << 8) & 0xffff);
    crc = (crc ^ data[i]!) & 0xffff;
    crc = (crc ^ (((crc & 0xff) >> 4) & 0xff)) & 0xffff;
    crc = (crc ^ ((crc << 12) & 0xffff)) & 0xffff;
    crc = (crc ^ (((crc & 0xff) << 5) & 0xffff)) & 0xffff;
  }
  return crc & 0xffff;
}

// ─────────────────────────────────────────────
// 帧构造
// ─────────────────────────────────────────────

/**
 * 构造 Wi-Fi 控制命令帧（无需排序/CRC 的简单命令）
 * 协议说明（第1章第3节）：帧长字段为 data 长度（4Bytes，小端）。无 data 时帧长填 0。
 */
function buildControlFrame(cmdL: number, cmdH: number, data?: Buffer): Buffer {
  const dataLen = data ? data.length : 0;
  const frameLen = FRAME_OVERHEAD + dataLen;
  const buf = Buffer.alloc(frameLen, 0);

  WIFI_HEADER.copy(buf, 0);
  buf[14] = cmdL;
  buf[15] = cmdH;
  // 排序(16-17) = 0
  buf.writeUInt16LE(0, 16);
  // 帧长(18-21) = data 长度 (4Bytes 小端，文档第54行明确定义)
  buf.writeUInt32LE(dataLen, 18);
  // CRCL(22) = 0, CRCH(23) = 0
  if (data && dataLen > 0) {
    data.copy(buf, 24);
  }
  WIFI_FOOTER.copy(buf, 24 + dataLen);
  return buf;
}

/**
 * 构造 Wi-Fi 数据帧（含排序和 CRC）
 * 协议说明（第1章第3节）：帧长字段为 data 长度（4Bytes，小端），CRC 字段为 data 的 crc16
 */
function buildDataFrame(cmdL: number, cmdH: number, seq: number, data: Buffer): Buffer {
  const dataLen = data.length;
  const frameLen = FRAME_OVERHEAD + dataLen;
  const buf = Buffer.alloc(frameLen, 0);

  WIFI_HEADER.copy(buf, 0);
  buf[14] = cmdL;
  buf[15] = cmdH;
  buf.writeUInt16LE(seq, 16);
  // 帧长(18-21) = data 长度 (4Bytes 小端，文档第54行明确定义)
  buf.writeUInt32LE(dataLen, 18);
  const crc = crc16compute(data);
  buf[22] = crc & 0xff;
  buf[23] = (crc >> 8) & 0xff;
  data.copy(buf, 24);
  WIFI_FOOTER.copy(buf, 24 + dataLen);
  return buf;
}

// ─────────────────────────────────────────────
// 帧解析（从流式 TCP 数据中提取完整帧）
// ─────────────────────────────────────────────
function parseWifiFrames(buf: Buffer): { frames: WifiFrame[]; remainder: Buffer } {
  const frames: WifiFrame[] = [];
  let offset = 0;

  while (offset < buf.length) {
    // 兼容文档第二章第24节例中的 3 字节裸就绪包：0x01 0x0C 0x00
    if (
      offset + 3 <= buf.length &&
      buf[offset] === 0x01 &&
      buf[offset + 1] === 0x0c &&
      buf[offset + 2] === 0x00
    ) {
      frames.push({
        cmdL: 0x0c,
        cmdH: 0x00,
        seq: 0,
        data: Buffer.alloc(0),
        crcL: 0,
        crcH: 0,
      });
      offset += 3;
      continue;
    }

    // 查找 Wi-Fi 协议帧头 "MeChoWifiStart"
    const headerIdx = buf.indexOf(WIFI_HEADER, offset);
    if (headerIdx === -1) break;

    // 至少需要有头 + CMD(2) + 排序(2) + 帧长(4) + CRC(2) = 24B
    if (headerIdx + 24 > buf.length) {
      offset = headerIdx;
      break;
    }

    const cmdL = buf[headerIdx + 14]!;
    const cmdH = buf[headerIdx + 15]!;
    const seq = buf.readUInt16LE(headerIdx + 16);
    // 协议第一章第3节定义：帧长即为 data 长度（4Bytes，小端）
    const dataLen = buf.readUInt32LE(headerIdx + 18);
    const crcL = buf[headerIdx + 22]!;
    const crcH = buf[headerIdx + 23]!;

    const totalFrameLen = 14 + 2 + 2 + 4 + 2 + dataLen + 12;

    if (headerIdx + totalFrameLen > buf.length) {
      offset = headerIdx;
      break;
    }

    // 验证尾部
    const footerStart = headerIdx + 14 + 2 + 2 + 4 + 2 + dataLen;
    if (!buf.slice(footerStart, footerStart + 12).equals(WIFI_FOOTER)) {
      // 尾部不匹配，跳过这个头继续搜索
      offset = headerIdx + 1;
      continue;
    }

    const data = dataLen > 0 ? buf.slice(headerIdx + 24, headerIdx + 24 + dataLen) : Buffer.alloc(0);
    frames.push({ cmdL, cmdH, seq, data, crcL, crcH });
    offset = footerStart + 12;
  }

  return { frames, remainder: buf.slice(offset) };
}

// ─────────────────────────────────────────────
// RecordingCardWifiManager
// ─────────────────────────────────────────────
export class RecordingCardWifiManager {
  private socket: net.Socket | null = null;
  private recvBuf: Buffer = Buffer.alloc(0);
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private frameHandlers: ((frame: WifiFrame) => void)[] = [];

  // 断点续传状态
  private currentDownloadFilename: string | null = null;
  private lastFrameIndex = -1;
  private lastFrameCrc = 0;
  private downloadResolve: ((buf: Buffer) => void) | null = null;
  private downloadReject: ((err: Error) => void) | null = null;
  private downloadChunks: Buffer[] = [];
  private isSyncing = false;

  /**
   * 通知录音卡进入音频同步状态 (CMD: 0x74 0x00 [0x01])
   * 协议文档第756行规范：在正式开始同步设备端音频前，必须先下发该指令通知设备端进入音频同步状态
   */
  async startSync(): Promise<void> {
    if (this.isSyncing) return;
    console.log('[RecordingCardWifi] 正在通知录音卡进入音频同步状态 (0x74 0x00 [0x01])...');
    await this.sendCommand(0x74, 0x00, Buffer.from([0x01]));
    this.isSyncing = true;
    console.log('[RecordingCardWifi] <<< 录音卡已成功进入音频同步状态');
  }

  /** 连接 TCP Socket */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[RecordingCardWifi] 正在连接录音卡 TCP Socket (${DEVICE_IP}:${DEVICE_PORT})...`);
      const sock = new net.Socket();
      const timer = setTimeout(() => {
        sock.destroy();
        console.warn(`[RecordingCardWifi] TCP 连接超时 (${CONNECT_TIMEOUT_MS}ms)`);
        reject(new Error(`[WifiManager] 连接超时 (${CONNECT_TIMEOUT_MS}ms)，请确认已连接录音卡 Wi-Fi 热点`));
      }, CONNECT_TIMEOUT_MS);

      sock.connect(DEVICE_PORT, DEVICE_IP, () => {
        clearTimeout(timer);
        this.socket = sock;
        console.log(`[RecordingCardWifi] TCP Socket 连接建立成功！等待设备上报就绪信号 (0x0C 0x00)...`);
        resolve();
      });

      sock.on('data', (chunk: Buffer) => {
        this.recvBuf = Buffer.concat([this.recvBuf, chunk]);
        const { frames, remainder } = parseWifiFrames(this.recvBuf);
        this.recvBuf = remainder;
        for (const frame of frames) {
          this.dispatchFrame(frame);
        }
      });

      sock.on('error', (err: Error) => {
        clearTimeout(timer);
        console.warn('[RecordingCardWifi] Socket 错误:', err.message);
        this.handleSocketClose();
        reject(err);
      });

      sock.on('close', () => {
        console.log('[RecordingCardWifi] Socket 连接已关闭');
        this.handleSocketClose();
      });
    });
  }

  /** 等待设备主动上报 Socket 就绪信号 0x01 0x0C 0x00 */
  waitSocketReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        console.warn(`[RecordingCardWifi] 等待 Socket 就绪超时 (${SOCKET_READY_TIMEOUT_MS}ms)`);
        reject(new Error(`[WifiManager] 等待 Socket 就绪超时 (${SOCKET_READY_TIMEOUT_MS}ms)`));
      }, SOCKET_READY_TIMEOUT_MS);

      const handler = (frame: WifiFrame) => {
        // 就绪信号：CMD=0x0C 0x00
        if (frame.cmdL === 0x0c && frame.cmdH === 0x00) {
          clearTimeout(timer);
          const idx = this.frameHandlers.indexOf(handler);
          if (idx !== -1) this.frameHandlers.splice(idx, 1);
          console.log('[RecordingCardWifi] 收到设备 Socket 就绪信号 (CMD: 0x0C 0x00)！');
          resolve();
        }
      };
      this.frameHandlers.push(handler);
    });
  }

  /** 启动心跳（每 3s 发一次 0xFF 0x00，单向，设备不回复） */
  startHeartbeat(): void {
    this.stopHeartbeat();
    console.log(`[RecordingCardWifi] 启动 3 秒心跳保活机制 (CMD: 0xFF 0x00)...`);
    this.heartbeatTimer = setInterval(() => {
      if (this.socket && !this.socket.destroyed) {
        const frame = buildControlFrame(0xff, 0x00);
        this.socket.write(frame);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  /** 停止心跳 */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      console.log('[RecordingCardWifi] 心跳已停止');
    }
  }

  /** 发送 Wi-Fi 控制命令并等待回复 */
  private sendCommand(
    cmdL: number,
    cmdH: number,
    data?: Buffer,
    timeoutMs = CMD_TIMEOUT_MS
  ): Promise<WifiFrame> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) {
        reject(new Error('[WifiManager] Socket 未连接'));
        return;
      }

      const hexCmd = `0x${cmdL.toString(16).padStart(2, '0')} 0x${cmdH.toString(16).padStart(2, '0')}`;
      console.log(`[RecordingCardWifi] >>> 发送 Wi-Fi 命令: ${hexCmd}, 数据长度: ${data?.length ?? 0}`);

      const timer = setTimeout(() => {
        const idx = this.frameHandlers.indexOf(handler);
        if (idx !== -1) this.frameHandlers.splice(idx, 1);
        console.warn(`[RecordingCardWifi] 命令 ${hexCmd} 响应超时`);
        reject(new Error(`[WifiManager] 命令 ${hexCmd} 响应超时`));
      }, timeoutMs);

      const handler = (frame: WifiFrame) => {
        if (frame.cmdL === cmdL && frame.cmdH === cmdH) {
          clearTimeout(timer);
          const idx = this.frameHandlers.indexOf(handler);
          if (idx !== -1) this.frameHandlers.splice(idx, 1);
          console.log(`[RecordingCardWifi] <<< 收到命令 ${hexCmd} 响应，数据长度: ${frame.data.length}`);
          resolve(frame);
        }
      };
      this.frameHandlers.push(handler);

      const frame = buildControlFrame(cmdL, cmdH, data);
      this.socket.write(frame);
    });
  }

  /** 分发收到的帧给所有 handler */
  private dispatchFrame(frame: WifiFrame): void {
    // 处理文件数据帧（CMD=0x1C 0x00）：先记录数据与帧序号，确保 progressHandler 能读取到最新字节统计
    if (frame.cmdL === 0x1c && frame.cmdH === 0x00 && this.downloadResolve) {
      this.downloadChunks.push(frame.data);
      this.lastFrameIndex = frame.seq;
      this.lastFrameCrc = (frame.crcH << 8) | frame.crcL;
    }

    // 再交给等待 handler（如 progressHandler）
    const handlers = [...this.frameHandlers];
    for (const h of handlers) {
      h(frame);
    }

    // 处理文件传输完成帧（CMD=0x1D 0x00）
    if (frame.cmdL === 0x1d && frame.cmdH === 0x00 && this.downloadResolve) {
      const totalLen = this.downloadChunks.reduce((acc, c) => acc + c.length, 0);
      console.log(`[RecordingCardWifi] <<< 收到文件传输完成帧 (0x1D 0x00)！总接收字节: ${totalLen}`);
      const merged = Buffer.concat(this.downloadChunks, totalLen);
      const resolve = this.downloadResolve;
      this.downloadResolve = null;
      this.downloadReject = null;
      this.downloadChunks = [];
      this.currentDownloadFilename = null;
      resolve(merged);
    }
  }

  /** 获取文件列表 */
  async getFileList(): Promise<WifiAudioFile[]> {
    console.log('[RecordingCardWifi] 正在开始同步并获取文件列表...');
    // 1. 确保进入音频同步状态 (0x74 0x00 [0x01])
    await this.startSync();
    // 2. 获取文件列表
    const listFrame = await this.sendCommand(0x1b, 0x00);
    // Wi-Fi 模式下设备返回单个 JSON，包含 FileNum 和 AudioFileArray
    try {
      const jsonStr = listFrame.data.toString('utf8');
      console.log('[RecordingCardWifi] 文件列表原始 JSON:', jsonStr);
      const parsed = JSON.parse(jsonStr);
      if (parsed.AudioFileArray && Array.isArray(parsed.AudioFileArray)) {
        console.log(`[RecordingCardWifi] 成功解析录音文件列表，共 ${parsed.AudioFileArray.length} 个文件`);
        return parsed.AudioFileArray as WifiAudioFile[];
      }
      // 设备繁忙时返回错误 JSON
      if (parsed.AudioFileList === 'MemoryBusy') {
        throw new Error('[WifiManager] 设备正在扫盘，请稍后再试');
      }
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error('[WifiManager] 文件列表 JSON 解析失败');
      }
      throw err;
    }
    return [];
  }

  /**
   * 下载单个文件
   * 内部自动处理断点续传：Socket 断开时记录断点，重连后调用 resumeDownload 继续
   */
  async downloadFile(
    filename: string,
    onProgress: (data: DownloadProgressData) => void,
    webContents?: WebContents
  ): Promise<Buffer> {
    console.log(`[RecordingCardWifi] >>> 开始下载录音文件: ${filename}...`);
    // 核心前置：严格遵循协议第756行，下载前确保通知录音卡进入音频同步状态 (0x74 0x00 [0x01])
    await this.startSync();

    this.currentDownloadFilename = filename;
    this.lastFrameIndex = -1;
    this.lastFrameCrc = 0;
    this.downloadChunks = [];

    return new Promise((resolve, reject) => {
      this.downloadResolve = resolve;
      this.downloadReject = reject;

      // 空闲超时检测
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          console.warn(`[RecordingCardWifi] 文件 ${filename} 传输空闲超时`);
          reject(new Error('[WifiManager] 文件传输空闲超时'));
        }, DOWNLOAD_IDLE_TIMEOUT_MS);
      };

      // 清理定时器与进度 handler
      const cleanup = () => {
        if (idleTimer) {
          clearTimeout(idleTimer);
          idleTimer = null;
        }
        const idx = this.frameHandlers.indexOf(progressHandler);
        if (idx !== -1) this.frameHandlers.splice(idx, 1);
      };

      this.downloadResolve = (buf: Buffer) => {
        cleanup();
        resolve(buf);
      };
      this.downloadReject = (err: Error) => {
        cleanup();
        reject(err);
      };

      // 监听数据帧进度
      const progressHandler = (frame: WifiFrame) => {
        if (frame.cmdL === 0x1c && frame.cmdH === 0x00) {
          resetIdleTimer();
          const receivedBytes = this.downloadChunks.reduce((acc, c) => acc + c.length, 0);
          onProgress({ filename, receivedBytes, frameIndex: frame.seq });
          webContents?.send(RecordingCardWifiIpc.DownloadProgress, {
            filename,
            receivedBytes,
            frameIndex: frame.seq,
          } satisfies DownloadProgressData);
        }
        if (frame.cmdL === 0x1d && frame.cmdH === 0x00) {
          cleanup();
        }
      };
      this.frameHandlers.push(progressHandler);

      // 发送同步文件命令
      const filenameBytes = Buffer.from(filename, 'utf8');
      const frame = buildDataFrame(0x1c, 0x00, 0, filenameBytes);
      if (this.socket && !this.socket.destroyed) {
        this.socket.write(frame);
        resetIdleTimer();
      } else {
        cleanup();
        reject(new Error('[WifiManager] Socket 未连接'));
      }
    });
  }

  /**
   * 断点续传（Socket 重连后调用）
   * 设备从 lastFrameIndex+1 处继续返回数据
   */
  async resumeDownload(
    filename: string,
    lastFrameIndex: number,
    lastFrameCrc: number,
    onProgress: (data: DownloadProgressData) => void,
    webContents?: WebContents
  ): Promise<Buffer> {
    this.currentDownloadFilename = filename;
    this.lastFrameIndex = lastFrameIndex;
    this.lastFrameCrc = lastFrameCrc;
    this.downloadChunks = [];

    const resumeJson = JSON.stringify({
      file: filename,
      index: lastFrameIndex,
      crc: lastFrameCrc,
    });
    const jsonBytes = Buffer.from(resumeJson, 'utf8');

    return new Promise((resolve, reject) => {
      this.downloadResolve = resolve;
      this.downloadReject = reject;

      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          reject(new Error('[WifiManager] 断点续传空闲超时'));
        }, DOWNLOAD_IDLE_TIMEOUT_MS);
      };

      // 先等待设备确认断点（返回 0x01 = 成功）
      const confirmHandler = (frame: WifiFrame) => {
        if (frame.cmdL === 0x78 && frame.cmdH === 0x00) {
          const idx = this.frameHandlers.indexOf(confirmHandler);
          if (idx !== -1) this.frameHandlers.splice(idx, 1);
          if (frame.data[0] !== 0x01) {
            reject(new Error('[WifiManager] 断点续传确认失败，请检查文件名或帧索引'));
            return;
          }
          resetIdleTimer();
          // 监听后续数据帧
          const progressHandler = (f: WifiFrame) => {
            if (f.cmdL === 0x1c && f.cmdH === 0x00) {
              resetIdleTimer();
              const receivedBytes = this.downloadChunks.reduce((acc, c) => acc + c.length, 0);
              onProgress({ filename, receivedBytes, frameIndex: f.seq });
              webContents?.send(RecordingCardWifiIpc.DownloadProgress, {
                filename,
                receivedBytes,
                frameIndex: f.seq,
              } satisfies DownloadProgressData);
            }
            if (f.cmdL === 0x1d && f.cmdH === 0x00) {
              if (idleTimer) clearTimeout(idleTimer);
              const pidx = this.frameHandlers.indexOf(progressHandler);
              if (pidx !== -1) this.frameHandlers.splice(pidx, 1);
            }
          };
          this.frameHandlers.push(progressHandler);
        }
      };
      this.frameHandlers.push(confirmHandler);

      const frame = buildDataFrame(0x78, 0x00, 0, jsonBytes);
      if (this.socket && !this.socket.destroyed) {
        this.socket.write(frame);
      } else {
        reject(new Error('[WifiManager] Socket 未连接'));
      }
    });
  }

  /** 当主 Socket 已断开时，尝试建立一次性轻量连接发送 0x0B 0x00 强制关闭录音卡 Wi-Fi */
  async forceCloseDeviceWifiOverSocket(timeoutMs = 1500): Promise<void> {
    return new Promise((resolve) => {
      const sock = new net.Socket();
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          sock.removeAllListeners();
          sock.destroy();
          resolve();
        }
      };

      sock.setTimeout(timeoutMs);
      sock.once('error', finish);
      sock.once('timeout', finish);
      sock.once('connect', () => {
        try {
          // 1. 先发退出音频同步状态指令 0x74 0x00 [0x00]，激活硬件内置的 13 秒看门狗自动关 Wi-Fi 开启 BLE
          const exitSyncFrame = buildControlFrame(0x74, 0x00, Buffer.from([0x00]));
          sock.write(exitSyncFrame);
          // 2. 紧接着发送主动关闭 Wi-Fi 0x0B 0x00
          const closeWifiFrame = buildControlFrame(0x0b, 0x00);
          sock.write(closeWifiFrame, () => {
            setTimeout(finish, 200);
          });
        } catch {
          finish();
        }
      });

      try {
        sock.connect(DEVICE_PORT, DEVICE_IP);
      } catch {
        finish();
      }
    });
  }

  /** 结束同步（发退出同步状态 0x74 0x00 [0x00] + 关闭 Wi-Fi 0x0B 0x00） */
  async endSync(webContents?: WebContents): Promise<void> {
    console.log('[RecordingCardWifi] >>> 正在退出音频同步模式并关闭设备 Wi-Fi...');
    this.isSyncing = false;
    if (this.socket && !this.socket.destroyed) {
      try {
        // 1. 发送退出同步状态指令 (置 0，超时设为 2000ms 避免卡死)
        await this.sendCommand(0x74, 0x00, Buffer.from([0x00]), 2000);
        console.log('[RecordingCardWifi] <<< 录音卡已退出音频同步模式 (0x74 0x00 [0x00])');
      } catch (e: any) {
        console.warn('[RecordingCardWifi] 退出音频同步模式命令超时或未响应，继续关 Wi-Fi:', e?.message);
      }
      try {
        // 2. 发送关闭 Wi-Fi 指令 (超时设为 2000ms 避免设备提前关 Wi-Fi 导致假死)
        await this.sendCommand(0x0b, 0x00, undefined, 2000);
        console.log('[RecordingCardWifi] <<< 录音卡已关闭 Wi-Fi (0x0B 0x00)');
      } catch (e: any) {
        console.warn('[RecordingCardWifi] 关闭 Wi-Fi 命令超时或未响应，继续断开 Socket:', e?.message);
      }
    } else {
      // 若主 Socket 已经意外断开，尝试轻量短连接补发关闭 Wi-Fi 命令
      await this.forceCloseDeviceWifiOverSocket().catch(() => {});
    }
    this.disconnect(webContents);
  }

  /** Socket 关闭处理（触发断点续传通知） */
  private handleSocketClose(): void {
    this.stopHeartbeat();
    this.isSyncing = false;
    // 如果正在下载且连接断开，立即响应报错，避免空等 15 秒空闲超时
    if (this.downloadReject) {
      const reject = this.downloadReject;
      this.downloadReject = null;
      this.downloadResolve = null;
      this.downloadChunks = [];
      this.currentDownloadFilename = null;
      reject(new Error('[WifiManager] Socket 连接已中断'));
    }
    this.socket = null;
    this.recvBuf = Buffer.alloc(0);
  }

  /** 断开连接 */
  disconnect(webContents?: WebContents): void {
    this.stopHeartbeat();
    this.isSyncing = false;
    this.frameHandlers = [];
    if (this.downloadReject) {
      const reject = this.downloadReject;
      this.downloadReject = null;
      this.downloadResolve = null;
      this.downloadChunks = [];
      if (webContents && this.currentDownloadFilename) {
        webContents.send(RecordingCardWifiIpc.Interrupted, {
          filename: this.currentDownloadFilename,
          lastFrameIndex: this.lastFrameIndex,
          lastFrameCrc: this.lastFrameCrc,
        } satisfies DownloadInterruptedData);
      }
      reject(new Error('[WifiManager] 连接已断开'));
      this.currentDownloadFilename = null;
    }
    if (this.socket && !this.socket.destroyed) {
      this.socket.destroy();
    }
    this.socket = null;
    this.recvBuf = Buffer.alloc(0);
  }

  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  /** 获取当前断点信息（供外部重连时使用） */
  getBreakpoint(): { filename: string | null; lastFrameIndex: number; lastFrameCrc: number } {
    return {
      filename: this.currentDownloadFilename,
      lastFrameIndex: this.lastFrameIndex,
      lastFrameCrc: this.lastFrameCrc,
    };
  }

  /** 取消下载（主动中断） */
  cancelDownload(): void {
    if (this.downloadReject) {
      const reject = this.downloadReject;
      this.downloadReject = null;
      this.downloadResolve = null;
      this.downloadChunks = [];
      this.currentDownloadFilename = null;
      reject(new Error('[WifiManager] 用户取消下载'));
    }
  }
}

export const recordingCardWifiManager = new RecordingCardWifiManager();
