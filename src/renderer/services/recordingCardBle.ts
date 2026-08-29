/**
 * 录音卡 BLE 通信服务（QS668 协议）
 *
 * 协议文档：doc.html（AI录音卡 BLE 通信协议 V1.0）
 * Service: 0xAE20  Write: 0xAE21  Notify: 0xAE22(数据) / 0xAE23(按键状态)
 */

// ─────────────────────────────────────────────
// Web Bluetooth API 类型兼容声明（tsconfig DOM lib 扩展）
// ─────────────────────────────────────────────
interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  value?: DataView;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: string | number): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTServer {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string | number): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothDevice extends EventTarget {
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
}

interface BluetoothRequestDeviceFilter {
  services?: Array<string | number>;
  name?: string;
  namePrefix?: string;
}

interface RequestDeviceOptions {
  filters?: BluetoothRequestDeviceFilter[];
  optionalServices?: Array<string | number>;
  acceptAllDevices?: boolean;
}

interface BluetoothNavigator {
  requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
}

// ─────────────────────────────────────────────
// BLE UUID 常量
// ─────────────────────────────────────────────
const SERVICE_UUID = 0xae20;
const CHAR_WRITE_UUID = 0xae21;
const CHAR_NOTIFY_DATA_UUID = 0xae22;
const CHAR_NOTIFY_KEY_UUID = 0xae23;

// ─────────────────────────────────────────────
// 协议类型与命令常量
// ─────────────────────────────────────────────
const TYPE_CTRL = 0x00;   // 控制命令
const TYPE_FILE = 0x02;   // 文件操作
const TYPE_REC  = 0x03;   // 按键/录音控制

const CMD_CTRL_GET_CAPACITY = 0x01;
const CMD_CTRL_CAPACITY_REPLY = 0x02;
const CMD_CTRL_GET_BATTERY = 0x03;
const CMD_CTRL_BATTERY_REPLY = 0x04;
const CMD_CTRL_GET_FIRMWARE = 0x0a;
const CMD_CTRL_FIRMWARE_REPLY = 0x0b;

const CMD_FILE_GET_LIST = 0x00;
const CMD_FILE_LIST_DATA = 0x01;
const CMD_FILE_REQUEST_IMPORT = 0x02;
const CMD_FILE_IMPORT_START = 0x03;
const CMD_FILE_DATA = 0x04;
const CMD_FILE_IMPORT_END = 0x05;
const CMD_FILE_CANCEL_IMPORT = 0x07;
const CMD_FILE_LIST_DONE = 0x12;

// ─────────────────────────────────────────────
// 对外暴露的数据类型
// ─────────────────────────────────────────────

/** 已连接的录音卡设备信息 */
export interface RecordingCardDevice {
  /** 设备广播名 */
  name: string;
  /** 电量 0-100，110=充电中 */
  battery: number;
  /** 固件版本，如 V1.4.2 */
  firmware: string;
  /** 剩余容量（KB） */
  remainKb: number;
  /** 总容量（KB） */
  totalKb: number;
}

/** 设备上的录音文件 */
export interface RecordingCardFile {
  /** 原始文件名（可能无扩展名，下载时补 .wav） */
  name: string;
  /** 录音时长（秒） */
  duration: number;
  /** 设备内压缩文件大小（字节） */
  size: number;
}

