export const VipIpcChannel = {
  GetStatus: 'vip:get-status',
  RefreshStatus: 'vip:refresh-status',
  StatusChanged: 'vip:status-changed',
} as const;

export type VipIpcChannel = (typeof VipIpcChannel)[keyof typeof VipIpcChannel];
