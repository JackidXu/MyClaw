/**
 * 录音卡设备状态卡片组件
 *
 * 严格完全参照原型 HTML/CSS (.rcd-dev, .rcd-dv.slim, .rcd-ic, .rcd-dn, .rcd-bl, .rcd-dm2, .rcd-da, .rcd-btn)
 * 拒绝假数据：未连接状态下单行展示 M1(BLE) + [未连接] 胶囊 + 已转写 X 条 · 都只存在本机；
 * 按钮文案严格按照用户要求设定为“连接录音卡”。
 */

import React from 'react';

import { i18nService } from '../../../services/i18n';

interface RecordingDeviceCardProps {
  deviceName?: string;
  isConnected: boolean;
  battery?: number | null;
  freeSpace?: string | null;
  lastSyncTime?: string | null;
  localTranscribedCount: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onUnbind?: () => void;
}

export const RecordingDeviceCard: React.FC<RecordingDeviceCardProps> = ({
  deviceName = 'M1(BLE)',
  isConnected,
  battery = null,
  freeSpace = null,
  lastSyncTime = null,
  localTranscribedCount = 0,
  onConnect,
  onDisconnect,
  onUnbind,
}) => {
  return (
    <div className="bg-white border border-[#ebebee] rounded-[14px] p-[10px_16px] shadow-[0_1px_3px_rgba(28,28,30,0.03)]">
      <div className="flex items-center gap-3">
        {/* 左侧录音卡图标 (.rcd-ic) */}
        <div className="w-10 h-10 rounded-[12px] bg-[#fff4ee] border border-[#f3c8ab] text-[#e2531f] flex items-center justify-center shrink-0">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="5" width="20" height="14" rx="3" />
            <circle cx="8" cy="12" r="2.5" />
            <circle cx="16" cy="12" r="2.5" />
            <path d="M10.5 12h3" />
          </svg>
        </div>

        {/* 中间信息区 (.rcd-dt) */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <b className="text-[13.5px] font-semibold text-[#1c1c1e] tracking-tight">
              {deviceName}
            </b>

            {/* 连接状态胶囊 (.rcd-bl) */}
            {isConnected ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#1a6ff2] bg-[#eaf2ff] border border-[#cfe0ff] rounded-[6px] px-2 py-0.5 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1a6ff2]" />
                {i18nService.t('recordingCardBleConnected')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#6b6b70] bg-[#f4f4f6] border border-[#dfdfe3] rounded-[6px] px-2 py-0.5 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#a6a6ac]" />
                {i18nService.t('recordingCardBleDisconnected')}
              </span>
            )}

            {/* 已连接时展示电量 */}
            {isConnected && battery !== null && (
              <span className="text-[11.5px] text-[#8b8b90] tabular-nums">
                {i18nService.t('recordingCardBattery', { battery })}
              </span>
            )}

            {/* 本地真实统计 (.rcd-dm2) */}
            <span className="text-[11px] text-[#8b8b90] font-normal tabular-nums">
              {isConnected && freeSpace ? i18nService.t('recordingCardFreeSpacePrefix', { space: freeSpace }) : ''}
              {isConnected && lastSyncTime ? i18nService.t('recordingCardLastSyncPrefix', { time: lastSyncTime }) : ''}
              {i18nService.t('recordingCardTranscribedCountLocal', { count: localTranscribedCount })}
            </span>
          </div>
        </div>

        {/* 右侧操作按钮组 (.rcd-da) */}
        <div className="flex items-center gap-2 shrink-0">
          {isConnected ? (
            <>
              <button
                type="button"
                onClick={onDisconnect}
                className="text-[12.5px] text-[#505055] border border-[#ebebee] bg-white rounded-[9px] px-3.5 py-1.5 hover:border-[#c6c6cc] hover:text-[#1c1c1e] transition-colors cursor-pointer"
              >
                {i18nService.t('recordingCardDisconnectBtn')}
              </button>
              {onUnbind && (
                <button
                  type="button"
                  onClick={onUnbind}
                  className="text-[12.5px] text-[#d4380d] border border-[#f3c8ab] bg-[#fff7f4] rounded-[9px] px-3.5 py-1.5 hover:bg-[#ffefe8] transition-colors cursor-pointer"
                >
                  {i18nService.t('recordingCardUnbindBtn')}
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={onConnect}
              className="text-[12.5px] font-medium text-[#1c1c1e] border border-[#dfdfe3] bg-white rounded-[9px] px-3.5 py-1.5 hover:border-[#c6c6cc] hover:bg-[#fafafb] transition-colors cursor-pointer shadow-xs"
            >
              {i18nService.t('recordingCardConnectBtn')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
