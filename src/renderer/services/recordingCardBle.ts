/**
 * 录音卡 BLE 通信服务（升迈 T240/M2 协议）
 *
 * 协议文档：设备对接协议文档.md
 * Service:  00001910-0000-1000-8000-00805f9b34fb
 * Write:    00001912-0000-1000-8000-00805f9b34fb (WRITE_WITHOUT_RESPONSE)
 * Notify:   00001911-0000-1000-8000-00805f9b34fb
 */
import { v5 as uuidv5 } from 'uuid';

// ─────────────────────────────────────────────
// Web Bluetooth API 类型兼容声明
// ─────────────────────────────────────────────
interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  value?: DataView;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(uuid: string): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTServer {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothDevice extends EventTarget {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
}

interface BluetoothNavigator {
  requestDevice(options: {
    filters?: { services?: string[]; name?: string; namePrefix?: string }[];
    acceptAllDevices?: boolean;
    optionalServices?: string[];
  }): Promise<BluetoothDevice>;
}

// ─────────────────────────────────────────────
// BLE UUID 常量（升迈 T240/M2 协议）
// ─────────────────────────────────────────────
const SERVICE_UUID = '00001910-0000-1000-8000-00805f9b34fb';
const CHAR_WRITE_UUID = '00001912-0000-1000-8000-00805f9b34fb';
const CHAR_NOTIFY_UUID = '00001911-0000-1000-8000-00805f9b34fb';

// 握手超时：从连接上开始计时，5s 内未完成握手设备会断开
const HANDSHAKE_TIMEOUT_MS = 4500;
// 普通命令响应超时
const CMD_TIMEOUT_MS = 8000;

// ─────────────────────────────────────────────
// 对外暴露的数据类型
// ─────────────────────────────────────────────

/** 握手结果（包含连接 Wi-Fi 所需信息） */
export interface HandshakeResult {
  /** 设备名称，如 "T240(BLE)" */
  deviceName: string;
  /** SN 码 */
  sn: string;
  /** 设备 UUID（完整格式） */
  deviceUuid: string;
  /** Wi-Fi SSID，从握手结果 WifiSsid 字段获取，如 "M2(045107968c78)" */
  wifiSsid: string;
  /** Wi-Fi 密码（设备 UUID 前 8 字节，如 "623d289d"） */
  wifiPassword: string;
  /** 电量 0-100 */
  battery: number;
  /** 剩余存储 KBytes */
  freeKb: number;
  /** 总存储 KBytes */
  totalKb: number;
}

// HeyClaw 录音卡专属命名空间 (固定不变，任何情况下不得修改)
export const RECORDING_CARD_UUID_NAMESPACE = 'a3f8e2c1-7d4b-5e9f-b0c2-8d1a6e3f9047';

/**
 * 根据 heyclaw_user_id 生成确定性 APP UUID
 * 同一用户永远得到同一 UUID，无需存储
 */
export function getAppUuid(userId: string | number): string {
  // userId = heyclaw_user_id (NewAPI user id), 同一用户永远得到同一UUID
  return uuidv5(`heyclaw-recording-card:${userId}`, RECORDING_CARD_UUID_NAMESPACE);
}

// ─────────────────────────────────────────────
// BLE 会话状态
// ─────────────────────────────────────────────
interface NotifyWaiter {
  filter: (data: Uint8Array) => boolean;
  resolve: (data: Uint8Array) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  desc: string;
}

interface BleSession {
  device: BluetoothDevice;
  server: BluetoothRemoteGATTServer;
  charWrite: BluetoothRemoteGATTCharacteristic;
  charNotify: BluetoothRemoteGATTCharacteristic;
  waiters: NotifyWaiter[];
  rawListeners: ((data: Uint8Array) => void)[];
}

let session: BleSession | null = null;
let cachedDevice: BluetoothDevice | null = null;
let cachedUserId: string | number | null = null;
let cachedOnDisconnected: (() => void) | undefined = undefined;
let isWifiTransferring = false;
let isHandshaking = false;

/** 统一控制台输出与磁盘持久化日志 */
function logBle(level: 'info' | 'warn' | 'error', message: string): void {
  if (level === 'error') console.error(`[RecordingCardBle] ${message}`);
  else if (level === 'warn') console.warn(`[RecordingCardBle] ${message}`);
  else console.log(`[RecordingCardBle] ${message}`);

  try {
    (window as any)?.electron?.log?.fromRenderer?.(level, 'RecordingCardBle', message);
  } catch {
    // 忽略
  }
}

// ─────────────────────────────────────────────
// 内部工具
// ─────────────────────────────────────────────

/** 发送 BLE 命令帧，格式: [0x01][CMD_L][CMD_H][可选数据...] */
async function sendBleCommand(cmdL: number, cmdH: number, data?: Uint8Array): Promise<void> {
  if (!session) throw new Error('[BleV2] 录音卡未连接');
  const payload = new Uint8Array([0x01, cmdL, cmdH, ...(data ?? [])]);
  const hexCmd = `0x${cmdL.toString(16).padStart(2, '0')} 0x${cmdH.toString(16).padStart(2, '0')}`;
  logBle('info', `>>> [BLE TX] CMD: ${hexCmd}, 载荷长度: ${data?.length ?? 0}`);
  await session.charWrite.writeValueWithoutResponse(payload.buffer as ArrayBuffer);
}

/** 等待匹配指定过滤条件的 Notify 数据（带超时与描述） */
function waitNotifyMatch(
  filter: (data: Uint8Array) => boolean,
  timeoutMs: number,
  desc = '响应'
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (!session) {
      reject(new Error('[BleV2] 录音卡未连接'));
      return;
    }
    const timer = setTimeout(() => {
      if (session) {
        const idx = session.waiters.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) session.waiters.splice(idx, 1);
      }
      reject(new Error(`[BleV2] 等待 ${desc} 超时 (${timeoutMs}ms)`));
    }, timeoutMs);

    session.waiters.push({ filter, resolve, reject, timer, desc });
  });
}

