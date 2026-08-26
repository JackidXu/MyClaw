import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { ProviderName } from '@shared/providers';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getProviderIcon, ProviderIconId } from '../../providers/uiRegistry';
import type { PricingCatalogMediaModel, PricingCatalogTextModel } from '../../services/auth';
import { getPortalPricingUrl } from '../../services/endpoints';
import { i18nService } from '../../services/i18n';

const MODEL_ICON_CLASS_NAME = 'h-6 w-6';

const MODEL_ICON_PROVIDER_HINTS: Array<{ pattern: RegExp; providerName: ProviderName | ProviderIconId }> = [
  { pattern: /doubao|豆包/i, providerName: ProviderIconId.Doubao },
  { pattern: /happyhorse/i, providerName: ProviderIconId.HappyHorse },
  { pattern: /kling|可灵/i, providerName: ProviderIconId.Kling },
  { pattern: /banana/i, providerName: ProviderIconId.Banana },
  { pattern: /deepseek/i, providerName: ProviderName.DeepSeek },
  { pattern: /minimax/i, providerName: ProviderName.Minimax },
  { pattern: /kimi|moonshot/i, providerName: ProviderName.Moonshot },
  { pattern: /glm|zhipu/i, providerName: ProviderName.Zhipu },
  { pattern: /qwen|qwq|qvq/i, providerName: ProviderName.Qwen },
  { pattern: /claude|anthropic/i, providerName: ProviderName.Anthropic },
  { pattern: /gemini/i, providerName: ProviderName.Gemini },
  { pattern: /gpt|openai/i, providerName: ProviderName.OpenAI },
  { pattern: /hy3|youdao/i, providerName: ProviderName.Youdaozhiyun },
];

type LoadState =
  | { kind: 'loading' }
  | { kind: 'loaded'; groups: PlanModelGroup[] }
  | { kind: 'error'; message: string };

type PlanModelCategory = 'text' | 'image' | 'video';
type PlanModelCategoryFilter = PlanModelCategory;

type PricingCatalogDisplayModel = (PricingCatalogTextModel | PricingCatalogMediaModel) & {
  category: PlanModelCategory;
};

interface PlanModelGroup {
  key: PlanModelCategory;
  models: PricingCatalogDisplayModel[];
}

type PlanModelCatalogCounts = Record<PlanModelCategory, number>;

const PLAN_MODEL_FILTER_LABEL_KEYS: Record<PlanModelCategoryFilter, string> = {
  text: 'planModelCatalogTextModels',
  image: 'planModelCatalogImageModels',
  video: 'planModelCatalogVideoModels',
};

const PLAN_MODEL_FILTERS: PlanModelCategoryFilter[] = ['text', 'image', 'video'];

const getPlanModelCounts = (groups: PlanModelGroup[]): PlanModelCatalogCounts => ({
  text: groups.find(group => group.key === 'text')?.models.length ?? 0,
  image: groups.find(group => group.key === 'image')?.models.length ?? 0,
  video: groups.find(group => group.key === 'video')?.models.length ?? 0,
});

const normalizeCatalogDescription = (description?: string): string => {
  const normalized = (description ?? '')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/，，/g, '，')
    .replace(/。；/g, '；')
    .trim();
  if (!normalized) return '';
  return normalized
    .split('；分时计价：')[0]
    .split('折算公式：')[0]
    .trim();
};

const resolveModelIconProviderKey = (model: PricingCatalogDisplayModel): string => {
  const searchableText = `${model.modelName ?? ''} ${model.modelId ?? ''}`;
  return MODEL_ICON_PROVIDER_HINTS.find(({ pattern }) => pattern.test(searchableText))?.providerName
    ?? '';
};

