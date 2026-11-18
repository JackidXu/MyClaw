import React, { useMemo, useState } from 'react';

import { i18nService } from '../../services/i18n';
import Modal from '../common/Modal';
import {
  ENGINE_CONFIGS,
  ExpertEngineType,
  getExpertCoverImage,
  getSceneLabel,
} from './builtinExpertData';
import type { PresetAgent } from './ExpertsView';

interface BuiltinExpertsSectionProps {
  presets: PresetAgent[];
  searchQuery: string;
  hiringId: string | null;
  onStartWork: (expert: PresetAgent, initialPrompt?: string) => void;
  onEdit: (expert: PresetAgent) => void;
}

// 优雅流光骨架屏 + 平滑淡入封面图组件
const CoverImageWithSkeleton: React.FC<{
  src: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  onPreview?: () => void;
}> = ({ src, alt, className = '', imgClassName = '', onPreview }) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={`relative overflow-hidden bg-[#eef1f6] dark:bg-zinc-800 ${className}`}>
      {/* 真实高光扫光波纹（从左向右持续扫过，清晰流光质感） */}
      {!loaded && (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="w-full h-full bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent animate-shimmer" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover transition-opacity duration-500 ease-out ${
          loaded ? 'opacity-100' : 'opacity-0'
        } ${imgClassName}`}
      />
      {/* 右上角独立放大镜按钮（必须点击该按钮才看大图，防止误触） */}
      {onPreview && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPreview();
          }}
          className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-all bg-black/60 hover:bg-black/85 active:scale-95 backdrop-blur-md text-white p-1.5 rounded-full shadow-md cursor-pointer hover:ring-1 hover:ring-white/40"
          title={i18nService.t('builtinViewHdImage')}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
          </svg>
        </button>
      )}
    </div>
  );
};

const BuiltinExpertsSection: React.FC<BuiltinExpertsSectionProps> = ({
  presets,
  searchQuery,
  hiringId,
  onStartWork,
  onEdit,
}) => {
  const [activeEngine, setActiveEngine] = useState<ExpertEngineType>(ExpertEngineType.Acquisition);
  const [activeScene, setActiveScene] = useState<string>('全部');
  const [selectedExpert, setSelectedExpert] = useState<PresetAgent | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // 切换引擎时重置场景为“全部”
  const handleSwitchEngine = (engine: ExpertEngineType) => {
    setActiveEngine(engine);
    setActiveScene('全部');
  };

  // 获客引擎专家（显式标记为 acquisition，以及尚未配置 engine 的专家，保证在“全部专家”中全部可见）
  const acquisitionExperts = useMemo(() => {
    return presets.filter((p) => !p.engine || p.engine === ExpertEngineType.Acquisition);
  }, [presets]);

  const conversionExperts = useMemo(() => {
    return presets.filter((p) => p.engine === ExpertEngineType.Conversion);
  }, [presets]);

  const currentEngineExperts = activeEngine === ExpertEngineType.Acquisition ? acquisitionExperts : conversionExperts;
  const currentEngineConfig = ENGINE_CONFIGS[activeEngine];

  // 场景列表严格根据当前引擎的场景阶段展示
  const availableScenes = currentEngineConfig.defaultScenes;

  // 过滤专家列表
  const filteredList = useMemo(() => {
    return currentEngineExperts.filter((item) => {
      // 1. 场景过滤：只有选择了具体阶段时才进行过滤；“全部”不过滤
      if (activeScene !== '全部') {
        if (item.scene !== activeScene) return false;
      }

      // 2. 搜索过滤：严格匹配专家自身的业务属性
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const content = `${item.name} ${item.description || ''} ${item.input || ''} ${item.output || ''} ${item.deliver || ''} ${item.scene || ''}`.toLowerCase();
        if (!content.includes(q)) return false;
      }

      return true;
    });
  }, [currentEngineExperts, activeScene, searchQuery]);

  return (
    <div className="space-y-6">
      {/* ── 双引擎卡片切换区域 ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 获客引擎卡片 */}
        {(() => {
          const cfg = ENGINE_CONFIGS[ExpertEngineType.Acquisition];
          const isSelected = activeEngine === ExpertEngineType.Acquisition;
          return (
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSwitchEngine(ExpertEngineType.Acquisition)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleSwitchEngine(ExpertEngineType.Acquisition);
                }
              }}
              className={`relative p-5 rounded-2xl cursor-pointer transition-all duration-200 border text-left outline-none ${
                isSelected
                  ? 'border-amber-500 bg-amber-500/[0.04] shadow-sm'
                  : 'border-border bg-surface hover:border-border/80 hover:shadow-xs'
              }`}
            >
              <div className="text-[11px] font-bold tracking-wider text-amber-600 dark:text-amber-400">
                {cfg.badge}
              </div>
              <h2 className="text-lg font-bold text-foreground mt-1 mb-1 tracking-tight">
                {cfg.title}
              </h2>
              <p className="text-xs text-secondary leading-relaxed">{cfg.description}</p>
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-secondary/80 font-medium">
                  {i18nService.t('builtinEngineAcquisitionPath', { count: acquisitionExperts.length })}
                </span>
                <span
                  className={`font-semibold ${
                    isSelected ? 'text-amber-600 dark:text-amber-400' : 'text-secondary/70'
                  }`}
                >
                  {isSelected ? i18nService.t('builtinEngineViewing') : i18nService.t('builtinEngineSwitch')}
                </span>
              </div>
            </div>
          );
        })()}

        {/* 成交引擎卡片 */}
        {(() => {
          const cfg = ENGINE_CONFIGS[ExpertEngineType.Conversion];
          const isSelected = activeEngine === ExpertEngineType.Conversion;
          return (
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSwitchEngine(ExpertEngineType.Conversion)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleSwitchEngine(ExpertEngineType.Conversion);
                }
              }}
              className={`relative p-5 rounded-2xl cursor-pointer transition-all duration-200 border text-left outline-none ${
                isSelected
                  ? 'border-blue-500 bg-blue-500/[0.04] shadow-sm'
                  : 'border-border bg-surface hover:border-border/80 hover:shadow-xs'
              }`}
            >
              <div className="text-[11px] font-bold tracking-wider text-blue-600 dark:text-blue-400">
                {cfg.badge}
              </div>
              <h2 className="text-lg font-bold text-foreground mt-1 mb-1 tracking-tight">
                {cfg.title}
              </h2>
              <p className="text-xs text-secondary leading-relaxed">{cfg.description}</p>
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-secondary/80 font-medium">
                  {i18nService.t('builtinEngineConversionPath', { count: conversionExperts.length })}
                </span>
                <span
                  className={`font-semibold ${
                    isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-secondary/70'
                  }`}
                >
                  {isSelected ? i18nService.t('builtinEngineViewing') : i18nService.t('builtinEngineSwitch')}
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── 阶段分类 Chips 工具条与统计 ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
        <div className="flex items-center gap-2 flex-wrap">
          {availableScenes.map((sceneName) => {
            const isChipSelected = activeScene === sceneName;
            return (
              <button
                key={sceneName}
                type="button"
                onClick={() => setActiveScene(sceneName)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 cursor-pointer ${
                  isChipSelected
                    ? 'bg-foreground text-background shadow-xs'
                    : 'bg-surface border border-border text-secondary hover:text-foreground hover:border-border/80'
                }`}
              >
                {getSceneLabel(sceneName)}
              </button>
            );
          })}
        </div>
        <div className="text-xs text-secondary font-medium shrink-0 ml-auto">
          {i18nService.t('builtinExpertsCountBadge', { count: filteredList.length })}
        </div>
      </div>

      {/* ── 专家卡片网格列表 ── */}
      {filteredList.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center text-secondary">
          <p className="text-sm font-medium">{i18nService.t('builtinNoExpertsInCategory')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 min-[1100px]:grid-cols-3 min-[1400px]:grid-cols-4 gap-4">
          {filteredList.map((expert) => {
            const coverImageSrc = getExpertCoverImage(expert);
            const isEn = i18nService.getLanguage() === 'en';
            const expertName = (isEn && expert.nameEn) ? expert.nameEn : expert.name;
            const expertDesc = (isEn && expert.descriptionEn) ? expert.descriptionEn : expert.description;
            const expertScene = expert.scene ? getSceneLabel(expert.scene) : '';

            return (
              <div
                key={expert.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedExpert(expert)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setSelectedExpert(expert);
                  }
                }}
                className="group relative flex flex-col bg-surface border border-border hover:border-amber-500/80 rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md will-change-transform text-left outline-none"
              >
                {/* 封面图片展示区（带微光骨架屏 + 平滑淡入，仅点击右上角独立角标才放大原图） */}
                <CoverImageWithSkeleton
                  src={coverImageSrc}
                  alt={expertName}
                  className="h-36 w-full border-b border-border/50"
                  imgClassName="group-hover:scale-105 transition-transform duration-300"
                  onPreview={() => setPreviewImageUrl(coverImageSrc)}
                />

                {/* 卡片正文（标题与轻量阶段标签 -> 描述 -> 独立产出条 -> 底部操作栏） */}
                <div className="p-3.5 sm:p-4 flex-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <h3 className="text-[13.5px] sm:text-sm font-bold text-foreground tracking-tight group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors truncate">
                      {expertName}
                    </h3>
                    {expertScene && (
                      <span className="text-[10px] text-secondary bg-surface-raised border border-border/60 px-1.5 py-0.5 rounded font-normal shrink-0">
                        {expertScene}
                      </span>
                    )}
                  </div>
                  {expertDesc && (
                    <p className="text-[11.8px] text-secondary leading-relaxed line-clamp-2 min-h-[34px]">
                      {expertDesc}
                    </p>
                  )}

                  {/* 产出物独立胶囊条（仅在中文模式且有 deliver 时展示；英文模式隐藏） */}
                  {!isEn && expert.deliver ? (
                    <div
                      className="mt-auto text-[11px] text-secondary bg-[#fafbfc] dark:bg-surface-raised border border-border/40 rounded-[7px] px-2 py-1 truncate"
                      title={i18nService.t('builtinDeliverPrefix', { deliver: expert.deliver })}
                    >
                      {i18nService.t('builtinDeliverPrefix', { deliver: expert.deliver })}
                    </div>
                  ) : (
                    <div className="mt-auto" />
                  )}

                  {/* 底部动作栏：右侧并列【编辑】（空心次要按钮）与【使用】（实心主要按钮） */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(expert);
                      }}
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-border text-secondary hover:text-foreground hover:border-border/80 hover:bg-surface-raised active:scale-95 transition-all shrink-0 cursor-pointer shadow-2xs"
                    >
                      {i18nService.t('edit')}
                    </button>
                    <button
                      type="button"
                      disabled={hiringId !== null}
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartWork(expert);
                      }}
                      className="px-3 py-1 rounded-full text-[11px] font-semibold bg-foreground text-background hover:opacity-90 active:scale-95 transition-all shrink-0 cursor-pointer disabled:opacity-50 flex items-center justify-center shadow-2xs"
                    >
                      {hiringId === expert.id ? '...' : i18nService.t('builtinUseExpert')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 专家详细档案弹窗（1:1 原型左右双栏布局） ── */}
      {selectedExpert && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedExpert(null)}
          onEscape={() => setSelectedExpert(null)}
          overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-[#101218]/45 backdrop-blur-[3px] p-4 sm:p-6"
          className="w-full max-w-[1020px] max-h-[88vh] bg-surface border border-border rounded-[20px] shadow-[0_30px_80px_rgba(0,0,0,0.25)] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 text-left"
        >
          {/* 弹窗头部（1:1 原型内边距与排版：padding 22px 24px 18px） */}
          {(() => {
            const isEn = i18nService.getLanguage() === 'en';
            const modalExpertName = (isEn && selectedExpert.nameEn) ? selectedExpert.nameEn : selectedExpert.name;
            const modalScene = selectedExpert.scene ? getSceneLabel(selectedExpert.scene) : '';
            const subtitle = [selectedExpert.group, modalScene].filter(Boolean).join(' · ');
            return (
              <div className="flex items-start justify-between gap-3.5 px-6 pt-[22px] pb-[18px] border-b border-border shrink-0">
                <div>
                  <h3 className="text-[17px] font-bold tracking-tight text-foreground">{modalExpertName}</h3>
                  {subtitle && (
                    <p className="text-[12.5px] text-secondary mt-1 leading-normal">{subtitle}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedExpert(null)}
                  className="ml-auto w-[30px] h-[30px] rounded-full bg-[#f2f3f6] dark:bg-surface-raised text-secondary hover:text-foreground text-[15px] flex items-center justify-center cursor-pointer transition-colors shrink-0"
                >
                  ✕
                </button>
              </div>
            );
          })()}

          {/* 弹窗主体（左侧约 58% 黄金比例宽幅展台，右侧参数清单与开始做按钮） */}
          <div className="grid grid-cols-1 md:grid-cols-[1.28fr_0.92fr] overflow-y-auto">
            {/* 左侧整栏（宽幅封面图，短边完全展示，左右裁剪量大幅降低；支持点击放大查看原图） */}
            <div
              className="group/cover relative w-full h-full min-h-[320px] bg-surface-raised md:border-r border-border overflow-hidden flex items-center justify-center cursor-zoom-in"
              onClick={() => setPreviewImageUrl(getExpertCoverImage(selectedExpert))}
              title={i18nService.t('builtinViewHdImage')}
            >
              <CoverImageWithSkeleton
                src={getExpertCoverImage(selectedExpert)}
                alt={i18nService.getLanguage() === 'en' && selectedExpert.nameEn ? selectedExpert.nameEn : selectedExpert.name}
                className="w-full h-full"
                imgClassName="group-hover/cover:scale-[1.02] transition-transform duration-300"
              />
              {/* 浮动小放大镜指示胶囊 */}
              <div className="absolute right-3.5 bottom-3.5 z-10 opacity-85 group-hover/cover:opacity-100 transition-opacity bg-black/65 hover:bg-black/85 backdrop-blur-md text-white px-3 py-1 rounded-full text-[11px] font-medium flex items-center gap-1.5 shadow-md pointer-events-none">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                </svg>
                <span>{i18nService.t('builtinViewLargeImageButton')}</span>
              </div>
            </div>

            {/* 右侧业务参数列表与按钮 */}
            <div className="p-6 flex flex-col justify-between">
              <div className="space-y-0">
                <div className="flex gap-3 py-2.5 border-b border-dashed border-[#eef0f4] dark:border-border/60 text-[12.5px] leading-relaxed">
                  <span className="shrink-0 w-[34px] h-[20px] rounded-[5px] bg-[#f5f6f9] dark:bg-surface-raised text-secondary text-[11px] flex items-center justify-center mt-0.5 font-medium">
                    {i18nService.t('builtinPropUsage')}
                  </span>
                  <b className="font-normal text-foreground leading-relaxed break-words flex-1">
                    {(i18nService.getLanguage() === 'en' && selectedExpert.descriptionEn ? selectedExpert.descriptionEn : selectedExpert.description) || i18nService.t('builtinNoDescription')}
                  </b>
                </div>

                <div className="flex gap-3 py-2.5 border-b border-dashed border-[#eef0f4] dark:border-border/60 text-[12.5px] leading-relaxed">
                  <span className="shrink-0 w-[34px] h-[20px] rounded-[5px] bg-[#f5f6f9] dark:bg-surface-raised text-secondary text-[11px] flex items-center justify-center mt-0.5 font-medium">
                    {i18nService.t('builtinPropInput')}
                  </span>
                  <b className="font-normal text-foreground leading-relaxed break-words flex-1">
                    {selectedExpert.input || i18nService.t('builtinNoExtraInput')}
                  </b>
                </div>

                <div className="flex gap-3 py-2.5 border-b border-dashed border-[#eef0f4] dark:border-border/60 text-[12.5px] leading-relaxed">
                  <span className="shrink-0 w-[34px] h-[20px] rounded-[5px] bg-[#f5f6f9] dark:bg-surface-raised text-secondary text-[11px] flex items-center justify-center mt-0.5 font-medium">
                    {i18nService.t('builtinPropOutput')}
                  </span>
                  <b className="font-normal text-foreground leading-relaxed break-words flex-1">
                    {selectedExpert.output || i18nService.t('builtinStandardOutput')}
                  </b>
                </div>

                {(!i18nService.getLanguage().startsWith('en') || selectedExpert.deliver) && !i18nService.getLanguage().startsWith('en') && (
                  <div className="flex gap-3 py-2.5 border-b border-dashed border-[#eef0f4] dark:border-border/60 text-[12.5px] leading-relaxed">
                    <span className="shrink-0 w-[34px] h-[20px] rounded-[5px] bg-[#f5f6f9] dark:bg-surface-raised text-secondary text-[11px] flex items-center justify-center mt-0.5 font-medium">
                      {i18nService.t('builtinPropDeliver')}
                    </span>
                    <b className="font-semibold text-foreground leading-relaxed break-words flex-1">
                      {selectedExpert.deliver || i18nService.t('builtinDefaultDeliver')}
                    </b>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={hiringId !== null}
                onClick={() => {
                  const expertToStart = selectedExpert;
                  setSelectedExpert(null);
                  onStartWork(expertToStart);
                }}
                className="mt-6 w-full bg-[#14161c] hover:bg-black text-white dark:bg-primary dark:text-primary-foreground rounded-[11px] py-3 text-[13px] font-semibold transition-all cursor-pointer shadow-sm disabled:opacity-50 flex items-center justify-center"
              >
                {hiringId === selectedExpert.id ? i18nService.t('builtinStarting') : i18nService.t('builtinStartDoing')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── 高清封面大图原图预览灯箱（LightBox：点屏幕任意处或按 Esc 立即退出） ── */}
      {previewImageUrl && (
        <Modal
          isOpen={true}
          onClose={() => setPreviewImageUrl(null)}
          onEscape={() => setPreviewImageUrl(null)}
          onClick={() => setPreviewImageUrl(null)}
          overlayClassName="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 sm:p-8 cursor-zoom-out select-none"
          className="relative max-w-[95vw] max-h-[92vh] flex items-center justify-center outline-none cursor-zoom-out"
        >
          <div
            className="relative flex items-center justify-center max-w-full max-h-full cursor-zoom-out"
            onClick={() => setPreviewImageUrl(null)}
          >
            <img
              src={previewImageUrl}
              alt={i18nService.t('builtinHdCoverAlt')}
              className="max-w-[92vw] max-h-[88vh] object-contain rounded-xl shadow-2xl border border-white/20 select-none animate-in fade-in zoom-in-95 duration-200 cursor-zoom-out"
            />
            <button
              type="button"
              onClick={() => setPreviewImageUrl(null)}
              className="absolute -top-3 -right-3 sm:-top-4 sm:-right-4 w-9 h-9 rounded-full bg-black/75 hover:bg-black text-white border border-white/30 flex items-center justify-center cursor-pointer shadow-lg transition-transform hover:scale-105 text-base"
              title={i18nService.t('builtinLightBoxCloseTip')}
            >
              ✕
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default BuiltinExpertsSection;
