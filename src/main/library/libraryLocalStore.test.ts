import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
  LibraryArtifactType,
  LibraryAvailability,
  LibraryCategory,
  LibraryFavoriteScope,
  LibraryItemKind,
  LibraryOrigin,
  LibraryRelationKind,
} from '../../shared/library/constants';
import type { LibraryArtifactCandidate } from '../../shared/library/types';
import { LibraryLocalStore } from './libraryLocalStore';
import { initializeLibraryTables } from './libraryMigrations';

describe('LibraryLocalStore', () => {
  let db: Database.Database;
  let store: LibraryLocalStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE cowork_sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        cwd TEXT NOT NULL,
        agent_id TEXT,
        updated_at INTEGER NOT NULL
      );
    `);
    initializeLibraryTables(db);
    initializeLibraryTables(db);
    store = new LibraryLocalStore(db);
  });

  afterEach(() => db.close());

  const insertSession = (id: string, title: string, updatedAt: number) => {
    db.prepare(`
      INSERT INTO cowork_sessions (id, title, cwd, agent_id, updated_at)
      VALUES (?, ?, '/workspace', 'main', ?)
    `).run(id, title, updatedAt);
  };

  const candidate = (
    sessionId: string,
    relatedAt: number,
    relationKind = LibraryRelationKind.Modified,
  ): LibraryArtifactCandidate => ({
    sessionId,
    messageId: `message-${sessionId}`,
    sessionArtifactId: `artifact-${sessionId}`,
    filePath: '/workspace/report.pdf',
    detectedType: LibraryArtifactType.Document,
    relationKind,
    relatedAt,
    origin: LibraryOrigin.Conversation,
  });

  const indexedFile = (mtime: number, origin = LibraryOrigin.Conversation) => ({
    pathKey: '/workspace/report.pdf',
    filePath: '/workspace/report.pdf',
    fileName: 'report.pdf',
    extension: '.pdf',
    artifactType: LibraryArtifactType.Document,
    category: LibraryCategory.Document,
    sizeBytes: 128,
    fileMtimeMs: mtime,
    availability: LibraryAvailability.Available,
    origin,
    verifiedAt: mtime,
  });

  test('keeps one artifact with many sessions and resolves the latest valid session', () => {
    insertSession('session-1', 'First session', 100);
    insertSession('session-2', 'Latest session', 200);

    const first = store.upsertFile(indexedFile(100), candidate('session-1', 100));
    const second = store.upsertFile(indexedFile(200), candidate('session-2', 200));

    expect(second.itemId).toBe(first.itemId);
    expect(store.list().list).toHaveLength(1);
    expect(store.list().list[0]).toMatchObject({
      relatedSessionCount: 2,
      latestSession: { sessionId: 'session-2', title: 'Latest session' },
    });

    db.prepare('DELETE FROM library_artifact_sessions WHERE session_id = ?').run('session-2');
    expect(store.list().list[0].latestSession?.sessionId).toBe('session-1');
  });

  test('shows artifacts carrying obsolete hidden metadata from an older local database', () => {
    insertSession('session-1', 'Session', 100);
    const item = store.upsertFile(indexedFile(100), candidate('session-1', 100));
    db.exec('ALTER TABLE library_local_artifacts ADD COLUMN hidden_at INTEGER');
    db.prepare('UPDATE library_local_artifacts SET hidden_at = ? WHERE id = ?')
      .run(100, item.itemId);

    expect(store.list().list).toHaveLength(1);
  });

  test('keeps the strongest relation kind while updating the latest relation metadata', () => {
    insertSession('session-1', 'Session', 100);
    const item = store.upsertFile(
      indexedFile(100),
      candidate('session-1', 100, LibraryRelationKind.Created),
    );
    store.upsertFile(
      indexedFile(200),
      candidate('session-1', 200, LibraryRelationKind.Referenced),
    );

    expect(store.getDetail(item.itemId)?.sessions[0]).toMatchObject({
      relationKind: LibraryRelationKind.Created,
      lastRelatedAt: 200,
    });
  });

  test('hides missing files from normal results and removes their local favorite', () => {
    insertSession('session-1', 'Session', 100);
    const item = store.upsertFile(indexedFile(100), candidate('session-1', 100));
    store.setFavorite({
      ownerScope: LibraryFavoriteScope.LocalDevice,
      itemKind: LibraryItemKind.LocalArtifact,
      itemId: item.itemId,
      favorite: true,
    });

    expect(store.markMissing(item.itemId, 200)).toBe(true);
    expect(store.list().list).toHaveLength(0);
    expect(store.getItem(item.itemId)).toMatchObject({
      availability: LibraryAvailability.Missing,
      isFavorite: false,
    });
  });

  test('isolates local favorites and paginates deterministically', () => {
    insertSession('session-1', 'Session', 100);
    const first = store.upsertFile(indexedFile(100), candidate('session-1', 100));
    store.upsertFile({
      ...indexedFile(200),
      pathKey: '/workspace/slides.pptx',
      filePath: '/workspace/slides.pptx',
      fileName: 'slides.pptx',
      extension: '.pptx',
      category: LibraryCategory.Slides,
    }, {
      ...candidate('session-1', 200),
      filePath: '/workspace/slides.pptx',
    });
    store.setFavorite({
      ownerScope: LibraryFavoriteScope.LocalDevice,
      itemKind: LibraryItemKind.LocalArtifact,
      itemId: first.itemId,
      favorite: true,
    });

    const pageOne = store.list({ pageSize: 1 });
    const pageTwo = store.list({ pageSize: 1, cursor: pageOne.nextCursor });
    expect(pageOne.hasMore).toBe(true);
    expect(pageTwo.list).toHaveLength(1);
    expect(pageTwo.list[0].itemId).not.toBe(pageOne.list[0].itemId);
    expect(store.list({ favoritesOnly: true }).list.map(item => item.itemId)).toEqual([first.itemId]);
  });
});
