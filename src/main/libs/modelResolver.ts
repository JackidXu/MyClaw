export type ProviderModelCatalog = Record<string, { models: Array<{ id: string }> }>;

export const AUTO_MODEL_REF = 'system/auto';

/**
 * Check if a model reference represents the System Auto Routing model.
 */
export function isAutoModelRef(modelRef: string | undefined | null): boolean {
  if (!modelRef) return true;
  const trimmed = modelRef.trim().toLowerCase();
  return !trimmed || trimmed === 'auto' || trimmed === 'system/auto';
}

/**
 * Formats providerId and modelId into a canonical model reference (providerId/modelId).
 */
export function toCanonicalModelRef(providerId: string, modelId: string): string {
  const p = providerId.trim();
  const m = modelId.trim();
  if (!p) return m;
  if (m.startsWith(`${p}/`)) return m;
  return `${p}/${m}`;
}

/**
 * Parses a canonical model reference string (providerId/modelId).
 */
export function parseCanonicalModelRef(modelRef: string): { providerId: string; modelId: string } | null {
  const trimmed = modelRef.trim();
  if (!trimmed || isAutoModelRef(trimmed)) {
    return null;
  }
  const slashIndex = trimmed.indexOf('/');
  if (slashIndex <= 0 || slashIndex === trimmed.length - 1) {
    return null;
  }
  return {
    providerId: trimmed.slice(0, slashIndex),
    modelId: trimmed.slice(slashIndex + 1),
  };
}

/**
 * Pure & Robust Model Normalizer:
 * 1. If explicit auto -> AUTO_MODEL_REF (system/auto)
 * 2. If valid canonical ref (providerId/modelId) -> Canonical Ref
 * 3. Fallback to fallbackPrimaryModel if provided, otherwise AUTO_MODEL_REF
 */
export function normalizeModelRef(
  modelRef: string | undefined | null,
  availableProviders: ProviderModelCatalog = {},
  fallbackPrimaryModel?: string,
): string {
  const trimmed = modelRef?.trim();

  if (trimmed && isAutoModelRef(trimmed)) {
    return AUTO_MODEL_REF;
  }

  if (trimmed) {
    const parsed = parseCanonicalModelRef(trimmed);
    if (parsed) {
      const providerConfig = availableProviders[parsed.providerId];
      if (providerConfig && providerConfig.models.some((m) => m.id === parsed.modelId)) {
        return toCanonicalModelRef(parsed.providerId, parsed.modelId);
      }
    }
  }

  return fallbackPrimaryModel || AUTO_MODEL_REF;
}
