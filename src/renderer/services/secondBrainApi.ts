/**
 * 第二大脑（第二大脑）接口封装
 *
 * 认证头：
 *   - Authorization: Bearer <session> (取 localStorage.heyclaw_session)
 */

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
    throw new Error(`[SecondBrainApi] 请求失败 ${resp.status}: ${apiPath}`);
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
    throw new Error(`[SecondBrainApi] 请求失败 ${resp.status}: ${apiPath}`);
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

/** 获取对话列表（分页，POST /fmp/chat/list） */
export async function fetchChatList(params: {
  page: number;
  pageSize: number;
}): Promise<ChatListResponse> {
  return post<ChatListResponse>('/fmp/chat/list', params);
}

/** 获取预签名上传参数 */
export async function fetchUploadPresignedUrl(): Promise<UploadPresignResponse> {
  return get<UploadPresignResponse>('/fmp/document/upload');
}

/** 将文件直接 PUT 上传至 TOS 预签名地址（跨主进程请求绕过 CORS 限制） */
export async function uploadFileToTos(uploadUrl: string, file: File): Promise<void> {
  const arrayBuffer = await file.arrayBuffer();
  const resp = await (window.electron.api.fetch as (opts: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string | ArrayBuffer | Uint8Array;
  }) => Promise<{ ok: boolean; status: number; data: unknown }>)({
    url: uploadUrl,
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
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

/** 工具函数定义（来自 /fmp/injectTools） */
export interface FmpToolFunction {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

/** 工具项（来自 /fmp/injectTools） */
export interface FmpTool {
  type: 'function';
  function: FmpToolFunction;
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

/** /fmp/injectTools 响应数据结构（应用级，启动时一次性加载） */
export interface FmpToolsResult {
  /** 需要注册给大模型的工具列表 */
  tools: FmpTool[];
  /** 数据版本号 */
  version?: number;
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

/** 获取应用级工具列表（GET /fmp/injectTools，应用初始化时调用一次） */
export async function fetchCognitionTools(): Promise<FmpToolsResult> {
  try {
    const res = await get<FmpToolsResult>('/fmp/injectTools');
    return {
      tools: Array.isArray(res.tools) ? res.tools : [],
      version: res.version,
    };
  } catch (err) {
    console.warn('[SecondBrain] fetchCognitionTools error:', err);
    return { tools: [] };
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

/** 对话上报接口 (POST /fmp/chat/report) */
export async function reportChatSession(params: ChatReportParams): Promise<void> {
  try {
    await post<unknown>('/fmp/chat/report', params);
  } catch (err) {
    console.warn('[SecondBrain] reportChatSession error:', err);
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
  fetchCognitionTools,
  reportChatSession,
  fetchPersonaDetail,
  updatePersona,
  get,
  post,
};