/** 发送 BLE 指令并严格等待匹配其命令字的响应帧 (格式: 0x01 [cmdL] [cmdH] ...) */
async function sendBleCommandAndExpect(
  cmdL: number,
  cmdH: number,
  data?: Uint8Array,
  timeoutMs = CMD_TIMEOUT_MS
): Promise<Uint8Array> {
  const hexCmd = `0x${cmdL.toString(16).padStart(2, '0')} 0x${cmdH.toString(16).padStart(2, '0')}`;
  // 必须提前挂上专用匹配器，绝不被任何历史残留帧或异步上报包误消费
  const promise = waitNotifyMatch(
    (bytes) => bytes.length >= 3 && bytes[0] === 0x01 && bytes[1] === cmdL && bytes[2] === cmdH,
    timeoutMs,
    `命令 ${hexCmd} 回复`
  );
  await sendBleCommand(cmdL, cmdH, data);
  return promise;
}

// ─────────────────────────────────────────────
// 公开 API
// ─────────────────────────────────────────────

/**
 * 内部统一建立 GATT 连接、双向握手闭环并读取电量和存储
 */
async function connectAndHandshake(
  device: BluetoothDevice,
  userId: string | number,
  onDisconnected?: () => void
): Promise<HandshakeResult> {
  if (session) {
    disconnect();
  }

  isHandshaking = true;
  try {
    logBle('info', `匹配到设备: ${device.name || '未知'}, ID: ${device.id}, 正在建立 GATT 连接...`);
    const server = await device.gatt!.connect();
    logBle('info', 'GATT 连接建立成功，正在发现 0x1910 服务...');
    const bleService = await server.getPrimaryService(SERVICE_UUID);

    const charWrite = await bleService.getCharacteristic(CHAR_WRITE_UUID);
    const charNotify = await bleService.getCharacteristic(CHAR_NOTIFY_UUID);
    logBle('info', '成功获取写特征 0x1912 与通知特征 0x1911');

    const s: BleSession = {
      device,
      server,
      charWrite,
      charNotify,
      waiters: [],
      rawListeners: [],
    };

    // 订阅 Notify 特征值
    await charNotify.startNotifications();
    logBle('info', 'Notify 通知通道监听已开启');
    charNotify.addEventListener('characteristicvaluechanged', (e: Event) => {
      const val = (e.target as BluetoothRemoteGATTCharacteristic).value;
      if (!val) return;
      const bytes = new Uint8Array(val.buffer, val.byteOffset, val.byteLength);
      const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(' ');
      const hexShort = hex.length > 60 ? hex.slice(0, 60) + '...' : hex;
      logBle('info', `<<< [BLE RX] 长度: ${bytes.length}, CMD: 0x${bytes[1]?.toString(16)} 0x${bytes[2]?.toString(16)}, 原始Hex: [${hexShort}]`);

      // 1. 优先分发给流式监听器（保证队列缓冲不漏帧）
      for (const listener of s.rawListeners) {
        try {
          listener(bytes);
        } catch (lErr) {
          logBle('warn', `rawListener 执行异常: ${lErr}`);
        }
      }

      // 2. 匹配队列中等待该响应的 waiter
      const idx = s.waiters.findIndex((w) => w.filter(bytes));
      if (idx !== -1) {
        const waiter = s.waiters.splice(idx, 1)[0]!;
        clearTimeout(waiter.timer);
        waiter.resolve(bytes);
      } else if (s.rawListeners.length === 0) {
        logBle('info', `收到未匹配等待项的异步通知帧，安全忽略: [${hexShort}]`);
      }
    });

    device.addEventListener('gattserverdisconnected', () => {
      logBle('warn', `监听到录音卡物理断开事件 (isWifiTransferring=${isWifiTransferring}, isHandshaking=${isHandshaking})`);
      disconnect();
      if (!isWifiTransferring && !isHandshaking) {
        onDisconnected?.();
      }
    });

    session = s;

    // 生成 APP UUID
    const appUuid = getAppUuid(userId);
    logBle('info', `【核心凭证】用户 APP UUID 派生完成: ${appUuid} (userId: ${userId})`);

    // 封装发送 APP 握手确认帧（严格对齐 Android f.s.a 与 iOS 0x58c10）
    const sendAppHandshake = async () => {
      const appUuidPayload = JSON.stringify({
        time: Math.floor(Date.now() / 1000),
        uuid: appUuid.toLowerCase(),
      });
      logBle('info', `>>> [握手] 下发 APP 握手数据包 (0x01 0x00): ${appUuidPayload}`);
      const appUuidBytes = new TextEncoder().encode(appUuidPayload);
      // 步骤标识 0x01 + JSON payload
      const cmdData = new Uint8Array([0x01, ...appUuidBytes]);
      await sendBleCommand(0x01, 0x00, cmdData);
    };

    let deviceUuid = '';
    let deviceName = device.name || 'HeyClaw 录音卡';
    let sn = '';
    let wifiSsid = '';
    let verifySuccess = false;

    // ── 握手流程（严格对齐 Android a.o 与 iOS RSRecordCardSDK 双向闭环状态机） ──
    const handshakeQueue: Uint8Array[] = [];
    let handshakeResolver: (() => void) | null = null;
    const onHandshakePacket = (bytes: Uint8Array) => {
      // 捕获 CMD 为 0x01 0x00 的握手交互帧
      if (bytes.length >= 3 && bytes[0] === 0x01 && bytes[1] === 0x01 && bytes[2] === 0x00) {
        handshakeQueue.push(bytes);
        if (handshakeResolver) {
          const r = handshakeResolver;
          handshakeResolver = null;
          r();
        }
      }
    };
    s.rawListeners.push(onHandshakePacket);

    try {
      const deadline = Date.now() + HANDSHAKE_TIMEOUT_MS;
      let hasSentHandshake = false;

      while (Date.now() < deadline) {
        if (handshakeQueue.length === 0) {
          const remaining = deadline - Date.now();
          if (remaining <= 0) break;
          await new Promise<void>((resolve) => {
            handshakeResolver = resolve;
            setTimeout(resolve, Math.min(remaining, 500));
          });
        }

        if (handshakeQueue.length === 0) continue;
        const packet = handshakeQueue.shift()!;
        const stepType = packet[3];
        logBle('info', `[握手] 接收并处理握手帧, 长度: ${packet.length}, 步骤标识: 0x${stepType?.toString(16)}`);

        // 1. 预告帧 (0x02 0x02) 或 设备上报 UUID 帧 (0x00 0x00) -> 仅触发一次 APP 握手数据包（严格对齐 Android a.o.class）
        if (
          !hasSentHandshake &&
          ((packet.length >= 5 && stepType === 0x02 && packet[4] === 0x02) ||
           (packet.length >= 4 && stepType === 0x00))
        ) {
          if (stepType === 0x00) {
            const jsonStr = new TextDecoder().decode(packet.slice(4));
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.uuid) deviceUuid = parsed.uuid;
            } catch {
              // 忽略
            }
          }
          logBle('info', '[握手] 🎯 捕获握手触发帧 (0x02 0x02 或 0x00)！立即回传 APP 握手包 (单次)...');
          await sendAppHandshake();
          hasSentHandshake = true;
          continue;
        }

        // 2. 设备全量配置验证结果报文（0x02 0x00 或错误码）
        if (packet.length >= 5 && stepType === 0x02 && packet[4] !== 0x02) {
          const statusCode = packet[4];
          if (statusCode !== 0x00) {
            const errMsg: Record<number, string> = {
              0x01: 'APP UUID 校验失败（设备已绑定其他账号）',
              0x02: '数据长度校验失败',
              0x03: '握手顺序错误',
              0x04: '握手超时',
            };
            throw new Error(`[BleV2] 握手被拒绝：${errMsg[statusCode] ?? `未知错误码 0x${statusCode?.toString(16)}`}`);
          }

          const jsonStr = new TextDecoder().decode(packet.slice(5));
          logBle('info', '[握手] 🎉 设备验证通过！全量配置就绪');
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.name) deviceName = parsed.name;
            if (parsed.SN) sn = parsed.SN;
            if (parsed.wifiSsid) wifiSsid = parsed.wifiSsid;
            if (parsed.WifiSsid) wifiSsid = parsed.WifiSsid;
            if (parsed.uuid) deviceUuid = parsed.uuid;
          } catch (err) {
            logBle('warn', `全量配置 JSON 解析异常: ${err}`);
          }
          verifySuccess = true;
          // 收到全量配置验证通过，双向握手圆满闭环完成，立即退出，与官方 Android a.o.class 完全一致
          break;
        }
      }
    } finally {
    s.rawListeners = s.rawListeners.filter((l) => l !== onHandshakePacket);
  }

  if (!verifySuccess) {
    throw new Error('[BleV2] 握手超时：未收到设备验证通过报文');
  }

  const wifiPassword = deviceUuid ? deviceUuid.replace(/-/g, '').slice(0, 8) : '';
  logBle('info', `🎉 握手全流程圆满成功！设备已就绪 (SN: ${sn})，正在读取真实硬件电量与存储容量...`);

  // 握手成功后，真实读取硬件电量与存储容量
  let battery = 100;
  let freeKb = 0;
  let totalKb = 0;
  try {
    battery = await getBattery();
    logBle('info', `<<< 设备真实电量获取成功: ${battery}%`);
  } catch (err) {
    logBle('warn', `获取电量失败 (非致命): ${err}`);
  }
  try {
    const storage = await getStorageCapacity();
    freeKb = storage.freeKb;
    totalKb = storage.totalKb;
    logBle('info', `<<< 设备存储容量获取成功: 剩余 ${freeKb} KB, 总计 ${totalKb} KB`);
  } catch (err) {
    logBle('warn', `获取存储容量失败 (非致命): ${err}`);
  }

  return { deviceName, sn, deviceUuid, wifiSsid, wifiPassword, battery, freeKb, totalKb };
} finally {
  isHandshaking = false;
}
}