// ─────────────────────────────────────────────
// CRC-16/XMODEM
// Polynomial=0x1021, Init=0x0000, RefIn=false, RefOut=false, XorOut=0x0000
// ─────────────────────────────────────────────
function crc16xmodem(data: Uint8Array): number {
  let crc = 0x0000;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

// ─────────────────────────────────────────────
// 帧构造器
// 帧格式：[MAGIC:1B=0x5A][SEQ:1B][CRC:2B LE][LEN:2B LE][DATA]
// CRC 计算范围：LEN(2B) + DATA
// ─────────────────────────────────────────────
let seqCounter = 0;

function buildFrame(type: number, cmd: number, params: Uint8Array = new Uint8Array()): Uint8Array {
  const data = new Uint8Array([type, cmd, ...params]);
  const len = data.length;

  // LEN 两字节（LE）
  const lenBytes = new Uint8Array([len & 0xff, (len >> 8) & 0xff]);

  // CRC 计算范围：LEN + DATA
  const crcInput = new Uint8Array([...lenBytes, ...data]);
  const crc = crc16xmodem(crcInput);
  const crcBytes = new Uint8Array([crc & 0xff, (crc >> 8) & 0xff]);

  const seq = seqCounter & 0xff;
  seqCounter = (seqCounter + 1) & 0xff;

  return new Uint8Array([0x5a, seq, ...crcBytes, ...lenBytes, ...data]);
}

// ─────────────────────────────────────────────
// 流式帧解析器（跨 Notify 重组）
// ─────────────────────────────────────────────
class FrameParser {
  private buf = new Uint8Array(0);
  private onFrame: (type: number, cmd: number, payload: Uint8Array) => void;

  constructor(onFrame: (type: number, cmd: number, payload: Uint8Array) => void) {
    this.onFrame = onFrame;
  }

  feed(chunk: DataView): void {
    const bytes = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const merged = new Uint8Array(this.buf.length + bytes.length);
    merged.set(this.buf);
    merged.set(bytes, this.buf.length);
    this.buf = merged;
    this.flush();
  }

  private flush(): void {
    // 跳过找 MAGIC=0x5A
    while (this.buf.length > 0 && this.buf[0] !== 0x5a) {
      this.buf = this.buf.slice(1);
    }
    // 头部至少 6B（MAGIC+SEQ+CRC+LEN）
    while (this.buf.length >= 6) {
      const len = this.buf[4] | (this.buf[5] << 8);
      const frameLen = 6 + len;
      if (this.buf.length < frameLen) break;

      const frame = this.buf.slice(0, frameLen);
      this.buf = this.buf.slice(frameLen);

      // 跳过校验，直接解析（协议层容错）
      if (len >= 2) {
        const type = frame[6];
        const cmd = frame[7];
        const payload = frame.slice(8, frameLen);
        this.onFrame(type, cmd, payload);
      }

      // 继续查找下一帧
      while (this.buf.length > 0 && this.buf[0] !== 0x5a) {
        this.buf = this.buf.slice(1);
      }
    }
  }

  reset(): void {
    this.buf = new Uint8Array(0);
  }
}

// ─────────────────────────────────────────────
// BLE 会话状态
// ─────────────────────────────────────────────
interface BleSession {
  device: BluetoothDevice;
  server: BluetoothRemoteGATTServer;
  charWrite: BluetoothRemoteGATTCharacteristic;
  charData: BluetoothRemoteGATTCharacteristic;
  charKey: BluetoothRemoteGATTCharacteristic;
  parserData: FrameParser;
  parserKey: FrameParser;
  /** 挂起的命令等待回调 map，key 为 `TYPE_CMD` */
  pending: Map<string, {
    resolve: (payload: Uint8Array) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>;
}

let session: BleSession | null = null;
let disconnectCallback: (() => void) | null = null;

// ─────────────────────────────────────────────
// 内部工具：等待特定帧（带超时）
// ─────────────────────────────────────────────
function waitFrame(s: BleSession, type: number, cmd: number, timeoutMs = 8000): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const key = `${type}_${cmd}`;
    const timer = setTimeout(() => {
      s.pending.delete(key);
      reject(new Error(`[BLE] 等待帧 TYPE=${type} CMD=${cmd} 超时`));
    }, timeoutMs);
    s.pending.set(key, { resolve, reject, timer });
  });
}

// ─────────────────────────────────────────────
// 帧分发
// ─────────────────────────────────────────────
function dispatchFrame(s: BleSession, type: number, cmd: number, payload: Uint8Array): void {
  const key = `${type}_${cmd}`;
  const pending = s.pending.get(key);
  if (pending) {
    clearTimeout(pending.timer);
    s.pending.delete(key);
    pending.resolve(payload);
  }
}

