import path from 'path';
import { describe, expect, test, vi } from 'vitest';

import {
  AgentBrowserObservationStatus,
  AgentBrowserToolPhase,
  type BrowserControlGatewayRequest,
  BrowserControlRequestMethod,
} from '../../shared/browserWebAccess/constants';
import { OpenClawBrowserObserver } from './openclawBrowserObserver';

describe('OpenClawBrowserObserver', () => {
  test('captures the active managed-browser tab through the gateway control service', async () => {
    const stateDir = path.resolve('C:/openclaw-state');
    const screenshotPath = path.join(stateDir, 'media', 'browser', 'capture.jpg');
    const calls: BrowserControlGatewayRequest[] = [];
    const requestBrowserControl = vi.fn(async (request: BrowserControlGatewayRequest) => {
      calls.push(request);
      if (request.path === '/tabs') {
        return {
          running: true,
          tabs: [{
            targetId: 'RAW-1',
            suggestedTargetId: 't1',
            tabId: 't1',
            title: 'Example',
            url: 'https://example.com',
            type: 'page',
          }],
        };
      }
      return {
        path: screenshotPath,
        targetId: 'RAW-1',
        url: 'https://example.com',
      };
    });
    const removeFile = vi.fn(async () => {});
    const emitObservation = vi.fn();
    const observer = new OpenClawBrowserObserver({
      engineManager: {
        getStateDir: () => stateDir,
      },
      isEmbeddedMode: () => true,
      emitObservation,
      requestBrowserControl,
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
    expect(calls).toEqual([
      {
        method: BrowserControlRequestMethod.Get,
        path: '/tabs',
        query: { profile: 'openclaw' },
        timeoutMs: 5_000,
      },
      {
        method: BrowserControlRequestMethod.Post,
        path: '/screenshot',
        query: { profile: 'openclaw' },
        body: { type: 'jpeg', targetId: 't1' },
        timeoutMs: 15_000,
      },
    ]);
    expect(removeFile).toHaveBeenCalledWith(screenshotPath);
    expect(emitObservation).toHaveBeenCalledWith(observation);
  });

  test('ignores browser activity in external mode', async () => {
    const requestBrowserControl = vi.fn();
    const emitObservation = vi.fn();
    const observer = new OpenClawBrowserObserver({
      engineManager: {
        getStateDir: () => path.resolve('C:/openclaw-state'),
      },
      isEmbeddedMode: () => false,
      emitObservation,
      requestBrowserControl,
    });

    observer.handleToolEvent({
      sessionId: 'session-1',
      phase: AgentBrowserToolPhase.Start,
      action: 'navigate',
    });
    const observation = await observer.refreshObservation('session-1');

    expect(observation).toBeNull();
    expect(requestBrowserControl).not.toHaveBeenCalled();
    expect(emitObservation).not.toHaveBeenCalled();
  });

  test('fails closed when the screenshot path is outside managed browser media', async () => {
    const stateDir = path.resolve('C:/openclaw-state');
    const readFile = vi.fn();
    const emitObservation = vi.fn();
    const requestBrowserControl = vi.fn(async (request: BrowserControlGatewayRequest) => (
      request.path === '/tabs'
        ? {
            tabs: [{
              targetId: 'RAW-1',
              title: 'Example',
              url: 'https://example.com',
              type: 'page',
            }],
          }
        : {
            path: path.resolve('C:/outside/secret.jpg'),
            targetId: 'RAW-1',
          }
    ));
    const observer = new OpenClawBrowserObserver({
      engineManager: {
        getStateDir: () => stateDir,
      },
      isEmbeddedMode: () => true,
      emitObservation,
      requestBrowserControl,
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