/**
 * 扫描并连接录音卡，完成 UUID 握手，返回握手结果
 *
 * @param userId heyclaw_user_id
 * @param onDisconnected 设备物理断开时的回调
 */
export async function handshake(
  userId: string | number,
  onDisconnected?: () => void
): Promise<HandshakeResult> {
  // 1. 优先尝试复用当前会话已授权的历史设备，无需重复唤起系统选择弹窗
  if (cachedDevice) {
    try {
      logBle('info', `检测到已授权的设备 (${cachedDevice.name || cachedDevice.id})，正在尝试直接回连...`);
      return await connectAndHandshake(cachedDevice, userId, onDisconnected);
    } catch (cachedErr: any) {
      logBle('warn', `直接回连历史设备未成功 (${cachedErr?.message})，正在尝试通过系统授权列表回连...`);
    }
  }

  const bluetooth = (navigator as unknown as { bluetooth?: BluetoothNavigator }).bluetooth;
  if (!bluetooth) {
    throw new Error('当前运行环境不支持 Web Bluetooth API');
  }

  // 2. 尝试从 Web Bluetooth 授权列表中获取已配对过的录音卡，直接静默连接
  if (typeof (bluetooth as any).getDevices === 'function') {
    try {
      const authorizedDevices: BluetoothDevice[] = await (bluetooth as any).getDevices();
      const matched = authorizedDevices.find(
        (d) => d.name?.startsWith('M1') || d.name?.startsWith('M2') || d.name?.startsWith('T240')
      );
      if (matched) {
        logBle('info', `从系统授权列表中匹配到录音卡: ${matched.name} (${matched.id})，无感直接连接...`);
        cachedDevice = matched;
        cachedUserId = userId;
        cachedOnDisconnected = onDisconnected;
        isWifiTransferring = false;
        try {
          return await connectAndHandshake(matched, userId, onDisconnected);
        } catch (authErr: any) {
          logBle('warn', `通过系统授权设备回连失败 (${authErr?.message})，回退到扫描弹窗...`);
        }
      }
    } catch {
      // 忽略
    }
  }

  logBle('info', `开始扫描录音卡蓝牙设备 (Service: ${SERVICE_UUID})...`);
  const device = await bluetooth.requestDevice({
    filters: [
      { namePrefix: 'M1' },
      { namePrefix: 'M2' },
      { namePrefix: 'T240' },
      { services: [SERVICE_UUID] },
    ],
    optionalServices: [SERVICE_UUID],
  });

  cachedDevice = device;
  cachedUserId = userId;
  cachedOnDisconnected = onDisconnected;
  isWifiTransferring = false;

  try {
    return await connectAndHandshake(device, userId, onDisconnected);
  } catch (err: any) {
    const isGattDisconnected =
      err?.message?.includes('GATT Server is disconnected') ||
      err?.message?.includes('GATT operation failed') ||
      err?.name === 'NetworkError';

    if (isGattDisconnected) {
      let lastErr = err;
      for (let retry = 1; retry <= 2; retry++) {
        logBle(
          'warn',
          `连接录音卡触发硬件切模复位 (${lastErr?.message})，正在自动无感重试 (第 ${retry}/2 次，等待 ${retry * 800}ms)...`
        );
        await new Promise((resolve) => setTimeout(resolve, retry * 800));
        try {
          return await connectAndHandshake(device, userId, onDisconnected);
        } catch (retryErr: any) {
          lastErr = retryErr;
        }
      }
      throw lastErr;
    }
    throw err;
  }
}

