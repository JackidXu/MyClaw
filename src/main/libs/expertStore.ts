import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';

import { parseExpertCatalog, parseExpertStoreManifest } from '../../shared/agent/expertCatalogValidation';
import type { ExpertCatalog, ExpertStoreManifest } from '../../shared/agent/presets';
import { usageFailureCode, type UsageParams } from '../../shared/analytics/usage';
import { PresetAgent } from '../presetAgents';
import { mainHttpClient } from './mainHttpClient';

// 付费专家数据结构（不含 department、level 字段）
export interface PaidExpert {
  id: string;
  name: string;
  nameEn?: string;
  avatar?: string;
  department?: string;
  description: string;
  descriptionEn?: string;
  systemPrompt: string;
  systemPromptEn?: string;
  skillIds: string[];
  sortOrder?: number;
  enabled: boolean;
  model?: string;
}

// 专家团数据结构（与 PresetAgent 兼容，额外携带 subagentAllowAgentIds 协作列表）
export interface ExpertTeam {
  id: string;
  name: string;
  nameEn?: string;
  avatar?: string;
  description: string;
  descriptionEn?: string;
  identity?: string;
  identityEn?: string;
  systemPrompt?: string;
  systemPromptEn?: string;
  skillIds: string[];
  subagentAllowAgentIds: string[];
  department?: string;
  sortOrder?: number;
  enabled: boolean;
  model?: string;
}

// 内存缓存（单次运行期内有效）
let cachedPresetExperts: PresetAgent[] | null = null;
let cachedPaidExperts: PaidExpert[] | null = null;
let cachedExpertTeams: ExpertTeam[] | null = null;

// 本地存储访问器引用（SQLite kv 表）
let localStoreGetter: (() => { get: <T = unknown>(key: string) => T | undefined; set: <T = unknown>(key: string, value: T) => void } | null) | null = null;

const CACHE_KV_KEY = 'cached_cloud_experts';

interface CachedExpertsData {
  presetExperts: PresetAgent[];
  paidExperts: PaidExpert[];
  expertTeams: ExpertTeam[];
}

/**
 * 注入本地存储访问器并在启动阶段预加载持久化缓存
 */
export function initExpertStoreFromLocal(
  storeGetter: () => { get: <T = unknown>(key: string) => T | undefined; set: <T = unknown>(key: string, value: T) => void } | null
): void {
  localStoreGetter = storeGetter;
  try {
    const store = storeGetter?.();
    const saved = store?.get<CachedExpertsData>(CACHE_KV_KEY);
    if (saved && typeof saved === 'object') {
      if (Array.isArray(saved.presetExperts) && saved.presetExperts.length > 0) {
        cachedPresetExperts = saved.presetExperts;
      }
      if (Array.isArray(saved.paidExperts) && saved.paidExperts.length > 0) {
        cachedPaidExperts = saved.paidExperts;
      }
      if (Array.isArray(saved.expertTeams) && saved.expertTeams.length > 0) {
        cachedExpertTeams = saved.expertTeams;
      }
      console.log(
        `[ExpertStore] Restored from local cache: ${cachedPresetExperts?.length || 0} presets, ${cachedPaidExperts?.length || 0} paid, ${cachedExpertTeams?.length || 0} teams`
      );
    }
  } catch (err) {
    console.warn('[ExpertStore] Failed to restore experts from local cache:', err);
  }
}

/**
 * 从云端拉取专家数据（成功且非空时持久化到本地，失败或为空时直接忽略不覆盖，不重试）
 */
