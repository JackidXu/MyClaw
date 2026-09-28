/**
 * 第二大脑（第二大脑）接口封装
 *
 * 认证头：
 *   - Authorization: Bearer <session> (取 localStorage.heyclaw_session)
 */

import {
  PrecheckDocumentItem,
  PrecheckResult,
  PrecheckUploadItem,
  SECOND_BRAIN_MAX_BATCH_COUNT,
  SECOND_BRAIN_SUPPORTED_EXTENSIONS,
} from '../../shared/secondBrain/constants';
import { httpClient } from './httpClient';

/** 接口路径前缀 */
const API_PREFIX = '/api/chaohuixie/claw';

/** 后端统一响应格式 */
interface SecondBrainResponse<T = unknown> {
  status: string;
  message: string;
  code: number;
  data: T;
}

/** 统计数据 */
export interface CognitionStats {
  /** 持续学习天数 */
  learning_days: number;
  /** 今日被调用次数 */
  usage_count_today?: number;
  /** 已采纳认知条数 */
  adopted_count: number;
  /** 昨日新增采纳条数 */
  adopted_count_yesterday?: number;
  /** 待确认认知条数 */
  pending_count: number;
  /** 学习资料数量 */
  material_count: number;
  /** 近 7 日上传文件数 */
  material_count_7d?: number;
}

/** 认知变更原有项（冲突旧认知） */
export interface ReplacedCognition {
  proposition: string;
  elaboration: string;
}

/** 待确认认知列表项 */
export interface CognitionItem {
  node_id: number;
  uid?: number;
  status?: number;
  /** 认知层级：0=思维模型 1=价值观念 2=决策规则 3=工作方式 4=行业知识 5=案例经验 6=表达方式 */
  layer: number;
  /** 认知命题（标题） */
  proposition: string;
  /** 认知阐述（详情） */
  elaboration: string;
  /** 冲突/变更旧认知，有冲突时为对象，无冲突时为 null */
  replaces?: ReplacedCognition | null;
  replaces_node_id?: number;
  source_id?: number;
  /** 1=文档 2=会话 3=归纳 */
  source_type: number;
  /** 来源名称（文件名 / 对话名 / 归纳描述） */
  source_name?: string;
  /** 置信度 0-100 */
  confidence: number;
  /** 创建时间（秒级时间戳） */
  create_time: string | number;
  update_time?: string | number;
}

/** 认知层级 layer 枚举文字映射：0=思维模型 1=价值观念 2=决策规则 3=工作方式 4=行业知识 5=案例经验 6=表达方式 */
export const LAYER_LABEL: Record<number, string> = {
  0: '思维模型',
  1: '价值观念',
  2: '决策规则',
  3: '工作方式',
  4: '行业知识',
  5: '案例经验',
  6: '表达方式',
};

/** source_type 枚举文字映射 */
export const SOURCE_TYPE_LABEL: Record<number, string> = {
  1: '文档',
  2: '会话',
  3: '音频',
  9: '归纳',
};

/** 资料 status 枚举：0=待萃取 1=萃取中 2=已萃取 3=萃取失败 */
export const DOCUMENT_STATUS = {
  Pending: 0,
  Processing: 1,
  Done: 2,
  Failed: 3,
} as const;

/** 资料列表单项 */
export interface DocumentItem {
  /** 类型：document=文档 chat=对话 */
  type: 'document' | 'chat';
  id: number;
  name: string;
  /** 0=待萃取 1=萃取中 2=已萃取 3=萃取失败 */
  extract_status: number;
  /** 已萃取认知条数 */
  extract_count: number;
  /** 对话消息数（type=chat 时有值） */
  messages_count?: number;
  create_time: number;
}

/** 文档列表单项（后端实际返回字段） */
export interface DocumentListItem {
  document_id: number;
  name: string;
  /** 0=待萃取 1=萃取中 2=已萃取 3=萃取失败 */
  extract_status: number;
  /** 已萃取认知条数 */
  extract_count: number;
  create_time: string | number;
}