/**
 * 自动静默回连录音卡蓝牙（退出 Wi-Fi 或临时断开后调用）
 * 直接复用已授权的 BluetoothDevice 实例，无需弹出设备选择窗
 */
export async function reconnect(retries = 3, delayMs = 1000): Promise<HandshakeResult> {
  if (!cachedDevice || !cachedUserId) {
    throw new Error('[BleV2] 无历史连接设备，无法自动回连');
  }
  isWifiTransferring = false;
  logBle('info', `准备静默回连录音卡设备: ${cachedDevice.name || cachedDevice.id}, 最多重试 ${retries} 次`);

  let lastError: any;
  for (let i = 1; i <= retries; i++) {
    try {
      logBle('info', `正在尝试自动回连录音卡 (第 ${i}/${retries} 次)...`);
      const result = await connectAndHandshake(cachedDevice, cachedUserId, cachedOnDisconnected);
      logBle('info', `🎉 录音卡自动回连并重新握手成功 (SN: ${result.sn}, 电量: ${result.battery}%, 剩余存储: ${result.freeKb}KB)`);
      return result;
    } catch (err: any) {
      lastError = err;
      logBle('warn', `第 ${i} 次回连未就绪: ${err?.message || '未知异常'}，等待 ${delayMs}ms 后重试...`);
      if (i < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  logBle('error', `录音卡重试 ${retries} 次后仍未能恢复蓝牙连接`);
  cachedOnDisconnected?.();
  throw lastError;
}

/** 同步时间（握手成功后调用，严格对齐文档第二章第2节 0x04 0x00） */
export async function syncTime(): Promise<void> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  console.log('[RecordingCardBle] >>> 同步时间至录音卡:', timeStr);
  const timeBytes = new TextEncoder().encode(timeStr);
  try {
    await sendBleCommandAndExpect(0x04, 0x00, timeBytes, CMD_TIMEOUT_MS);
    console.log('[RecordingCardBle] <<< 时间同步指令已确认完成');
  } catch (err) {
    console.warn('[RecordingCardBle] 时间同步指令失败 (非致命):', err);
  }
}

/**
 * 录音卡内音频文件条目（严格对齐文档第三章第2节 JSON 结构）
 */
export interface BleAudioFile {
  file: string;
  size: number;
  creat_time: number;
  duration_ms: number;
  index: number;
}

/**
 * 通过 BLE 获取录音卡内的音频文件列表（纯只读指令，不触碰 Wi-Fi，不改变设备工作模式）
 * 严格对齐文档第三章第2节第2条与 Android b.y.class 队列式消费模型：
 * app -> device: 0x01 0x1B 0x00
 * device -> app: 0x01 0x1B 0x00 {"FileNum": N}
 * device -> app: 0x01 0x1B 0x00 {"file": "...", "size": ..., "creat_time": ..., "duration_ms": ...}
 */
export async function getFileListViaBle(): Promise<BleAudioFile[]> {
  const s = session;
  if (!s) {
    throw new Error('[Blev2] 录音卡未连接');
  }

  // 稍作缓冲，确保此前指令的 BLE 队列完全排空
  await new Promise((resolve) => setTimeout(resolve, 300));

  console.log('[RecordingCardBle] >>> [BLE 本地] 下发获取文件列表指令 (0x1B 0x00)...');
  const files: BleAudioFile[] = [];
  let expectedFileNum = -1;

  // 使用基于 rawListeners 的流式队列，彻底解决连续快速通知帧丢失问题
  const fileQueue: Uint8Array[] = [];
  let fileResolver: (() => void) | null = null;
  const onFilePacket = (bytes: Uint8Array) => {
    if (bytes.length >= 3 && bytes[0] === 0x01 && bytes[1] === 0x1b && bytes[2] === 0x00) {
      fileQueue.push(bytes);
      if (fileResolver) {
        const r = fileResolver;
        fileResolver = null;
        r();
      }
    }
  };
  s.rawListeners.push(onFilePacket);

  try {
    // 下发 0x1B 获取命令
    await sendBleCommand(0x1b, 0x00);

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (fileQueue.length === 0) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        await new Promise<void>((resolve) => {
          fileResolver = resolve;
          setTimeout(resolve, Math.min(remaining, 1000));
        });
      }

      if (fileQueue.length === 0) continue;
      const packet = fileQueue.shift()!;
      const jsonStr = new TextDecoder().decode(packet.slice(3)).trim();
      console.log(`[RecordingCardBle] <<< [BLE 文件信息] 原始: ${jsonStr}`);

      let parsed: any;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (err) {
        console.warn('[RecordingCardBle] 文件 JSON 解析异常:', jsonStr, err);
        continue;
      }

      // 扫盘繁忙提示
      if (parsed.AudioFileList === 'MemoryBusy') {
        throw new Error('设备正在扫盘中，请稍候再试');
      }

      // 第一帧：文件总数 {"FileNum": 300}
      if (typeof parsed.FileNum === 'number') {
        expectedFileNum = parsed.FileNum;
        console.log(`[RecordingCardBle] 设备端上报录音文件总数: ${expectedFileNum}`);
        if (expectedFileNum === 0) {
          break; // 设备内无文件
        }
        continue;
      }

      // 录音文件条目帧：{"file": "...", "size": ..., "creat_time": ..., "duration_ms": ...}
      if (parsed.file) {
        files.push({
          file: parsed.file,
          size: parsed.size ?? 0,
          creat_time: parsed.creat_time ?? 0,
          duration_ms: parsed.duration_ms ?? 0,
          index: parsed.index ?? files.length + 1,
        });

        if (expectedFileNum > 0 && files.length >= expectedFileNum) {
          console.log(`[RecordingCardBle] 🎉 已成功接收全部 ${files.length} 个录音文件列表！`);
          break;
        }
      }
    }
  } finally {
    s.rawListeners = s.rawListeners.filter((l) => l !== onFilePacket);
  }

  return files;
}