// ─────────────────────────────────────────────
// 写命令帧到 AE21
// ─────────────────────────────────────────────
async function writeCommand(s: BleSession, frame: Uint8Array): Promise<void> {
  await s.charWrite.writeValueWithoutResponse(frame.buffer as ArrayBuffer);
}

// ─────────────────────────────────────────────
// 公开 API
// ─────────────────────────────────────────────

/**
 * 扫描并连接录音卡，返回设备基础信息
 * （主进程已配置 select-bluetooth-device 自动选择 AE20 设备）
 */
export async function connect(onDisconnected?: () => void): Promise<RecordingCardDevice> {
  if (session) {
    disconnect();
  }

  disconnectCallback = onDisconnected || null;

  const bluetooth = (navigator as unknown as { bluetooth?: BluetoothNavigator }).bluetooth;
  if (!bluetooth) {
    throw new Error('当前运行环境不支持 Web Bluetooth API');
  }

  const device = await bluetooth.requestDevice({
    filters: [{ services: [SERVICE_UUID] }],
    optionalServices: [SERVICE_UUID],
  });

  const server = await device.gatt!.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);

  const charWrite = await service.getCharacteristic(CHAR_WRITE_UUID);
  const charData = await service.getCharacteristic(CHAR_NOTIFY_DATA_UUID);
  const charKey = await service.getCharacteristic(CHAR_NOTIFY_KEY_UUID);

  const pending: BleSession['pending'] = new Map();

  const s: BleSession = {
    device,
    server,
    charWrite,
    charData,
    charKey,
    parserData: new FrameParser((type, cmd, payload) => dispatchFrame(s, type, cmd, payload)),
    parserKey: new FrameParser((type, cmd, payload) => dispatchFrame(s, type, cmd, payload)),
    pending,
  };

  // 订阅 AE22（数据通道）
  await charData.startNotifications();
  charData.addEventListener('characteristicvaluechanged', (e: Event) => {
    const val = (e.target as BluetoothRemoteGATTCharacteristic).value;
    if (val) s.parserData.feed(val);
  });

  // 订阅 AE23（按键状态）
  try {
    await charKey.startNotifications();
    charKey.addEventListener('characteristicvaluechanged', (e: Event) => {
      const val = (e.target as BluetoothRemoteGATTCharacteristic).value;
      if (val) s.parserKey.feed(val);
    });
  } catch {
    // AE23 可选，忽略失败
  }

  // 监听物理断开事件（如设备关机、超时休眠、超出距离）
  device.addEventListener('gattserverdisconnected', () => {
    disconnect();
    if (disconnectCallback) {
      disconnectCallback();
    }
  });

  session = s;

  // 查询电量、固件、容量
  const [battery, firmware, capacity] = await Promise.all([
    queryBattery(),
    queryFirmwareVersion(),
    queryDiskUsage(),
  ]);

  return {
    name: device.name ?? '录音卡',
    battery,
    firmware,
    remainKb: capacity.remainKb,
    totalKb: capacity.totalKb,
  };
}

/** 断开蓝牙连接，清理状态 */
export function disconnect(): void {
  if (!session) return;
  // 清理所有挂起的等待
  for (const p of session.pending.values()) {
    clearTimeout(p.timer);
    p.reject(new Error('[BLE] 录音卡连接已断开'));
  }
  session.pending.clear();
  session.parserData.reset();
  session.parserKey.reset();
  try {
    if (session.server.connected) {
      session.server.disconnect();
    }
  } catch {
    // 忽略
  }
  session = null;
}

/** 是否已连接 */
export function isConnected(): boolean {
  return session !== null && session.server.connected;
}

/** 确保当前处于已连接状态，否则抛出友好提示并清理残留 */
function ensureConnected(): BleSession {
  if (!session || !session.server.connected) {
    disconnect();
    if (disconnectCallback) {
      disconnectCallback();
    }
    throw new Error('录音卡已断开连接，请重新连接');
  }
  return session;
}