/** 资料列表响应（分页） */
export interface DocumentListResponse {
  total: number | string;
  per_page: number | string;
  current_page: number | string;
  last_page: number | string;
  data: DocumentListItem[];
}

/** 待确认认知列表响应（分页） */
export interface CognitionListResponse {
  total: number | string;
  per_page: number | string;
  current_page: number | string;
  last_page: number | string;
  data: CognitionItem[];
}

/** 预签名上传响应 */
export interface UploadPresignResponse {
  key: string;
  upload_url: string;
  tos_url: string;
}

/** 对话列表单项 */
export interface ChatListItem {
  chat_id: number;
  name: string;
  /** 0=待萃取 1=萃取中 2=已萃取 3=萃取失败 */
  extract_status: number;
  /** 已萃取认知条数 */
  extract_count: number;
  create_time: string | number;
}

/** 对话列表响应（分页） */
export interface ChatListResponse {
  total: number | string;
  per_page: number | string;
  current_page: number | string;
  last_page: number | string;
  data: ChatListItem[];
}

/** 音频列表单项（后端实际返回字段） */
export interface AudioListItem {
  audio_id: number;
  name: string;
  /** 时长（毫秒） */
  duration: number;
  /** 0=待萃取 1=萃取中 2=已萃取 3=萃取失败 */
  extract_status: number;
  /** 已萃取认知条数 */
  extract_count: number;
  create_time: string | number;
}

/** 音频列表响应（分页） */
export interface AudioListResponse {
  total: number | string;
  per_page: number | string;
  current_page: number | string;
  last_page: number | string;
  data: AudioListItem[];
}

/** Tab 对应的 type 参数 */
export const MATERIAL_TAB_TYPE: Record<string, string> = {
  '文档': 'document',
  '对话': 'chat',
};

/** 构建 API 路径 */
function buildPath(path: string): string {
  const prefix = API_PREFIX.replace(/\/+$/, '');
  const pathname = path.startsWith('/') ? path : `/${path}`;
  return `${prefix}${pathname}`;
}

/**
 * 通用 GET 请求
 * 成功条件：status === 'success' 且 code === 1
 */
async function get<T>(path: string): Promise<T> {
  const apiPath = buildPath(path);
  const resp = await httpClient.biz.get<SecondBrainResponse<T>>(apiPath);

  if (!resp.ok) {
    const errDetail = resp.error || (resp.status === 0 ? '网络未连通或连接超时' : `HTTP ${resp.status}`);
    throw new Error(`[SecondBrainApi] 请求失败 (${errDetail}): ${apiPath}`);
  }

  const body = resp.data;
  if (!body || body.status !== 'success' || body.code !== 1) {
    throw new Error(`[SecondBrainApi] 业务错误: ${body?.message ?? resp.error ?? '未知错误'}`);
  }

  return body.data;
}

/**
 * 通用 POST 请求（JSON body）
 */
async function post<T>(path: string, payload?: unknown): Promise<T> {
  const apiPath = buildPath(path);
  const resp = await httpClient.biz.post<SecondBrainResponse<T>>(apiPath, payload);

  if (!resp.ok) {
    const errDetail = resp.error || (resp.status === 0 ? '网络未连通或连接超时' : `HTTP ${resp.status}`);
    throw new Error(`[SecondBrainApi] 请求失败 (${errDetail}): ${apiPath}`);
  }

  const body = resp.data;
  if (!body || body.status !== 'success' || body.code !== 1) {
    throw new Error(`[SecondBrainApi] 业务错误: ${body?.message ?? resp.error ?? '未知错误'}`);
  }

  return body.data;
}

/** ----------------------------------------
 *  业务接口
 * ---------------------------------------- */

/** 获取第二大脑统计数据 */
export async function fetchCognitionStats(): Promise<CognitionStats> {
  return get<CognitionStats>('/fmp/stats');
}

/** 每周趋势项 */
export interface TrendWeekItem {
  week_start: string;
  week_end: string;
  label: string;
  adopted_count: number;
  usage_count: number;
}

