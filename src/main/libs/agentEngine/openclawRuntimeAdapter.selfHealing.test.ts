import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => process.cwd(),
    getPath: () => process.cwd(),
    getVersion: () => 'test-version',
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

import { AgentLifecyclePhase } from './constants';
import { OpenClawRuntimeAdapter } from './openclawRuntimeAdapter';

function createMockStore() {
  const sessions = new Map<string, any>();
  return {
    sessions,
    getSession: vi.fn((id: string) => sessions.get(id)),
    updateSession: vi.fn((id: string, patch: any) => {
      const s = sessions.get(id);
      if (s) Object.assign(s, patch);
    }),
    addMessage: vi.fn((sessionId: string, msg: any) => {
      const s = sessions.get(sessionId);
      const fullMsg = { id: `msg-${Date.now()}`, ...msg };
      s?.messages?.push(fullMsg);
      return fullMsg;
    }),
  };
}

function createActiveTurn(sessionId: string, sessionKey: string, runId: string) {
  return {
    sessionId,
    sessionKey,
    runId,
    model: 'test-model',
    turnToken: 1,
    startedAtMs: Date.now(),
    knownRunIds: new Set([runId]),
    assistantMessageId: undefined,
    committedAssistantText: '',
    lastCommittedAssistantMessageId: null,
    currentAssistantSegmentText: '',
    currentText: '',
    agentAssistantTextLength: 0,
    hasSeenAgentAssistantStream: false,
    currentContentText: '',
    currentContentBlocks: [],
    sawNonTextContentBlocks: false,
    textStreamMode: 'snapshot',
    toolUseMessageIdByToolCallId: new Map(),
    toolResultMessageIdByToolCallId: new Map(),
    toolResultTextByToolCallId: new Map(),
    mediaStatusPollCountByToolCallId: new Map(),
    mediaStatusPollCountByTaskId: new Map(),
    mediaStatusPollBaseByToolCallId: new Map(),
    contextMaintenanceToolCallIds: new Set(),
    thinking: { messageId: null, currentText: '', messageIdByKey: new Map() },
    stopRequested: false,
    pendingUserSync: false,
    bufferedChatPayloads: [],
    bufferedAgentPayloads: [],
    hasContextCompactionEvent: false,
    hasContextMaintenanceTool: false,
    pendingRecoverableFollowup: false,
    pendingOpenClawRetry: false,
    pendingVisibleFinalContinuation: false,
  };
}

