import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  CommandLineIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  EyeSlashIcon,
  InformationCircleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import React, { useState } from 'react';

import type { YixiaoerConfig } from '../../../shared/contentDistribution/constants';
import { useYxerCliStatus } from '../../services/contentDistribution';
import { i18nService } from '../../services/i18n';

interface ContentDistributionSettingsProps {
  value: YixiaoerConfig;
  onChange: (value: YixiaoerConfig) => void;
}

const ContentDistributionSettings: React.FC<ContentDistributionSettingsProps> = ({
  value,
  onChange,
}) => {
  const [showApiKey, setShowApiKey] = useState(false);
  const { cliStatus, checking, installing, refreshCli, installCli } = useYxerCliStatus();

  const handleInstall = async () => {
    if (installing) return;
    const res = await installCli(false);
    if (res.success) {
      window.dispatchEvent(
        new CustomEvent('app:showToast', {
          detail: i18nService.t('contentDistEnvInstallSuccess'),
        }),
      );
    } else {
      window.dispatchEvent(
        new CustomEvent('app:showToast', {
          detail: `${i18nService.t('contentDistEnvInstallFailed')}: ${res.error || ''}`,
        }),
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* 顶部介绍与说明卡片 */}
      <div className="rounded-xl border border-border bg-surface p-5 shadow-subtle">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
            <CommandLineIcon className="h-5 w-5" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              {i18nService.t('contentDistTitle')}
            </h3>
            <p className="text-sm text-secondary leading-relaxed">
              {i18nService.t('contentDistDesc')}
            </p>
          </div>
        </div>

        {/* 步骤引导 */}
        <div className="mt-4 rounded-lg bg-background p-4 text-xs text-secondary space-y-2 border border-border/50">
          <div className="font-medium text-foreground flex items-center gap-1.5">
            <InformationCircleIcon className="h-4 w-4 text-primary" />
            <span>如何获取凭据：</span>
          </div>
          <ol className="list-decimal list-inside space-y-1 pl-1 leading-normal">
            <li>打开您电脑上已登录的「蚁小二」客户端；</li>
            <li>点击客户端左侧导航栏的「CLI」菜单；</li>
            <li>复制「API Key」与「Client ID」，分别填入下方输入框中，并点击右下角保存。</li>
          </ol>
        </div>
      </div>

      {/* 分发运行环境 (yxer CLI) 状态卡片 */}
      <div className="rounded-xl border border-border bg-surface p-5 shadow-subtle">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 shrink-0">
              {checking ? (
                <div className="rounded-lg bg-secondary/10 p-2 text-secondary">
                  <ArrowPathIcon className="h-5 w-5 animate-spin" />
                </div>
              ) : cliStatus.installed ? (
                <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
                  <CheckCircleIcon className="h-5 w-5" />
                </div>
              ) : installing ? (
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <ArrowPathIcon className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
                  <ExclamationTriangleIcon className="h-5 w-5" />
                </div>
              )}
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-semibold text-foreground">
                  {i18nService.t('contentDistEnvTitle')}
                </h4>
                {checking ? (
                  <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-xs text-secondary">
                    检测中...
                  </span>
                ) : cliStatus.installed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {i18nService.t('contentDistEnvReady')} (v{cliStatus.version})
                  </span>
                ) : installing ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary animate-pulse font-medium">
                    {i18nService.t('contentDistEnvInstalling')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {i18nService.t('contentDistEnvNotReady')}
                  </span>
                )}
              </div>

              <p className="text-xs text-secondary leading-relaxed">
                {cliStatus.installed
                  ? i18nService.t('contentDistEnvDescReady')
                  : i18nService.t('contentDistEnvDescNotReady')}
              </p>

              {cliStatus.path && (
                <p className="text-[11px] text-secondary/70 font-mono truncate pt-0.5" title={cliStatus.path}>
                  <span className="text-secondary/90">{i18nService.t('contentDistEnvPathLabel')}:</span> {cliStatus.path}
                </p>
              )}
            </div>
          </div>

          {/* 右侧动作按钮 */}
          <div className="shrink-0 flex items-center gap-2">
            {cliStatus.installed ? (
              <button
                type="button"
                onClick={() => void refreshCli()}
                disabled={checking}
                title={i18nService.t('contentDistEnvRecheckBtn')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface hover:border-primary/50 transition disabled:opacity-50"
              >
                <ArrowPathIcon className={`h-3.5 w-3.5 text-secondary ${checking ? 'animate-spin' : ''}`} />
                <span>{i18nService.t('contentDistEnvRecheckBtn')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleInstall()}
                disabled={installing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-primary-hover active:scale-95 transition disabled:opacity-60"
              >
                {installing ? (
                  <>
                    <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                    <span>{i18nService.t('contentDistEnvInstalling')}</span>
                  </>
                ) : (
                  <>
                    <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                    <span>{i18nService.t('contentDistEnvInstallBtn')}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 配置表单 */}
      <div className="rounded-xl border border-border bg-surface p-5 shadow-subtle space-y-5">
        {/* API Key */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground">
            蚁小二 API Key <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={value.apiKey}
              onChange={(e) => onChange({ ...value, apiKey: e.target.value })}
              placeholder="请输入您的蚁小二 API Key"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-secondary/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-foreground"
            >
              {showApiKey ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-secondary">
            用于身份鉴权。重置后旧令牌会失效，请确保与蚁小二客户端中显示一致。
          </p>
        </div>

        {/* Client ID */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground">
            本机 Client ID
          </label>
          <input
            type="text"
            value={value.clientId}
            onChange={(e) => onChange({ ...value, clientId: e.target.value })}
            placeholder="例如：_9bvKq... (从蚁小二客户端获取)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-secondary/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-mono"
          />
          <p className="text-xs text-secondary">
            <span className="font-medium text-foreground">强烈推荐填写：</span>
            填写后任务将直接由本机蚁小二客户端执行，走您当前的宽带网络发布，天然免风控、账号不掉线。若未显示请确认本机客户端已运行。
          </p>
        </div>
      </div>

      {/* 底部使用方法与推荐指令卡片 */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 shadow-subtle space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <SparklesIcon className="h-4 w-4" />
          </div>
          <h4 className="text-sm font-semibold text-foreground">
            {i18nService.t('contentDistUsageTitle')}
          </h4>
        </div>

        <p className="text-xs text-secondary leading-relaxed">
          {i18nService.t('contentDistUsageTip1')}
        </p>

        {/* 常用指令示例 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/80 px-3.5 py-2 text-xs font-mono text-foreground">
            <span className="text-primary font-bold">💬</span>
            <span>{i18nService.t('contentDistUsageExample1')}</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/80 px-3.5 py-2 text-xs font-mono text-foreground">
            <span className="text-primary font-bold">💬</span>
            <span>{i18nService.t('contentDistUsageExample2')}</span>
          </div>
        </div>

        <p className="text-xs text-secondary/90 leading-relaxed pt-1">
          {i18nService.t('contentDistUsageTip2')}
        </p>
      </div>
    </div>
  );
};

export default ContentDistributionSettings;
