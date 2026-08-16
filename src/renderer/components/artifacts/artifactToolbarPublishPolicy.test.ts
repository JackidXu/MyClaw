import type { LocalWebService } from '@shared/localWebServices/constants';
import { describe, expect, test } from 'vitest';

import { type Artifact, ArtifactTypeValue } from '@/types/artifact';

import {
  resolveArtifactPreviewToolbarPublishTarget,
  resolveBrowserToolbarPublishTarget,
} from './artifactToolbarPublishPolicy';

const makeArtifact = (
  type: Artifact['type'],
  overrides: Partial<Artifact> = {},
): Artifact => ({
  id: 'artifact-1',
  messageId: 'message-1',
  sessionId: 'session-1',
  type,
  title: 'Artifact title',
  content: '',
  createdAt: 1,
  ...overrides,
});

const localService: LocalWebService = {
  id: 'localhost:5175',
  title: 'Local app',
  url: 'http://localhost:5175',
  host: 'localhost',
  port: 5175,
  online: true,
};

describe('artifactToolbarPublishPolicy', () => {
  test('does not expose sharing in the regular preview toolbar when publish is disabled', () => {
    const artifact = makeArtifact(ArtifactTypeValue.Image, {
      filePath: '/tmp/image.png',
    });

    expect(resolveArtifactPreviewToolbarPublishTarget(artifact, true)).toBeNull();
  });

  test('does not expose sharing without a controller or shareable source', () => {
    const artifact = makeArtifact(ArtifactTypeValue.Image, {
      filePath: '/tmp/image.png',
    });

    expect(resolveArtifactPreviewToolbarPublishTarget(artifact, false)).toBeNull();
    expect(
      resolveArtifactPreviewToolbarPublishTarget(
        makeArtifact(ArtifactTypeValue.Text, { content: 'text' }),
        true,
      ),
    ).toBeNull();
  });

  test('does not expose share or deploy for managed HTML previews when publish is disabled', () => {
    const artifact = makeArtifact(ArtifactTypeValue.Html, {
      filePath: '/tmp/index.html',
    });

    expect(resolveBrowserToolbarPublishTarget({
      htmlArtifact: artifact,
      localService,
      shareAvailable: true,
    })).toBeNull();
  });

  test('does not deploy a local service when publish is disabled', () => {
    expect(resolveBrowserToolbarPublishTarget({
      localService,
      shareAvailable: true,
    })).toBeNull();
  });

  test('does not expose an action for an ordinary browser page', () => {
    expect(resolveBrowserToolbarPublishTarget({
      shareAvailable: true,
    })).toBeNull();
  });
});
