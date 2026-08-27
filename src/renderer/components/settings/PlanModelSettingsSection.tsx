import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { ProviderName } from '@shared/providers';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { getProviderIcon, ProviderIconId } from '../../providers/uiRegistry';
import type { PricingCatalogMediaModel, PricingCatalogTextModel } from '../../services/auth';
import { getPortalPricingUrl } from '../../services/endpoints';
import { i18nService } from '../../services/i18n';
import {
  PlanModelCatalogAnalyticsActionType,
  PlanModelCatalogAnalyticsCategory,
  type PlanModelCatalogAnalyticsCategory as PlanModelCategory,
  PlanModelCatalogAnalyticsResult,
  PlanModelCatalogAnalyticsSource,
  reportPlanModelCatalogAction,
} from './planModelCatalogAnalytics';

const MODEL_ICON_CLASS_NAME = 'h-6 w-6';
const DESCRIPTION_TOOLTIP_MAX_WIDTH = 420;
const DESCRIPTION_TOOLTIP_MIN_WIDTH = 240;
const DESCRIPTION_TOOLTIP_MIN_HEIGHT = 120;
const DESCRIPTION_TOOLTIP_MAX_HEIGHT = 260;
const DESCRIPTION_TOOLTIP_MAX_HEIGHT_RATIO = 0.42;
const DESCRIPTION_TOOLTIP_OFFSET = 10;
const DESCRIPTION_TOOLTIP_VIEWPORT_MARGIN = 12;
const DESCRIPTION_TOOLTIP_BOTTOM_SAFE_AREA = 80;
const DESCRIPTION_TOOLTIP_CLOSE_DELAY_MS = 120;
const DESCRIPTION_TOOLTIP_DATA_ATTR = 'data-plan-model-description-tooltip';

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

type PlanModelCategoryFilter = PlanModelCategory;

type PricingCatalogDisplayModel = (PricingCatalogTextModel | PricingCatalogMediaModel) & {
  category: PlanModelCategory;
};

type DescriptionTooltipPlacement = 'above' | 'below';

interface DescriptionTooltipState {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  placement: DescriptionTooltipPlacement;
  text: string;
}

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

const PLAN_MODEL_FILTERS: PlanModelCategoryFilter[] = [
  PlanModelCatalogAnalyticsCategory.Text,
  PlanModelCatalogAnalyticsCategory.Image,
  PlanModelCatalogAnalyticsCategory.Video,
];

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

const clamp = (value: number, min: number, max: number): number => (
  Math.min(Math.max(value, min), max)
);

