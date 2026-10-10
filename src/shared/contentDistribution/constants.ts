export interface YixiaoerConfig {
  apiKey: string;
  clientId: string;
  enabled: boolean;
}

export const defaultYixiaoerConfig: YixiaoerConfig = {
  apiKey: '',
  clientId: '',
  enabled: false,
};

export interface YxerCliStatus {
  installed: boolean;
  version?: string;
  path?: string;
  isManaged?: boolean;
}

export interface YxerCliInstallResult {
  success: boolean;
  version?: string;
  path?: string;
  error?: string;
}

export const ContentDistributionIpc = {
  GetConfig: 'content-distribution:get-config',
  SaveConfig: 'content-distribution:save-config',
  CheckCli: 'content-distribution:check-cli',
  InstallCli: 'content-distribution:install-cli',
} as const;

export type ContentDistributionIpc =
  (typeof ContentDistributionIpc)[keyof typeof ContentDistributionIpc];


