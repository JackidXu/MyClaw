import Database from 'better-sqlite3';
import { afterEach, describe, expect, test } from 'vitest';

import {
  getCoworkParentSessionId,
  isCoworkSessionBoundToIm,
  resolveCoworkSessionIdByOpenClawSessionKey,
  resolveLocalDesktopCoworkSessionIdByOpenClawSessionKey,
} from './openclawLocalSessionResolver';

const dbs: Database.Database[] = [];

const createDb = (): Database.Database => {
  const db = new Database(':memory:');
  dbs.push(db);
  db.exec(`
    CREATE TABLE cowork_sessions (
      id TEXT PRIMARY KEY,
      claude_session_id TEXT,
      parent_session_id TEXT
    );
    CREATE TABLE im_session_mappings (
      cowork_session_id TEXT
    );
    CREATE TABLE subagent_runs (
      id TEXT PRIMARY KEY,
      parent_session_id TEXT,
      session_key TEXT
    );
  `);
  return db;
};

const insertSession = (
  db: Database.Database,
  id: string,
  claudeSessionId: string | null = null,
  parentSessionId: string | null = null,
) => {
  db.prepare('INSERT INTO cowork_sessions (id, claude_session_id, parent_session_id) VALUES (?, ?, ?)')
    .run(id, claudeSessionId, parentSessionId);
};

const insertSubagentRun = (
  db: Database.Database,
  id: string,
  parentSessionId: string,
  sessionKey: string,
) => {
  db.prepare('INSERT INTO subagent_runs (id, parent_session_id, session_key) VALUES (?, ?, ?)')
    .run(id, parentSessionId, sessionKey);
};

afterEach(() => {
  while (dbs.length > 0) {
    dbs.pop()?.close();
  }
});

describe('openclaw local session resolver', () => {
  test('resolves managed desktop session keys across agents', () => {
    const db = createDb();
    insertSession(db, 'session-1');

    expect(resolveCoworkSessionIdByOpenClawSessionKey(
      db,
      'agent:qa-reviewer:lobsterai:session-1',
    )).toBe('session-1');
  });

  test('resolves materialized subagent child session keys', () => {
    const db = createDb();
    insertSession(db, 'parent-1');
    insertSession(db, 'child-1', 'agent:qa-reviewer:subagent:run-1', 'parent-1');

    expect(resolveCoworkSessionIdByOpenClawSessionKey(
      db,
      'agent:qa-reviewer:subagent:run-1',
    )).toBe('child-1');
    expect(getCoworkParentSessionId(db, 'child-1')).toBe('parent-1');
  });

  test('resolves parent session ID for unmaterialized subagents via subagent_runs', () => {
    const db = createDb();
    insertSession(db, 'parent-1');
    // 子代理没有写入 cowork_sessions 表（未物化），但被登记在 subagent_runs 表
    insertSubagentRun(db, 'run-1', 'parent-1', 'agent:main:subagent:run-1');

    expect(resolveCoworkSessionIdByOpenClawSessionKey(
      db,
      'agent:main:subagent:run-1',
    )).toBe('parent-1');
  });

  test('rejects IM-bound sessions and descendants for desktop callbacks', () => {
    const db = createDb();
    insertSession(db, 'im-parent');
    insertSession(db, 'im-child', 'agent:qa-reviewer:subagent:run-2', 'im-parent');
    db.prepare('INSERT INTO im_session_mappings (cowork_session_id) VALUES (?)').run('im-parent');

    expect(isCoworkSessionBoundToIm(db, 'im-child')).toBe(true);
    expect(resolveLocalDesktopCoworkSessionIdByOpenClawSessionKey(
      db,
      'agent:qa-reviewer:subagent:run-2',
    )).toBe(null);
  });
});
