import fs from 'fs';
import path from 'path';

import {
  type AgentBrowserObservation,
  AgentBrowserObservationStatus,
  type AgentBrowserTab,
  type AgentBrowserToolEvent,
  AgentBrowserToolPhase,
  BrowserRuntimeProfile,
} from '../../shared/browserWebAccess/constants';
import type { OpenClawEngineManager } from './openclawEngineManager';

const BROWSER_CONTROL_PORT_OFFSET = 2;
const BROWSER_CONTROL_TIMEOUT_MS = 15_000;
const MAX_SCREENSHOT_BYTES = 6 * 1024 * 1024;
const MAX_CACHED_SESSIONS = 8;

type BrowserObserverEngineManager = Pick<
  OpenClawEngineManager,
  'getGatewayConnectionInfo' | 'getStateDir'
>;

type BrowserControlTab = {
  targetId?: unknown;
  suggestedTargetId?: unknown;
  tabId?: unknown;
  label?: unknown;
  title?: unknown;
  url?: unknown;
  type?: unknown;
};

type BrowserTabsResponse = {
  running?: unknown;
  tabs?: unknown;
};

type BrowserScreenshotResponse = {
  path?: unknown;
  targetId?: unknown;
  url?: unknown;
};

export interface OpenClawBrowserObserverOptions {
  engineManager: BrowserObserverEngineManager;
  isEmbeddedMode: () => boolean;
  emitObservation: (observation: AgentBrowserObservation) => void;
  fetchImpl?: typeof fetch;
  readFile?: typeof fs.promises.readFile;
  statFile?: typeof fs.promises.stat;
  removeFile?: typeof fs.promises.unlink;
  now?: () => number;
}

const readString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const normalizeTab = (value: unknown): AgentBrowserTab | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const tab = value as BrowserControlTab;
  if (readString(tab.type) && readString(tab.type) !== 'page') return null;
  const targetId = readString(tab.targetId);
  if (!targetId) return null;
  return {
    targetId,
    ...(readString(tab.suggestedTargetId)
      ? { suggestedTargetId: readString(tab.suggestedTargetId) }
      : {}),
    ...(readString(tab.tabId) ? { tabId: readString(tab.tabId) } : {}),
    ...(readString(tab.label) ? { label: readString(tab.label) } : {}),
    title: readString(tab.title) ?? '',
    url: readString(tab.url) ?? '',
  };
};

const tabMatchesTarget = (tab: AgentBrowserTab, targetId: string): boolean => (
  tab.targetId === targetId
  || tab.suggestedTargetId === targetId
  || tab.tabId === targetId
  || tab.label === targetId
);

const isPathInside = (basePath: string, candidatePath: string): boolean => {
  const relative = path.relative(basePath, candidatePath);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
};

const resolveScreenshotMimeType = (filePath: string): 'image/jpeg' | 'image/png' | null => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.png') return 'image/png';
  return null;
};

export class OpenClawBrowserObserver {
  private readonly engineManager: BrowserObserverEngineManager;
  private readonly isEmbeddedMode: () => boolean;
  private readonly emitObservation: (observation: AgentBrowserObservation) => void;
  private readonly fetchImpl: typeof fetch;
  private readonly readFile: typeof fs.promises.readFile;
  private readonly statFile: typeof fs.promises.stat;
  private readonly removeFile: typeof fs.promises.unlink;
  private readonly now: () => number;
  private readonly observations = new Map<string, AgentBrowserObservation>();
  private readonly refreshGenerationBySession = new Map<string, number>();

  constructor(options: OpenClawBrowserObserverOptions) {
    this.engineManager = options.engineManager;
    this.isEmbeddedMode = options.isEmbeddedMode;
    this.emitObservation = options.emitObservation;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.readFile = options.readFile ?? fs.promises.readFile;
    this.statFile = options.statFile ?? fs.promises.stat;
    this.removeFile = options.removeFile ?? fs.promises.unlink;
    this.now = options.now ?? Date.now;
  }

  getObservation(sessionId: string): AgentBrowserObservation | null {
    if (!this.isEmbeddedMode()) return null;
    return this.observations.get(sessionId) ?? null;
  }

