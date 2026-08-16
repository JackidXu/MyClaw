import type { LocalWebService } from '@shared/localWebServices/constants';

import type { Artifact } from '@/types/artifact';

export const ArtifactToolbarPublishActionKind = {
  Share: 'share',
  Deploy: 'deploy',
} as const;

export type ArtifactToolbarPublishActionKind =
  (typeof ArtifactToolbarPublishActionKind)[keyof typeof ArtifactToolbarPublishActionKind];

export interface ArtifactToolbarShareTarget {
  kind: typeof ArtifactToolbarPublishActionKind.Share;
  artifact: Artifact;
}

export interface ArtifactToolbarDeployTarget {
  kind: typeof ArtifactToolbarPublishActionKind.Deploy;
  localService: LocalWebService;
}

export type ArtifactToolbarPublishTarget =
  | ArtifactToolbarShareTarget
  | ArtifactToolbarDeployTarget;

export function resolveArtifactPreviewToolbarPublishTarget(
  _artifact: Artifact | null | undefined,
  _shareAvailable: boolean,
): ArtifactToolbarShareTarget | null {
  return null;
}

export function resolveBrowserToolbarPublishTarget(_input: {
  htmlArtifact?: Artifact | null;
  localService?: LocalWebService | null;
  shareAvailable: boolean;
}): ArtifactToolbarPublishTarget | null {
  return null;
}