export async function fetchExpertsFromCloud(): Promise<{
  presetExperts: PresetAgent[];
  paidExperts: PaidExpert[];
  expertTeams: ExpertTeam[];
}> {
  try {
    const res = await mainHttpClient.admin.get<{
      success: boolean;
      presetExperts?: PresetAgent[];
      paidExperts?: PaidExpert[];
      expertTeams?: ExpertTeam[];
    }>('/api/experts');

    if (!res.ok || !res.data) {
      console.warn('[ExpertStore] fetchExpertsFromCloud failed, keeping existing cache:', res.error || `HTTP ${res.status}`);
      return {
        presetExperts: cachedPresetExperts || [],
        paidExperts: cachedPaidExperts || [],
        expertTeams: cachedExpertTeams || [],
      };
    }

    const data = res.data;
    if (!data.success) {
      console.warn('[ExpertStore] Server returned success=false, keeping existing cache');
      return {
        presetExperts: cachedPresetExperts || [],
        paidExperts: cachedPaidExperts || [],
        expertTeams: cachedExpertTeams || [],
      };
    }

    const newPresets = data.presetExperts || [];
    const newPaid = data.paidExperts || [];
    const newTeams = data.expertTeams || [];

    // 若云端下发的数据完全为空，视为无效/异常响应，直接忽略不覆盖现有缓存
    if (newPresets.length === 0 && newPaid.length === 0 && newTeams.length === 0) {
      console.warn('[ExpertStore] Received empty experts data from cloud, keeping existing cache');
      return {
        presetExperts: cachedPresetExperts || [],
        paidExperts: cachedPaidExperts || [],
        expertTeams: cachedExpertTeams || [],
      };
    }

    // 请求成功且数据有效，更新内存缓存
    cachedPresetExperts = newPresets;
    cachedPaidExperts = newPaid;
    cachedExpertTeams = newTeams;

    // 持久化存储到本地 SQLite kv 表
    try {
      const store = localStoreGetter?.();
      if (store) {
        store.set(CACHE_KV_KEY, {
          presetExperts: cachedPresetExperts,
          paidExperts: cachedPaidExperts,
          expertTeams: cachedExpertTeams,
        });
      }
    } catch (saveErr) {
      console.warn('[ExpertStore] Failed to persist experts to local cache:', saveErr);
    }

    console.log(`[ExpertStore] Loaded & persisted ${cachedPresetExperts.length} preset experts, ${cachedPaidExperts.length} paid experts, ${cachedExpertTeams.length} expert teams`);
    return { presetExperts: cachedPresetExperts, paidExperts: cachedPaidExperts, expertTeams: cachedExpertTeams };
  } catch (err) {
    console.warn('[ExpertStore] Failed to fetch experts, keeping existing cache:', err);
    return {
      presetExperts: cachedPresetExperts || [],
      paidExperts: cachedPaidExperts || [],
      expertTeams: cachedExpertTeams || [],
    };
  }
}

/**
 * 返回内置专家列表（使用内存缓存，若未初始化返回空数组）
 */
export function getPresetExperts(): PresetAgent[] {
  return cachedPresetExperts || [];
}

/**
 * 返回付费专家列表（使用内存缓存，若未初始化返回空数组）
 */
export function getPaidExperts(): PaidExpert[] {
  return cachedPaidExperts || [];
}

/**
 * 返回专家团列表（使用内存缓存，若未初始化返回空数组）
 */
export function getExpertTeams(): ExpertTeam[] {
  return cachedExpertTeams || [];
}

/**
 * 判断某个 agentId 是否为付费专家（基于运行时缓存数据）
 */
export function isPaidExpertId(agentId: string): boolean {
  if (!cachedPaidExperts) return false;
  return cachedPaidExperts.some(e => e.id === agentId);
}

const MAX_CATALOG_BYTES = 4 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 32 * 1024;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const RETRY_INTERVAL_MS = 30 * 1000;
const REQUEST_TIMEOUT_MS = 10000;

