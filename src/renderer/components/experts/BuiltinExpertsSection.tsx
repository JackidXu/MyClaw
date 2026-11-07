import React, { useMemo, useState } from 'react';

import Modal from '../common/Modal';
import { ENGINE_CONFIGS, ExpertEngineType, getExpertCoverImage } from './builtinExpertData';
import type { PresetAgent } from './ExpertsView';

interface BuiltinExpertsSectionProps {
  presets: PresetAgent[];
  searchQuery: string;
  hiringId: string | null;
  onStartWork: (expert: PresetAgent, initialPrompt?: string) => void;
}

const BuiltinExpertsSection: React.FC<BuiltinExpertsSectionProps> = ({
  presets,
  searchQuery,
  hiringId,
  onStartWork,
}) => {
  const [activeEngine, setActiveEngine] = useState<ExpertEngineType>(ExpertEngineType.Acquisition);
  const [activeScene, setActiveScene] = useState<string>('全部');
  const [selectedExpert, setSelectedExpert] = useState<PresetAgent | null>(null);

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
                  {acquisitionExperts.length} 位专家 · 定位 → 起盘 → 日常生产
                </span>
                <span
                  className={`font-semibold ${
                    isSelected ? 'text-amber-600 dark:text-amber-400' : 'text-secondary/70'
                  }`}
                >
                  {isSelected ? '正在看 →' : '切换 →'}
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
                  {conversionExperts.length} 位专家 · 破冰 → 挖需 → 报价 → 签约
                </span>
                <span
                  className={`font-semibold ${
                    isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-secondary/70'
                  }`}
                >
                  {isSelected ? '正在看 →' : '切换 →'}
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
                {sceneName === '全部' ? '全部专家' : sceneName}
              </button>
            );
          })}
        </div>
        <div className="text-xs text-secondary font-medium shrink-0 ml-auto">
          {filteredList.length} 位专家
        </div>
      </div>

      {/* ── 专家卡片网格列表 ── */}
      {filteredList.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center text-secondary">
          <p className="text-sm font-medium">该分类下暂无专家，可在管理后台进行配置</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 min-[1100px]:grid-cols-3 min-[1400px]:grid-cols-4 gap-4">
          {filteredList.map((expert) => {
            const coverImageSrc = getExpertCoverImage(expert);

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
                {/* 封面图片展示区（带兜底封面图，有 scene 时展示微标签） */}
                <div className="relative h-36 w-full overflow-hidden bg-surface-raised border-b border-border/50">
                  <img
                    src={coverImageSrc}
                    alt={expert.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {expert.scene && (
                    <span className="absolute left-2.5 top-2.5 text-[10.5px] font-bold px-2 py-0.5 rounded-md border backdrop-blur-md shadow-2xs z-10 text-amber-700 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-950/60 border-amber-200/80 dark:border-amber-800">
                      {expert.scene}
                    </span>
                  )}
                </div>

                {/* 卡片正文（1:1 原型布局：标题 -> 描述 -> 独立产出条 -> 看示例） */}
                <div className="p-3.5 sm:p-4 flex-1 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-[13.5px] sm:text-sm font-bold text-foreground tracking-tight group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                      {expert.name}
                    </h3>
                  </div>
                  {expert.description && (
                    <p className="text-[11.8px] text-secondary leading-relaxed line-clamp-2 min-h-[34px]">
                      {expert.description}
                    </p>
                  )}

                  {/* 产出物独立胶囊条（完整展示不截断） */}
                  {expert.deliver ? (
                    <div
                      className="mt-auto text-[11px] text-secondary bg-[#fafbfc] dark:bg-surface-raised border border-border/40 rounded-[7px] px-2 py-1 truncate"
                      title={`产出 · ${expert.deliver}`}
                    >
                      产出 · {expert.deliver}
                    </div>
                  ) : (
                    <div className="mt-auto" />
                  )}

                  {/* 查看动作文案（原型文案：看示例 →） */}
                  <div className="text-[11.5px] font-semibold text-amber-600 dark:text-amber-400 text-left pt-0.5 group-hover:translate-x-0.5 transition-transform">
                    看示例 →
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
          overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-[#101218]/45 backdrop-blur-[3px] p-6"
          className="w-full max-w-[860px] max-h-[88vh] bg-surface border border-border rounded-[20px] shadow-[0_30px_80px_rgba(0,0,0,0.25)] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 text-left"
        >
          {/* 弹窗头部（1:1 原型内边距与排版：padding 22px 24px 18px） */}
          {(() => {
            const subtitle = [selectedExpert.group, selectedExpert.scene].filter(Boolean).join(' · ');
            return (
              <div className="flex items-start justify-between gap-3.5 px-6 pt-[22px] pb-[18px] border-b border-border shrink-0">
                <div>
                  <h3 className="text-[17px] font-bold tracking-tight text-foreground">{selectedExpert.name}</h3>
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

          {/* 弹窗主体（左右 1:1 对半分，分割线居中；左侧封面图铺满） */}
          <div className="grid grid-cols-1 md:grid-cols-2 overflow-y-auto">
            {/* 左侧整栏（封面图满幅铺满，短边完全展示，长边居中裁剪） */}
            <div className="relative w-full h-full min-h-[300px] bg-surface-raised md:border-r border-border overflow-hidden flex items-center justify-center">
              <img
                src={getExpertCoverImage(selectedExpert)}
                alt={selectedExpert.name}
                className="w-full h-full object-cover"
              />
            </div>

            {/* 右侧业务参数列表与按钮 */}
            <div className="p-6 flex flex-col justify-between">
              <div className="space-y-0">
                <div className="flex gap-3 py-2.5 border-b border-dashed border-[#eef0f4] dark:border-border/60 text-[12.5px] leading-relaxed">
                  <span className="shrink-0 w-[34px] h-[20px] rounded-[5px] bg-[#f5f6f9] dark:bg-surface-raised text-secondary text-[11px] flex items-center justify-center mt-0.5 font-medium">
                    用途
                  </span>
                  <b className="font-normal text-foreground leading-relaxed break-words flex-1">
                    {selectedExpert.description || '暂无描述'}
                  </b>
                </div>

                <div className="flex gap-3 py-2.5 border-b border-dashed border-[#eef0f4] dark:border-border/60 text-[12.5px] leading-relaxed">
                  <span className="shrink-0 w-[34px] h-[20px] rounded-[5px] bg-[#f5f6f9] dark:bg-surface-raised text-secondary text-[11px] flex items-center justify-center mt-0.5 font-medium">
                    输入
                  </span>
                  <b className="font-normal text-foreground leading-relaxed break-words flex-1">
                    {selectedExpert.input || '无需额外输入'}
                  </b>
                </div>

                <div className="flex gap-3 py-2.5 border-b border-dashed border-[#eef0f4] dark:border-border/60 text-[12.5px] leading-relaxed">
                  <span className="shrink-0 w-[34px] h-[20px] rounded-[5px] bg-[#f5f6f9] dark:bg-surface-raised text-secondary text-[11px] flex items-center justify-center mt-0.5 font-medium">
                    输出
                  </span>
                  <b className="font-normal text-foreground leading-relaxed break-words flex-1">
                    {selectedExpert.output || '标准工作成果'}
                  </b>
                </div>

                <div className="flex gap-3 py-2.5 border-b border-dashed border-[#eef0f4] dark:border-border/60 text-[12.5px] leading-relaxed">
                  <span className="shrink-0 w-[34px] h-[20px] rounded-[5px] bg-[#f5f6f9] dark:bg-surface-raised text-secondary text-[11px] flex items-center justify-center mt-0.5 font-medium">
                    交付
                  </span>
                  <b className="font-semibold text-foreground leading-relaxed break-words flex-1">
                    {selectedExpert.deliver || '文档 / 方案'}
                  </b>
                </div>
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
                {hiringId === selectedExpert.id ? '正在启动...' : '开始做 →'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default BuiltinExpertsSection;
