export const AppIpcChannel = {
  GetKeyfromAttribution: 'app:getKeyfromAttribution',
  OpenSystemNotificationSettings: 'app:openSystemNotificationSettings',
  GetDiagnosticInfo: 'app:getDiagnosticInfo',
} as const;

export type AppIpcChannel = (typeof AppIpcChannel)[keyof typeof AppIpcChannel];