export function fetchExpertStoreText(url: string, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // Deliberately do not follow redirects: both allowed origins and size limits
    // remain enforced at the actual download endpoint.
    const request = https.get(url, response => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Expert store HTTP ${response.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > limit) request.destroy(new Error('Expert store response too large'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    const timeout = setTimeout(() => request.destroy(new Error('Expert store request timed out')), REQUEST_TIMEOUT_MS);
    request.on('error', reject);
    request.on('close', () => clearTimeout(timeout));
  });
}

interface CachedCatalog {
  endpoint: string;
  manifest: ExpertStoreManifest;
  content: string;
}

interface ExpertStoreOptions {
  getEndpoint: () => string;
  cacheDirectory: string;
  fetchText?: typeof fetchExpertStoreText;
  now?: () => number;
  onLoad?: (fields: UsageParams) => void;
}

interface StoreEntry {
  cached?: CachedCatalog;
  catalog?: ExpertCatalog;
  refreshAfter: number;
  pending?: Promise<ExpertCatalog>;
}

function validateContent(manifest: ExpertStoreManifest, content: string): ExpertCatalog {
  if (Buffer.byteLength(content) > MAX_CATALOG_BYTES
    || createHash('sha256').update(content).digest('hex') !== manifest.sha256) {
    throw new Error('Expert catalog integrity check failed');
  }
  const catalog = parseExpertCatalog(JSON.parse(content));
  if (catalog.version !== manifest.version) throw new Error('Expert catalog version mismatch');
  return catalog;
}

/** Overmind selects a versioned CDN catalog. Caches never cross environments. */
export class ExpertStore {
  private readonly entries = new Map<string, StoreEntry>();
  private readonly fetchText: typeof fetchExpertStoreText;
  private readonly now: () => number;

  constructor(private readonly options: ExpertStoreOptions) {
    this.fetchText = options.fetchText ?? fetchExpertStoreText;
    this.now = options.now ?? Date.now;
  }

  getCatalog(): Promise<ExpertCatalog> {
    const endpoint = this.options.getEndpoint();
    let entry = this.entries.get(endpoint);
    if (!entry) {
      entry = { refreshAfter: 0 };
      this.entries.set(endpoint, entry);
    }
    if (entry.pending) return entry.pending;
    if (entry.catalog && entry.refreshAfter > this.now()) return Promise.resolve(entry.catalog);
    const activeEntry = entry;
    activeEntry.pending = this.load(endpoint, activeEntry).finally(() => { activeEntry.pending = undefined; });
    return activeEntry.pending;
  }

  private async load(endpoint: string, entry: StoreEntry): Promise<ExpertCatalog> {
    const startedAt = this.now();
    let phase: ExpertCatalogLoadPhase = ExpertCatalogLoadPhase.Manifest;
    const cachePath = path.join(this.options.cacheDirectory, `${createHash('sha256').update(endpoint).digest('hex')}.json`);
    if (!entry.cached) {
      try {
        const serialized = await readFile(cachePath, 'utf8');
        // The file wraps raw JSON content, so allow escaping overhead.
        if (Buffer.byteLength(serialized) > MAX_CATALOG_BYTES * 2) throw new Error('Expert cache too large');
        const cached = JSON.parse(serialized) as CachedCatalog;
        if (cached.endpoint !== endpoint || typeof cached.content !== 'string') throw new Error('Invalid expert cache');
        cached.manifest = parseExpertStoreManifest(cached.manifest);
        entry.catalog = validateContent(cached.manifest, cached.content);
        entry.cached = cached;
      } catch {
        // A missing/corrupt cache is replaced only after a fully validated fetch.
      }
    }
    try {
      const response = JSON.parse(await this.fetchText(endpoint, MAX_MANIFEST_BYTES));
      const value = response?.data?.value;
      const manifest = parseExpertStoreManifest(typeof value === 'string' ? JSON.parse(value) : value);
      if (entry.cached?.manifest.sha256 !== manifest.sha256 || entry.cached.manifest.version !== manifest.version) {
        phase = ExpertCatalogLoadPhase.Catalog;
        const content = await this.fetchText(manifest.catalogUrl, MAX_CATALOG_BYTES);
        phase = ExpertCatalogLoadPhase.Validation;
        const catalog = validateContent(manifest, content);
        const cached = { endpoint, manifest, content };
        // Keep the previous valid file if download, parsing or persistence fails.
        try {
          await mkdir(this.options.cacheDirectory, { recursive: true });
          await writeFile(`${cachePath}.tmp`, JSON.stringify(cached), 'utf8');
          await rename(`${cachePath}.tmp`, cachePath);
        } catch (error) {
          console.warn('[ExpertStore] Failed to persist catalog:', error);
        }
        entry.catalog = catalog;
        entry.cached = cached;
      }
      entry.refreshAfter = this.now() + REFRESH_INTERVAL_MS;
      this.reportLoad({ outcome: 'succeeded', catalogVersion: entry.catalog?.version, durationMs: this.now() - startedAt, cacheFallback: false });
      return entry.catalog!;
    } catch (error) {
      this.reportLoad({ outcome: 'failed', failureStage: phase, failureCode: usageFailureCode(error),
        cacheFallback: Boolean(entry.catalog), catalogVersion: entry.catalog?.version, durationMs: this.now() - startedAt });
      if (!entry.catalog) throw error;
      entry.refreshAfter = this.now() + RETRY_INTERVAL_MS;
      console.warn('[ExpertStore] Using cached catalog after refresh failure:', error);
      return entry.catalog;
    }
  }

  private reportLoad(fields: UsageParams): void {
    try { this.options.onLoad?.(fields); } catch { /* Reporting must not affect catalog availability. */ }
  }
}

const ExpertCatalogLoadPhase = { Manifest: 'manifest', Catalog: 'catalog', Validation: 'validation' } as const;
type ExpertCatalogLoadPhase = typeof ExpertCatalogLoadPhase[keyof typeof ExpertCatalogLoadPhase];
