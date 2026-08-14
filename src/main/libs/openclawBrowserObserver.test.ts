import path from 'path';
import { describe, expect, test, vi } from 'vitest';

import {
  AgentBrowserObservationStatus,
  AgentBrowserToolPhase,
} from '../../shared/browserWebAccess/constants';
import { OpenClawBrowserObserver } from './openclawBrowserObserver';

const createJsonResponse = (value: unknown, status = 200): Response => new Response(
  JSON.stringify(value),
  {
    status,
    headers: { 'Content-Type': 'application/json' },
  },
);

describe('OpenClawBrowserObserver', () => {
  test('captures the active managed-browser tab with authenticated control requests', async () => {
    const stateDir = path.resolve('C:/openclaw-state');
    const screenshotPath = path.join(stateDir, 'media', 'browser', 'capture.jpg');
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('/tabs?')) {
        return createJsonResponse({
          running: true,
          tabs: [{
            targetId: 'RAW-1',
            suggestedTargetId: 't1',
            tabId: 't1',
            title: 'Example',
            url: 'https://example.com',
            type: 'page',
          }],
        });
      }
      return createJsonResponse({
        path: screenshotPath,
        targetId: 'RAW-1',
        url: 'https://example.com',
      });
    });
    const removeFile = vi.fn(async () => {});
    const emitObservation = vi.fn();
    const observer = new OpenClawBrowserObserver({
      engineManager: {
        getGatewayConnectionInfo: () => ({ port: 18789, token: 'secret' }) as never,
        getStateDir: () => stateDir,
      },
      isEmbeddedMode: () => true,
      emitObservation,
      fetchImpl: fetchImpl as typeof fetch,
      readFile: vi.fn(async () => Buffer.from('image')) as never,
      statFile: vi.fn(async () => ({ isFile: () => true, size: 5 })) as never,
      removeFile: removeFile as never,
      now: () => 123,
    });

    const observation = await observer.refreshObservation('session-1', 't1');

    expect(observation).toMatchObject({
      sessionId: 'session-1',
      status: AgentBrowserObservationStatus.Ready,
      targetId: 'RAW-1',
      title: 'Example',
      url: 'https://example.com',
      screenshotDataUrl: 'data:image/jpeg;base64,aW1hZ2U=',
      updatedAt: 123,
    });
    expect(calls).toHaveLength(2);
    expect(new Headers(calls[0]?.init?.headers).get('Authorization')).toBe('Bearer secret');
    expect(JSON.parse(String(calls[1]?.init?.body))).toMatchObject({
      type: 'jpeg',
      targetId: 't1',
    });
    expect(removeFile).toHaveBeenCalledWith(screenshotPath);
    expect(emitObservation).toHaveBeenCalledWith(observation);
  });

  test('ignores browser activity in external mode', async () => {
    const fetchImpl = vi.fn();
    const emitObservation = vi.fn();
    const observer = new OpenClawBrowserObserver({
      engineManager: {
        getGatewayConnectionInfo: () => ({ port: 18789, token: 'secret' }) as never,
        getStateDir: () => path.resolve('C:/openclaw-state'),
      },
      isEmbeddedMode: () => false,
      emitObservation,
      fetchImpl: fetchImpl as typeof fetch,
    });

    observer.handleToolEvent({
      sessionId: 'session-1',
      phase: AgentBrowserToolPhase.Start,
      action: 'navigate',
    });
    const observation = await observer.refreshObservation('session-1');

    expect(observation).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(emitObservation).not.toHaveBeenCalled();
  });

  test('fails closed when the screenshot path is outside managed browser media', async () => {
    const stateDir = path.resolve('C:/openclaw-state');
    const readFile = vi.fn();
    const emitObservation = vi.fn();
    const fetchImpl = vi.fn(async (url: string | URL | Request) => (
      String(url).includes('/tabs?')
        ? createJsonResponse({
            tabs: [{
              targetId: 'RAW-1',
              title: 'Example',
              url: 'https://example.com',
              type: 'page',
            }],
          })
        : createJsonResponse({
            path: path.resolve('C:/outside/secret.jpg'),
            targetId: 'RAW-1',
          })
    ));
    const observer = new OpenClawBrowserObserver({
      engineManager: {
        getGatewayConnectionInfo: () => ({ port: 18789, token: 'secret' }) as never,
        getStateDir: () => stateDir,
      },
      isEmbeddedMode: () => true,
      emitObservation,
      fetchImpl: fetchImpl as typeof fetch,
      readFile: readFile as never,
      now: () => 456,
    });

    const observation = await observer.refreshObservation('session-1');

    expect(observation).toMatchObject({
      status: AgentBrowserObservationStatus.Error,
      updatedAt: 456,
    });
    expect(readFile).not.toHaveBeenCalled();
    expect(emitObservation).toHaveBeenCalledWith(observation);
  });
});