describe('OpenClawRuntimeAdapter: Universal Self-Healing and Error Termination Gates', () => {
  let store: any;
  let adapter: any;
  let gatewayClient: any;

  beforeEach(() => {
    vi.useFakeTimers();
    store = createMockStore();
    adapter = new OpenClawRuntimeAdapter(store as any, {} as any);
    gatewayClient = {
      start: vi.fn(),
      stop: vi.fn(),
      request: vi.fn(async () => ({})),
    };
    adapter.gatewayClient = gatewayClient;
    // 监听 error 事件，防止 Node.js EventEmitter 抛出未捕获错误
    adapter.on('error', () => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  test('用例 1: 自救中收到 lifecycle error，不拉黑 runId，后续事件正常派发', () => {
    const sessionId = 'session-1';
    const sessionKey = `agent:main:lobsterai:${sessionId}`;
    const runId = 'run-healing-1';

    store.sessions.set(sessionId, { id: sessionId, status: 'running', messages: [] });
    const turn = createActiveTurn(sessionId, sessionKey, runId);
    turn.hasContextCompactionEvent = true; // 正在自愈中
    adapter.activeTurns.set(sessionId, turn);
    adapter.sessionIdByRunId.set(runId, sessionId);

    // 收到带有 phase=error 的生命周期事件
    adapter.dispatchAgentEvent(sessionId, turn, {
      runId,
      stream: 'lifecycle',
      data: {
        phase: AgentLifecyclePhase.Error,
        error: 'Rate limit or context pressure, retrying',
        willRetry: true,
      },
    });

    // 断言 1: runId 绝对不能被拉黑
    expect(adapter.terminatedRunIds.has(runId)).toBe(false);

    // 紧接着自愈成功，推来正常的 tool 调用或文字
    const toolSpy = vi.spyOn(adapter, 'handleAgentToolEvent');
    adapter.handleAgentEvent({
      runId,
      stream: 'tool',
      data: { toolCallId: 'call-resumed', name: 'read' },
    });

    // 断言 2: turn 依然活跃，工具事件正常被派发处理
    expect(toolSpy).toHaveBeenCalledWith(sessionId, turn, {
      toolCallId: 'call-resumed',
      name: 'read',
    });
  });

  test('用例 2: 自救耗时超过 20 秒，定时器触发时绝对不调用 chat.abort', () => {
    const sessionId = 'session-2';
    const sessionKey = `agent:main:lobsterai:${sessionId}`;
    const runId = 'run-healing-2';

    store.sessions.set(sessionId, { id: sessionId, status: 'running', messages: [] });
    const turn = createActiveTurn(sessionId, sessionKey, runId);
    adapter.activeTurns.set(sessionId, turn);
    adapter.sessionIdByRunId.set(runId, sessionId);

    // 收到一个临时 error，但进入了可恢复跟随
    turn.pendingOpenClawRetry = true;

    adapter.handleAgentLifecycleEvent(sessionId, {
      phase: AgentLifecyclePhase.Error,
      error: 'Transient model timeout',
      willRetry: true,
    }, runId);

    // 快进 20 秒（LIFECYCLE_ERROR_FALLBACK_DELAY_MS）
    vi.advanceTimersByTime(25000);

    // 断言: 网关客户端的 chat.abort 绝对不能被调用！
    expect(gatewayClient.request).not.toHaveBeenCalledWith('chat.abort', expect.anything());
    // 会话依然存活
    expect(adapter.activeTurns.has(sessionId)).toBe(true);
  });

  test('用例 3: 自救失败中途网关宣告彻底失败（chat state=error），自愈清除并正常收敛', () => {
    const sessionId = 'session-3';
    const sessionKey = `agent:main:lobsterai:${sessionId}`;
    const runId = 'run-healing-3';

    store.sessions.set(sessionId, { id: sessionId, status: 'running', messages: [] });
    const turn = createActiveTurn(sessionId, sessionKey, runId);
    turn.hasContextCompactionEvent = true;
    adapter.activeTurns.set(sessionId, turn);
    adapter.sessionIdByRunId.set(runId, sessionId);

    // 网关推来终态 chat state=error
    adapter.handleChatError(sessionId, turn, {
      state: 'error',
      errorMessage: 'Compaction failed to free sufficient tokens',
    });

    // 断言 1: 自愈状态被清除
    expect(turn.hasContextCompactionEvent).toBe(false);
    // 断言 2: 会话状态更新为 error
    expect(store.updateSession).toHaveBeenCalledWith(sessionId, { status: 'error' });
    // 断言 3: turn 被彻底清理释放，不再挂起
    expect(adapter.activeTurns.has(sessionId)).toBe(false);
  });

  test('用例 4: 非自救状态下网关死锁失联，20 秒超时兜底必须准时触发 chat.abort 并释放会话', () => {
    const sessionId = 'session-4';
    const sessionKey = `agent:main:lobsterai:${sessionId}`;
    const runId = 'run-dead-4';

    store.sessions.set(sessionId, { id: sessionId, status: 'running', messages: [] });
    const turn = createActiveTurn(sessionId, sessionKey, runId);
    // 确保没有自愈标记
    adapter.activeTurns.set(sessionId, turn);
    adapter.sessionIdByRunId.set(runId, sessionId);

    // 收到普通不可自愈的 error 事件
    adapter.handleAgentLifecycleEvent(sessionId, {
      phase: AgentLifecyclePhase.Error,
      error: 'Fatal backend crash with no retry',
    }, runId);

    // 快进 20 秒
    vi.advanceTimersByTime(25000);

    // 断言 1: 必须准时调用 chat.abort 解锁网关
    expect(gatewayClient.request).toHaveBeenCalledWith('chat.abort', {
      sessionKey,
      runId,
    });
    // 断言 2: 本地会话必须被更新为 error 并清理
    expect(store.updateSession).toHaveBeenCalledWith(sessionId, { status: 'error' });
    expect(adapter.activeTurns.has(sessionId)).toBe(false);
  });

  test('用例 5: 致命不可自救错误，runId 必须被拉黑，后续幽灵事件全部静默丢弃', () => {
    const sessionId = 'session-5';
    const sessionKey = `agent:main:lobsterai:${sessionId}`;
    const runId = 'run-fatal-5';

    store.sessions.set(sessionId, { id: sessionId, status: 'running', messages: [] });
    const turn = createActiveTurn(sessionId, sessionKey, runId);
    adapter.activeTurns.set(sessionId, turn);
    adapter.sessionIdByRunId.set(runId, sessionId);

    // 派发致命 error 事件（明确无 retry、无自救）
    adapter.dispatchAgentEvent(sessionId, turn, {
      runId,
      stream: 'lifecycle',
      data: {
        phase: AgentLifecyclePhase.Error,
        error: 'Invalid authentication key',
      },
    });

    // 断言 1: 该 runId 必须被加入黑名单
    expect(adapter.terminatedRunIds.has(runId)).toBe(true);

    // 如果网关底层随后又发来死后诈尸的幽灵事件
    const handleSpy = vi.spyOn(adapter, 'handleAgentToolEvent');
    adapter.handleAgentEvent({
      runId,
      stream: 'tool',
      data: { toolCallId: 'call-ghost', name: 'read' },
    });

    // 断言 2: 幽灵事件直接在入口被过滤，绝不会进入 tool 派发
    expect(handleSpy).not.toHaveBeenCalled();
  });

  test('用例 6: 旧 runId 失败拉黑后，同一会话发起下一轮新指令（新 runId）正常工作无污染', () => {
    const sessionId = 'session-6';
    const sessionKey = `agent:main:lobsterai:${sessionId}`;
    const oldRunId = 'run-old-failed';
    const newRunId = 'run-new-active';

    // 假设旧 runId 已经被拉黑
    adapter.terminatedRunIds.add(oldRunId);

    store.sessions.set(sessionId, { id: sessionId, status: 'idle', messages: [] });

    // 用户在同一会话发起新指令，分配新 runId
    const newTurn = createActiveTurn(sessionId, sessionKey, newRunId);
    adapter.activeTurns.set(sessionId, newTurn);
    adapter.sessionIdByRunId.set(newRunId, sessionId);

    // 断言 1: 新 runId 不在黑名单内
    expect(adapter.terminatedRunIds.has(newRunId)).toBe(false);

    // 新 runId 正常接收事件
    const newToolSpy = vi.spyOn(adapter, 'handleAgentToolEvent');
    adapter.handleAgentEvent({
      runId: newRunId,
      stream: 'tool',
      data: { toolCallId: 'call-new-turn', name: 'search' },
    });

    // 断言 2: 新内容顺利推进
    expect(newToolSpy).toHaveBeenCalledWith(sessionId, newTurn, {
      toolCallId: 'call-new-turn',
      name: 'search',
    });
  });

  test('用例 7: chat state=error 遇到 Context overflow，挂起等待底层自动压缩重试，不立即报错销毁会话', () => {
    const sessionId = 'session-7';
    const sessionKey = `agent:main:lobsterai:${sessionId}`;
    const runId = 'run-overflow-7';

    store.sessions.set(sessionId, { id: sessionId, status: 'running', messages: [] });
    const turn = createActiveTurn(sessionId, sessionKey, runId);
    adapter.activeTurns.set(sessionId, turn);
    adapter.sessionIdByRunId.set(runId, sessionId);

    // 收到网关发来的 chat state=error (Context overflow)
    adapter.handleChatEvent({
      runId,
      sessionKey,
      seq: 100,
      state: 'error',
      errorMessage: 'Context overflow: prompt too large for the model.',
      rawErrorPreview: 'Context overflow: estimated context size exceeds safe threshold during tool loop.',
    } as any);

    // 断言 1: 会话不能被置为 error，turn 仍然活着
    expect(store.updateSession).not.toHaveBeenCalledWith(sessionId, { status: 'error' });
    expect(adapter.activeTurns.has(sessionId)).toBe(true);
    expect(turn.pendingOpenClawRetry).toBe(true);

    // 模拟 45 秒后底层自动压缩重试成功发来 chat delta
    adapter.handleChatEvent({
      runId,
      sessionKey,
      seq: 101,
      state: 'delta',
      message: { role: 'assistant', content: [{ type: 'text', text: '恢复正常输出' }] },
    } as any);

    // 断言 2: turn 成功恢复输出，没有沦为孤儿幽灵
    expect(turn.currentAssistantSegmentText).toBe('恢复正常输出');
    expect(adapter.activeTurns.has(sessionId)).toBe(true);
  });
});