/**
 * 打开 Wi-Fi（严格对齐文档第二章第22节 0x0A 0x00）
 * 严格等待 0x01 0x0A 0x00 回复，确认状态码为 0x00 后方可认为开启成功
 */
export async function openWifi(): Promise<void> {
  logBle('info', '>>> 下发开启设备 Wi-Fi 热点指令 (0x0A 0x00)...');
  isWifiTransferring = true;
  const resp = await sendBleCommandAndExpect(0x0a, 0x00, undefined, CMD_TIMEOUT_MS);
  // 回复格式：0x01 0x0A 0x00 0xxx
  const status = resp[3];
  if (status !== 0x00) {
    isWifiTransferring = false;
    const isBusy = (status & 0x01) !== 0;
    throw new Error(`[BleV2] 打开 Wi-Fi 失败：${isBusy ? '设备繁忙（正在访问SD卡）' : `错误码 0x${status?.toString(16)}`}`);
  }
  logBle('info', '<<< 设备 Wi-Fi 热点已真正成功开启 (0x0A 0x00 回复 0x00)');
}

/** 关闭 Wi-Fi（严格对齐文档第二章第23节 0x0B 0x00） */
export async function closeWifi(): Promise<void> {
  logBle('info', '>>> 下发关闭设备 Wi-Fi 指令 (0x0B 0x00)...');
  isWifiTransferring = false;
  await sendBleCommandAndExpect(0x0b, 0x00).catch(() => { /* 忽略超时 */ });
  logBle('info', '<<< 设备 Wi-Fi 已关闭');
}

