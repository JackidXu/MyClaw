import { beforeEach, describe, expect, test } from 'vitest';

// 针对轻量隔离测试：直接模拟并测试纯状态机跃迁契约
const MAX_FINE_TUNING_ROUNDS = 2;
const MAX_CONSECUTIVE_INSPECTIONS_IN_REVIEW = 8;

type TurnInspectionPhase = 'idle' | 'generating' | 'inspecting' | 'mutating_round';

interface TurnInspectionTracker {
  phase: TurnInspectionPhase;
  fineTuningRounds: number;
  isLockedOut: boolean;
}

const MUTATING_TOOL_NAMES = new Set([
  'write',
  'edit',
  'apply_patch',
  'ppt_edit',
  'word_edit',
  'excel_edit',
  'heyclaw_image_generate',
  'heyclaw_video_generate',
  'heyclaw_image_segment',
  'heyclaw_skin_manage',
  'write_file',
  'edit_file',
  'patch',
  'file_writer',
  'replace_file_content',
  'image_generate',
]);

const COMMAND_EXECUTION_TOOL_NAMES = new Set([
  'exec',
  'bash',
  'process',
]);

const SAFE_READ_ONLY_TOOL_NAMES = new Set([
  'read',
  'read_file',
  'read_file_range',
  'view_file',
  'grep',
  'find',
  'ppt_read',
  'word_read',
  'excel_read',
  'ask_user',
  'askuserquestion',
  'session_status',
  'progress_card',
]);

function isTerminalVisualInspection(toolName: string, params?: unknown): boolean {
  const normalized = (toolName || '').toLowerCase().trim();
  if (normalized === 'view_image' || normalized === 'preview' || normalized === 'web_inspector') {
    return true;
  }
  if (normalized === 'browser' || normalized === 'playwright') {
    if (!params || typeof params !== 'object') {
      return false;
    }
    const p = params as Record<string, unknown>;
    const action = typeof p.action === 'string' ? p.action.toLowerCase().trim() : '';
    return action === 'screenshot';
  }
  return false;
}

function createTestStateMachine(initialHasMutated = false) {
  let hasMutatedArtifact = initialHasMutated;
  const tracker: TurnInspectionTracker & {
    hasInspectedTerminalArtifact: boolean;
    hasExecutedCommandSinceInspection: boolean;
    consecutiveInspectionCount: number;
  } = {
    phase: 'idle',
    fineTuningRounds: 0,
    isLockedOut: false,
    hasInspectedTerminalArtifact: false,
    hasExecutedCommandSinceInspection: false,
    consecutiveInspectionCount: 0,
  };

  function checkAndRecord(toolName: string, params?: unknown): { isThrashing: boolean; rounds: number; reason?: string } {
    const normalized = (toolName || '').toLowerCase().trim();

    if (tracker.isLockedOut) {
      if (SAFE_READ_ONLY_TOOL_NAMES.has(normalized)) {
        return { isThrashing: false, rounds: tracker.fineTuningRounds };
      }
      return { isThrashing: true, rounds: tracker.fineTuningRounds, reason: 'locked_out' };
    }

    if (MUTATING_TOOL_NAMES.has(normalized)) {
      hasMutatedArtifact = true;
      tracker.consecutiveInspectionCount = 0;
      if (tracker.phase === 'idle') {
        tracker.phase = 'generating';
        return { isThrashing: false, rounds: tracker.fineTuningRounds };
      }

      if (tracker.phase === 'inspecting') {
        if (tracker.fineTuningRounds >= MAX_FINE_TUNING_ROUNDS) {
          tracker.isLockedOut = true;
          return { isThrashing: true, rounds: tracker.fineTuningRounds, reason: 'fine_tuning_limit' };
        }
        tracker.fineTuningRounds += 1;
        tracker.phase = 'mutating_round';
        tracker.hasExecutedCommandSinceInspection = false;
        return { isThrashing: false, rounds: tracker.fineTuningRounds };
      }

      return { isThrashing: false, rounds: tracker.fineTuningRounds };
    }

    if (isTerminalVisualInspection(normalized, params)) {
      if (!hasMutatedArtifact && tracker.phase === 'idle') {
        return { isThrashing: false, rounds: tracker.fineTuningRounds };
      }

      tracker.hasInspectedTerminalArtifact = true;

      if (tracker.hasExecutedCommandSinceInspection) {
        tracker.hasExecutedCommandSinceInspection = false;
        tracker.fineTuningRounds += 1;
        tracker.consecutiveInspectionCount = 1;
        return { isThrashing: false, rounds: tracker.fineTuningRounds };
      }

      if (tracker.phase !== 'inspecting') {
        tracker.phase = 'inspecting';
        tracker.hasExecutedCommandSinceInspection = false;
        tracker.consecutiveInspectionCount = 0;
      }

      tracker.consecutiveInspectionCount += 1;
      if (tracker.consecutiveInspectionCount > MAX_CONSECUTIVE_INSPECTIONS_IN_REVIEW) {
        tracker.isLockedOut = true;
        return { isThrashing: true, rounds: tracker.fineTuningRounds, reason: 'consecutive_inspection_limit' };
      }

      return { isThrashing: false, rounds: tracker.fineTuningRounds };
    }

    if (COMMAND_EXECUTION_TOOL_NAMES.has(normalized)) {
      if (tracker.hasInspectedTerminalArtifact) {
        if (tracker.fineTuningRounds >= MAX_FINE_TUNING_ROUNDS) {
          tracker.isLockedOut = true;
          return { isThrashing: true, rounds: tracker.fineTuningRounds, reason: 'fine_tuning_limit' };
        }
        tracker.hasExecutedCommandSinceInspection = true;
        tracker.consecutiveInspectionCount = 0;
      }
      hasMutatedArtifact = true;
      return { isThrashing: false, rounds: tracker.fineTuningRounds };
    }

    return { isThrashing: false, rounds: tracker.fineTuningRounds };
  }

  return { tracker, checkAndRecord };
}

