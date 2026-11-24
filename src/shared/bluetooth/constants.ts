/**
 * bluetooth.ts - 蓝牙设备发现与选择 IPC 通信契约
 */

export const BluetoothIpcChannels = {
  // 主进程向渲染层推流发现的蓝牙设备列表
  DevicesDiscovered: 'bluetooth:devices-discovered',
  // 渲染层通知主进程选中的目标设备 ID
  SelectDevice: 'bluetooth:select-device',
  // 渲染层取消当前蓝牙扫描/配对
  CancelDevice: 'bluetooth:cancel-device',
} as const;

export type BluetoothIpcChannels = (typeof BluetoothIpcChannels)[keyof typeof BluetoothIpcChannels];

export interface DiscoveredBluetoothDevice {
  deviceId: string;
  deviceName: string;
  // 物理 MAC 地址或从名称/广播中提取的短标识 (如 "045107968c78" 或 "8C78")
  deviceMac: string;
}
