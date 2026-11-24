import React, { useEffect, useState } from 'react';

import Modal from '../../common/Modal';

export interface DiscoveredCardItem {
  deviceId: string;
  deviceName: string;
  deviceMac: string;
  isBoundHistory?: boolean;
}

interface BluetoothDevicePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (deviceId: string) => void;
  discoveredDevices: DiscoveredCardItem[];
  boundMacs: Set<string>;
  connectingDeviceId: string | null;
}

export const BluetoothDevicePickerModal: React.FC<BluetoothDevicePickerModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  discoveredDevices,
  boundMacs,
  connectingDeviceId,
}) => {
  const [dots, setDots] = useState('');

  // 扫描中动态点点点
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 400);
    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  // 将设备排序：曾连接过的置顶，其余按发现顺序
  const sortedDevices = [...discoveredDevices].sort((a, b) => {
    const aBound = boundMacs.has(a.deviceMac.toLowerCase());
    const bBound = boundMacs.has(b.deviceMac.toLowerCase());
    if (aBound && !bBound) return -1;
    if (!aBound && bBound) return 1;
    return 0;
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="w-[420px] bg-white rounded-2xl p-6 shadow-2xl border border-black/5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-[#f0f0f2]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#eef5ff] text-[#2468f2] flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m7 7 10 10-5 5V2l5 5L7 17" />
              </svg>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-[#182033]">连接录音卡</h3>
              <p className="text-[11.5px] text-[#7d8597]">
                {sortedDevices.length === 0 ? `正在搜索附近设备${dots}` : '请选择您手边的录音卡连接'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-[#8c8c94] hover:bg-[#f4f4f6] hover:text-[#182033] flex items-center justify-center transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* 设备列表 */}
        <div className="mt-4 max-h-[260px] overflow-y-auto space-y-2 pr-1 select-none">
          {sortedDevices.length === 0 ? (
            <div className="py-10 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 rounded-full border-2 border-[#2468f2]/20 border-t-[#2468f2] animate-spin mb-3" />
              <p className="text-[13px] text-[#505055] font-medium">正在扫描附近的录音卡广播...</p>
              <p className="text-[11.5px] text-[#909099] mt-1">请确保录音卡处于开机状态并靠近电脑</p>
            </div>
          ) : (
            sortedDevices.map((dev) => {
              const isBound = boundMacs.has(dev.deviceMac.toLowerCase());
              const isConnecting = connectingDeviceId === dev.deviceId;

              return (
                <div
                  key={dev.deviceId}
                  onClick={() => !isConnecting && onSelect(dev.deviceId)}
                  className={`group relative flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                    isConnecting
                      ? 'border-[#2468f2] bg-[#f5f8ff]'
                      : 'border-[#eaebee] hover:border-[#2468f2]/60 hover:bg-[#f9faff]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[#f0f4fd] text-[#2468f2] flex items-center justify-center shrink-0">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="5" width="20" height="14" rx="3" />
                        <circle cx="8" cy="12" r="2.5" />
                        <circle cx="16" cy="12" r="2.5" />
                        <path d="M10.5 12h3" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13.5px] font-semibold text-[#182033] truncate">
                          {dev.deviceName || '录音卡'}
                        </span>
                        {isBound && (
                          <span className="text-[10px] font-medium text-[#2468f2] bg-[#eaf2ff] border border-[#cfe0ff] rounded px-1.5 py-0.2 shrink-0">
                            曾连接过
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#8c909e] truncate mt-0.5">
                        MAC: {dev.deviceMac ? dev.deviceMac.toUpperCase() : '未知'}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {isConnecting ? (
                      <span className="text-[12px] font-medium text-[#2468f2] flex items-center gap-1.5">
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-[#2468f2]/30 border-t-[#2468f2] animate-spin" />
                        连接中
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="text-[12px] font-medium text-[#2468f2] bg-[#f0f5ff] group-hover:bg-[#2468f2] group-hover:text-white px-3 py-1.5 rounded-lg transition-colors"
                      >
                        连接
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-[#f0f0f2] flex items-center justify-between text-[11px] text-[#909099]">
          <span>找不到设备？请确认录音卡电源开关处于开启状态</span>
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] text-[#6b6b70] hover:text-[#182033] px-2 py-1 rounded transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </Modal>
  );
};