/** 解绑设备（严格对齐文档第二章第6节 0x05 0x00 0x00，保留音频） */
export async function unbind(): Promise<void> {
  logBle('info', '>>> 下发解除配对绑定指令 (0x05 0x00 0x00 保留音频)...');
  cachedDevice = null;
  cachedUserId = null;
  cachedOnDisconnected = undefined;
  isWifiTransferring = false;
  // 0x00 = 保留音频
  await sendBleCommand(0x05, 0x00, new Uint8Array([0x00]));
  // 设备收到后会清除配对码并断开连接
  await waitNotifyMatch((b) => b[1] === 0x05 && b[2] === 0x00, 3000, '解绑确认').catch(() => {});
  logBle('info', '<<< 解绑指令已完成发送');
}

/** 获取电量（严格对齐文档第二章第3节 0x09 0x00，返回 0~100） */
export async function getBattery(): Promise<number> {
  const resp = await sendBleCommandAndExpect(0x09, 0x00);
  return resp[3] ?? 0;
}

/** 获取存储容量（严格对齐文档第二章第8节 0x06 0x00） */
export async function getStorageCapacity(): Promise<{ freeKb: number; totalKb: number }> {
  const resp = await sendBleCommandAndExpect(0x06, 0x00);
  try {
    const jsonStr = new TextDecoder().decode(resp.slice(3));
    const parsed = JSON.parse(jsonStr);
    const totalKb = parsed.TotalCapacity ?? 0;
    const freeKb = parsed.FreeCapacity ?? 0;
    return { freeKb, totalKb };
  } catch {
    return { freeKb: 0, totalKb: 0 };
  }
}

/** 断开 BLE 连接，清理所有挂起等待器 */
export function disconnect(): void {
  if (!session) return;
  for (const w of session.waiters) {
    clearTimeout(w.timer);
    w.reject(new Error('[BleV2] 连接主动断开'));
  }
  session.waiters = [];
  session.rawListeners = [];
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
