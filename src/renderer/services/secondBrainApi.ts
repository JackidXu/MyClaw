/**
 * 认知大脑（第二大脑）接口封装
 *
 * 域名说明：
 *   - 本地开发（npm run electron:dev）：https://dev-zhike.banchengyun.com
 *   - 正式打包：https://zhike.banchengyun.com
 *
 * 认证头：
 *   - claw_cookie  取 localStorage.heyclaw_session
 *   - claw_uid     取 localStorage.heyclaw_user_id
 */

/** 动态获取接口基础域名（import.meta.env.DEV 在开发环境为 true，打包后为 false） */
const getBaseUrl = () =>
  import.meta.env.DEV
    ? 'https://dev-zhike.banchengyun.com'
    : 'https://zhike.banchengyun.com';

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
  /** 已采纳认知条数 */
  adopted_count: number;
  /** 待确认认知条数 */
  pending_count: number;
  /** 学习资料数量 */
  material_count: number;
}

/** 待确认认知列表项 */
export interface CognitionItem {
  item_id: number;
  level: number;
  /** 1=经验案例 2=表达方式 3=行业判断 4=管理方式 5=商业理念 6=决策原则 */
  category: number;
  /** 认知完整内容 */
  content: string;
  /** 摘要 */
  summary: string;
  /** 原有认知摘要（发生认知变化时有值） */
  replace_summary?: string;
  /** 1=文档 2=会话 3=归纳 */
  source_type: number;
  /** 来源名称（文件名 / 对话名 / 归纳描述） */
  source_name: string;
  /** 置信度 0-100 */
  confidence: number;
  /** 创建时间（秒级时间戳） */
  create_time: number;
}

/** category 枚举文字映射 */
export const CATEGORY_LABEL: Record<number, string> = {
  1: '经验案例',
  2: '表达方式',
  3: '行业判断',
  4: '管理方式',
  5: '商业理念',
  6: '决策原则',
};

/** source_type 枚举文字映射 */
export const SOURCE_TYPE_LABEL: Record<number, string> = {
  1: '文档',
  2: '会话',
  3: '归纳',
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
  cognition_count: number;
  /** 对话消息数（type=chat 时有值） */
  messages_count?: number;
  create_time: number;
}

/** 资料列表响应（分页） */
export interface DocumentListResponse {
  total: number | string;
  per_page: number | string;
  current_page: number | string;
  last_page: number | string;
  data: DocumentItem[];
}

/** 预签名上传响应 */
export interface UploadPresignResponse {
  key: string;
  upload_url: string;
  tos_url: string;
}

/** Tab 对应的 type 参数 */
export const MATERIAL_TAB_TYPE: Record<string, string> = {
  '全部': 'all',
  '文档': 'document',
  '对话': 'chat',
};

/** 读取认证请求头，从 localStorage 取值 */
function buildAuthHeaders(): Record<string, string> {
  const session = localStorage.getItem('heyclaw_session') ?? '';
  const userId = localStorage.getItem('heyclaw_user_id') ?? '';
  return {
    'claw_cookie': session,
    'claw_uid': userId,
  };
}

/** 构建完整 URL */
function buildUrl(path: string): string {
  const base = getBaseUrl().replace(/\/+$/, '');
  const prefix = API_PREFIX.replace(/\/+$/, '');
  const pathname = path.startsWith('/') ? path : `/${path}`;
  return `${base}${prefix}${pathname}`;
}

/**
 * 通用 GET 请求
 * 成功条件：status === 'success' 且 code === 1
 */
async function get<T>(path: string): Promise<T> {
  const url = buildUrl(path);
  const headers = buildAuthHeaders();

  const resp = await (window.electron.api.fetch as (opts: {
    url: string;
    method: string;
    headers: Record<string, string>;
  }) => Promise<{ ok: boolean; status: number; data: unknown }>)({
    url,
    method: 'GET',
    headers,
  });

  if (!resp.ok) {
    throw new Error(`[SecondBrainApi] 请求失败 ${resp.status}: ${url}`);
  }

  const body = resp.data as SecondBrainResponse<T>;
  if (body.status !== 'success' || body.code !== 1) {
    throw new Error(`[SecondBrainApi] 业务错误: ${body.message ?? '未知错误'}`);
  }

  return body.data;
}

/**
 * 通用 POST 请求（JSON body）
 */