/** 查询电量（0-100，110=充电中） */
export async function queryBattery(): Promise<number> {
  const s = ensureConnected();
  const frame = buildFrame(TYPE_CTRL, CMD_CTRL_GET_BATTERY);
  const [, payload] = await Promise.all([
    writeCommand(s, frame),
    waitFrame(s, TYPE_CTRL, CMD_CTRL_BATTERY_REPLY),
  ]);
  return payload[0] ?? 0;
}

/** 查询固件版本 */
export async function queryFirmwareVersion(): Promise<string> {
  const s = ensureConnected();
  const frame = buildFrame(TYPE_CTRL, CMD_CTRL_GET_FIRMWARE);
  const [, payload] = await Promise.all([
    writeCommand(s, frame),
    waitFrame(s, TYPE_CTRL, CMD_CTRL_FIRMWARE_REPLY),
  ]);
  // 6B ASCII，去掉 NUL
  return String.fromCharCode(...payload).replace(/\0+$/, '');
}

/** 查询磁盘容量 */
export async function queryDiskUsage(): Promise<{ remainKb: number; totalKb: number }> {
  const s = ensureConnected();
  const frame = buildFrame(TYPE_CTRL, CMD_CTRL_GET_CAPACITY);
  const [, payload] = await Promise.all([
    writeCommand(s, frame),
    waitFrame(s, TYPE_CTRL, CMD_CTRL_CAPACITY_REPLY),
  ]);
  if (payload.length < 8) return { remainKb: 0, totalKb: 0 };
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  // remain/total 各 4B LE，单位 KB
  const remainKb = dv.getUint32(0, true);
  const totalKb = dv.getUint32(4, true);
  return { remainKb, totalKb };
}

/**
 * 获取设备录音文件列表
 * 协议：发送 CMD 2-0，累积 CMD 2-1 帧，收到 CMD 2-18 后返回完整列表
 */
export async function getFileList(): Promise<RecordingCardFile[]> {
  const s = ensureConnected();

  const files: RecordingCardFile[] = [];

  // 临时监听 2-1 和 2-18 帧
  const origParser = s.parserData;
  let listDoneResolve: (() => void) | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const listDonePromise = new Promise<void>((resolve) => {
    listDoneResolve = resolve;
  });

  // 替换为专用解析器，处理列表帧
  s.parserData = new FrameParser((type, cmd, payload) => {
    if (type === TYPE_FILE && cmd === CMD_FILE_LIST_DATA) {
      // payload: count(4B BE) + N×28B
      const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      if (payload.length < 4) return;
      const count = dv.getUint32(0, false); // BE
      for (let i = 0; i < count && 4 + i * 28 + 28 <= payload.length; i++) {
        const off = 4 + i * 28;
        const duration = dv.getUint32(off, false);      // time: BE 秒
        const size = dv.getUint32(off + 4, false);      // size: BE 字节
        const nameBytes = payload.slice(off + 8, off + 28);
        const name = String.fromCharCode(...nameBytes).replace(/\0+$/, '').trim();
        if (name) {
          files.push({ name, duration, size });
        }
      }
      // 重置空闲超时（兼容旧固件不发 CMD=18 的情况）
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        listDoneResolve?.();
      }, 1200);
    } else if (type === TYPE_FILE && cmd === CMD_FILE_LIST_DONE) {
      if (idleTimer) clearTimeout(idleTimer);
      listDoneResolve?.();
    } else {
      // 非列表帧交给原解析器处理
      dispatchFrame(s, type, cmd, payload);
    }
  });

  const frame = buildFrame(TYPE_FILE, CMD_FILE_GET_LIST);
  await writeCommand(s, frame);

  // 等待列表完成，最长 15 秒
  await Promise.race([
    listDonePromise,
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('[BLE] 获取文件列表超时')), 15000)
    ),
  ]);

  // 恢复原解析器
  s.parserData = origParser;
  if (idleTimer) clearTimeout(idleTimer);

  return files;
}

/**
 * 下载单个录音文件（BLE 传输）
 * @param rawName 设备文件列表中的原始名称（可能不含扩展名）
 * @param onProgress 进度回调（0-100）
 * @returns WAV 文件二进制数据
 */