const renderModelIcon = (model: PricingCatalogDisplayModel): React.ReactNode => {
  const icon = getProviderIcon(resolveModelIconProviderKey(model));
  if (!React.isValidElement<{ className?: string }>(icon)) return icon;

  const existingClassName = icon.props.className ? `${icon.props.className} ` : '';
  return React.cloneElement(icon, {
    className: `${existingClassName}${MODEL_ICON_CLASS_NAME}`,
  });
};

const PlanModelCard: React.FC<{
  model: PricingCatalogDisplayModel;
}> = ({ model }) => {
  const description = normalizeCatalogDescription(model.description || model.capabilities || undefined);
  const modelName = model.modelName?.trim() || model.modelId?.trim() || i18nService.t('planModelCatalogUnnamedModel');
  const supportsImage = 'supportsImage' in model && Boolean(model.supportsImage);
  const supportsThinking = 'supportsThinking' in model && Boolean(model.supportsThinking);
  const mediaCapabilityKey = model.category === 'image'
    ? 'planModelCatalogImageCapability'
    : model.category === 'video'
      ? 'planModelCatalogVideoCapability'
      : null;

  return (
    <article
      className="min-h-[184px] min-w-0 rounded-2xl border border-transparent bg-surface-raised/50 p-5 transition-colors hover:border-border"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-primary">
          {renderModelIcon(model)}
        </span>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {mediaCapabilityKey && (
            <span className="rounded-full bg-primary-muted px-2.5 py-1 text-[11px] font-medium leading-none text-secondary">
              {i18nService.t(mediaCapabilityKey)}
            </span>
          )}
          {supportsImage && (
            <span className="rounded-full bg-primary-muted px-2.5 py-1 text-[11px] font-medium leading-none text-secondary">
              {i18nService.t('modelSupportsImageInputBadge')}
            </span>
          )}
          {supportsThinking && (
            <span className="rounded-full bg-primary-muted px-2.5 py-1 text-[11px] font-medium leading-none text-secondary">
              {i18nService.t('planModelCatalogSupportsThinking')}
            </span>
          )}
        </div>
      </div>

      <h4 className="mt-6 line-clamp-2 text-xl font-semibold leading-7 text-foreground">
        {modelName}
      </h4>
      {description && (
        <p className="mt-3 line-clamp-4 text-sm leading-6 text-secondary">
          {description}
        </p>
      )}
    </article>
  );
};

const toDisplayModels = (
  category: PlanModelCategory,
  models?: Array<PricingCatalogTextModel | PricingCatalogMediaModel>,
): PricingCatalogDisplayModel[] => (
  (Array.isArray(models) ? models : [])
    .filter(model => Boolean(model.modelId || model.modelName))
    .map(model => ({ ...model, category }))
);

