/**
 * 第二大脑文档自动上传相关常量与类型定义
 */

export const SecondBrainAutoUploadIpc = {
  /** 打开系统原生文件夹选择对话框 */
  SelectWatchDir: 'secondBrain:selectWatchDir',
  /** 获取当前配置与运行状态 */
  GetConfig: 'secondBrain:getAutoUploadConfig',
  /** 保存配置并更新定时/扫描状态 */
  SetConfig: 'secondBrain:setAutoUploadConfig',
  /** 手动立即触发同步 */
  TriggerSync: 'secondBrain:triggerManualSync',
  /** 扫描目录待同步的新增或修改文件 */
  ScanPendingFiles: 'secondBrain:scanPendingFiles',
  /** 读取本地待上传文件的二进制内容 */
  ReadLocalFile: 'secondBrain:readLocalFile',
  /** 计算文件或数据的 MD5 哈希（复用主进程 Node crypto） */
  ComputeFileHash: 'secondBrain:computeFileHash',
  /** 状态变更通知（主进程 -> 渲染进程） */
  StatusChanged: 'secondBrain:autoUploadStatusChanged',
  /** 主进程定时器触发同步请求（主进程 -> 渲染进程） */
  TriggerSyncRequested: 'secondBrain:triggerSyncRequested',
} as const;

export type SecondBrainAutoUploadIpcChannel =
  typeof SecondBrainAutoUploadIpc[keyof typeof SecondBrainAutoUploadIpc];

/** 单文件最大大小限制：2MB（与手动上传保持一致） */
export const SECOND_BRAIN_MAX_FILE_SIZE = 2 * 1024 * 1024;

/** 单批次最大上传文档数量：10 份（与手动上传保持一致） */
export const SECOND_BRAIN_MAX_BATCH_COUNT = 10;

/** 定时扫描间隔：5 分钟（300,000 毫秒） */
export const SECOND_BRAIN_SYNC_INTERVAL_MS = 5 * 60 * 1000;

/** 支持的文档扩展名列表（全部小写） */
export const SECOND_BRAIN_SUPPORTED_EXTENSIONS = ['.docx', '.md', '.txt'] as const;
export type SecondBrainSupportedExtension = typeof SECOND_BRAIN_SUPPORTED_EXTENSIONS[number];

/** 自动同步配置 */
export interface SecondBrainAutoUploadConfig {
  /** 监听同步的本地目录绝对路径 */
  watchDir: string;
}

/** 自动同步运行状态 */
export interface SecondBrainAutoUploadStatus {
  /** 监听同步的本地目录绝对路径 */
  watchDir: string;
  /** 当前是否正在执行扫描或上传 */
  isSyncing: boolean;
}

/** 待同步的单个文件项 */
export interface SecondBrainPendingItem {
  filePath: string;
  fileName: string;
  mtimeMs: number;
  fileHash: string;
}

/** 批量预检单项文档请求信息 */
export interface PrecheckDocumentItem {
  name: string;
  fileHash: string;
  filePath?: string;
  mtimeMs?: number;
}

/** 批量预检可上传项（附带预签名凭据） */
export interface PrecheckUploadItem {
  name: string;
  fileHash: string;
  upload_url: string;
  tos_url: string;
  key: string;
}

/** 批量预检裁决结果 */
export interface PrecheckResult {
  /** 允许上传的项清单（服务端截断最多 10 个） */
  uploadItems: PrecheckUploadItem[];
  /** 云端查重已存在的 MD5 清单 */
  duplicateMd5s: string[];
}
