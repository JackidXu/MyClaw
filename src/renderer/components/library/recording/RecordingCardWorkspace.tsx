/**
 * 录音卡三栏工作台主容器
 *
 * 遵循“只存在本机”原则：音频落盘本地，逐字稿与纪要落库 SQLite。
 * 顶部设备卡片已移除自动传输与设置；中栏播放音频直接调用浏览器打开。
 */

import React, { useCallback, useEffect, useState } from 'react';

import type { LocalRecordingItem } from '../../../../shared/recordingCard/localRecording';
import { LocalRecordingStatus } from '../../../../shared/recordingCard/localRecording';
import { asrService } from '../../../services/asrService';
import { copyTextToClipboard } from '../../../services/clipboard';
import {
  type GeneratedSummaryResult,
  recordingSummaryService,
} from '../../../services/recordingSummaryService';
import {
  createAudio,
  fetchAudioUploadPresignedUrl,
  uploadFileToTos,
} from '../../../services/secondBrainApi';
import { formatAudioDuration, getAudioBlobDuration } from './audioDuration';
import { RecordingDeviceCard } from './RecordingDeviceCard';
import { RecordingListColumn } from './RecordingListColumn';
import { RecordingSummaryColumn } from './RecordingSummaryColumn';
import { RecordingTranscriptColumn } from './RecordingTranscriptColumn';

interface RecordingCardWorkspaceProps {
  onShowToast?: (type: 'success' | 'error' | 'info', message: string) => void;
  onSendToChat?: (text: string) => void;
}