async function post<T>(path: string, payload?: unknown): Promise<T> {
  const url = buildUrl(path);
  const headers: Record<string, string> = {
    ...buildAuthHeaders(),
    'Content-Type': 'application/json',
  };

  const resp = await (window.electron.api.fetch as (opts: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  }) => Promise<{ ok: boolean; status: number; data: unknown }>)({
    url,
    method: 'POST',
    headers,
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });

  if (!resp.ok) {
    throw new Error(`[SecondBrainApi] 请求失败 ${resp.status}: ${url}`);
  }

  const body = resp.data as SecondBrainResponse<T>;
  if (body.status !== 'success' || body.code !== 1) {
    throw new Error(`[SecondBrainApi] 业务错误: ${body.message ?? '未知错误'}`);
  }

  return body.data;
}

/** ----------------------------------------
 *  业务接口
 * ---------------------------------------- */

/** 获取认知大脑统计数据 */
export async function fetchCognitionStats(): Promise<CognitionStats> {
  return get<CognitionStats>('/cognition/stats');
}

/** 获取待确认认知列表 */
export async function fetchCognitionItemList(): Promise<CognitionItem[]> {
  return get<CognitionItem[]>('/cognition/itemList');
}

/** 采纳认知（content/summary 可选，传入时以修改后的内容为准） */
export async function adoptCognitionItem(params: {
  itemId: number;
  content?: string;
  summary?: string;
}): Promise<void> {
  await post<unknown>('/cognition/itemAdopt', params);
}

/** 驳回认知 */
export async function rejectCognitionItem(itemId: number): Promise<void> {
  await post<unknown>('/cognition/itemReject', { itemId });
}

/** 获取学习资料列表（分页） */
export async function fetchDocumentList(params: {
  type: string;
  page: number;
  pageSize: number;
}): Promise<DocumentListResponse> {
  const query = new URLSearchParams({
    type: params.type,
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  return get<DocumentListResponse>(`/cognition/document/list?${query.toString()}`);
}

/** 获取预签名上传参数 */
export async function fetchUploadPresignedUrl(): Promise<UploadPresignResponse> {
  return get<UploadPresignResponse>('/cognition/document/upload');
}

/** 将文件直接 PUT 上传至 TOS 预签名地址（跨主进程请求绕过 CORS 限制） */
export async function uploadFileToTos(uploadUrl: string, file: File): Promise<void> {
  const content = await file.text();
  const resp = await (window.electron.api.fetch as (opts: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  }) => Promise<{ ok: boolean; status: number; data: unknown }>)({
    url: uploadUrl,
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: content,
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
  await post<unknown>('/cognition/document/create', params);
}

/** 获取资料下载地址 */
export async function downloadDocument(documentId: number): Promise<{ download_url: string }> {
  return post<{ download_url: string }>('/cognition/document/download', { documentId });
}

/** 删除资料 */
export async function deleteDocument(documentId: number): Promise<void> {
  await post<unknown>('/cognition/document/delete', { documentId });
}

export interface CognitionInjectionData {
  prompt?: string;
  version?: number;
}

/** 获取认知注入 System prompt (GET /cognition/injection) */
export async function fetchCognitionInjection(): Promise<string> {
  try {
    const res = await get<CognitionInjectionData | string>('/cognition/injection');
    if (typeof res === 'string') return res;
    if (typeof res === 'object' && res !== null) {
      return res.prompt ?? '';
    }
    return '';
  } catch (err) {
    console.warn('[SecondBrain] fetchCognitionInjection error:', err);
    return '';
  }
}

export interface ChatReportParams {
  chatId: string;
  name?: string;
  messages: Array<{
    user: string;
    assistant: string;
  }>;
}

/** 对话上报接口 (POST /cognition/chat/report) */
export async function reportChatSession(params: ChatReportParams): Promise<void> {
  try {
    await post<unknown>('/cognition/chat/report', params);
  } catch (err) {
    console.warn('[SecondBrain] reportChatSession error:', err);
  }
}

export const secondBrainApi = {
  fetchCognitionStats,
  fetchCognitionItemList,
  adoptCognitionItem,
  rejectCognitionItem,
  fetchDocumentList,
  fetchUploadPresignedUrl,
  uploadFileToTos,
  createDocument,
  downloadDocument,
  deleteDocument,
  fetchCognitionInjection,
  reportChatSession,
  get,
  post,
};

