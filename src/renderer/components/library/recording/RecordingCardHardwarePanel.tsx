/**
 * 录音卡硬件控制与转存本机面板组件 (RecordingCardHardwarePanel)
 *
 * 完整迁移自 SecondBrainView 录音卡硬件模块：
 * 1. 低功耗蓝牙 (BLE) 扫描与握手，常态维持低功耗连接，展示电量、剩余存储与总容量；
 * 2. 录音卡内音频列表读取 (0x1B 0x00)；
 * 3. 严格基于 cardFileId 唯一识别“已转存本机”与“待转存”；
 * 4. “转存本机”与“全部转存本机”：通过 Wi-Fi TCP 高速下载音频 -> 封装为标准 Ogg Opus -> 保存到本地磁盘并落库 SQLite (只存在本机，零云端)；
 * 5. Wi-Fi AP 自动连接与引导弹窗。
 */

import React, { useEffect, useRef, useState } from 'react';

import type { LocalRecordingItem } from '../../../../shared/recordingCard/localRecording';
import { LocalRecordingStatus } from '../../../../shared/recordingCard/localRecording';
import { copyTextToClipboard } from '../../../services/clipboard';
import { wrapRawOpusToOgg } from '../../../services/oggOpusEncoder';
import * as recordingCardBle from '../../../services/recordingCardBle';
import Modal from '../../common/Modal';
import { formatAudioDuration } from './audioDuration';

interface BleDeviceInfo {
  name: string;
  sn: string;
  battery: number;
  freeKb: number;
  totalKb: number;
  wifiSsid: string;
  wifiPassword?: string;
  wifiApOpened: boolean;
  wifiConnected: boolean;
}

interface BleRecordingFile {
  name: string;
  file: string;
  size: number;
  duration: number;
  createTime?: number;
}