export const RecordingCardWorkspace: React.FC<RecordingCardWorkspaceProps> = ({
  onShowToast,
  onSendToChat,
}) => {
  const [recordings, setRecordings] = useState<LocalRecordingItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transcribingIds, setTranscribingIds] = useState<Set<string>>(new Set());
  const [transcribeProgressMap, setTranscribeProgressMap] = useState<Record<string, string>>({});
  const [summarizingId, setSummarizingId] = useState<string | null>(null);

  // 录音卡设备状态
  const [isDeviceConnected, setIsDeviceConnected] = useState(false);
  const [deviceName, setDeviceName] = useState('M1(BLE)');

  const toast = useCallback(
    (type: 'success' | 'error' | 'info', msg: string) => {
      onShowToast?.(type, msg);
    },
    [onShowToast],
  );

  // 1. 加载本地 SQLite 录音列表，并对缺失时长的历史记录异步补算回写
  const loadLocalRecordings = useCallback(async () => {
    try {
      const res = await window.electron.localRecordings?.getList?.();
      if (res?.success && Array.isArray(res.data)) {
        setRecordings(res.data);
        if (res.data.length > 0 && !selectedId) {
          setSelectedId(res.data[0].id);
        }

        // 异步检查并补齐历史存量 00:00 录音的时长 (通过主进程原生 fs 读取，无 CSP 限制)
        for (const item of res.data) {
          if ((!item.durationMs || item.duration === '00:00') && item.localPath) {
            void (async () => {
              try {
                const readRes = await window.electron.localRecordings?.readAudioFile?.(item.localPath!);
                if (readRes?.success && readRes.data) {
                  const blob = new Blob([readRes.data]);
                  const durSec = await getAudioBlobDuration(blob);
                  if (durSec > 0) {
                    const updated: LocalRecordingItem = {
                      ...item,
                      duration: formatAudioDuration(durSec),
                      durationMs: Math.round(durSec * 1000),
                      updatedAt: Date.now(),
                    };
                    await window.electron.localRecordings?.upsertRecord?.(updated);
                    setRecordings(prev => prev.map(r => (r.id === item.id ? updated : r)));
                  }
                }
              } catch (e) {
                console.debug('[RecordingCardWorkspace] 自动回写音频时长失败:', item.id, e);
              }
            })();
          }
        }
      }
    } catch (err: any) {
      console.warn('[RecordingCardWorkspace] loadLocalRecordings error:', err);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadLocalRecordings();
  }, [loadLocalRecordings]);

  // 当前选中的录音对象
  const selectedItem = recordings.find(r => r.id === selectedId) || null;

  // 2. 外部本地音频导入
  const handleImportFile = async (file: File) => {
    try {
      toast('info', `正在导入本地音频「${file.name}」...`);
      const arrayBuffer = await file.arrayBuffer();

      // 保存到本地磁盘
      const saveRes = await window.electron.localRecordings?.saveAudioFile?.(
        file.name,
        arrayBuffer,
      );
      if (!saveRes?.success || !saveRes.data) {
        throw new Error(saveRes?.error || '保存音频文件失败');
      }

      // 精准解析音频真实时长
      const durationSec = await getAudioBlobDuration(file);
      const durationMs = Math.round(durationSec * 1000);
      const durationStr = formatAudioDuration(durationSec);

      const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const title = file.name.replace(/\.[^/.]+$/, '');

      const newItem: LocalRecordingItem = {
        id,
        name: file.name,
        title,
        localPath: saveRes.data.localPath,
        duration: durationStr,
        durationMs,
        size: saveRes.data.size,
        sourceType: 'imported',
        status: LocalRecordingStatus.Pending,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await window.electron.localRecordings?.upsertRecord?.(newItem);
      toast('success', `音频「${file.name}」导入成功，可点击转写`);
      await loadLocalRecordings();
      setSelectedId(id);
    } catch (err: any) {
      toast('error', `导入失败: ${err?.message || err}`);
    }
  };

  // 3. 执行单条音频转写
  const handleTranscribeOne = async (item: LocalRecordingItem) => {
    if (transcribingIds.has(item.id)) return;

    setTranscribingIds(prev => new Set(prev).add(item.id));
    setTranscribeProgressMap(prev => ({
      ...prev,
      [item.id]: '正在准备音频文件...',
    }));

    try {
      let tosUrl = item.tosUrl;
      let tosKey = item.tosKey;

      // 步骤 A: 如果本地未曾上传过该音频，才获取预签名并上传到云端存储；若已存在则直接复用
      if (!tosUrl || !tosKey) {
        toast('info', `正在上传「${item.title || item.name}」到云端...`);

        // 通过主进程读取本地音频文件
        const fileData = await window.electron.localRecordings?.getById?.(item.id);
        if (!fileData?.data?.localPath) {
          throw new Error('未找到本地音频文件路径');
        }

        // 获取云端预签名上传地址
        const presign = await fetchAudioUploadPresignedUrl();

        // 通过主进程原生 fs 读取音频 ArrayBuffer (彻底避免渲染层 CSP 限制)
        const readRes = await window.electron.localRecordings?.readAudioFile?.(fileData.data.localPath);
        if (!readRes?.success || !readRes.data) {
          throw new Error(readRes?.error || '读取本地音频文件失败');
        }
        const audioBuffer = readRes.data;

        const ext = item.name.split('.').pop()?.toLowerCase() || 'ogg';
        const mime = ext === 'ogg' ? 'audio/ogg' : ext === 'mp3' ? 'audio/mpeg' : 'audio/wav';

        await uploadFileToTos(presign.upload_url, audioBuffer, mime);

        tosUrl = presign.tos_url || presign.upload_url.split('?')[0];
        tosKey = presign.key;
      }

      // 步骤 B: 提交语音转写任务 (使用公网直链)
      const ext = item.name.split('.').pop()?.toLowerCase() || 'ogg';

      setTranscribeProgressMap(prev => ({
        ...prev,
        [item.id]: '音频已就绪，正在启动 AI 智能识别...',
      }));

      const submitRes = await asrService.submitTask({
        audioUrl: tosUrl,
        format: ext === 'ogg' ? 'ogg' : ext,
        codec: ext === 'ogg' ? 'opus' : undefined,
      });

      // 步骤 C: 轮询等待转写完成
      const asrResult = await asrService.pollAsrResult(submitRes.task_id, {
        onProgress: msg => {
          setTranscribeProgressMap(prev => ({ ...prev, [item.id]: msg }));
        },
      });

      // 步骤 D: 自动调用服务端提炼商业纪要
      setTranscribeProgressMap(prev => ({
        ...prev,
        [item.id]: '正在提炼商业纪要与核心决策...',
      }));
      setSummarizingId(item.id);

      let summaryResult: GeneratedSummaryResult | null = null;
      try {
        summaryResult = await recordingSummaryService.generateSummary({
          transcriptText: asrResult.text,
          utterances: asrResult.utterances,
          originalFilename: item.name,
        });
      } catch (sumErr) {
        console.warn('[RecordingCardWorkspace] 自动提炼纪要异常:', sumErr);
      }

      // 步骤 E: 落库本地 SQLite (持久化真实的 tosUrl 和 tosKey，绝对不覆盖为 task_id)
      const updatedItem: LocalRecordingItem = {
        ...item,
        title: summaryResult?.title || item.title,
        status: LocalRecordingStatus.Transcribed,
        taskId: submitRes.task_id,
        tosUrl,
        tosKey,
        transcriptText: asrResult.text,
        utterances: asrResult.utterances,
        summary: summaryResult?.summary || undefined,
        items: summaryResult?.items || [],
        updatedAt: Date.now(),
      };

      await window.electron.localRecordings?.upsertRecord?.(updatedItem);
      if (summaryResult?.summary) {
        toast('success', `「${updatedItem.title}」转写与智能纪要已生成！`);
      } else {
        toast('info', `「${updatedItem.title}」逐字稿转写完成，可一键提炼纪要`);
      }
      await loadLocalRecordings();
    } catch (err: any) {
      toast('error', `转写失败: ${err?.message || err}`);
    } finally {
      setTranscribingIds(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      setTranscribeProgressMap(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      setSummarizingId(null);
    }
  };

  // 4. 全部转写
  const handleTranscribeAll = async () => {
    const pendingList = recordings.filter(
      r => r.status === LocalRecordingStatus.Pending,
    );
    if (pendingList.length === 0) {
      toast('info', '暂无待转写的录音');
      return;
    }
    toast('info', `开始批量转写 ${pendingList.length} 份录音...`);
    for (const item of pendingList) {
      await handleTranscribeOne(item);
    }
  };

  // 5. 浏览器播放本地音频
  const handlePlayAudio = async () => {
    if (!selectedItem?.localPath) {
      toast('error', '未找到本地音频文件路径');
      return;
    }
    try {
      // 优先使用系统的打开路径能力或浏览器打开
      const shell = window.electron.shell;
      if (shell?.openPath) {
        await shell.openPath(selectedItem.localPath);
      } else if (shell?.openExternal) {
        await shell.openExternal(`file://${selectedItem.localPath}`);
      }
      toast('info', '已在浏览器/系统播放器中打开音频');
    } catch (err: any) {
      toast('error', `打开音频播放失败: ${err?.message || err}`);
    }
  };

  // 6. 重新生成总结
  const handleReSummarize = async () => {
    if (!selectedItem?.transcriptText) return;
    setSummarizingId(selectedItem.id);
    try {
      toast('info', '正在重新提炼会议纪要与决策点...');
      const summaryResult = await recordingSummaryService.generateSummary({
        transcriptText: selectedItem.transcriptText,
        utterances: selectedItem.utterances,
        originalFilename: selectedItem.name,
      });

      const updated: LocalRecordingItem = {
        ...selectedItem,
        title: summaryResult.title || selectedItem.title,
        summary: summaryResult.summary,
        items: summaryResult.items,
        updatedAt: Date.now(),
      };

      await window.electron.localRecordings?.upsertRecord?.(updated);
      toast('success', 'AI 总结与决策点已更新！');
      await loadLocalRecordings();
    } catch (err: any) {
      toast('error', `重新总结失败: ${err?.message || err}`);
    } finally {
      setSummarizingId(null);
    }
  };

  // 7. 同步到第二大脑
  const handleSyncToSecondBrain = async () => {
    if (!selectedItem) return;
    try {
      toast('info', `正在将「${selectedItem.title}」同步到第二大脑...`);

      let tosUrl = selectedItem.tosUrl;
      let tosKey = selectedItem.tosKey;

      // 如果先前未记录或已失效，则重新获取预签名直传凭证并上传
      if (!tosUrl || !tosKey) {
        const fileData = await window.electron.localRecordings?.getById?.(selectedItem.id);
        if (!fileData?.data?.localPath) {
          throw new Error('未找到本地音频文件路径');
        }
        const presign = await fetchAudioUploadPresignedUrl();
        const readRes = await window.electron.localRecordings?.readAudioFile?.(fileData.data.localPath);
        if (!readRes?.success || !readRes.data) {
          throw new Error(readRes?.error || '读取本地音频文件失败');
        }
        const ext = selectedItem.name.split('.').pop()?.toLowerCase() || 'ogg';
        const mime = ext === 'ogg' ? 'audio/ogg' : ext === 'mp3' ? 'audio/mpeg' : 'audio/wav';
        await uploadFileToTos(presign.upload_url, readRes.data, mime);
        tosUrl = presign.tos_url;
        tosKey = presign.key;
      }

      // 创建第二大脑音频记录
      await createAudio({
        name: `${selectedItem.title}.ogg`,
        tosUrl,
        tosKey,
      });

      // 更新状态为已入脑，并持久化云端地址
      const updated: LocalRecordingItem = {
        ...selectedItem,
        status: LocalRecordingStatus.Synced,
        tosUrl,
        tosKey,
        updatedAt: Date.now(),
      };
      await window.electron.localRecordings?.upsertRecord?.(updated);
      toast('success', `「${selectedItem.title}」已成功同步到第二大脑资料库！`);
      await loadLocalRecordings();
    } catch (err: any) {
      toast('error', `同步到第二大脑失败: ${err?.message || err}`);
    }
  };

  const handleSyncBrainBatch = async (targets: LocalRecordingItem[]) => {
    if (targets.length === 0) return;
    toast('info', `正在批量推送 ${targets.length} 条录音至第二大脑...`);
    let successCount = 0;
    for (const item of targets) {
      try {
        let tosUrl = item.tosUrl;
        let tosKey = item.tosKey;

        if (!tosUrl || !tosKey) {
          const fileData = await window.electron.localRecordings?.getById?.(item.id);
          if (fileData?.data?.localPath) {
            const presign = await fetchAudioUploadPresignedUrl();
            const readRes = await window.electron.localRecordings?.readAudioFile?.(fileData.data.localPath);
            if (readRes?.success && readRes.data) {
              const ext = item.name.split('.').pop()?.toLowerCase() || 'ogg';
              const mime = ext === 'ogg' ? 'audio/ogg' : ext === 'mp3' ? 'audio/mpeg' : 'audio/wav';
              await uploadFileToTos(presign.upload_url, readRes.data, mime);
              tosUrl = presign.tos_url;
              tosKey = presign.key;
            }
          }
        }

        if (!tosUrl || !tosKey) continue;

        await createAudio({
          name: `${item.title}.ogg`,
          tosUrl,
          tosKey,
        });
        const updated: LocalRecordingItem = {
          ...item,
          status: LocalRecordingStatus.Synced,
          tosUrl,
          tosKey,
          updatedAt: Date.now(),
        };
        await window.electron.localRecordings?.upsertRecord?.(updated);
        successCount++;
      } catch (e) {
        console.warn('[RecordingCardWorkspace] 批量推送异常:', item.id, e);
      }
    }
    toast('success', `批量推送完成，已成功 ${successCount} 条`);
    await loadLocalRecordings();
  };

  // 8. 发到聊天框
  const handleSendToChat = () => {
    if (!selectedItem) return;
    const textToSend = `【${selectedItem.title} · 会议纪要】\n${selectedItem.summary || selectedItem.transcriptText || ''}`;
    onSendToChat?.(textToSend);
    toast('success', '已将录音纪要发送至聊天框');
  };

  // 9. 复制与导出
  const handleCopyTranscript = () => {
    if (!selectedItem?.transcriptText) return;
    copyTextToClipboard(selectedItem.transcriptText);
    toast('success', '已复制逐字稿全文');
  };

  const handleExportTranscript = () => {
    if (!selectedItem) return;
    const content = selectedItem.transcriptText || '';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedItem.title || '录音逐字稿'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast('success', '已导出逐字稿文本');
  };

  const handleCopySummary = () => {
    if (!selectedItem?.summary) return;
    copyTextToClipboard(selectedItem.summary);
    toast('success', '已复制 AI 总结');
  };

  const handleExportSummary = () => {
    if (!selectedItem) return;
    const content = `# ${selectedItem.title}\n\n## 会议纪要\n${selectedItem.summary || ''}\n\n## 提炼认知\n${(selectedItem.items || []).map(i => `- [${i.kind}] ${i.text}`).join('\n')}`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedItem.title || '会议纪要'}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast('success', '已导出 Markdown 纪要');
  };

  const handleDelete = async (item: LocalRecordingItem) => {
    if (!confirm(`确定删除录音「${item.title || item.name}」吗？`)) return;
    await window.electron.localRecordings?.deleteRecord?.(item.id, true);
    toast('success', '已删除录音记录与本地音频');
    if (selectedId === item.id) {
      setSelectedId(null);
    }
    await loadLocalRecordings();
  };

  const handleUpdateSummaryText = async (newSummary: string) => {
    if (!selectedItem) return;
    const updated: LocalRecordingItem = {
      ...selectedItem,
      summary: newSummary,
      updatedAt: Date.now(),
    };
    await window.electron.localRecordings?.upsertRecord?.(updated);
    toast('success', '纪要内容已保存');
    await loadLocalRecordings();
  };

  const handleRenameItem = async (item: LocalRecordingItem, newTitle: string) => {
    try {
      const updated: LocalRecordingItem = {
        ...item,
        title: newTitle,
        updatedAt: Date.now(),
      };
      await window.electron.localRecordings?.upsertRecord?.(updated);
      toast('success', `录音已重命名为「${newTitle}」`);
      await loadLocalRecordings();
    } catch (err: any) {
      toast('error', `重命名失败: ${err?.message || err}`);
    }
  };

  return (
    <div className="w-full max-w-[1240px] mx-auto p-4 space-y-3 select-none flex flex-col h-full min-h-0">
      {/* 顶部安全提示条 (.rc-local) */}
      <div className="bg-[#fafafb] border border-[#ebebee] rounded-[10px] p-[10px_14px] flex items-center gap-2.5 text-[12.5px] text-[#505055] leading-[1.6] shrink-0">
        <span className="w-[26px] h-[26px] rounded-[8px] bg-[#fff4ee] text-[#e2531f] flex items-center justify-center shrink-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="10.5" width="16" height="10" rx="2" />
            <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
          </svg>
        </span>
        <span>
          <b className="font-semibold text-[#1c1c1e]">录音卡里的录音会自动传到这台电脑，不会上传。</b>
          转写后的内容要不要进第二大脑，由你勾选后决定。
        </span>
      </div>

      {/* 设备状态卡片 (.rcd-dev) */}
      <div className="shrink-0">
        <RecordingDeviceCard
          deviceName={deviceName}
          isConnected={isDeviceConnected}
          localTranscribedCount={
            recordings.filter(r => r.status !== LocalRecordingStatus.Pending).length
          }
          onConnect={() => {
            setIsDeviceConnected(true);
            setDeviceName('M1(BLE)');
            toast('success', '录音卡蓝牙连接成功');
          }}
          onDisconnect={() => {
            setIsDeviceConnected(false);
            toast('info', '已断开录音卡连接');
          }}
          onUnbind={() => {
            setIsDeviceConnected(false);
            toast('info', '已解除设备绑定');
          }}
        />
      </div>

      {/* 三栏工作台主体容器 (.rcw) */}
      <div className="flex-1 min-h-[580px] flex border border-[#ebebee] rounded-[12px] bg-white overflow-hidden shadow-[0_1px_3px_rgba(28,28,30,0.03)]">
        {/* 左栏：录音列表 (.rcw-list) */}
        <RecordingListColumn
          items={recordings}
          selectedId={selectedId}
          onSelect={item => setSelectedId(item.id)}
          onImportAudio={handleImportFile}
          onTranscribeSingle={handleTranscribeOne}
          onTranscribeAll={handleTranscribeAll}
          onSyncBrainBatch={handleSyncBrainBatch}
          onDeleteSingle={handleDelete}
          onRenameItem={handleRenameItem}
          onRefreshList={loadLocalRecordings}
        />

        {/* 中栏：逐字稿与浏览器播放 (.rcw-tx) */}
        <RecordingTranscriptColumn
          item={selectedItem}
          isTranscribing={selectedItem ? transcribingIds.has(selectedItem.id) : false}
          transcribeProgressText={
            selectedItem ? transcribeProgressMap[selectedItem.id] : undefined
          }
          onTranscribe={() => selectedItem && handleTranscribeOne(selectedItem)}
          onPlayAudio={handlePlayAudio}
          onCopyTranscript={handleCopyTranscript}
          onExportTranscript={handleExportTranscript}
        />

        {/* 右栏：AI 纪要与协同输出 (.rcw-sum) */}
        <RecordingSummaryColumn
          item={selectedItem}
          isSummarizing={selectedItem ? summarizingId === selectedItem.id : false}
          isTranscribing={selectedItem ? transcribingIds.has(selectedItem.id) : false}
          onRegenerateSummary={handleReSummarize}
          onCopySummary={handleCopySummary}
          onExportMarkdown={handleExportSummary}
          onSyncToSecondBrain={handleSyncToSecondBrain}
          onSendToChat={handleSendToChat}
          onSaveEditedSummary={handleUpdateSummaryText}
        />
      </div>
    </div>
  );
};