/** 每周趋势响应 */
export interface CognitionTrendResponse {
  weeks: TrendWeekItem[];
}

/** 获取每周趋势（近 N 周沉淀与调用频次） */
export async function fetchCognitionTrend(weeks = 8): Promise<CognitionTrendResponse> {
  return get<CognitionTrendResponse>(`/fmp/trend?weeks=${weeks}`);
}

/** 认知列表查询参数 */
export interface FetchCognitionItemListParams {
  page?: number;
  pageSize?: number;
  /** 状态：0 待审核 / 1 已采纳 / 2 已驳回 / 3 已失效 */
  status?: number;
  /** 层级过滤：0~6 */
  layer?: number;
  /** 是否已失效：0 仅未失效 / 1 仅已失效 */
  superseded?: number;
  /** 创建时间范围开始 */
  createTimeStart?: string;
  /** 创建时间范围结束 */
  createTimeEnd?: string;
}

/** 获取认知列表(支持待审核、已采纳、时间范围等过滤) */
export async function fetchCognitionItemList(params: FetchCognitionItemListParams = {}): Promise<CognitionListResponse> {
  const query = new URLSearchParams();
  if (params.page !== undefined) query.set('page', String(params.page));
  if (params.pageSize !== undefined) query.set('pageSize', String(params.pageSize));
  if (params.status !== undefined) query.set('status', String(params.status));
  if (params.layer !== undefined) query.set('layer', String(params.layer));
  if (params.superseded !== undefined) query.set('superseded', String(params.superseded));
  if (params.createTimeStart) query.set('createTimeStart', params.createTimeStart);
  if (params.createTimeEnd) query.set('createTimeEnd', params.createTimeEnd);

  return get<CognitionListResponse>(`/fmp/node/list?${query.toString()}`);
}

/** 采纳认知（proposition/elaboration 可选，传入时以修改后的内容为准） */
export async function adoptCognitionItem(params: {
  nodeId: number;
  proposition?: string;
  elaboration?: string;
}): Promise<void> {
  await post<unknown>('/fmp/node/adopt', params);
}

/** 驳回认知 */
export async function rejectCognitionItem(nodeId: number): Promise<void> {
  await post<unknown>('/fmp/node/reject', { nodeId });
}

/** 获取学习资料文档列表（分页） */
export async function fetchDocumentList(params: {
  page: number;
  pageSize: number;
}): Promise<DocumentListResponse> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  return get<DocumentListResponse>(`/fmp/document/list?${query.toString()}`);
}

/** 获取对话列表（分页，GET /fmp/chat/list） */
export async function fetchChatList(params: {
  page: number;
  pageSize: number;
}): Promise<ChatListResponse> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  return get<ChatListResponse>(`/fmp/chat/list?${query.toString()}`);
}

export interface PresignedUrlResult {
  alreadyExists?: boolean;
  message?: string;
  data?: UploadPresignResponse;
}

/** 获取预签名上传参数（支持 md5 哈希查重检测） */
export async function fetchUploadPresignedUrl(md5?: string): Promise<PresignedUrlResult> {
  const query = md5 ? `?md5=${encodeURIComponent(md5)}` : '';
  const apiPath = buildPath(`/fmp/document/upload${query}`);
  const resp = await httpClient.biz.get<SecondBrainResponse<UploadPresignResponse>>(apiPath);

  if (!resp.ok) {
    const errDetail = resp.error || (resp.status === 0 ? '网络未连通或连接超时' : `HTTP ${resp.status}`);
    throw new Error(`[SecondBrainApi] 获取预签名上传参数失败 (${errDetail})`);
  }

  const body = resp.data;
  // 1. 命中文件哈希已存在（code === 40001 或 message 包含已上传）
  if (body?.code === 40001 || (body?.status === 'error' && body?.message?.includes('已上传'))) {
    return {
      alreadyExists: true,
      message: body?.message || '该文件已上传过，无需重复上传',
    };
  }

  // 2. 正常成功
  if (body && body.status === 'success' && body.code === 1 && body.data) {
    return {
      alreadyExists: false,
      data: body.data,
    };
  }

  // 3. 其它业务错误
  throw new Error(body?.message || resp.error || '获取上传参数失败');
}

