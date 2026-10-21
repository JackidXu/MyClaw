/**
 * 录音卡三栏工作台 - 左栏：录音列表
 *
 * 严格完全参照原型 HTML/CSS (.rcw-list, .rcw-lh, .rcw-lt, .rc-seg, .rcw-rows, .rcd-row, .rcd-fic)
 */

import React, { useRef, useState } from 'react';

import type { LocalRecordingItem } from '../../../../shared/recordingCard/localRecording';
import { LocalRecordingStatus } from '../../../../shared/recordingCard/localRecording';
import Modal from '../../common/Modal';

interface RecordingListColumnProps {
  items: LocalRecordingItem[];
  selectedId: string | null;
  transcribingIds?: Set<string>;
  onSelect: (item: LocalRecordingItem) => void;
  onImportAudio: (file: File) => void;
  onTranscribeSingle: (item: LocalRecordingItem) => void;
  onTranscribeAll: () => void;
  onSyncBrainBatch?: (selectedItems: LocalRecordingItem[]) => void;
  onDeleteSingle: (item: LocalRecordingItem) => void;
  onRenameItem?: (item: LocalRecordingItem, newTitle: string) => void;
  onRefreshList?: () => void;
}

export const RecordingListColumn: React.FC<RecordingListColumnProps> = ({
  items,
  selectedId,
  transcribingIds,
  onSelect,
  onImportAudio,
  onTranscribeSingle,
  onSyncBrainBatch,
  onDeleteSingle,
  onRenameItem,
}) => {
  const [keyword, setKeyword] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'local' | 'pushed'>('all');
  const [isManageMode, _setIsManageMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [renamingItem, setRenamingItem] = useState<LocalRecordingItem | null>(null);
  const [deletingLocalItem, setDeletingLocalItem] = useState<LocalRecordingItem | null>(null);
  const [renameText, setRenameText] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 支持的纯音频格式扩展名
  const ALLOWED_EXTS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.flac'];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
      if (!ALLOWED_EXTS.includes(ext)) {
        alert('仅支持导入纯音频文件（mp3、wav、m4a、aac、ogg、flac、opus）');
        e.target.value = '';
        return;
      }
      onImportAudio(file);
      e.target.value = '';
    }
  };

  const toggleSelectAll = () => {
    if (selectedItemIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(filteredItems.map(i => i.id)));
    }
  };

  const toggleSelectItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };


  const formatDateLabel = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');
    if (isToday) {
      return `今天 ${hours}:${mins}`;
    }
    const isYesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
    if (isYesterday) {
      return `昨天 ${hours}:${mins}`;
    }
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${month}-${day} ${hours}:${mins}`;
  };

  // 过滤项
  const filteredItems = items.filter(item => {
    if (keyword.trim()) {
      const kw = keyword.toLowerCase();
      const matchTitle = (item.title || item.name).toLowerCase().includes(kw);
      const matchTranscript = (item.transcriptText || '').toLowerCase().includes(kw);
      if (!matchTitle && !matchTranscript) return false;
    }

    if (filterType === 'local') {
      return item.status !== LocalRecordingStatus.Synced;
    }
    if (filterType === 'pushed') {
      return item.status === LocalRecordingStatus.Synced;
    }
    return true;
  });

  const totalCount = items.length;
  const pendingCount = items.filter(i => i.status === LocalRecordingStatus.Pending).length;

  return (
    <div className="w-[300px] shrink-0 border-r border-[#ebebee] flex flex-col bg-[#fafafb] min-h-0 select-none">
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.wav,.m4a,.aac,.ogg,.opus,.flac"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* 头部 (.rcw-lh) - 主标题与副标题上下排列，右侧仅保留导入与管理 */}
      <div className="p-[10px_12px] border-b border-[#ebebee] flex items-center justify-between gap-2 shrink-0 bg-[#fafafb]">
        {/* 左侧：主标题 + 副标题（上下排布） */}
        <div className="flex flex-col min-w-0 shrink-0">
          <b className="text-[13px] font-semibold text-[#1c1c1e] leading-tight whitespace-nowrap">
            录音文件
          </b>
          <span className="text-[10px] text-[#8b8b90] leading-tight whitespace-nowrap mt-0.5 tabular-nums">
            {totalCount} 个文件 · {pendingCount} 待转写
          </span>
        </div>

        {/* 右侧：单行精简按钮组（导入 + 管理） */}
        <div className="flex items-center gap-1.5 shrink-0 flex-nowrap">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-[11.5px] whitespace-nowrap text-[#505055] border border-[#ebebee] bg-white rounded-[7px] px-2.5 py-1 hover:border-[#c6c6cc] hover:text-[#1c1c1e] transition-colors cursor-pointer shadow-2xs"
            title="导入电脑本地音频"
          >
            导入
          </button>
          {/* TODO: 批量管理功能暂不开放，后续视产品需求再行启用 */}
          {/* <button
            type="button"
            onClick={() => {
              setIsManageMode(!isManageMode);
              if (isManageMode) setSelectedItemIds(new Set());
            }}
            className={`text-[11.5px] whitespace-nowrap border rounded-[7px] px-2.5 py-1 transition-colors cursor-pointer shadow-2xs ${
              isManageMode
                ? 'border-[#FF6B35] bg-[#fff4ee] text-[#e2531f] font-medium'
                : 'border-[#ebebee] bg-white text-[#505055] hover:border-[#c6c6cc]'
            }`}
            title={isManageMode ? '退出管理模式' : '进入批量管理模式'}
          >
            {isManageMode ? '完成' : '管理'}
          </button> */}
        </div>
      </div>

      {/* 搜索与 Segment 分类 (.rcw-lt) */}
      <div className="flex flex-col gap-2 p-[8px_12px] border-b border-[#ebebee] shrink-0">
        <div className="flex items-center gap-2 bg-white border border-[#ebebee] rounded-[9px] px-2.5 py-1.5 focus-within:border-[#f3c8ab]">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="text-[#8b8b90] shrink-0"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="搜索录音"
            className="w-full bg-transparent text-[12px] text-[#1c1c1e] placeholder-[#8b8b90] outline-none"
          />
        </div>

        {/* Segment 胶囊分类 (.rc-seg) - 移除孤立的批量同步，自适应平铺 */}
        <div className="grid grid-cols-3 bg-[#f2f2f4] border border-[#ebebee] rounded-[9px] p-0.5 gap-0.5">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`text-[12px] py-1 rounded-[7px] transition-colors cursor-pointer text-center ${
              filterType === 'all'
                ? 'bg-white text-[#1c1c1e] font-medium shadow-[0_1px_3px_rgba(28,28,30,0.06)]'
                : 'text-[#8b8b90] hover:text-[#1c1c1e]'
            }`}
          >
            全部
          </button>
          <button
            type="button"
            onClick={() => setFilterType('local')}
            className={`text-[12px] py-1 rounded-[7px] transition-colors cursor-pointer text-center ${
              filterType === 'local'
                ? 'bg-white text-[#1c1c1e] font-medium shadow-[0_1px_3px_rgba(28,28,30,0.06)]'
                : 'text-[#8b8b90] hover:text-[#1c1c1e]'
            }`}
          >
            仅本机
          </button>
          <button
            type="button"
            onClick={() => setFilterType('pushed')}
            className={`text-[12px] py-1 rounded-[7px] transition-colors cursor-pointer text-center ${
              filterType === 'pushed'
                ? 'bg-white text-[#1c1c1e] font-medium shadow-[0_1px_3px_rgba(28,28,30,0.06)]'
                : 'text-[#8b8b90] hover:text-[#1c1c1e]'
            }`}
          >
            已推送
          </button>
        </div>
      </div>

      {/* 批量管理操作条 (.rcd-mbar) - 批处理动作统一收敛在此 */}
      {isManageMode && (
        <div className="flex items-center gap-1.5 bg-[#f2f2f4] border-b border-[#ebebee] p-[7px_12px] text-[11.5px] text-[#505055] shrink-0">
          <label
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 cursor-pointer select-none font-medium text-[#1c1c1e]"
          >
            <span
              className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center transition-colors ${
                selectedItemIds.size === filteredItems.length && filteredItems.length > 0
                  ? 'bg-[#FF6B35] border-[#FF6B35] text-white'
                  : 'border-[#dfdfe3] bg-white'
              }`}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4">
                <path d="M4 12.5l5 5L20 6.5" />
              </svg>
            </span>
            全选
          </label>
          <span className="text-[#8b8b90] text-[11px] tabular-nums">已选 {selectedItemIds.size}</span>
          <span className="flex-1" />
          <button
            type="button"
            disabled={selectedItemIds.size === 0}
            onClick={() => {
              const selectedList = filteredItems.filter(i => selectedItemIds.has(i.id));
              selectedList.forEach(item => {
                if (
                  item.status === LocalRecordingStatus.Pending ||
                  item.status === LocalRecordingStatus.Failed
                ) {
                  onTranscribeSingle(item);
                }
              });
            }}
            className="text-[11px] text-[#505055] border border-[#dfdfe3] bg-white rounded-[6px] px-2 py-0.5 hover:border-[#c6c6cc] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            转写
          </button>
          <button
            type="button"
            disabled={selectedItemIds.size === 0}
            onClick={() => {
              const targets = filteredItems.filter(i => selectedItemIds.has(i.id));
              onSyncBrainBatch?.(targets);
            }}
            className="text-[11px] text-[#e2531f] border border-[#f3c8ab] bg-[#fff4ee] rounded-[6px] px-2 py-0.5 hover:bg-[#ffe9dd] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            推送大脑
          </button>
          <button
            type="button"
            disabled={selectedItemIds.size === 0}
            onClick={() => {
              const selectedList = filteredItems.filter(i => selectedItemIds.has(i.id));
              selectedList.forEach(item => onDeleteSingle(item));
              setSelectedItemIds(new Set());
            }}
            className="text-[11px] text-[#e04838] border border-[#f8d0cb] bg-[#fff5f4] rounded-[6px] px-2 py-0.5 hover:bg-[#ffe9e7] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            删除
          </button>
        </div>
      )}

      {/* 录音卡片列表 (.rcw-rows) */}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 min-h-0 [scrollbar-gutter:stable]">
        {filteredItems.length === 0 ? (
          <div className="py-12 text-center text-[12.5px] text-[#8b8b90]">
            {items.length === 0
              ? '录音卡里还没有文件，可从设备拉取或点击上方「导入」'
              : '没有匹配的录音记录'}
          </div>
        ) : (
          filteredItems.map(item => {
            const isSelected = selectedId === item.id;
            const isTranscribed = item.status === LocalRecordingStatus.Transcribed;
            const isSynced = item.status === LocalRecordingStatus.Synced;
            const isItemTranscribing =
              item.status === LocalRecordingStatus.Transcribing ||
              Boolean(transcribingIds?.has(item.id));
            const isFailed = item.status === LocalRecordingStatus.Failed;
            const isPending =
              !isItemTranscribing &&
              !isTranscribed &&
              !isFailed &&
              !isSynced;
            const isChecked = selectedItemIds.has(item.id);

            return (
              <div
                key={item.id}
                onClick={() => onSelect(item)}
                className={`relative flex items-center gap-2.5 p-[10px_12px] rounded-[10px] border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-[#FF6B35] bg-[#fff4ee] shadow-2xs'
                    : 'border-[#ebebee] bg-white hover:border-[#dfdfe3] hover:bg-[#fafafb]'
                }`}
              >
                {/* 勾选框 */}
                {isManageMode && (
                  <span
                    onClick={(e) => toggleSelectItem(item.id, e)}
                    className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors ${
                      isChecked
                        ? 'bg-[#FF6B35] border-[#FF6B35] text-white'
                        : 'border-[#dfdfe3] bg-white'
                    }`}
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4">
                      <path d="M4 12.5l5 5L20 6.5" />
                    </svg>
                  </span>
                )}

                {/* 录音小图标 (.rcd-fic) - 仅已转写和已推送点亮，失败与待转写保持灰色未完成态 */}
                <div
                  className={`w-7 h-7 rounded-[8px] flex items-center justify-center shrink-0 ${
                    isSynced || isTranscribed
                      ? 'bg-[#fff4ee] text-[#e2531f] border border-[#f8d9c6]'
                      : 'bg-[#f4f4f6] text-[#8b8b90] border border-[#ebebee]'
                  }`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <path d="M12 19v3" />
                  </svg>
                </div>

                {/* 中间信息 (.rcd-fi) */}
                <div className="flex-1 min-w-0 pr-1">
                  <b className="block text-[13px] font-semibold text-[#1c1c1e] truncate leading-tight">
                    {item.title || item.name}
                  </b>
                  <small className="block text-[11px] text-[#8b8b90] mt-1 tabular-nums whitespace-nowrap truncate">
                    {formatDateLabel(item.createdAt)} ｜ {item.duration || '00:00'}
                  </small>
                </div>

                {/* 右侧状态标签或转写/重试按钮 */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {isSynced ? (
                    <span className="text-[10.5px] px-2 py-0.5 rounded-[5px] bg-[#edf4ff] text-[#2563eb] select-none cursor-default font-normal">
                      已推送
                    </span>
                  ) : isTranscribed ? (
                    <span className="text-[10.5px] px-2 py-0.5 rounded-[5px] bg-[#f0fdf4] text-[#16a34a] select-none cursor-default font-normal">
                      已转写
                    </span>
                  ) : isItemTranscribing ? (
                    <span className="inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded-[5px] bg-[#fff7ed] text-[#ea580c] select-none cursor-default font-normal">
                      <span className="w-2.5 h-2.5 rounded-full border border-[#ea580c] border-t-transparent animate-spin inline-block" />
                      转写中...
                    </span>
                  ) : isFailed ? (
                    <div className="flex items-center gap-1">
                      <span
                        title={item.transcribeError || '转写失败，点击旁边重试'}
                        className="text-[10.5px] px-1.5 py-0.5 rounded-[5px] bg-[#fef2f2] text-[#ef4444] select-none cursor-help font-normal"
                      >
                        转写失败
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTranscribeSingle(item);
                        }}
                        title="重新提交转写"
                        className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[#FF6B35] bg-white border border-[#FF6B35]/30 rounded-[6px] px-1.5 py-0.5 hover:bg-[#fff4ee] hover:border-[#FF6B35] active:scale-95 cursor-pointer transition-all shadow-2xs"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                          <path d="M21 3v5h-5" />
                          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                          <path d="M3 21v-5h5" />
                        </svg>
                        重试
                      </button>
                    </div>
                  ) : isPending ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTranscribeSingle(item);
                      }}
                      className="text-[11px] font-medium text-white bg-[#FF6B35] rounded-[6px] px-2.5 py-0.5 hover:bg-[#fa5a20] active:scale-95 cursor-pointer transition-all shadow-2xs shrink-0"
                    >
                      转写
                    </button>
                  ) : null}

                  {/* 更多操作三点菜单 */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(activeMenuId === item.id ? null : item.id);
                      }}
                      className="w-5 h-5 rounded-[5px] flex items-center justify-center text-[#8b8b90] hover:bg-[#f2f2f4] hover:text-[#1c1c1e] cursor-pointer"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>

                    {activeMenuId === item.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-6 z-20 min-w-[110px] bg-white border border-[#dfdfe3] rounded-[10px] p-1 shadow-[0_12px_30px_rgba(28,28,30,0.12)] text-[12px]"
                      >
                        <div
                          onClick={() => {
                            setActiveMenuId(null);
                            setRenamingItem(item);
                            setRenameText(item.title || item.name);
                          }}
                          className="px-2.5 py-1.5 rounded-[7px] text-[#1c1c1e] hover:bg-[#f4f4f6] cursor-pointer"
                        >
                          重命名
                        </div>
                        <div
                          onClick={() => {
                            setActiveMenuId(null);
                            setDeletingLocalItem(item);
                          }}
                          className="px-2.5 py-1.5 rounded-[7px] text-[#d4380d] hover:bg-[#fff4ef] cursor-pointer"
                        >
                          删除本机记录
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 重命名弹窗：使用通用 Modal 挂载在 body 根节点，彻底避免侧边栏等局部层叠上下文穿透 */}
      {renamingItem && (
        <Modal
          isOpen={true}
          onClose={() => setRenamingItem(null)}
          onEscape={() => setRenamingItem(null)}
          overlayClassName="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-2xs"
          className="w-[360px] bg-white rounded-[14px] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.18)] border border-[#ebebee]"
        >
          <h4 className="text-[14px] font-semibold text-[#1c1c1e] mb-3">重命名录音</h4>
          <input
            type="text"
            autoFocus
            value={renameText}
            onChange={e => setRenameText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const trimmed = renameText.trim();
                if (trimmed && onRenameItem) {
                  onRenameItem(renamingItem, trimmed);
                }
                setRenamingItem(null);
              }
            }}
            className="w-full px-3 py-2 text-[13px] border border-[#f3c8ab] rounded-[8px] outline-none focus:border-[#FF6B35]"
            placeholder="请输入新的录音标题..."
          />
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={() => setRenamingItem(null)}
              className="text-[12px] px-3.5 py-1.5 rounded-[7px] border border-[#ebebee] hover:border-[#c6c6cc] text-[#505055] cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                const trimmed = renameText.trim();
                if (trimmed && onRenameItem) {
                  onRenameItem(renamingItem, trimmed);
                }
                setRenamingItem(null);
              }}
              disabled={!renameText.trim()}
              className="text-[12px] font-medium px-4 py-1.5 rounded-[7px] bg-[#FF6B35] hover:bg-[#e2531f] text-white disabled:opacity-50 cursor-pointer"
            >
              确认
            </button>
          </div>
        </Modal>
      )}

      {/* 删除本机记录二次确认弹窗：使用规范的精致 Modal */}
      {deletingLocalItem && (
        <Modal
          isOpen={true}
          onClose={() => setDeletingLocalItem(null)}
          onEscape={() => setDeletingLocalItem(null)}
          overlayClassName="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-2xs"
          className="w-[360px] bg-white rounded-[14px] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.18)] border border-[#ebebee]"
        >
          <div className="flex items-center gap-2.5 mb-2.5 text-[#dc2626]">
            <div className="w-8 h-8 rounded-[8px] bg-[#fff5f5] flex items-center justify-center text-base">
              🗑
            </div>
            <h4 className="text-[14.5px] font-semibold text-[#1c1c1e]">删除本机记录</h4>
          </div>
          <div className="text-[12.5px] text-[#505055] space-y-2 mb-4 leading-relaxed">
            <p>
              确定要删除录音 <b className="text-[#1c1c1e] select-all">「{deletingLocalItem.title || deletingLocalItem.name}」</b> 吗？
            </p>
            <div className="p-2.5 rounded-[8px] bg-[#f4f4f6] text-[11.5px] text-[#8b8b90]">
              💡 <b>注意</b>：此操作将同时删除本地数据库记录与本机磁盘中的音频文件；<b>不会影响</b>录音卡硬件内的原始文件。
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeletingLocalItem(null)}
              className="text-[12px] px-3.5 py-1.5 rounded-[7px] border border-[#ebebee] hover:border-[#c6c6cc] text-[#505055] cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                const target = deletingLocalItem;
                setDeletingLocalItem(null);
                onDeleteSingle(target);
              }}
              className="text-[12px] font-medium px-4 py-1.5 rounded-[7px] bg-[#dc2626] hover:bg-[#b91c1c] text-white shadow-xs cursor-pointer"
            >
              确认删除
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};
