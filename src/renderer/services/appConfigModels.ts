import { ProviderAuthType, ProviderName, ProviderRegistry } from '../../shared/providers';
import { getProviderDisplayName } from '../config';
import { store } from '../store';
import { setAvailableModels, setDefaultSelectedModel } from '../store/slices/modelSlice';
import type { ApiConfig } from './api';
import { apiService } from './api';
import { configService } from './config';
import { applyTypographyPreferences } from './typography';

export interface ProviderModelOption {
  id: string;
  name: string;
  provider?: string;
  providerKey?: string;
  openClawProviderId?: string;
  supportsImage?: boolean;
  supportsVideo?: boolean;
  supportsThinking?: boolean;
  thinkingConfig?: any;
  contextWindow?: number;
  maxTokens?: number;
  description?: string;
  isRecommended?: boolean;
  costMultiplier?: number;
  agenticReady?: boolean;
  runtimeProfile?: any;
}

/**
 * Applies the loaded app config to a renderer: typography, API client config,
 * and the provider models offered by model pickers. Shared by the main window
 * and the desktop companion's composer window.
 */
export function applyAppConfigToStore(log?: (label: string) => void): ProviderModelOption[] {
  const config = configService.getConfig();
  applyTypographyPreferences(config);
  const apiConfig: ApiConfig = {
    apiKey: config.api.key,
    baseUrl: config.api.baseUrl,
  };
  apiService.setConfig(apiConfig);

  const providerModels: ProviderModelOption[] = [];
  if (config.providers) {
    Object.entries(config.providers).forEach(([providerName, providerConfig]) => {
      if (providerConfig.enabled && providerConfig.models) {
        const openClawProviderId = ProviderRegistry.getOpenClawProviderIdForConfig(providerName, providerConfig);
        if (providerName === ProviderName.Minimax && providerConfig.authType === ProviderAuthType.OAuth) {
          log?.('MiniMax OAuth provider resolved to OpenClaw minimax-portal');
        }
        providerConfig.models.forEach((model: any) => {
          providerModels.push({
            id: model.id,
            name: model.name,
            provider: getProviderDisplayName(providerName, providerConfig),
            providerKey: providerName,
            openClawProviderId,
            supportsImage: model.supportsImage ?? false,
            supportsVideo: Boolean(model.supportsVideo),
            supportsThinking: Boolean(model.supportsThinking),
            thinkingConfig: model.thinkingConfig,
            contextWindow: model.contextWindow,
            maxTokens: model.maxTokens,
            description: model.description || undefined,
            isRecommended: Boolean(model.isRecommended),
            costMultiplier: model.costMultiplier,
            agenticReady: model.agenticReady,
            runtimeProfile: model.runtimeProfile,
          });
        });
      }
    });
  }
  store.dispatch(setAvailableModels(providerModels as any));
  if (providerModels.length > 0) {
    const allModels = store.getState().model.availableModels;
    const preferredModel = allModels.find(
      model => model.id === config.model.defaultModel
        && (!config.model.defaultModelProvider || model.providerKey === config.model.defaultModelProvider)
    ) ?? allModels[0];
    store.dispatch(setDefaultSelectedModel(preferredModel));
  }
  return providerModels;
}