/** 第二大脑支持格式标准 MIME 类型映射 */
export const SECOND_BRAIN_MIME_MAP: Record<string, string> = {
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

/** 根据文件名推导标准 MIME Content-Type */
export function getDocumentMimeType(fileName: string): string {
  const ext = '.' + fileName.split('.').pop()?.toLowerCase();
  return SECOND_BRAIN_MIME_MAP[ext] || 'application/octet-stream';
}

/** 将文件直接 PUT 上传至 TOS 预签名地址（跨主进程请求绕过 CORS 限制） */
export async function uploadFileToTos(
  uploadUrl: string,
  file: File | Blob | ArrayBuffer | Uint8Array,
  mimeType?: string,
): Promise<void> {
  let arrayBuffer: ArrayBuffer;
  let contentType = mimeType;

  if (file instanceof ArrayBuffer) {
    arrayBuffer = file;
  } else if (file instanceof Uint8Array) {
    arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  } else {
    arrayBuffer = await file.arrayBuffer();
    if (!contentType && 'type' in file && file.type) {
      contentType = file.type;
    }
  }

  if (!contentType) {
    contentType = 'application/octet-stream';
  }

  const resp = await (window.electron.api.fetch as (opts: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string | ArrayBuffer | Uint8Array;
  }) => Promise<{ ok: boolean; status: number; data: unknown }>)({
    url: uploadUrl,
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: arrayBuffer,
  });

  if (!resp.ok) {
    throw new Error(`[TOS Upload] 上传文件失败 HTTP ${resp.status}`);
  }
}

/** 创建资料记录 */
export async function createDocument(params: {
  name: string;
  tosUrl: string;
  tosKey: string;
}): Promise<void> {
  await post<unknown>('/fmp/document/create', params);
}

/** 批量预签名前端请求响应数据结构 */
export interface UploadBatchResponseData {
  list: Array<{
    md5: string;
    dedup_checked: boolean;
    key: string;
    upload_url: string;
    tos_url: string;
  }>;
  duplicated: Array<{
    md5: string;
    document_id: number;
    extract_status: number;
  }>;
}

/**
 * 预检文档列表（云端单一真理来源查重 + 截断下发预签名）
 * 对接 PHP 后端接口：POST /fmp/document/uploadBatch
 */
export async function precheckDocuments(
  items: PrecheckDocumentItem[],
  _maxUploads: number = SECOND_BRAIN_MAX_BATCH_COUNT,
): Promise<PrecheckResult> {
  const md5s = items.map((item) => item.fileHash).filter(Boolean);
  if (md5s.length === 0) {
    return { uploadItems: [], duplicateMd5s: [] };
  }

  const res = await post<UploadBatchResponseData>('/fmp/document/uploadBatch', { md5s });

  const uploadItems: PrecheckUploadItem[] = (res?.list || []).map((listItem) => {
    const matched = items.find((i) => i.fileHash === listItem.md5);
    return {
      name: matched?.name || listItem.md5,
      fileHash: listItem.md5,
      upload_url: listItem.upload_url,
      tos_url: listItem.tos_url,
      key: listItem.key,
    };
  });

  const duplicateMd5s: string[] = (res?.duplicated || []).map((d) => d.md5);

  return {
    uploadItems,
    duplicateMd5s,
  };
}

/**
 * 统一文档上传与创建记录核心方法（手动单选上传使用）
 */