const PlanModelSettingsSection: React.FC = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [activeCategory, setActiveCategory] = useState<PlanModelCategoryFilter>('text');

  const getScrollContainer = useCallback((): HTMLElement | null => {
    let node = rootRef.current?.parentElement ?? null;
    while (node) {
      const overflowY = window.getComputedStyle(node).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }, []);

  const loadModels = useCallback(async () => {
    setLoadState({ kind: 'loading' });
    try {
      console.debug('[PlanModelCatalog] renderer requesting pricing catalog.');
      const result = await window.electron.auth.getPricingCatalog();
      if (!result.success) {
        throw new Error(result.error || i18nService.t('planModelCatalogLoadFailed'));
      }
      const groups: PlanModelGroup[] = [
        {
          key: 'text',
          models: toDisplayModels('text', result.textModels),
        },
        {
          key: 'image',
          models: toDisplayModels('image', result.imageModels),
        },
        {
          key: 'video',
          models: toDisplayModels('video', result.videoModels),
        },
      ];
      const counts = getPlanModelCounts(groups);
      console.debug(
        '[PlanModelCatalog] renderer loaded pricing catalog: '
        + `${counts.text} text, ${counts.image} image, ${counts.video} video models.`,
      );
      setLoadState({
        kind: 'loaded',
        groups,
      });
    } catch (error) {
      console.warn('[PlanModelCatalog] renderer failed to load pricing catalog:', error);
      setLoadState({
        kind: 'error',
        message: error instanceof Error ? error.message : i18nService.t('planModelCatalogLoadFailed'),
      });
    }
  }, []);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const allModels = useMemo(() => {
    if (loadState.kind !== 'loaded') return [];
    return loadState.groups.flatMap(group => group.models);
  }, [loadState]);

  const categoryCounts = useMemo<Record<PlanModelCategoryFilter, number>>(() => ({
    text: allModels.filter(model => model.category === 'text').length,
    image: allModels.filter(model => model.category === 'image').length,
    video: allModels.filter(model => model.category === 'video').length,
  }), [allModels]);

  const visibleModels = useMemo(
    () => allModels.filter(model => model.category === activeCategory),
    [activeCategory, allModels],
  );

  const handleCategoryChange = useCallback((nextCategory: PlanModelCategoryFilter) => {
    if (nextCategory === activeCategory) return;
    console.debug(`[PlanModelCatalog] renderer switched category from ${activeCategory} to ${nextCategory}.`);
    setActiveCategory(nextCategory);
    window.requestAnimationFrame(() => {
      const scrollContainer = getScrollContainer();
      if (scrollContainer) {
        scrollContainer.scrollTop = 0;
      }
    });
  }, [activeCategory, getScrollContainer]);

  const handleOpenSubscription = useCallback(() => {
    void window.electron.shell.openExternal(getPortalPricingUrl());
  }, []);

  if (loadState.kind === 'loading') {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-border bg-surface">
        <div className="flex items-center gap-2 text-sm text-secondary">
          <ArrowPathIcon className="h-4 w-4 animate-spin" />
          {i18nService.t('loading')}
        </div>
      </div>
    );
  }

  if (loadState.kind === 'error') {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-border bg-surface px-6 text-center">
        <ExclamationTriangleIcon className="h-8 w-8 text-amber-500" />
        <div className="mt-3 text-sm font-medium text-foreground">
          {i18nService.t('planModelCatalogLoadFailed')}
        </div>
        <div className="mt-1 max-w-md text-xs leading-5 text-secondary">
          {loadState.message}
        </div>
        <button
          type="button"
          onClick={() => { void loadModels(); }}
          className="mt-4 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover active:scale-[0.98]"
        >
          {i18nService.t('retry')}
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="space-y-5 pb-2">
      <div className="sticky top-0 z-20 -mx-6 -mt-4 flex items-start justify-between gap-3 border-b border-border/60 bg-background px-6 py-4 before:absolute before:inset-x-0 before:-top-4 before:h-4 before:bg-background before:content-['']">
        <div className="min-w-0">
          <div className="flex min-w-0 gap-3 overflow-x-auto">
            {PLAN_MODEL_FILTERS.map(filter => {
              const active = filter === activeCategory;
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => { handleCategoryChange(filter); }}
                  className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium leading-none transition-colors ${
                    active
                      ? 'border-primary/30 bg-primary-muted text-primary shadow-sm'
                      : 'border-border bg-background text-secondary hover:border-primary/30 hover:text-foreground'
                  }`}
                >
                  {i18nService.t(PLAN_MODEL_FILTER_LABEL_KEYS[filter])}
                  <span className="text-xs leading-none text-tertiary">{categoryCounts[filter]}</span>
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={handleOpenSubscription}
          className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover active:scale-[0.98]"
        >
          {i18nService.t('planModelCatalogBuyPlan')}
        </button>
      </div>

      {visibleModels.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface px-6 py-10 text-center text-sm text-secondary">
          {i18nService.t('planModelCatalogEmpty')}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 pt-2 xl:grid-cols-3">
          {visibleModels.map((model, index) => (
            <PlanModelCard
              key={model.modelId || `${model.modelName}-${index}`}
              model={model}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default PlanModelSettingsSection;