describe('Turn Inspection State Machine Unit Tests', () => {
  let sm: ReturnType<typeof createTestStateMachine>;

  beforeEach(() => {
    sm = createTestStateMachine();
  });

  test('idle phase: pre-edit research and inspection has 0 penalty', () => {
    // 调研阶段看原图、打开浏览器看现状（包含动作与截图）
    const r1 = sm.checkAndRecord('view_image');
    expect(r1.isThrashing).toBe(false);
    expect(r1.rounds).toBe(0);

    const r2 = sm.checkAndRecord('browser', { action: 'open' });
    expect(r2.isThrashing).toBe(false);
    expect(r2.rounds).toBe(0);

    const r3 = sm.checkAndRecord('browser', { action: 'screenshot' });
    expect(r3.isThrashing).toBe(false);
    expect(r3.rounds).toBe(0);

    // 未产生物理写入前，不激活终态验收标记（绝不误判为产物验收）
    expect(sm.tracker.hasInspectedTerminalArtifact).toBe(false);
    expect(sm.tracker.fineTuningRounds).toBe(0);
  });

  test('complex pipeline generation: multiple writes, exec, and inspecting 8 scenes is 100% allowed', () => {
    // 首次组装流水线：写文件 -> 跑脚本 -> 写文件 -> 渲染出片
    sm.checkAndRecord('write');
    sm.checkAndRecord('exec');
    sm.checkAndRecord('write');
    sm.checkAndRecord('edit');

    expect(sm.tracker.phase).toBe('generating');

    // 终态验收：连看 8 个场景的分镜图（完全在 8 次限额内，100% 放行）
    for (let i = 1; i <= 8; i++) {
      const res = sm.checkAndRecord('view_image');
      expect(res.isThrashing).toBe(false);
      expect(res.rounds).toBe(0);
    }

    expect(sm.tracker.phase).toBe('inspecting');
    expect(sm.tracker.fineTuningRounds).toBe(0);

    // 第 9 次连续看图：超过 8 次无改动纯看图，坚决打断并锁死！
    const res9 = sm.checkAndRecord('view_image');
    expect(res9.isThrashing).toBe(true);
    expect(res9.reason).toBe('consecutive_inspection_limit');
    expect(sm.tracker.isLockedOut).toBe(true);
  });

  test('1 initial generation + up to 2 fine-tuning rounds allowed, 3rd round blocked', () => {
    // 1. 初次生成
    sm.checkAndRecord('write');
    // 初次验收（查看画面）
    sm.checkAndRecord('view_image');
    expect(sm.tracker.fineTuningRounds).toBe(0);

    // 2. 第 1 轮微调：看过之后决定改代码
    const round1Edit = sm.checkAndRecord('edit');
    expect(round1Edit.isThrashing).toBe(false);
    expect(round1Edit.rounds).toBe(1);
    expect(sm.tracker.fineTuningRounds).toBe(1);

    // 第 1 轮复查：连看 3 张图
    sm.checkAndRecord('view_image');
    sm.checkAndRecord('view_image');
    sm.checkAndRecord('browser');

    // 3. 第 2 轮微调：再次动手改代码（允许）
    const round2Edit = sm.checkAndRecord('edit');
    expect(round2Edit.isThrashing).toBe(false);
    expect(round2Edit.rounds).toBe(2);
    expect(sm.tracker.fineTuningRounds).toBe(2);

    // 第 2 轮复查（允许）
    sm.checkAndRecord('view_image');

    // 4. 第 3 轮企图修改：达到上限 MAX_FINE_TUNING_ROUNDS = 2，坚决打断！
    const round3EditAttempt = sm.checkAndRecord('edit');
    expect(round3EditAttempt.isThrashing).toBe(true);
    expect(round3EditAttempt.rounds).toBe(MAX_FINE_TUNING_ROUNDS);
    expect(sm.tracker.isLockedOut).toBe(true);

    // 锁死后，任何写工具持续拦截
    const writeAttempt = sm.checkAndRecord('write');
    expect(writeAttempt.isThrashing).toBe(true);

    // 锁死后，终态审查工具（view_image/browser）持续拦截，防止死磕
    const inspectAttempt = sm.checkAndRecord('view_image');
    expect(inspectAttempt.isThrashing).toBe(true);

    // 锁死后遵循工业级只读白名单：允许 read / grep 回读已有产物写交付汇报
    const readAttempt = sm.checkAndRecord('read');
    expect(readAttempt.isThrashing).toBe(false);

    const askUserAttempt = sm.checkAndRecord('ask_user');
    expect(askUserAttempt.isThrashing).toBe(false);
  });

  test('command tool oscillation detection: view -> exec script -> view counts as fine-tuning', () => {
    // 1. 初次生成阶段：调用 3 次 exec 跑初始构建，零惩罚
    sm.checkAndRecord('write');
    sm.checkAndRecord('exec');
    sm.checkAndRecord('exec');
    sm.checkAndRecord('exec');

    // 2. 首次进入验收：查看 3 张分镜图，微调轮次 = 0
    sm.checkAndRecord('view_image');
    sm.checkAndRecord('view_image');
    expect(sm.tracker.fineTuningRounds).toBe(0);

    // 3. 验收期单次调用 exec 测量布局，但不重复看图：不提前误杀
    sm.checkAndRecord('exec'); // 测量卡片各区块实际宽度
    expect(sm.tracker.fineTuningRounds).toBe(0);

    // 4. 第 1 轮脚本微调闭环：跑完 exec 之后再次调用 view_image 审查结果 -> 触发震荡闭环，轮次 = 1！
    const r1 = sm.checkAndRecord('view_image');
    expect(r1.isThrashing).toBe(false);
    expect(r1.rounds).toBe(1);
    expect(sm.tracker.fineTuningRounds).toBe(1);

    // 5. 第 2 轮脚本微调闭环：模型又通过 exec 修复画面并重新看图 -> 允许看第 2 轮改后图！轮次 = 2！
    sm.checkAndRecord('exec'); // 修复四幕画面并重渲染
    const r2 = sm.checkAndRecord('view_image');
    expect(r2.isThrashing).toBe(false);
    expect(r2.rounds).toBe(2);
    expect(sm.tracker.fineTuningRounds).toBe(2);

    // 6. 第 3 轮企图微调（在要【改】的时候拦截！）：
    // 模型企图发起第 3 轮 exec 脚本修改时，立即坚决拦截并激活锁死！彻底阻止第三次物理修改！
    const r3Attempt = sm.checkAndRecord('exec');
    expect(r3Attempt.isThrashing).toBe(true);
    expect(r3Attempt.rounds).toBe(2);
    expect(sm.tracker.isLockedOut).toBe(true);

    // 7. 锁死后，无论是继续企图调 exec 还是写工具，均被 Default-Deny 坚决拦截，无法逃逸
    expect(sm.checkAndRecord('exec').isThrashing).toBe(true);
    expect(sm.checkAndRecord('bash').isThrashing).toBe(true);
    expect(sm.checkAndRecord('write').isThrashing).toBe(true);
    expect(sm.checkAndRecord('view_image').isThrashing).toBe(true);
    // 依然允许安全只读汇报
    expect(sm.checkAndRecord('read').isThrashing).toBe(false);
  });

  test('browser action distinction: open, resize, scroll are actions, only screenshot is inspection', () => {
    // 模拟真实案发现场：模型生成网页后，打开、缩放、滚屏、截图 10 屏
    sm.checkAndRecord('write');
    // 页面交互动作：完全不计入连看
    expect(sm.checkAndRecord('browser', { action: 'open' }).isThrashing).toBe(false);
    expect(sm.checkAndRecord('browser', { action: 'resize' }).isThrashing).toBe(false);

    // 逐屏滚屏 + 截图（前 8 屏顺利通过）
    for (let i = 1; i <= 8; i++) {
      // 滚屏动作
      expect(sm.checkAndRecord('browser', { action: 'act', request: { kind: 'evaluate' } }).isThrashing).toBe(false);
      // 截图验收
      const shotRes = sm.checkAndRecord('browser', { action: 'screenshot' });
      expect(shotRes.isThrashing).toBe(false);
      expect(shotRes.rounds).toBe(0);
    }

    // 第 9 屏滚屏动作依然允许（因为动作不计入连看）
    expect(sm.checkAndRecord('browser', { action: 'act' }).isThrashing).toBe(false);

    // 第 9 次截图：真正触发 > 8 次纯审查上限打断！
    const shot9 = sm.checkAndRecord('browser', { action: 'screenshot' });
    expect(shot9.isThrashing).toBe(true);
    expect(shot9.reason).toBe('consecutive_inspection_limit');
    expect(sm.tracker.isLockedOut).toBe(true);
  });
});