export async function uploadAndCreateDocument(params: {
  name: string;
  content: File | Blob | ArrayBuffer | Uint8Array;
  mimeType?: string;
  fileHash?: string;
  filePath?: string;
  mtimeMs?: number;
}): Promise<{ name: string; tosUrl?: string; tosKey?: string; isDuplicate: boolean }> {
  // 1. 若未显式传入 fileHash，通过主进程 Node 原生 crypto 计算 MD5 哈希
  let fileHash = params.fileHash;
  if (!fileHash && params.content) {
    try {
      const localPath = params.filePath || (params.content as any).path;
      if (typeof localPath === 'string' && localPath) {
        const hashRes = await window.electron.secondBrainAutoUpload?.computeFileHash?.({ filePath: localPath });
        if (hashRes?.success && hashRes.hash) {
          fileHash = hashRes.hash;
        }
      }
      if (!fileHash) {
        let uint8Array: Uint8Array | undefined;
        if (params.content instanceof Uint8Array) {
          uint8Array = params.content;
        } else if (params.content instanceof ArrayBuffer) {
          uint8Array = new Uint8Array(params.content);
        } else if (params.content instanceof Blob) {
          const ab = await params.content.arrayBuffer();
          uint8Array = new Uint8Array(ab);
        }
        if (uint8Array) {
          const hashRes = await window.electron.secondBrainAutoUpload?.computeFileHash?.({ buffer: uint8Array });
          if (hashRes?.success && hashRes.hash) {
            fileHash = hashRes.hash;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. 向云端请求预签名并查重（云端为唯一真理来源，彻底移除本地 SQLite 判定）
  const presignRes = await fetchUploadPresignedUrl(fileHash);

  if (presignRes.alreadyExists) {
    return { name: params.name, isDuplicate: true };
  }

  if (!presignRes.data) {
    throw new Error('未获取到有效的预签名上传凭据');
  }

  const { upload_url, tos_url, key } = presignRes.data;

  // 3. 直传 TOS
  await uploadFileToTos(upload_url, params.content, params.mimeType);

  // 4. 录入第二大脑开始 AI 萃取
  await createDocument({
    name: params.name,
    tosUrl: tos_url,
    tosKey: key,
  });

  return { name: params.name, tosUrl: tos_url, tosKey: key, isDuplicate: false };
}

/** 批量上传条目项 */
export interface BatchUploadItem {
  name: string;
  content?: File | Blob | ArrayBuffer | Uint8Array;
  filePath?: string;
  mtimeMs?: number;
  fileHash?: string;
}

/** 批量上传配置选项 */
export interface BatchUploadOptions {
  /** 单批次最大真实上传数量（默认 10） */
  maxRealUploads?: number;
  /** 单个文件处理回调 */
  onItemProgress?: (item: BatchUploadItem, index: number, total: number) => void;
}

/** 批量上传返回结果 */
export interface BatchUploadResult {
  /** 真实消耗带宽与算力完成上传的文件数 */
  realUploadedCount: number;
  /** 云端查重已存在跳过的文件数 */
  skippedCount: number;
  /** 上传失败的文件列表 */
  failedItems: Array<{ name: string; error: string }>;
  /** 因单批次配额（默认 10 份）截断未在本批次处理的待上传有效新文件数 */
  truncatedCount: number;
}

/**
 * 统一批量上传调度器（手动多选上传与自动同步 100% 复用）
 *
 * 核心流程：
 * 1. 确保所有待传项具备 fileHash；
 * 2. 一次性调用预检接口 precheckDocuments，由云端返回重复项列表与最多 10 个待上传文件的 TOS 预签名凭据；
 * 3. 针对下发了凭据的文件执行直传 TOS 与落库；
 * 4. 统计结果结构化返回。
 */
export async function batchUploadDocuments(
  items: BatchUploadItem[],
  options: BatchUploadOptions = {},
): Promise<BatchUploadResult> {
  const maxRealUploads = options.maxRealUploads ?? SECOND_BRAIN_MAX_BATCH_COUNT;

  let realUploadedCount = 0;
  let skippedCount = 0;
  const failedItems: Array<{ name: string; error: string }> = [];

  if (items.length === 0) {
    return { realUploadedCount: 0, skippedCount: 0, failedItems: [], truncatedCount: 0 };
  }

  // 1. 过滤非支持格式、隐藏文件与 Office 临时锁文件，并补齐 fileHash
  const preparedItems: BatchUploadItem[] = [];
  for (const item of items) {
    // 忽略隐藏文件与 Office 临时锁文件（如 ~$xxx.docx）
    if (item.name.startsWith('.') || item.name.startsWith('~$')) {
      continue;
    }

    const ext = '.' + item.name.split('.').pop()?.toLowerCase();
    if (!SECOND_BRAIN_SUPPORTED_EXTENSIONS.includes(ext as any)) {
      // 忽略图片、音频、视频等非文本资料，绝不读取磁盘与计算 MD5
      continue;
    }

    let hash = item.fileHash;
    if (!hash && item.filePath) {
      try {
        const hashRes = await window.electron.secondBrainAutoUpload?.computeFileHash?.({ filePath: item.filePath });
        if (hashRes?.success && hashRes.hash) {
          hash = hashRes.hash;
        }
      } catch {
        // ignore
      }
    }

    if (!hash && item.content) {
      try {
        let uint8Array: Uint8Array | undefined;
        if (item.content instanceof Uint8Array) {
          uint8Array = item.content;
        } else if (item.content instanceof ArrayBuffer) {
          uint8Array = new Uint8Array(item.content);
        } else if (item.content instanceof Blob) {
          const ab = await item.content.arrayBuffer();
          uint8Array = new Uint8Array(ab);
        }
        if (uint8Array) {
          const hashRes = await window.electron.secondBrainAutoUpload?.computeFileHash?.({ buffer: uint8Array });
          if (hashRes?.success && hashRes.hash) {
            hash = hashRes.hash;
          }
        }
      } catch {
        // ignore
      }
    }

    if (!hash) {
      failedItems.push({ name: item.name, error: '无法计算文件校验码' });
      continue;
    }

    preparedItems.push({
      ...item,
      fileHash: hash,
    });
  }

  // 2. 批量调用云端预检与配额下发接口
  const precheckItems: PrecheckDocumentItem[] = preparedItems
    .filter((item): item is BatchUploadItem & { fileHash: string } => Boolean(item.fileHash))
    .map((item) => ({
      name: item.name,
      fileHash: item.fileHash,
      filePath: item.filePath,
      mtimeMs: item.mtimeMs,
    }));

  const precheckRes = await precheckDocuments(precheckItems, maxRealUploads);
  skippedCount = precheckRes.duplicateMd5s.length;

  // 3. 对预检返回的待上传项依次执行直传 TOS 与创建文档
  const totalToUpload = precheckRes.uploadItems.length;
  for (let i = 0; i < totalToUpload; i++) {
    const uploadItem = precheckRes.uploadItems[i];
    const sourceItem =
      preparedItems.find(
        (item) => item.fileHash === uploadItem.fileHash && item.name === uploadItem.name,
      ) || preparedItems.find((item) => item.fileHash === uploadItem.fileHash);

    if (!sourceItem) {
      continue;
    }

    options.onItemProgress?.(sourceItem, i, totalToUpload);

    try {
      let content = sourceItem.content;
      if (!content && sourceItem.filePath) {
        const readRes = await window.electron.secondBrainAutoUpload?.readLocalFile?.(sourceItem.filePath);
        if (!readRes?.success || !readRes.data) {
          throw new Error(readRes?.error || '无法读取本地文件内容');
        }
        content = readRes.data;
      }

      if (!content) {
        throw new Error('未提供有效的文件内容');
      }

      // 直传 TOS（自动推导标准 MIME Content-Type，确保与自动同步 100% 一致）
      const mimeType = getDocumentMimeType(uploadItem.name);
      await uploadFileToTos(uploadItem.upload_url, content, mimeType);

      // 录入第二大脑开始 AI 萃取
      await createDocument({
        name: uploadItem.name,
        tosUrl: uploadItem.tos_url,
        tosKey: uploadItem.key,
      });

      realUploadedCount++;
    } catch (err: any) {
      const errMsg = err instanceof Error ? err.message : String(err || '上传失败');
      failedItems.push({ name: uploadItem.name, error: errMsg });
    }
  }

  // 计算因单批配额截断未上传的有效新文件数
  const truncatedCount = Math.max(0, precheckItems.length - skippedCount - precheckRes.uploadItems.length);

  return {
    realUploadedCount,
    skippedCount,
    failedItems,
    truncatedCount,
  };
}

/** 获取资料下载地址 */
export async function downloadDocument(documentId: number): Promise<{ download_url: string }> {
  return post<{ download_url: string }>('/fmp/document/download', { documentId });
}

/** 删除资料 */
export async function deleteDocument(documentId: number): Promise<void> {
  await post<unknown>('/fmp/document/delete', { documentId });
}

/** 删除对话 */
export async function deleteChat(chatId: string | number): Promise<void> {
  await post<unknown>('/fmp/chat/delete', { chatId });
}

/** 重新萃取资料 */
export async function reExtractDocument(documentId: number): Promise<void> {
  await post<unknown>('/fmp/document/reExtract', { documentId });
}

/** 获取音频预签名上传参数 */
export async function fetchAudioUploadPresignedUrl(): Promise<UploadPresignResponse> {
  return get<UploadPresignResponse>('/fmp/audio/upload');
}

/** 创建音频记录（触发 ASR + 萃取） */
export async function createAudio(params: {
  name: string;
  tosUrl: string;
  tosKey: string;
}): Promise<void> {
  await post<unknown>('/fmp/audio/create', params);
}

/** 获取音频列表（分页） */
export async function fetchAudioList(params: {
  page: number;
  pageSize: number;
}): Promise<AudioListResponse> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  return get<AudioListResponse>(`/fmp/audio/list?${query.toString()}`);
}

/** 删除音频 */
export async function deleteAudio(audioId: number): Promise<void> {
  await post<unknown>('/fmp/audio/delete', { audioId });
}

/** 重新萃取音频 */
export async function reExtractAudio(audioId: number): Promise<void> {
  await post<unknown>('/fmp/audio/reExtract', { audioId });
}




/** /fmp/injectPrompt 响应数据结构（会话级，每次新会话调用） */
export interface FmpPromptResult {
  /** 精简后的认知注入提示词 */
  prompt: string;
  /** 数据版本号 */
  version?: number;
  /** 是否来自后端缓存 */
  cached?: boolean;
}

/** 获取会话级认知注入提示词（GET /fmp/injectPrompt，每次新会话调用） */
export async function fetchCognitionPrompt(): Promise<FmpPromptResult> {
  try {
    const res = await get<FmpPromptResult>('/fmp/injectPrompt');
    return {
      prompt: typeof res.prompt === 'string' ? res.prompt : '',
      version: res.version,
      cached: res.cached,
    };
  } catch (err) {
    console.warn('[SecondBrain] fetchCognitionPrompt error:', err);
    return { prompt: '' };
  }
}


/** 人设数据结构 */
export interface PersonaData {
  name: string;
  business: string;
  industry?: string;
  positioning?: string;
}

/** 更新人设参数 */
export interface UpdatePersonaParams {
  name: string;
  business: string;
  industry?: string;
  positioning?: string;
}

/** 获取人设详情 (GET /fmp/persona/detail) */
export async function fetchPersonaDetail(): Promise<PersonaData | null> {
  return get<PersonaData | null>('/fmp/persona/detail');
}

/** 更新人设信息 (POST /fmp/persona/update) */
export async function updatePersona(params: UpdatePersonaParams): Promise<void> {
  await post<unknown>('/fmp/persona/update', params);
}

export const secondBrainApi = {
  fetchCognitionStats,
  fetchCognitionItemList,
  adoptCognitionItem,
  rejectCognitionItem,
  fetchDocumentList,
  fetchChatList,
  fetchUploadPresignedUrl,
  uploadFileToTos,
  createDocument,
  downloadDocument,
  deleteDocument,
  deleteChat,
  reExtractDocument,
  fetchCognitionPrompt,
  fetchPersonaDetail,
  updatePersona,
  get,
  post,
};