const getDescriptionTooltipState = (
  anchorRect: DOMRect,
  text: string,
): DescriptionTooltipState => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const viewportBottom = Math.max(
    DESCRIPTION_TOOLTIP_VIEWPORT_MARGIN + DESCRIPTION_TOOLTIP_MIN_HEIGHT,
    viewportHeight - DESCRIPTION_TOOLTIP_BOTTOM_SAFE_AREA,
  );
  const preferredMaxHeight = Math.min(
    DESCRIPTION_TOOLTIP_MAX_HEIGHT,
    Math.max(DESCRIPTION_TOOLTIP_MIN_HEIGHT, Math.floor(viewportHeight * DESCRIPTION_TOOLTIP_MAX_HEIGHT_RATIO)),
  );
  const availableWidth = Math.max(
    0,
    viewportWidth - (DESCRIPTION_TOOLTIP_VIEWPORT_MARGIN * 2),
  );
  const width = Math.min(
    DESCRIPTION_TOOLTIP_MAX_WIDTH,
    availableWidth,
    Math.max(DESCRIPTION_TOOLTIP_MIN_WIDTH, anchorRect.width),
  );
  const left = clamp(
    anchorRect.left,
    DESCRIPTION_TOOLTIP_VIEWPORT_MARGIN,
    Math.max(DESCRIPTION_TOOLTIP_VIEWPORT_MARGIN, viewportWidth - width - DESCRIPTION_TOOLTIP_VIEWPORT_MARGIN),
  );
  const availableBelow = viewportHeight
    ? viewportBottom - anchorRect.bottom - DESCRIPTION_TOOLTIP_OFFSET - DESCRIPTION_TOOLTIP_VIEWPORT_MARGIN
    : 0;
  const availableAbove = anchorRect.top
    - DESCRIPTION_TOOLTIP_OFFSET
    - DESCRIPTION_TOOLTIP_VIEWPORT_MARGIN;
  const placement: DescriptionTooltipPlacement = availableBelow < preferredMaxHeight && availableAbove > availableBelow
    ? 'above'
    : 'below';
  const top = placement === 'above'
    ? clamp(
      anchorRect.top - DESCRIPTION_TOOLTIP_OFFSET,
      DESCRIPTION_TOOLTIP_VIEWPORT_MARGIN + DESCRIPTION_TOOLTIP_MIN_HEIGHT,
      Math.max(DESCRIPTION_TOOLTIP_VIEWPORT_MARGIN, viewportHeight - DESCRIPTION_TOOLTIP_VIEWPORT_MARGIN),
    )
    : clamp(
      anchorRect.bottom + DESCRIPTION_TOOLTIP_OFFSET,
      DESCRIPTION_TOOLTIP_VIEWPORT_MARGIN,
      Math.max(
        DESCRIPTION_TOOLTIP_VIEWPORT_MARGIN,
        viewportBottom - DESCRIPTION_TOOLTIP_VIEWPORT_MARGIN - DESCRIPTION_TOOLTIP_MIN_HEIGHT,
      ),
    );
  const maxHeight = placement === 'above'
    ? Math.min(preferredMaxHeight, Math.max(DESCRIPTION_TOOLTIP_MIN_HEIGHT, top - DESCRIPTION_TOOLTIP_VIEWPORT_MARGIN))
    : Math.min(preferredMaxHeight, Math.max(DESCRIPTION_TOOLTIP_MIN_HEIGHT, viewportBottom - top));

  return {
    left,
    top,
    width,
    maxHeight,
    placement,
    text,
  };
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
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const tooltipCloseTimerRef = useRef<number | null>(null);
  const [descriptionTooltip, setDescriptionTooltip] = useState<DescriptionTooltipState | null>(null);
  const description = normalizeCatalogDescription(model.description || model.capabilities || undefined);
  const modelName = model.modelName?.trim() || model.modelId?.trim() || i18nService.t('planModelCatalogUnnamedModel');
  const supportsImage = 'supportsImage' in model && Boolean(model.supportsImage);
  const supportsThinking = 'supportsThinking' in model && Boolean(model.supportsThinking);
  const mediaCapabilityKey = model.category === 'image'
    ? 'planModelCatalogImageCapability'
    : model.category === 'video'
      ? 'planModelCatalogVideoCapability'
      : null;

  const closeDescriptionTooltip = useCallback(() => {
    if (tooltipCloseTimerRef.current) {
      window.clearTimeout(tooltipCloseTimerRef.current);
      tooltipCloseTimerRef.current = null;
    }
    setDescriptionTooltip(null);
  }, []);

  const scheduleDescriptionTooltipClose = useCallback(() => {
    if (tooltipCloseTimerRef.current) {
      window.clearTimeout(tooltipCloseTimerRef.current);
    }
    tooltipCloseTimerRef.current = window.setTimeout(() => {
      tooltipCloseTimerRef.current = null;
      setDescriptionTooltip(null);
    }, DESCRIPTION_TOOLTIP_CLOSE_DELAY_MS);
  }, []);

  const cancelDescriptionTooltipClose = useCallback(() => {
    if (!tooltipCloseTimerRef.current) return;
    window.clearTimeout(tooltipCloseTimerRef.current);
    tooltipCloseTimerRef.current = null;
  }, []);

  const openDescriptionTooltip = useCallback(() => {
    cancelDescriptionTooltipClose();
    const descriptionNode = descriptionRef.current;
    if (!descriptionNode || !description) {
      closeDescriptionTooltip();
      return;
    }

    const isDescriptionTruncated = descriptionNode.scrollHeight > descriptionNode.clientHeight + 1
      || descriptionNode.scrollWidth > descriptionNode.clientWidth + 1;
    if (!isDescriptionTruncated) {
      closeDescriptionTooltip();
      return;
    }

    setDescriptionTooltip(getDescriptionTooltipState(
      descriptionNode.getBoundingClientRect(),
      description,
    ));
  }, [cancelDescriptionTooltipClose, closeDescriptionTooltip, description]);

  useEffect(() => {
    if (!descriptionTooltip) return undefined;

    const handleScroll = (event: Event) => {
      if (event.target instanceof Element && event.target.closest(`[${DESCRIPTION_TOOLTIP_DATA_ATTR}="true"]`)) {
        return;
      }
      closeDescriptionTooltip();
    };

    window.addEventListener('resize', closeDescriptionTooltip);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('resize', closeDescriptionTooltip);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [closeDescriptionTooltip, descriptionTooltip]);

  useEffect(() => () => {
    if (tooltipCloseTimerRef.current) {
      window.clearTimeout(tooltipCloseTimerRef.current);
    }
  }, []);

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
        <>
          <p
            ref={descriptionRef}
            className="mt-3 line-clamp-4 text-sm leading-6 text-secondary"
            onMouseEnter={openDescriptionTooltip}
            onMouseLeave={scheduleDescriptionTooltipClose}
          >
            {description}
          </p>
          {descriptionTooltip && createPortal(
            <div
              role="tooltip"
              data-plan-model-description-tooltip="true"
              className="fixed z-[10000] overscroll-contain rounded-lg border border-border bg-surface px-3 py-2 text-sm leading-6 text-foreground shadow-xl"
              onMouseEnter={cancelDescriptionTooltipClose}
              onMouseLeave={scheduleDescriptionTooltipClose}
              style={{
                left: descriptionTooltip.left,
                top: descriptionTooltip.top,
                width: descriptionTooltip.width,
                maxHeight: descriptionTooltip.maxHeight,
                overflowY: 'auto',
                transform: descriptionTooltip.placement === 'above' ? 'translateY(-100%)' : undefined,
              }}
            >
              {descriptionTooltip.text}
            </div>,
            document.body,
          )}
        </>
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
    reportPlanModelCatalogAction({
      actionType: PlanModelCatalogAnalyticsActionType.CategoryChange,
      activeCategory,
      modelCounts: categoryCounts,
      previousCategory: activeCategory,
      source: PlanModelCatalogAnalyticsSource.CatalogToolbar,
      targetCategory: nextCategory,
      visibleModelCount: categoryCounts[nextCategory],
    });
    setActiveCategory(nextCategory);
    window.requestAnimationFrame(() => {
      const scrollContainer = getScrollContainer();
      if (scrollContainer) {
        scrollContainer.scrollTop = 0;
      }
    });
  }, [activeCategory, categoryCounts, getScrollContainer]);

  const handleOpenSubscription = useCallback(async () => {
    console.debug(`[PlanModelCatalog] renderer opening pricing portal from ${activeCategory} category.`);
    try {
      const result = await window.electron.shell.openExternal(getPortalPricingUrl());
      if (!result.success) {
        console.warn('[PlanModelCatalog] renderer failed to open pricing portal:', result.error);
        reportPlanModelCatalogAction({
          actionType: PlanModelCatalogAnalyticsActionType.OpenPricing,
          activeCategory,
          errorCode: 'open_external_failed',
          modelCounts: categoryCounts,
          result: PlanModelCatalogAnalyticsResult.Failed,
          source: PlanModelCatalogAnalyticsSource.CatalogToolbar,
          visibleModelCount: categoryCounts[activeCategory],
        });
        return;
      }
      reportPlanModelCatalogAction({
        actionType: PlanModelCatalogAnalyticsActionType.OpenPricing,
        activeCategory,
        modelCounts: categoryCounts,
        result: PlanModelCatalogAnalyticsResult.Success,
        source: PlanModelCatalogAnalyticsSource.CatalogToolbar,
        visibleModelCount: categoryCounts[activeCategory],
      });
    } catch (error) {
      console.warn('[PlanModelCatalog] renderer failed to open pricing portal:', error);
      reportPlanModelCatalogAction({
        actionType: PlanModelCatalogAnalyticsActionType.OpenPricing,
        activeCategory,
        errorCode: 'unknown',
        modelCounts: categoryCounts,
        result: PlanModelCatalogAnalyticsResult.Failed,
        source: PlanModelCatalogAnalyticsSource.CatalogToolbar,
        visibleModelCount: categoryCounts[activeCategory],
      });
    }
  }, [activeCategory, categoryCounts]);

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
          onClick={() => { void handleOpenSubscription(); }}
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