export async function downloadFile(
  rawName: string,
  onProgress?: (progress: number) => void
): Promise<Uint8Array> {
  const s = ensureConnected();

  // 重建目标文件名（优先 .wav）
  const baseName = rawName.replace(/\.[^.]*$/, '');
  const targetName = `${baseName}.wav`;

  // filename 字段固定 24B，NUL 填充
  const nameBytes = new Uint8Array(24);
  const encoded = new TextEncoder().encode(targetName);
  nameBytes.set(encoded.slice(0, 24));

  // CMD 2-2 参数：offset(4B LE) + filename(24B) = 28B
  const params = new Uint8Array(28);
  // offset = 0（首次下载）
  params.set(nameBytes, 4);

  // 构造完整帧 DATA(30B) = TYPE(1) + CMD(1) + params(28)
  const frame = buildFrame(TYPE_FILE, CMD_FILE_REQUEST_IMPORT, params);
  // 验证整帧 36B（6B头 + 30B DATA）
  if (frame.length !== 36) {
    throw new Error(`[BLE] 下载请求帧长度异常: ${frame.length}B，预期 36B`);
  }

  const chunks: Uint8Array[] = [];
  let totalReceived = 0;
  let downloadDoneResolve: ((data: Uint8Array) => void) | null = null;
  let downloadDoneReject: ((err: Error) => void) | null = null;

  const downloadPromise = new Promise<Uint8Array>((resolve, reject) => {
    downloadDoneResolve = resolve;
    downloadDoneReject = reject;
  });

  const origParser = s.parserData;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      downloadDoneReject?.(new Error('[BLE] 文件传输超时（空闲 12s）'));
    }, 12000);
  };

  s.parserData = new FrameParser((type, cmd, payload) => {
    if (type === TYPE_FILE && cmd === CMD_FILE_IMPORT_START) {
      // 下载开始，重置空闲定时
      resetIdleTimer();
    } else if (type === TYPE_FILE && cmd === CMD_FILE_DATA) {
      // 文件数据分片
      chunks.push(new Uint8Array(payload));
      totalReceived += payload.length;
      resetIdleTimer();
      // 进度估算（基于接收字节数，无法精确，WAV 约 32KB/s * 时长 + 44B）
      onProgress?.(Math.min(99, Math.floor((totalReceived / (totalReceived + 1024)) * 100)));
    } else if (type === TYPE_FILE && cmd === CMD_FILE_IMPORT_END) {
      if (idleTimer) clearTimeout(idleTimer);
      const code = payload[0] ?? 1;
      if (code === 0) {
        // 合并所有分片
        const total = chunks.reduce((acc, c) => acc + c.length, 0);
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.length;
        }
        onProgress?.(100);
        downloadDoneResolve?.(merged);
      } else {
        downloadDoneReject?.(new Error(`[BLE] 文件导入失败，设备返回 code=${code}`));
      }
    } else {
      dispatchFrame(s, type, cmd, payload);
    }
  });

  // 发送下载请求（整帧 36B 单次写入）
  await writeCommand(s, frame);
  resetIdleTimer();

  let result: Uint8Array;
  try {
    result = await Promise.race([
      downloadPromise,
      new Promise<Uint8Array>((_, reject) =>
        setTimeout(() => reject(new Error('[BLE] 文件下载总超时（120s）')), 120000)
      ),
    ]);
  } finally {
    s.parserData = origParser;
    if (idleTimer) clearTimeout(idleTimer);
  }

  return result;
}

/** 取消当前正在进行的文件传输（发送 CMD 2-7） */
export async function cancelDownload(): Promise<void> {
  const s = session;
  if (!s) return;
  const frame = buildFrame(TYPE_FILE, CMD_FILE_CANCEL_IMPORT);
  try {
    await writeCommand(s, frame);
  } catch {
    // 忽略取消发送失败
  }
}

export const recordingCardBle = {
  connect,
  disconnect,
  isConnected,
  queryBattery,
  queryFirmwareVersion,
  queryDiskUsage,
  getFileList,
  downloadFile,
  cancelDownload,
};

// TYPE_REC 仅用于类型完整性，防止 TS 警告
void TYPE_REC;
