import { useCallback, useEffect, useState } from 'react';

import type {
  YixiaoerConfig,
  YxerCliInstallResult,
  YxerCliStatus,
} from '../../shared/contentDistribution/constants';

export const CONTENT_DISTRIBUTION_CONFIG_EVENT = 'content-distribution:config-changed';
export const CONTENT_DISTRIBUTION_CLI_CHANGED_EVENT = 'content-distribution:cli-changed';

/**
 * 内容分发服务（前端配置与状态支持）
 */
export const contentDistributionService = {
  async getConfig(): Promise<YixiaoerConfig | null> {
    try {
      return (await window.electron.contentDistribution?.getConfig()) || null;
    } catch {
      return null;
    }
  },

  async hasApiKey(): Promise<boolean> {
    const config = await this.getConfig();
    return Boolean(config?.apiKey);
  },

  async checkCli(): Promise<YxerCliStatus> {
    try {
      return (await window.electron.contentDistribution?.checkCli()) || { installed: false };
    } catch {
      return { installed: false };
    }
  },

  async installCli(force = false): Promise<YxerCliInstallResult> {
    try {
      const res =
        (await window.electron.contentDistribution?.installCli(force)) || {
          success: false,
          error: '调用安装接口失败',
        };
      if (res.success) {
        this.notifyCliChanged();
      }
      return res;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : '安装分发环境失败',
      };
    }
  },

  notifyConfigChanged(): void {
    window.dispatchEvent(new CustomEvent(CONTENT_DISTRIBUTION_CONFIG_EVENT));
  },

  notifyCliChanged(): void {
    window.dispatchEvent(new CustomEvent(CONTENT_DISTRIBUTION_CLI_CHANGED_EVENT));
  },
};

/**
 * 响应式监听蚁小二密钥配置状态的 Hook
 */
export const useYixiaoerStatus = () => {
  const [hasApiKey, setHasApiKey] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    try {
      const active = await contentDistributionService.hasApiKey();
      setHasApiKey(active);
    } catch {
      setHasApiKey(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkStatus();
    const handleUpdate = () => void checkStatus();
    window.addEventListener(CONTENT_DISTRIBUTION_CONFIG_EVENT, handleUpdate);
    return () => {
      window.removeEventListener(CONTENT_DISTRIBUTION_CONFIG_EVENT, handleUpdate);
    };
  }, [checkStatus]);

  return { hasApiKey, loading, refresh: checkStatus };
};

/**
 * 响应式监听 yxer CLI 运行环境状态的 Hook
 */
export const useYxerCliStatus = () => {
  const [cliStatus, setCliStatus] = useState<YxerCliStatus>({ installed: false });
  const [checking, setChecking] = useState(true);
  const [installing, setInstalling] = useState(false);

  const refreshCli = useCallback(async () => {
    setChecking(true);
    try {
      const status = await contentDistributionService.checkCli();
      setCliStatus(status);
    } catch {
      setCliStatus({ installed: false });
    } finally {
      setChecking(false);
    }
  }, []);

  const installCli = useCallback(
    async (force = false): Promise<YxerCliInstallResult> => {
      setInstalling(true);
      try {
        const res = await contentDistributionService.installCli(force);
        await refreshCli();
        return res;
      } finally {
        setInstalling(false);
      }
    },
    [refreshCli],
  );

  useEffect(() => {
    void refreshCli();
    const handleCliChanged = () => void refreshCli();
    window.addEventListener(CONTENT_DISTRIBUTION_CLI_CHANGED_EVENT, handleCliChanged);
    return () => {
      window.removeEventListener(CONTENT_DISTRIBUTION_CLI_CHANGED_EVENT, handleCliChanged);
    };
  }, [refreshCli]);

  return { cliStatus, checking, installing, refreshCli, installCli };
};
