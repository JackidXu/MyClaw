/** 录音卡 Wi-Fi IPC 通道常量（升迈 T240/M2 协议） */
export const RecordingCardWifiIpc = {
  /** 渲染→主进程：建立 TCP Socket（用户已连接 Wi-Fi 热点后调用） */
  Connect: 'recording-card-wifi:connect',
  /** 渲染→主进程：断开 TCP Socket */
  Disconnect: 'recording-card-wifi:disconnect',
  /** 渲染→主进程：获取文件列表 */
  GetFiles: 'recording-card-wifi:get-files',
  /** 渲染→主进程：下载单个文件 */
  DownloadFile: 'recording-card-wifi:download-file',
  /** 主→渲染：下载进度推送 */
  DownloadProgress: 'recording-card-wifi:download-progress',
  /** 主→渲染：下载中断通知（Socket 断开，携带断点信息） */
  Interrupted: 'recording-card-wifi:interrupted',
  /** 渲染→主进程：取消当前下载 */
  Cancel: 'recording-card-wifi:cancel',
  /** 渲染→主进程：自动连接指定 Wi-Fi 热点（带超时与轮询） */
  AutoConnectWifi: 'recording-card-wifi:auto-connect',
  /** 渲染→主进程：获取宿主机当前连接的 Wi-Fi 名称 */
  GetCurrentWifi: 'recording-card-wifi:get-current-wifi',
  /** 渲染→主进程：恢复连接原有的 Wi-Fi 网络 */
  RestoreWifi: 'recording-card-wifi:restore-wifi',
  /** 渲染→主进程：探测宿主机是否真正连通公网（底层原生探针） */
  CheckOnline: 'recording-card-wifi:check-online',
} as const;

export type RecordingCardWifiIpc =
  typeof RecordingCardWifiIpc[keyof typeof RecordingCardWifiIpc];

/** 下载进度数据 */
export interface DownloadProgressData {
  filename: string;
  receivedBytes: number;
  frameIndex: number;
}

/** 下载中断数据（用于断点续传） */
export interface DownloadInterruptedData {
  filename: string;
  lastFrameIndex: number;
  lastFrameCrc: number;
}