  clearSession(sessionId: string): void {
    this.observations.delete(sessionId);
    this.refreshGenerationBySession.delete(sessionId);
  }

  handleToolEvent(event: AgentBrowserToolEvent): void {
    if (!this.isEmbeddedMode()) return;

    const profile = event.profile ?? BrowserRuntimeProfile.Managed;
    const previous = this.observations.get(event.sessionId);
    if (event.phase === AgentBrowserToolPhase.Start) {
      this.publish({
        sessionId: event.sessionId,
        profile,
        status: AgentBrowserObservationStatus.Loading,
        tabs: previous?.tabs ?? [],
        ...(event.targetId || previous?.targetId
          ? { targetId: event.targetId ?? previous?.targetId }
          : {}),
        ...(previous?.title ? { title: previous.title } : {}),
        ...(previous?.url ? { url: previous.url } : {}),
        ...(previous?.screenshotDataUrl ? { screenshotDataUrl: previous.screenshotDataUrl } : {}),
        updatedAt: this.now(),
      });
      return;
    }

    if (event.phase !== AgentBrowserToolPhase.Result) return;
    if (event.action === 'stop') {
      this.publish({
        sessionId: event.sessionId,
        profile,
        status: AgentBrowserObservationStatus.Stopped,
        tabs: [],
        updatedAt: this.now(),
      });
      return;
    }
    if (event.isError) {
      this.publish({
        sessionId: event.sessionId,
        profile,
        status: AgentBrowserObservationStatus.Error,
        tabs: previous?.tabs ?? [],
        ...(previous?.targetId ? { targetId: previous.targetId } : {}),
        ...(previous?.title ? { title: previous.title } : {}),
        ...(previous?.url ? { url: previous.url } : {}),
        ...(previous?.screenshotDataUrl ? { screenshotDataUrl: previous.screenshotDataUrl } : {}),
        updatedAt: this.now(),
        error: 'Browser tool action failed.',
      });
      return;
    }

    void this.refreshObservation(event.sessionId, event.targetId, profile);
  }

  async refreshObservation(
    sessionId: string,
    targetId?: string,
    profile: string = BrowserRuntimeProfile.Managed,
  ): Promise<AgentBrowserObservation | null> {
    if (!this.isEmbeddedMode()) return null;
    const generation = (this.refreshGenerationBySession.get(sessionId) ?? 0) + 1;
    this.refreshGenerationBySession.set(sessionId, generation);

    try {
      const observation = await this.captureObservation(sessionId, targetId, profile);
      if (this.refreshGenerationBySession.get(sessionId) !== generation) {
        return this.observations.get(sessionId) ?? null;
      }
      this.publish(observation);
      return observation;
    } catch (error) {
      console.warn('[OpenClawBrowserObserver] Failed to refresh browser observation.', error);
      const previous = this.observations.get(sessionId);
      const observation: AgentBrowserObservation = {
        sessionId,
        profile,
        status: AgentBrowserObservationStatus.Error,
        tabs: previous?.tabs ?? [],
        ...(previous?.targetId ? { targetId: previous.targetId } : {}),
        ...(previous?.title ? { title: previous.title } : {}),
        ...(previous?.url ? { url: previous.url } : {}),
        ...(previous?.screenshotDataUrl ? { screenshotDataUrl: previous.screenshotDataUrl } : {}),
        updatedAt: this.now(),
        error: error instanceof Error ? error.message : 'Browser observation failed.',
      };
      if (this.refreshGenerationBySession.get(sessionId) === generation) {
        this.publish(observation);
      }
      return observation;
    }
  }

