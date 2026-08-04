import { OpenClawProviderId, ProviderRegistry } from '@shared/providers/constants';

import type { Model } from '../store/slices/modelSlice';

type ModelRefInput = Pick<Model, 'id' | 'providerKey' | 'openClawProviderId' | 'isServerModel'>;

function resolveModelOpenClawProviderId(model: ModelRefInput): string {
  if (model.isServerModel) {
    return OpenClawProviderId.LobsteraiServer;
  }
  return model.openClawProviderId || ProviderRegistry.getOpenClawProviderId(model.providerKey ?? '');
}

export function toOpenClawModelRef(model: ModelRefInput): string {
  if (model.id === 'system/auto' || (model as any).isAutoModel) {
    return 'system/auto';
  }
  return `${resolveModelOpenClawProviderId(model)}/${model.id}`;
}

export function matchesOpenClawModelRef(
  modelRef: string,
  model: ModelRefInput,
): boolean {
  const normalizedRef = modelRef.trim();
  if (!normalizedRef) return false;
  if (normalizedRef === 'system/auto' || normalizedRef === 'auto') {
    return model.id === 'system/auto' || (model as any).isAutoModel === true;
  }
  if (normalizedRef.includes('/')) {
    return normalizedRef === toOpenClawModelRef(model);
  }
  return normalizedRef === model.id;
}

export function resolveOpenClawModelRef<T extends ModelRefInput>(
  modelRef: string,
  availableModels: T[],
): T | null {
  const normalizedRef = modelRef.trim();
  if (!normalizedRef) return null;

  if (normalizedRef === 'system/auto' || normalizedRef === 'auto') {
    const autoModel = availableModels.find((m) => m.id === 'system/auto' || (m as any).isAutoModel);
    if (autoModel) return autoModel;
  }

  if (normalizedRef.includes('/')) {
    const exact = availableModels.find((model) => toOpenClawModelRef(model) === normalizedRef) ?? null;
    if (exact) return exact;

    const slashIndex = normalizedRef.indexOf('/');
    const providerId = normalizedRef.slice(0, slashIndex);
    const modelId = normalizedRef.slice(slashIndex + 1);

    if (providerId === OpenClawProviderId.OpenAI || providerId === OpenClawProviderId.OpenAICodex) {
      const migratedProviderId = providerId === OpenClawProviderId.OpenAICodex
        ? OpenClawProviderId.OpenAI
        : OpenClawProviderId.OpenAICodex;
      const migratedRef = `${migratedProviderId}/${modelId}`;
      const migratedMatch = availableModels.find((model) => toOpenClawModelRef(model) === migratedRef) ?? null;
      if (migratedMatch) return migratedMatch;
    }

    const idMatches = availableModels.filter((model) => model.id === modelId);
    if (idMatches.length === 1) {
      return idMatches[0];
    }
    return null;
  }

  const matchingModels = availableModels.filter((model) => model.id === normalizedRef);
  return matchingModels.length === 1 ? matchingModels[0] : null;
}
