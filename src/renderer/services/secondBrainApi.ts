/**
 * 第二大脑（第二大脑）接口封装
 *
 * 域名说明：
 *   - 本地开发（npm run electron:dev）：https://dev-zhike.banchengyun.com
 *   - 正式打包：https://zhike.banchengyun.com
 *
 * 认证头：
 *   - Authorization: Bearer <session> (取 localStorage.heyclaw_session)
 */

import { httpClient } from './httpClient';

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

/** 认知变更原有项 */
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
  /** 是否有认知变化，非空数组表示有变化 */
  replaces?: ReplacedCognition[] | null;
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

/** 资料列表响应（分页） */
export interface DocumentListResponse {
  total: number | string;
  per_page: number | string;
  current_page: number | string;
  last_page: number | string;
  data: DocumentItem[];
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

/** Tab 对应的 type 参数 */
export const MATERIAL_TAB_TYPE: Record<string, string> = {
  '全部': 'all',
  '文档': 'document',
  '对话': 'chat',
};

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
  const resp = await httpClient.get<SecondBrainResponse<T>>(url);

  if (!resp.ok) {
    throw new Error(`[SecondBrainApi] 请求失败 ${resp.status}: ${url}`);
  }

  const body = resp.data;
  if (!body || body.status !== 'success' || body.code !== 1) {
    throw new Error(`[SecondBrainApi] 业务错误: ${body?.message ?? '未知错误'}`);
  }

  return body.data;
}

/**
 * 通用 POST 请求（JSON body）
 */
async function post<T>(path: string, payload?: unknown): Promise<T> {
  const url = buildUrl(path);
  const resp = await httpClient.post<SecondBrainResponse<T>>(url, payload);

  if (!resp.ok) {
    throw new Error(`[SecondBrainApi] 请求失败 ${resp.status}: ${url}`);
  }

  const body = resp.data;
  if (!body || body.status !== 'success' || body.code !== 1) {
    throw new Error(`[SecondBrainApi] 业务错误: ${body?.message ?? '未知错误'}`);
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

/** 获取待确认认知列表(分页) */
export async function fetchCognitionItemList(params: {
  page: number;
  pageSize: number;
}): Promise<CognitionListResponse> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
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
  return get<DocumentListResponse>(`/fmp/document/list?${query.toString()}`);
}

/** 获取预签名上传参数 */
export async function fetchUploadPresignedUrl(): Promise<UploadPresignResponse> {
  return get<UploadPresignResponse>('/fmp/document/upload');
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

/** /fmp/retrieve 返回的单条认知节点 */
export interface FmpRetrieveItem {
  type: 'node';
  id: number;
  /** 认知层级：0=思维模型 1=价值观念 2=决策规则 3=工作方式 4=行业知识 5=案例经验 6=表达方式 */
  layer: number;
  text: string;
  /** 归一化后的相关性分数 */
  score: number;
  /** 原始余弦相似度 */
  raw_score: number;
}

/** /fmp/retrieve 响应数据结构 */
export interface FmpRetrieveResult {
  /** 检索是否成功 */
  status: boolean;
  /** 实际返回的条目数 */
  count: number;
  /** 全局候选里最高的原始余弦相似度，用于判断整体相关度 */
  top_score: number;
  /** top_score >= threshold 时为 true，表示问题与第二大脑相关 */
  relevant: boolean;
  /** 当前生效的相关性阈值（默认 0.4） */
  threshold: number;
  /** 命中的 top-K 认知条目 */
  items: FmpRetrieveItem[];
  /** 已格式化的 Markdown 文本，可直接作为 tool_result 回填给模型 */
  document: string;
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

/**
 * RAG 检索（POST /fmp/retrieve）
 * @param query 检索查询词
 * @param topK 返回条数
 * @param layer 层级筛选：0=思维模型 1=价值观念 2=决策规则 3=工作方式 4=行业知识 5=经验提炼 6=语言习惯，不传则检索全部层级
 */
export async function retrieveFmp(params: { query: string; topK?: number; layer?: number }): Promise<FmpRetrieveResult> {
  return post<FmpRetrieveResult>('/fmp/retrieve', params);
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
  fetchUploadPresignedUrl,
  uploadFileToTos,
  createDocument,
  downloadDocument,
  deleteDocument,
  deleteChat,
  reExtractDocument,
  fetchCognitionPrompt,
  fetchCognitionTools,
  retrieveFmp,
  reportChatSession,
  fetchPersonaDetail,
  updatePersona,
  get,
  post,
};