  private async captureObservation(
    sessionId: string,
    requestedTargetId: string | undefined,
    profile: string,
  ): Promise<AgentBrowserObservation> {
    const tabsResult = await this.fetchBrowserJson<BrowserTabsResponse>(
      `/tabs?profile=${encodeURIComponent(profile)}`,
      { timeoutMs: 5_000 },
    );
    const tabs = Array.isArray(tabsResult.tabs)
      ? tabsResult.tabs.map(normalizeTab).filter((tab): tab is AgentBrowserTab => tab !== null)
      : [];
    if (tabs.length === 0) {
      return {
        sessionId,
        profile,
        status: AgentBrowserObservationStatus.Empty,
        tabs,
        updatedAt: this.now(),
      };
    }

    const previousTargetId = this.observations.get(sessionId)?.targetId;
    const preferredTargetId = requestedTargetId ?? previousTargetId;
    const preferredTab = preferredTargetId
      ? tabs.find(tab => tabMatchesTarget(tab, preferredTargetId))
      : undefined;
    const screenshotTargetId = preferredTab ? preferredTargetId : undefined;
    const screenshotResult = await this.fetchBrowserJson<BrowserScreenshotResponse>(
      `/screenshot?profile=${encodeURIComponent(profile)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'jpeg',
          ...(screenshotTargetId ? { targetId: screenshotTargetId } : {}),
        }),
        timeoutMs: BROWSER_CONTROL_TIMEOUT_MS,
      },
    );
    const screenshotPath = readString(screenshotResult.path);
    const capturedTargetId = readString(screenshotResult.targetId);
    if (!screenshotPath) {
      throw new Error('Browser screenshot path is unavailable.');
    }
    const selectedTab = (capturedTargetId
      ? tabs.find(tab => tabMatchesTarget(tab, capturedTargetId))
      : preferredTab) ?? tabs[tabs.length - 1];
    const screenshotDataUrl = await this.readScreenshotDataUrl(screenshotPath);

    return {
      sessionId,
      profile,
      status: AgentBrowserObservationStatus.Ready,
      tabs,
      targetId: capturedTargetId ?? selectedTab.targetId,
      title: selectedTab.title,
      url: readString(screenshotResult.url) ?? selectedTab.url,
      screenshotDataUrl,
      updatedAt: this.now(),
    };
  }

  private async fetchBrowserJson<T>(
    route: string,
    options: RequestInit & { timeoutMs?: number } = {},
  ): Promise<T> {
    const connection = this.engineManager.getGatewayConnectionInfo();
    if (!connection.port || !connection.token) {
      throw new Error('OpenClaw browser connection is unavailable.');
    }
    const { timeoutMs = BROWSER_CONTROL_TIMEOUT_MS, ...requestOptions } = options;
    const headers = new Headers(requestOptions.headers);
    headers.set('Authorization', `Bearer ${connection.token}`);
    const response = await this.fetchImpl(
      `http://127.0.0.1:${connection.port + BROWSER_CONTROL_PORT_OFFSET}${route}`,
      {
        ...requestOptions,
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { error: text };
      }
    }
    if (!response.ok) {
      const message = payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error?: unknown }).error)
        : `HTTP ${response.status}`;
      throw new Error(message);
    }
    return payload as T;
  }

  private async readScreenshotDataUrl(filePath: string): Promise<string> {
    const resolvedPath = path.resolve(filePath);
    const browserMediaRoot = path.resolve(this.engineManager.getStateDir(), 'media', 'browser');
    const mimeType = resolveScreenshotMimeType(resolvedPath);
    if (!isPathInside(browserMediaRoot, resolvedPath) || !mimeType) {
      throw new Error('Browser screenshot path is outside the managed media directory.');
    }

    try {
      const stat = await this.statFile(resolvedPath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_SCREENSHOT_BYTES) {
        throw new Error('Browser screenshot has an invalid size.');
      }
      const buffer = await this.readFile(resolvedPath);
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    } finally {
      await this.removeFile(resolvedPath).catch(() => {});
    }
  }

  private publish(observation: AgentBrowserObservation): void {
    this.observations.delete(observation.sessionId);
    this.observations.set(observation.sessionId, observation);
    while (this.observations.size > MAX_CACHED_SESSIONS) {
      const oldestSessionId = this.observations.keys().next().value;
      if (!oldestSessionId) break;
      this.observations.delete(oldestSessionId);
      this.refreshGenerationBySession.delete(oldestSessionId);
    }
    this.emitObservation(observation);
  }
}
