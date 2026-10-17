/**
 * 本机录音资产相关数据模型与 IPC 常量
 *
 * 遵循“只存在本机”架构：音频文件、逐字稿与 AI 纪要持久化落库本地 SQLite。
 */

export const LocalRecordingIpc = {
  /** 获取本机所有录音记录列表 */
  GetList: 'local-recording:get-list',
  /** 获取单条录音详情 */
  GetById: 'local-recording:get-by-id',
  /** 保存录音音频二进制文件到本地磁盘，并返回本地绝对路径与元信息 */
  SaveAudioFile: 'local-recording:save-audio-file',
  /** 创建或更新录音记录 */
  UpsertRecord: 'local-recording:upsert-record',
  /** 删除单条录音记录（可选是否同步删除本地音频源文件） */
  DeleteRecord: 'local-recording:delete-record',
  /** 批量或单条更新录音状态 */
  UpdateStatus: 'local-recording:update-status',
  /** 读取本地音频二进制文件 */
  ReadAudioFile: 'local-recording:read-audio-file',
} as const;

export type LocalRecordingIpc = typeof LocalRecordingIpc[keyof typeof LocalRecordingIpc];

/** 录音转写状态枚举 */
export const LocalRecordingStatus = {
  /** 待转写 */
  Pending: 'pending',
  /** 转写中 */
  Transcribing: 'transcribing',
  /** 已转写·仅存在本机 */
  Transcribed: 'transcribed',
  /** 已入脑（已同步到第二大脑） */
  Synced: 'synced',
} as const;

export type LocalRecordingStatus = typeof LocalRecordingStatus[keyof typeof LocalRecordingStatus];

/** 说话人分句逐字稿项 */
export interface RecordingUtterance {
  id: number;
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
  timeStr: string;
}

/** AI 总结提炼出的认知/决策点 */
export interface RecordingExtractedItem {
  kind: string;
  text: string;
  suggestion: string;
}

/** 本机录音资产项完整模型 */
export interface LocalRecordingItem {
  id: string;
  name: string;
  title: string;
  localPath: string;
  duration: string;
  durationMs: number;
  size: number;
  sourceType: 'card' | 'imported';
  status: LocalRecordingStatus;
  taskId?: string;
  tosUrl?: string;
  tosKey?: string;
  transcriptText?: string;
  utterances?: RecordingUtterance[];
  summary?: string;
  items?: RecordingExtractedItem[];
  createdAt: number;
  updatedAt: number;
}