interface RecordingCardHardwarePanelProps {
  localRecordings: LocalRecordingItem[];
  onLocalRecordingsChanged: () => Promise<void>;
  onShowToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const RecordingCardHardwarePanel: React.FC<RecordingCardHardwarePanelProps> = ({
  localRecordings,
  onLocalRecordingsChanged,
  onShowToast,
}) => {
  // BLE 设备状态
  const [bleDevice, setBleDevice] = useState<BleDeviceInfo | null>(null);
  const [bleConnecting, setBleConnecting] = useState(false);
  const [bleFiles, setBleFiles] = useState<BleRecordingFile[]>([]);
  const [bleLoadingFiles, setBleLoadingFiles] = useState(false);

  // 分页状态（严格对齐第二大脑 10 条一页）
  const BLE_FILES_PAGE_SIZE = 10;
  const [bleFilesPage, setBleFilesPage] = useState(1);
  const bleFilesTotal = bleFiles.length;
  const bleFilesLastPage = Math.max(1, Math.ceil(bleFilesTotal / BLE_FILES_PAGE_SIZE));
  const paginatedBleFiles = React.useMemo(() => {
    const start = (bleFilesPage - 1) * BLE_FILES_PAGE_SIZE;
    return bleFiles.slice(start, start + BLE_FILES_PAGE_SIZE);
  }, [bleFiles, bleFilesPage]);

  // 转存与 Wi-Fi 状态
  const [showCardFilesModal, setShowCardFilesModal] = useState(false);
  const [syncingFileNames, setSyncingFileNames] = useState<Set<string>>(new Set());
  const [syncProgress, setSyncProgress] = useState<Record<string, number>>({});
  const [showWifiSyncModal, setShowWifiSyncModal] = useState(false);
  const [openingWifiAp, setOpeningWifiAp] = useState(false);
  const [autoConnectingWifi, setAutoConnectingWifi] = useState(false);
  const [autoConnectFailed, setAutoConnectFailed] = useState(false);
  const [wifiConnecting, setWifiConnecting] = useState(false);
  const [wifiGuideCopied, setWifiGuideCopied] = useState(false);
  const [showUnbindModal, setShowUnbindModal] = useState(false);

  const originalWifiSsidRef = useRef<string | null>(null);
  const pendingSyncActionRef = useRef<(() => Promise<void>) | null>(null);
  const isWifiFlowRunningRef = useRef(false);

  // 判断是否任何文件正在转存中
  const isAnySyncing = syncingFileNames.size > 0;

  // 格式化字节大小
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  /**
   * 严格基于 cardFileId 唯一识别录音卡文件是否已转存本机
   * 即使用户重命名或智能纪要改写了标题，cardFileId 永不改变！
   */
  const savedCardFileIdSet = React.useMemo(() => {
    const set = new Set<string>();
    for (const item of localRecordings) {
      if (item.cardFileId) {
        set.add(item.cardFileId);
        set.add(item.cardFileId.replace(/\.[^.]*$/, ''));
      }
      if (item.name) {
        set.add(item.name);
        set.add(item.name.replace(/\.[^.]*$/, ''));
      }
    }
    return set;
  }, [localRecordings]);

  const isFileSavedLocally = (fileName: string) => {
    const base = fileName.replace(/\.[^.]*$/, '');
    return savedCardFileIdSet.has(fileName) || savedCardFileIdSet.has(base);
  };

  // 卸载时断开连接与还原网络
  useEffect(() => {
    return () => {
      window.electron.recordingCardWifi?.disconnect?.(originalWifiSsidRef.current || undefined).catch(() => {});
      if (recordingCardBle.isConnected()) {
        recordingCardBle.closeWifi().catch(() => {});
        recordingCardBle.disconnect();
      }
    };
  }, []);

  // 连接录音卡 (BLE 握手)
  const handleConnectBle = async () => {
    if (bleConnecting) return;
    const userId = localStorage.getItem('heyclaw_user_id') || 'local_user';

    setBleConnecting(true);
    try {
      const handshakeInfo = await recordingCardBle.handshake(userId, () => {
        setBleDevice(null);
        setBleFiles([]);
      });

      setBleDevice({
        name: handshakeInfo.deviceName || 'HeyClaw 录音卡',
        sn: handshakeInfo.sn,
        battery: handshakeInfo.battery,
        freeKb: handshakeInfo.freeKb,
        totalKb: handshakeInfo.totalKb,
        wifiSsid: handshakeInfo.wifiSsid,
        wifiPassword: handshakeInfo.wifiPassword,
        wifiApOpened: false,
        wifiConnected: false,
      });

      onShowToast('success', '录音卡蓝牙连接成功，正在读取录音列表…');
      await loadBleFilesViaBle();
    } catch (err: any) {
      const rawMsg = err?.message || String(err);
      const isScanTimeout =
        rawMsg.includes('User cancelled the requestDevice') ||
        rawMsg.includes('no device') ||
        rawMsg.includes('NotFound');
      const tip = isScanTimeout
        ? '未搜索到录音卡蓝牙信号。若设备刚结束传输，正在重启蓝牙广播，请稍候片刻再试'
        : `连接录音卡失败: ${rawMsg || '请确认蓝牙已开启并靠近设备'}`;
      onShowToast('error', tip);
    } finally {
      setBleConnecting(false);
    }
  };

  // 通过 BLE 读取文件列表
  const loadBleFilesViaBle = async () => {
    setBleLoadingFiles(true);
    try {
      const files = await recordingCardBle.getFileListViaBle();
      const list: BleRecordingFile[] = files.map(f => ({
        name: f.file,
        file: f.file,
        size: f.size,
        duration: Math.round(f.duration_ms / 1000),
        createTime: f.creat_time,
      }));
      setBleFiles(list);
      setBleFilesPage(1);
    } catch (err: any) {
      onShowToast('error', `获取录音卡文件列表失败: ${err?.message || '未知错误'}`);
    } finally {
      setBleLoadingFiles(false);
    }
  };

  // 断开 BLE 连接
  const handleDisconnectBle = () => {
    if (recordingCardBle.isConnected()) {
      recordingCardBle.disconnect();
    }
    setBleDevice(null);
    setBleFiles([]);
    onShowToast('info', '已断开录音卡连接');
  };

  // 解除绑定
  const handleUnbind = async () => {
    try {
      await recordingCardBle.unbind();
      recordingCardBle.disconnect();
      setBleDevice(null);
      setBleFiles([]);
      setShowUnbindModal(false);
      onShowToast('success', '已解除录音卡设备绑定');
    } catch (err: any) {
      onShowToast('error', `解除绑定失败: ${err?.message || err}`);
    }
  };

  // 关闭 Wi-Fi 热点并切回外网与蓝牙
  const handleCloseWifi = async () => {
    try {
      await window.electron.recordingCardWifi?.disconnect?.(originalWifiSsidRef.current || undefined);
    } catch {
      // 忽略
    }
    try {
      await recordingCardBle.closeWifi();
    } catch {
      // 忽略
    }
    setBleDevice(prev => (prev ? { ...prev, wifiConnected: false, wifiApOpened: false } : null));

    // 录音卡关闭 Wi-Fi 后会自动重启蓝牙广播，静默重连
    setTimeout(async () => {
      try {
        await recordingCardBle.reconnect(5, 1500);
      } catch {
        // 忽略
      }
    }, 1000);
  };

  // 单个文件转存核心业务逻辑 (100% 纯本地落盘)
  const executeTransferOne = async (file: BleRecordingFile) => {
    if (syncingFileNames.has(file.name)) return;
    setSyncingFileNames(prev => new Set(prev).add(file.name));
    setSyncProgress(prev => ({ ...prev, [file.name]: 1 }));

    let removeProgressListener: (() => void) | null = null;
    let wifiClosed = false;

    try {
      // 1. 注册进度监听并下载音频流
      removeProgressListener = window.electron.recordingCardWifi.onDownloadProgress((data: any) => {
        if (data.filename === file.file) {
          const percent = file.size > 0 ? Math.min(95, Math.round((data.receivedBytes / file.size) * 95)) : 50;
          setSyncProgress(prev => ({ ...prev, [file.name]: Math.max(1, percent) }));
        }
      });

      const res = await window.electron.recordingCardWifi.downloadFile(file.file);
      if (!res.success || !res.data) {
        throw new Error(res.error || '下载文件数据为空');
      }
      setSyncProgress(prev => ({ ...prev, [file.name]: 96 }));

      // 2. 封装为标准 Ogg Opus
      const oggOpusBytes = wrapRawOpusToOgg(res.data);
      const oggBuffer = oggOpusBytes.buffer.slice(
        oggOpusBytes.byteOffset,
        oggOpusBytes.byteOffset + oggOpusBytes.byteLength,
      ) as ArrayBuffer;

      // 3. 关闭录音卡 Wi-Fi，立即切回原系统外网与恢复蓝牙
      wifiClosed = true;
      await handleCloseWifi();

      // 等待操作系统的外网 Wi-Fi 重新建立与 DHCP 稳定 (1.2s)，彻底杜绝转写立即发起时报 net::ERR_NETWORK_CHANGED
      await new Promise(resolve => setTimeout(resolve, 1200));

      // 4. 调用主进程原子化保存到本机磁盘目录 (userData/recordings)
      const base = file.name.replace(/\.[^.]*$/, '');
      const saveFilename = `${base}.ogg`;
      const saveRes = await window.electron.localRecordings?.saveAudioFile?.(saveFilename, oggBuffer);
      if (!saveRes?.success || !saveRes.data) {
        throw new Error(saveRes?.error || '保存音频文件至本地失败');
      }

      // 5. 写入本地 SQLite 表
      const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const durationSec = file.duration || 0;
      const durationMs = Math.round(durationSec * 1000);
      const durationStr = formatAudioDuration(durationSec);

      const newItem: LocalRecordingItem = {
        id,
        name: file.name,
        title: base,
        localPath: saveRes.data.localPath,
        duration: durationStr,
        durationMs,
        size: saveRes.data.size,
        sourceType: 'card',
        status: LocalRecordingStatus.Pending,
        cardFileId: file.name, // 录音卡硬件唯一物理标识，永不改变
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await window.electron.localRecordings?.upsertRecord?.(newItem);
      setSyncProgress(prev => ({ ...prev, [file.name]: 100 }));
      onShowToast('success', `录音「${base}」已成功转存到本机，可开始转写！`);
      await onLocalRecordingsChanged();
    } catch (err: any) {
      if (!wifiClosed) {
        await handleCloseWifi();
      }
      onShowToast('error', `转存失败: ${err?.message || err}`);
    } finally {
      if (removeProgressListener) {
        removeProgressListener();
      }
      setSyncingFileNames(prev => {
        const next = new Set(prev);
        next.delete(file.name);
        return next;
      });
    }
  };

  // 批量全部转存核心业务逻辑 (100% 纯本地落盘)
  const executeTransferAll = async (targets: BleRecordingFile[]) => {
    if (targets.length === 0) return;

    let removeProgressListener: (() => void) | null = null;
    let wifiClosed = false;

    try {
      const downloadedList: { file: BleRecordingFile; oggBuffer: ArrayBuffer; base: string }[] = [];

      for (const f of targets) {
        setSyncingFileNames(prev => new Set(prev).add(f.name));
        setSyncProgress(prev => ({ ...prev, [f.name]: 1 }));

        if (removeProgressListener) {
          removeProgressListener();
        }
        removeProgressListener = window.electron.recordingCardWifi.onDownloadProgress((data: any) => {
          if (data.filename === f.file) {
            const percent = f.size > 0 ? Math.min(95, Math.round((data.receivedBytes / f.size) * 95)) : 50;
            setSyncProgress(prev => ({ ...prev, [f.name]: Math.max(1, percent) }));
          }
        });

        try {
          const res = await window.electron.recordingCardWifi.downloadFile(f.file);
          if (res.success && res.data) {
            const base = f.name.replace(/\.[^.]*$/, '');
            const oggOpusBytes = wrapRawOpusToOgg(res.data);
            const oggBuffer = oggOpusBytes.buffer.slice(
              oggOpusBytes.byteOffset,
              oggOpusBytes.byteOffset + oggOpusBytes.byteLength,
            ) as ArrayBuffer;
            downloadedList.push({ file: f, oggBuffer, base });
            setSyncProgress(prev => ({ ...prev, [f.name]: 96 }));
          }
        } catch (downloadErr: any) {
          console.warn('[RecordingCardHardwarePanel] 下载文件失败:', f.name, downloadErr);
        }
      }

      // 关闭 Wi-Fi 热点，恢复蓝牙与系统网络
      wifiClosed = true;
      await handleCloseWifi();

      // 等待操作系统的外网 Wi-Fi 重新建立与 DHCP 稳定 (1.2s)，彻底杜绝转写立即发起时报 net::ERR_NETWORK_CHANGED
      await new Promise(resolve => setTimeout(resolve, 1200));

      // 将下载好的文件批量保存到本地磁盘并落库
      let successCount = 0;
      for (const item of downloadedList) {
        try {
          const saveFilename = `${item.base}.ogg`;
          const saveRes = await window.electron.localRecordings?.saveAudioFile?.(saveFilename, item.oggBuffer);
          if (saveRes?.success && saveRes.data) {
            const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const durationSec = item.file.duration || 0;
            const newItem: LocalRecordingItem = {
              id,
              name: item.file.name,
              title: item.base,
              localPath: saveRes.data.localPath,
              duration: formatAudioDuration(durationSec),
              durationMs: Math.round(durationSec * 1000),
              size: saveRes.data.size,
              sourceType: 'card',
              status: LocalRecordingStatus.Pending,
              cardFileId: item.file.name,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            await window.electron.localRecordings?.upsertRecord?.(newItem);
            setSyncProgress(prev => ({ ...prev, [item.file.name]: 100 }));
            successCount++;
          }
        } catch (saveErr) {
          console.warn('[RecordingCardHardwarePanel] 批量落库保存失败:', item.base, saveErr);
        }
      }

      onShowToast('success', `批量转存完成，已成功转存 ${successCount} 条录音到本机！`);
      await onLocalRecordingsChanged();
    } catch (err: any) {
      if (!wifiClosed) {
        await handleCloseWifi();
      }
      onShowToast('error', `批量转存异常: ${err?.message || err}`);
    } finally {
      if (removeProgressListener) {
        removeProgressListener();
      }
      setSyncingFileNames(new Set());
    }
  };

  // 唤醒 Wi-Fi AP 并调度转存任务
  const triggerWifiFlow = async (action: () => Promise<void>) => {
    if (!bleDevice || isWifiFlowRunningRef.current) return;
    isWifiFlowRunningRef.current = true;
    pendingSyncActionRef.current = action;

    setShowWifiSyncModal(true);
    setAutoConnectFailed(false);

    try {
      const currentWifi = await window.electron.recordingCardWifi.getCurrentWifi();
      if (currentWifi && currentWifi !== bleDevice.wifiSsid) {
        originalWifiSsidRef.current = currentWifi;
      }
    } catch {
      // 忽略
    }

    if (!bleDevice.wifiApOpened) {
      setOpeningWifiAp(true);
      setAutoConnectingWifi(false);
      try {
        await recordingCardBle.openWifi();
        setBleDevice(prev => (prev ? { ...prev, wifiApOpened: true } : null));
        await new Promise(r => setTimeout(r, 3500));
      } catch (err: any) {
        setOpeningWifiAp(false);
        setShowWifiSyncModal(false);
        isWifiFlowRunningRef.current = false;
        pendingSyncActionRef.current = null;
        onShowToast('error', `唤醒录音卡 Wi-Fi 失败: ${err?.message || err}`);
        return;
      } finally {
        setOpeningWifiAp(false);
      }
    }

    const hasSaved = await window.electron.recordingCardWifi.hasSavedWifi(bleDevice.wifiSsid).catch(() => false);
    if (!hasSaved) {
      setAutoConnectingWifi(false);
      setAutoConnectFailed(false);
      isWifiFlowRunningRef.current = false;
      return;
    }

    setAutoConnectingWifi(true);
    setAutoConnectFailed(false);
    void runAutoConnectWifi(bleDevice.wifiSsid, bleDevice.wifiPassword, action);
  };

  // 执行自动直连录音卡 Wi-Fi
  const runAutoConnectWifi = async (ssid: string, password?: string, syncAction?: () => Promise<void>) => {
    setAutoConnectingWifi(true);
    setAutoConnectFailed(false);

    try {
      const autoRes = await window.electron.recordingCardWifi.autoConnect(ssid, password);
      if (!autoRes.success) {
        throw new Error(autoRes.error || '系统连接录音卡 Wi-Fi 超时');
      }

      const socketDeadline = Date.now() + 16000;
      let socketConnected = false;
      let lastSocketErr = '';

      while (Date.now() < socketDeadline) {
        try {
          const res = await window.electron.recordingCardWifi.connect();
          if (res.success) {
            socketConnected = true;
            break;
          }
          lastSocketErr = res.error || '';
        } catch (sockErr: any) {
          lastSocketErr = sockErr?.message || String(sockErr);
        }
        await new Promise(r => setTimeout(r, 600));
      }

      if (!socketConnected) {
        throw new Error(lastSocketErr || 'Wi-Fi 关联或录音卡 Socket 通道未就绪');
      }

      isWifiFlowRunningRef.current = false;
      setBleDevice(prev => (prev ? { ...prev, wifiConnected: true } : null));
      setShowWifiSyncModal(false);
      setAutoConnectingWifi(false);

      const act = syncAction || pendingSyncActionRef.current;
      if (act) {
        pendingSyncActionRef.current = null;
        await act();
      }
    } catch {
      isWifiFlowRunningRef.current = false;
      setAutoConnectingWifi(false);
      setAutoConnectFailed(true);
    }
  };

  // 手动确认连入 Wi-Fi
  const handleConfirmWifiManual = async () => {
    if (!bleDevice || wifiConnecting) return;
    setWifiConnecting(true);
    isWifiFlowRunningRef.current = true;

    try {
      const socketDeadline = Date.now() + 12000;
      let socketConnected = false;
      let lastSocketErr = '';

      while (Date.now() < socketDeadline) {
        try {
          const res = await window.electron.recordingCardWifi.connect();
          if (res.success) {
            socketConnected = true;
            break;
          }
          lastSocketErr = res.error || '';
        } catch (sockErr: any) {
          lastSocketErr = sockErr?.message || String(sockErr);
        }
        await new Promise(r => setTimeout(r, 600));
      }

      if (!socketConnected) {
        throw new Error(lastSocketErr || '建立 Wi-Fi 同步连接失败');
      }

      isWifiFlowRunningRef.current = false;
      setBleDevice(prev => (prev ? { ...prev, wifiConnected: true } : null));
      setShowWifiSyncModal(false);

      const act = pendingSyncActionRef.current;
      if (act) {
        pendingSyncActionRef.current = null;
        await act();
      }
    } catch (err: any) {
      isWifiFlowRunningRef.current = false;
      onShowToast('error', `建立连接失败: ${err?.message || err}`);
    } finally {
      setWifiConnecting(false);
    }
  };

  const handleCancelWifiSync = () => {
    setShowWifiSyncModal(false);
    setAutoConnectingWifi(false);
    setAutoConnectFailed(false);
    setWifiConnecting(false);
    setOpeningWifiAp(false);
    isWifiFlowRunningRef.current = false;
    pendingSyncActionRef.current = null;
    recordingCardBle.abortBleOperations();
  };

  const unsavedFiles = bleFiles.filter(f => !isFileSavedLocally(f.name));

  return (
    <div className="space-y-3">
      {/* 录音卡设备卡片：完全迁移自第二大脑真实硬件控制栏 */}
      {bleDevice ? (
        <div className="bg-white border border-[#ebebee] rounded-[14px] p-[12px_16px] shadow-[0_1px_3px_rgba(28,28,30,0.03)] space-y-3">
          <div className="flex items-center justify-between gap-3">
            {/* 左侧设备基础信息 */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-[12px] bg-[#fff4ee] border border-[#f3c8ab] text-[#e2531f] flex items-center justify-center text-lg shrink-0">
                🎙
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14px] font-bold text-[#1c1c1e] truncate">{bleDevice.name}</span>
                  {bleDevice.wifiConnected ? (
                    <span className="text-[10px] font-semibold text-[#2f9e58] bg-[#eef7f0] border border-[#cfe8d6] px-1.5 py-0.5 rounded-[5px]">
                      Wi-Fi 极速通道已就绪
                    </span>
                  ) : bleDevice.wifiApOpened ? (
                    <span className="text-[10px] font-semibold text-[#e2531f] bg-[#fff4ee] border border-[#f8d9c6] px-1.5 py-0.5 rounded-[5px]">
                      热点已开启 · 待连接
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-[#1a6ff2] bg-[#eaf2ff] border border-[#cfe0ff] px-1.5 py-0.5 rounded-[5px]">
                      蓝牙已连接
                    </span>
                  )}
                </div>
                <div className="text-[11.5px] text-[#8b8b90] mt-0.5 tabular-nums">
                  电量 {bleDevice.battery}% · 剩余存储 {(bleDevice.freeKb / (1024 * 1024)).toFixed(1)}GB · 总容量 {(bleDevice.totalKb / (1024 * 1024)).toFixed(1)}GB
                </div>
              </div>
            </div>

            {/* 右侧操作按钮组 */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowCardFilesModal(true)}
                className="rounded-[8px] bg-[#FF6B35] hover:bg-[#e2531f] px-3.5 py-1.5 text-[12px] font-medium text-white shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span>管理卡内录音</span>
                <span className="bg-white/20 px-1.5 py-0.2 rounded-full text-[11px] font-semibold">
                  {bleFiles.length}
                </span>
                {unsavedFiles.length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-yellow-300 animate-pulse" title={`${unsavedFiles.length} 个待转存`} />
                )}
              </button>

              {bleDevice.wifiConnected ? (
                <button
                  type="button"
                  onClick={handleCloseWifi}
                  className="rounded-[8px] border border-[#ebebee] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#505055] hover:border-[#c6c6cc] transition-colors cursor-pointer"
                  title="关闭录音卡热点，恢复低功耗蓝牙模式"
                >
                  关闭 Wi-Fi
                </button>
              ) : bleDevice.wifiApOpened ? (
                <button
                  type="button"
                  onClick={() => setShowWifiSyncModal(true)}
                  className="rounded-[8px] border border-[#f3c8ab] bg-[#fff4ee] px-2.5 py-1.5 text-[12px] font-medium text-[#e2531f] hover:bg-[#ffe8db] transition-colors cursor-pointer"
                >
                  连接热点
                </button>
              ) : null}

              <button
                type="button"
                onClick={handleDisconnectBle}
                className="rounded-[8px] border border-[#ebebee] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#505055] hover:border-[#c6c6cc] hover:text-[#1c1c1e] transition-colors cursor-pointer"
              >
                断开连接
              </button>

              <button
                type="button"
                onClick={() => setShowUnbindModal(true)}
                className="rounded-[8px] border border-[#f3c8ab] bg-[#fff7f4] px-2.5 py-1.5 text-[12px] font-medium text-[#d4380d] hover:bg-[#ffefe8] transition-colors cursor-pointer"
              >
                解除绑定
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* 未连接引导卡片 */
        <div className="bg-white border border-dashed border-[#ebebee] rounded-[14px] p-[12px_16px] shadow-[0_1px_3px_rgba(28,28,30,0.03)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-[#f4f4f6] border border-[#ebebee] flex items-center justify-center text-lg text-[#8b8b90] shrink-0">
              🎙
            </div>
            <div>
              <div className="text-[13.5px] font-semibold text-[#1c1c1e]">录音卡未连接</div>
              <div className="text-[11.5px] text-[#8b8b90] mt-0.5">
                通过蓝牙读取录音卡文件列表，极速转存至本机电脑并直接转写
              </div>
            </div>
          </div>
          <button
            type="button"
            disabled={bleConnecting}
            onClick={handleConnectBle}
            className="rounded-[8px] bg-[#FF6B35] hover:bg-[#e2531f] px-3.5 py-1.5 text-[12.5px] font-medium text-white shadow-xs transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
          >
            {bleConnecting ? '连接中…' : '连接录音卡'}
          </button>
        </div>
      )}

      {/* 卡内录音文件管理弹窗（大视口弹窗，彻底释放下方工作台空间） */}
      {showCardFilesModal && bleDevice && (
        <Modal
          isOpen={true}
          onClose={() => setShowCardFilesModal(false)}
          onEscape={() => setShowCardFilesModal(false)}
          overlayClassName="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 backdrop-blur-2xs"
          className="w-[720px] max-w-[92vw] max-h-[85vh] flex flex-col bg-white rounded-[16px] shadow-[0_24px_60px_rgba(0,0,0,0.2)] border border-[#ebebee] overflow-hidden"
        >
          {/* 弹窗 Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#ebebee] shrink-0 bg-[#fafafb]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[8px] bg-[#fff4ee] text-[#FF6B35] flex items-center justify-center text-base">
                🎙
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-[#1c1c1e]">录音卡内音频管理</h3>
                <div className="text-[12px] text-[#8b8b90] mt-0.5">
                  共 <b className="text-[#1c1c1e] font-semibold">{bleFiles.length}</b> 个录音 ·{' '}
                  <b className="text-[#FF6B35] font-semibold">{unsavedFiles.length}</b> 个待转存
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={bleLoadingFiles || isAnySyncing}
                onClick={loadBleFilesViaBle}
                className="rounded-[7px] border border-[#ebebee] bg-white px-3 py-1.5 text-[12px] font-medium text-[#505055] hover:border-[#c6c6cc] hover:text-[#1c1c1e] transition-colors disabled:opacity-40 cursor-pointer"
              >
                {bleLoadingFiles ? '读取中…' : '刷新列表'}
              </button>
              <button
                type="button"
                disabled={isAnySyncing || bleLoadingFiles || unsavedFiles.length === 0}
                onClick={() => triggerWifiFlow(() => executeTransferAll(unsavedFiles))}
                className={`rounded-[7px] px-3.5 py-1.5 text-[12px] font-medium shadow-xs transition-colors ${
                  isAnySyncing || bleLoadingFiles || unsavedFiles.length === 0
                    ? 'bg-[#f4f4f5] text-[#a1a1aa] border border-[#e4e4e7] cursor-not-allowed'
                    : 'bg-[#FF6B35] hover:bg-[#e2531f] text-white cursor-pointer'
                }`}
              >
                {isAnySyncing ? '转存进行中…' : '全部转存本机'}
              </button>
              <button
                type="button"
                onClick={() => setShowCardFilesModal(false)}
                className="ml-2 w-8 h-8 rounded-[8px] text-[#8b8b90] hover:text-[#1c1c1e] hover:bg-[#ebebee] flex items-center justify-center text-lg transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>

          {/* 弹窗 Body: 录音卡内文件列表 */}
          <div className="flex-1 min-h-[320px] max-h-[55vh] overflow-y-auto [scrollbar-gutter:stable] p-6 space-y-2.5">
            {bleLoadingFiles ? (
              <div className="py-16 text-center text-[13px] text-[#8b8b90]">
                <div className="w-6 h-6 border-2 border-[#FF6B35]/20 border-t-[#FF6B35] rounded-full animate-spin mx-auto mb-2" />
                正在通过蓝牙读取录音卡文件列表中…
              </div>
            ) : bleFiles.length === 0 ? (
              <div className="py-16 text-center text-[13px] text-[#8b8b90]">录音卡内暂无录音文件</div>
            ) : (
              paginatedBleFiles.map((file, idx) => {
                const isSaved = isFileSavedLocally(file.name);
                const isSyncing = syncingFileNames.has(file.name);
                const prog = syncProgress[file.name] ?? 0;

                return (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex items-center gap-3.5 p-3 rounded-[12px] border border-[#ebebee] bg-[#fafafb] hover:bg-white hover:border-[#f3c8ab]/60 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                  >
                    <div className="w-8 h-8 rounded-[8px] bg-[#fff4ee] text-[#e2531f] flex items-center justify-center text-sm shrink-0">
                      🎧
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-medium text-[#1c1c1e] truncate">{file.name}</div>
                      <div className="text-[11.5px] text-[#8b8b90] mt-0.5 flex items-center gap-1.5 tabular-nums">
                        <span>{formatAudioDuration(file.duration)}</span>
                        <span>·</span>
                        <span>{formatBytes(file.size)}</span>
                      </div>
                      {isSyncing && (
                        <div className="mt-1.5 h-1.5 w-full bg-[#ebebee] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#FF6B35] rounded-full transition-all duration-200"
                            style={{ width: `${prog}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isSyncing ? (
                        <span className="text-[11px] font-medium text-[#1a6ff2] bg-[#eaf2ff] border border-[#cfe0ff] px-2.5 py-1 rounded-[6px]">
                          转存中 {prog}%
                        </span>
                      ) : isSaved ? (
                        <span className="text-[11px] font-medium text-[#2f9e58] bg-[#eef7f0] border border-[#cfe8d6] px-2.5 py-1 rounded-[6px]">
                          已转存本机
                        </span>
                      ) : null}

                      {!isSaved && (
                        <button
                          type="button"
                          disabled={isAnySyncing}
                          onClick={() => triggerWifiFlow(() => executeTransferOne(file))}
                          className={`rounded-[7px] px-3 py-1.5 text-[12px] font-medium transition-colors ${
                            isAnySyncing
                              ? 'border border-[#ebebee] text-[#a1a1aa] bg-white cursor-not-allowed'
                              : 'border border-[#f3c8ab] bg-[#fff4ee] text-[#e2531f] hover:bg-[#ffe9dd] cursor-pointer'
                          }`}
                        >
                          {isSyncing ? '转存中…' : '转存本机'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 弹窗 Footer: 分页器 */}
          {bleFilesLastPage > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-[#ebebee] text-[12px] select-none shrink-0 bg-[#fafafb]">
              <span className="text-[#8b8b90] text-[12px]">
                第 <b className="text-[#1c1c1e] font-semibold">{bleFilesPage}</b> / {bleFilesLastPage} 页
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={bleFilesPage <= 1}
                  onClick={() => setBleFilesPage(p => Math.max(1, p - 1))}
                  className="h-7 px-3 rounded-[7px] border border-[#ebebee] bg-white hover:bg-[#f4f4f6] font-medium text-[#505055] hover:text-[#1c1c1e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  ‹ 上一页
                </button>
                <button
                  type="button"
                  disabled={bleFilesPage >= bleFilesLastPage}
                  onClick={() => setBleFilesPage(p => Math.min(bleFilesLastPage, p + 1))}
                  className="h-7 px-3 rounded-[7px] border border-[#ebebee] bg-white hover:bg-[#f4f4f6] font-medium text-[#505055] hover:text-[#1c1c1e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  下一页 ›
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Wi-Fi 极速同步转存引导模态框 */}
      {showWifiSyncModal && bleDevice && (
        <Modal
          isOpen={true}
          onClose={handleCancelWifiSync}
          onEscape={handleCancelWifiSync}
          overlayClassName="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-2xs"
          className="w-[440px] bg-white rounded-[14px] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.18)] border border-[#ebebee]"
        >
          <div className="flex items-center justify-between pb-3 border-b border-[#ebebee] mb-3">
            <h4 className="text-[14px] font-semibold text-[#1c1c1e]">录音卡 Wi-Fi 高速转存</h4>
            <button
              type="button"
              onClick={handleCancelWifiSync}
              className="text-[#8b8b90] hover:text-[#1c1c1e] text-[14px] cursor-pointer"
            >
              ✕
            </button>
          </div>

          {openingWifiAp ? (
            <div className="py-8 flex flex-col items-center justify-center gap-3 text-[12px] text-[#8b8b90]">
              <div className="w-6 h-6 border-2 border-[#FF6B35]/20 border-t-[#FF6B35] rounded-full animate-spin" />
              <span>正在唤醒录音卡高速 Wi-Fi 热点，请稍候…</span>
            </div>
          ) : autoConnectingWifi ? (
            <div className="py-3 flex flex-col items-center justify-center gap-3 text-center">
              <div className="relative flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-[#fff4ee] flex items-center justify-center text-xl">
                  📡
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-[#FF6B35] border-t-transparent animate-spin" />
              </div>
              <div className="space-y-0.5">
                <div className="text-[12px] font-bold text-[#1c1c1e]">
                  正在尝试自动连接录音卡热点
                </div>
                <div className="text-[11px] text-[#FF6B35] font-mono font-bold">
                  {bleDevice.wifiSsid}
                </div>
              </div>
              <div className="text-[11px] text-[#8b8b90] leading-relaxed px-4">
                为实现高速传输，电脑 Wi-Fi 将短暂直连录音卡，转存落地后将立即自动切回原有网络。
              </div>
              <button
                type="button"
                onClick={handleCancelWifiSync}
                className="mt-2 text-[12px] px-3.5 py-1 rounded-[7px] border border-[#ebebee] hover:border-[#c6c6cc] text-[#505055]"
              >
                取消
              </button>
            </div>
          ) : (
            <div className="space-y-3.5 text-[12px]">
              {autoConnectFailed && (
                <div className="p-2.5 rounded-[8px] bg-[#fff4ee] border border-[#f8d9c6] text-[#e2531f] text-[11px] flex items-center justify-between gap-2">
                  <span>未能自动直连，请在电脑 Wi-Fi 列表中手动连接热点</span>
                  <button
                    type="button"
                    onClick={() => void runAutoConnectWifi(bleDevice.wifiSsid, bleDevice.wifiPassword)}
                    className="text-[#FF6B35] underline font-semibold cursor-pointer shrink-0"
                  >
                    重试
                  </button>
                </div>
              )}
              <div className="p-3 rounded-[10px] bg-[#fafafb] border border-[#ebebee] space-y-2">
                <div className="text-[11.5px] font-semibold text-[#1c1c1e]">
                  ① 打开电脑 Wi-Fi 设置，连接录音卡热点：
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 rounded-[7px] bg-white border border-[#ebebee]">
                    <span className="text-[#8b8b90] text-[11px]">Wi-Fi 热点名称 (SSID)</span>
                    <span className="font-mono font-bold text-[#1c1c1e] select-all">{bleDevice.wifiSsid}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-[7px] bg-white border border-[#ebebee]">
                    <span className="text-[#8b8b90] text-[11px]">Wi-Fi 密码</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#1c1c1e] select-all">{bleDevice.wifiPassword || '12345678'}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await copyTextToClipboard(bleDevice.wifiPassword || '12345678');
                          if (ok) {
                            setWifiGuideCopied(true);
                            setTimeout(() => setWifiGuideCopied(false), 2000);
                          }
                        }}
                        className="text-[11px] font-semibold text-[#FF6B35] hover:underline cursor-pointer"
                      >
                        {wifiGuideCopied ? '已复制' : '复制密码'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-[#8b8b90] leading-relaxed">
                ② 电脑连上热点后，点击下方【开始极速转存】，音频文件将直接存入本机硬盘，完成后自动切回原有网络。
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#ebebee]">
                <button
                  type="button"
                  disabled={wifiConnecting}
                  onClick={handleCancelWifiSync}
                  className="px-3.5 py-1.5 text-[12px] font-medium rounded-[7px] border border-[#ebebee] text-[#505055] hover:border-[#c6c6cc] cursor-pointer"
                >
                  暂不转存
                </button>
                <button
                  type="button"
                  disabled={wifiConnecting}
                  onClick={handleConfirmWifiManual}
                  className="px-4 py-1.5 text-[12px] font-medium rounded-[7px] bg-[#FF6B35] hover:bg-[#e2531f] text-white shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {wifiConnecting ? '正在建立通道…' : '我已连接热点，开始极速转存'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* 解除绑定确认弹窗 */}
      {showUnbindModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowUnbindModal(false)}
          overlayClassName="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-2xs"
          className="w-[340px] bg-white rounded-[14px] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.18)] border border-[#ebebee]"
        >
          <h4 className="text-[14px] font-semibold text-[#1c1c1e] mb-2">解除设备绑定</h4>
          <p className="text-[12px] text-[#8b8b90] leading-relaxed mb-4">
            解除绑定后将清除录音卡本地配对信息。确定解除绑定吗？
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowUnbindModal(false)}
              className="text-[12px] px-3.5 py-1.5 rounded-[7px] border border-[#ebebee] hover:border-[#c6c6cc] text-[#505055]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleUnbind}
              className="text-[12px] font-medium px-4 py-1.5 rounded-[7px] bg-[#d4380d] hover:bg-[#b32b05] text-white"
            >
              确认解绑
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};
