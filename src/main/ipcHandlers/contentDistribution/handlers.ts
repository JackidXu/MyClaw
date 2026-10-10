import type { IpcMain } from 'electron';

import {
  ContentDistributionIpc,
  type YixiaoerConfig,
  type YxerCliInstallResult,
  type YxerCliStatus,
} from '../../../shared/contentDistribution/constants';
import type { ContentDistributionService } from '../../contentDistribution/contentDistributionService';

export interface ContentDistributionHandlerDeps {
  ipcMain: IpcMain;
  getService: () => ContentDistributionService;
}

export const registerContentDistributionHandlers = ({
  ipcMain,
  getService,
}: ContentDistributionHandlerDeps): void => {
  ipcMain.handle(ContentDistributionIpc.GetConfig, (): YixiaoerConfig => {
    try {
      return getService().getConfig();
    } catch (error) {
      console.error('[ContentDistribution] 获取配置失败:', error);
      throw error;
    }
  });

  ipcMain.handle(
    ContentDistributionIpc.SaveConfig,
    (_event, config: Partial<YixiaoerConfig>): { success: boolean; error?: string } => {
      try {
        return getService().saveConfig(config);
      } catch (error) {
        console.error('[ContentDistribution] 保存配置失败:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : '保存配置失败',
        };
      }
    },
  );

  ipcMain.handle(
    ContentDistributionIpc.CheckCli,
    async (): Promise<YxerCliStatus> => {
      try {
        return await getService().checkYxerCli();
      } catch (error) {
        console.error('[ContentDistribution] 检查 CLI 状态失败:', error);
        return { installed: false };
      }
    },
  );

  ipcMain.handle(
    ContentDistributionIpc.InstallCli,
    async (_event, force?: boolean): Promise<YxerCliInstallResult> => {
      try {
        return await getService().ensureYxerCli(Boolean(force));
      } catch (error) {
        console.error('[ContentDistribution] 安装 CLI 失败:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : '安装分发运行环境失败',
        };
      }
    },
  );
};

