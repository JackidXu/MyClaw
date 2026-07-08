import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

import { agentService } from '../../services/agent';
import { i18nService } from '../../services/i18n';
import type { RootState } from '../../store';
import type { PresetAgent } from '../../types/agent';
import ComposeIcon from '../icons/ComposeIcon';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';
import WindowTitleBar from '../window/WindowTitleBar';
import AgentAvatarIcon from './AgentAvatarIcon';
import AgentCreateModal from './AgentCreateModal';
import AgentSettingsPanel from './AgentSettingsPanel';

interface AgentsViewProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  updateBadge?: React.ReactNode;
}

const DEPARTMENTS = ['全部', '设计部', '市场部', '组织部', '运营部', '商品部', 'IT部'];

const AgentsView: React.FC<AgentsViewProps> = ({
  isSidebarCollapsed,
  onToggleSidebar,
  onNewChat,
  updateBadge,
}) => {
  const isMac = window.electron.platform === 'darwin';
  const agents = useSelector((state: RootState) => state.agent.agents);
  const currentAgentId = useSelector((state: RootState) => state.agent.currentAgentId);
  const [presets, setPresets] = useState<PresetAgent[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [settingsAgentId, setSettingsAgentId] = useState<string | null>(null);
  const [addingPreset, setAddingPreset] = useState<string | null>(null);
  const [activeDept, setActiveDept] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    agentService.loadAgents();
    agentService.getPresets().then(setPresets);
  }, []);

  // Refresh presets when agents change (to update installed status)
  useEffect(() => {
    agentService.getPresets().then(setPresets);
  }, [agents]);

  const enabledAgents = agents.filter((a) => a.enabled && a.id !== 'main');

  // Filter agents and presets by selected department & search query
  const matchesSearch = (name?: string, title?: string, desc?: string, nickname?: string) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      name?.toLowerCase().includes(query) ||
      title?.toLowerCase().includes(query) ||
      desc?.toLowerCase().includes(query) ||
      nickname?.toLowerCase().includes(query)
    );
  };

  const filteredEnabledAgents = enabledAgents.filter((a) => {
    const matchesDept = activeDept === '全部' || a.department === activeDept;
    return matchesDept && matchesSearch(a.name, a.title, a.description, a.nickname);
  });

  const presetAgents = filteredEnabledAgents.filter((a) => a.source === 'preset');
  const customAgents = filteredEnabledAgents.filter((a) => a.source === 'custom');

  const filteredUninstalledPresets = presets.filter((p) => {
    const isUninstalled = !p.installed;
    const matchesDept = activeDept === '全部' || p.department === activeDept;
    return isUninstalled && matchesDept && matchesSearch(p.name, p.title, p.description, p.nickname);
  });

  const handleAddPreset = async (presetId: string) => {
    setAddingPreset(presetId);
    try {
      await agentService.addPreset(presetId);
    } finally {
      setAddingPreset(null);
    }
  };

  const handleStartWork = (agentId: string) => {
    agentService.switchAgent(agentId);
    if (onNewChat) {
      onNewChat();
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-background h-full">
      {/* Header */}
      <div className="draggable flex h-12 items-center justify-between px-4 border-b border-border shrink-0">
        <div className="flex items-center space-x-3 h-8">
          {isSidebarCollapsed && (
            <div className={`non-draggable flex items-center gap-1 ${isMac ? 'pl-[68px]' : ''}`}>
              <button
                type="button"
                onClick={onToggleSidebar}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-secondary hover:bg-surface-raised transition-colors"
              >
                <SidebarToggleIcon className="h-4 w-4" isCollapsed={true} />
              </button>
              <button
                type="button"
                onClick={onNewChat}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-secondary hover:bg-surface-raised transition-colors"
              >
                <ComposeIcon className="h-4 w-4" />
              </button>
              {updateBadge}
            </div>
          )}
          <h1 className="text-lg font-semibold text-foreground">
            AI 专家员工
          </h1>
        </div>
        <WindowTitleBar inline />
      </div>

      {/* Department Tabs & Search Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface shrink-0 gap-4">
        <div className="flex items-center space-x-2 overflow-x-auto [scrollbar-width:none] py-0.5">
          {DEPARTMENTS.map((dept) => (
            <button
              key={dept}
              onClick={() => setActiveDept(dept)}
              className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all whitespace-nowrap cursor-pointer ${
                activeDept === dept
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-secondary bg-surface-raised hover:bg-surface-raised/80 hover:text-foreground'
              }`}
            >
              {dept}
            </button>
          ))}
        </div>
        <div className="relative w-64 shrink-0">
          <input
            type="text"
            placeholder="搜索专家..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-full border border-border bg-surface-raised focus:outline-none focus:border-primary/50 focus:bg-background transition-all"
          />
          <MagnifyingGlassIcon className="absolute left-2.5 top-2 h-4 w-4 text-secondary/60" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable] bg-surface-raised/30">
        <div className="max-w-6xl mx-auto px-6 py-6">
          {/* Subtitle */}
          <p className="text-sm text-secondary mb-6">
            召唤 AI 专家加入你的团队，每个人都有自己的绝活
          </p>

          {/* Preset Agents Section */}
          {(presetAgents.length > 0 || filteredUninstalledPresets.length > 0) && (
            <div className="mb-8">
              <h2 className="text-sm font-medium text-secondary mb-4 border-l-2 border-primary pl-2">
                内置专家员工
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {/* Installed presets */}
                {presetAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    icon={agent.icon}
                    name={agent.name}
                    nickname={agent.nickname}
                    title={agent.title}
                    description={agent.description}
                    level={agent.level}
                    tags={agent.tags}
                    isActive={agent.id === currentAgentId}
                    onClick={() => setSettingsAgentId(agent.id)}
                    onStartWork={() => handleStartWork(agent.id)}
                  />
                ))}
                {/* Uninstalled presets */}
                {filteredUninstalledPresets.map((preset) => {
                  const isEn = i18nService.getLanguage() === 'en';
                  return (
                    <UninstalledPresetCard
                      key={preset.id}
                      icon={preset.icon}
                      name={isEn && preset.nameEn ? preset.nameEn : preset.name}
                      nickname={isEn && preset.nicknameEn ? preset.nicknameEn : preset.nickname}
                      title={isEn && preset.titleEn ? preset.titleEn : preset.title}
                      description={isEn && preset.descriptionEn ? preset.descriptionEn : preset.description}
                      level={preset.level}
                      tags={preset.tags}
                      isAdding={addingPreset === preset.id}
                      onAdd={() => handleAddPreset(preset.id)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom Agents Section */}
          <div>
            <h2 className="text-sm font-medium text-secondary mb-4 border-l-2 border-primary pl-2">
              我雇佣的自定义员工
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {customAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  icon={agent.icon}
                  name={agent.name}
                  nickname={agent.nickname}
                  title={agent.title}
                  description={agent.description}
                  level={agent.level}
                  tags={agent.tags}
                  isActive={agent.id === currentAgentId}
                  onClick={() => setSettingsAgentId(agent.id)}
                  onStartWork={() => handleStartWork(agent.id)}
                />
              ))}
              {/* Create new agent card */}
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-all min-h-[220px] cursor-pointer"
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center bg-primary/10">
                  <PlusIcon className="h-6 w-6 text-primary" />
                </div>
                <span className="text-sm font-semibold text-primary">
                  创建新的自定义员工
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AgentCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        source="agents_view"
      />
      <AgentSettingsPanel
        agentId={settingsAgentId}
        onClose={() => setSettingsAgentId(null)}
      />
    </div>
  );
};

/* ── Level Badge Helper ─────────────────────────── */
const LevelBadge: React.FC<{ level: string }> = ({ level }) => {
  const getStyle = () => {
    switch (level) {
      case '高级':
        return 'text-amber-600 bg-amber-50 border-amber-200';
      case '中级':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case '初级':
      default:
        return 'text-purple-600 bg-purple-50 border-purple-200';
    }
  };

  const getLabel = () => {
    switch (level) {
      case '高级':
        return 'P7';
      case '中级':
        return 'P6';
      case '初级':
      default:
        return 'P5';
    }
  };

  return (
    <span className={`absolute top-4 right-4 px-2 py-0.5 text-[10px] font-bold rounded-lg border uppercase tracking-wider ${getStyle()}`}>
      {getLabel()}
    </span>
  );
};

/* ── Agent Card (installed) ─────────────────────────── */

const AgentCard: React.FC<{
  icon: string;
  name: string;
  nickname?: string;
  title?: string;
  description: string;
  level?: string;
  tags?: string[];
  isActive: boolean;
  onClick: () => void;
  onStartWork: () => void;
}> = ({ icon, name, nickname, title, description, level, tags, isActive, onClick, onStartWork }) => (
  <div
    className={`group flex flex-col items-center p-6 rounded-2xl border text-center transition-all min-h-[260px] bg-background hover:shadow-lg hover:border-primary relative cursor-pointer ${
      isActive ? 'border-primary shadow-sm bg-primary/[0.02]' : 'border-border'
    }`}
  >
    <LevelBadge level={level || '中级'} />

    {/* Avatar with Gradient border */}
    <div className="w-20 h-20 rounded-full p-0.5 bg-gradient-to-tr from-primary/30 to-primary/80 flex items-center justify-center mb-4 shrink-0 shadow-sm transition-transform group-hover:scale-105">
      <div className="w-full h-full rounded-full overflow-hidden bg-background flex items-center justify-center">
        <AgentAvatarIcon
          value={icon}
          className="h-full w-full object-cover"
          iconClassName="h-8 w-8"
          legacyClassName="text-3xl"
        />
      </div>
    </div>

    {/* Info */}
    <div className="min-w-0 w-full flex-1 flex flex-col items-center">
      <div className="text-base font-bold text-foreground truncate max-w-[90%] transition-colors group-hover:text-primary">
        {nickname || name}
      </div>
      {(title || name) && (
        <div className="inline-block px-2.5 py-0.5 text-[10px] font-semibold rounded-full bg-primary/10 text-primary border border-primary/20 mt-1.5 mb-3 uppercase tracking-wide group-hover:bg-primary group-hover:text-white group-hover:border-transparent transition-all">
          {title || name}
        </div>
      )}

      {/* Description & Action hover transition container */}
      <div className="w-full h-12 relative overflow-hidden shrink-0">
        {/* Description - default state */}
        <div className="absolute inset-0 flex items-center justify-center transition-all duration-200 group-hover:translate-y-10 group-hover:opacity-0">
          {description && (
            <p className="text-xs text-secondary line-clamp-2 px-1 leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {/* Actions - hover state */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 translate-y-10 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStartWork();
            }}
            className="flex-1 h-9 text-xs font-semibold rounded-xl bg-primary text-white hover:bg-primary-hover shadow-sm transition-all cursor-pointer"
          >
            开始干活
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="px-3 h-9 text-xs font-medium rounded-xl bg-surface-raised text-secondary hover:text-foreground border border-border hover:bg-surface-raised/80 transition-all cursor-pointer"
          >
            设置
          </button>
        </div>
      </div>

      {/* Tags */}
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1 mt-3 transition-opacity group-hover:opacity-0">
          {tags.slice(0, 3).map((tag, idx) => (
            <span key={idx} className="text-[9px] bg-surface-raised text-secondary px-2 py-0.5 rounded-md border border-border/50 font-medium">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  </div>
);

/* ── Uninstalled Preset Card ─────────────────────────── */

const UninstalledPresetCard: React.FC<{
  icon: string;
  name: string;
  nickname?: string;
  title?: string;
  description: string;
  level?: string;
  tags?: string[];
  isAdding: boolean;
  onAdd: () => void;
}> = ({ icon, name, nickname, title, description, level, tags, isAdding, onAdd }) => (
  <div className="group flex flex-col items-center p-6 rounded-2xl border border-dashed border-border opacity-85 hover:opacity-100 bg-background/50 hover:bg-background transition-all min-h-[260px] relative text-center cursor-pointer hover:border-primary hover:shadow-lg">
    <LevelBadge level={level || '中级'} />

    {/* Avatar */}
    <div className="w-20 h-20 rounded-full p-0.5 bg-gradient-to-tr from-secondary/20 to-secondary/50 flex items-center justify-center mb-4 shrink-0 shadow-sm transition-transform group-hover:scale-105 group-hover:from-primary/30 group-hover:to-primary/80">
      <div className="w-full h-full rounded-full overflow-hidden bg-background flex items-center justify-center">
        <AgentAvatarIcon
          value={icon}
          className="h-full w-full object-cover opacity-80 group-hover:opacity-100"
          iconClassName="h-8 w-8"
          legacyClassName="text-3xl"
        />
      </div>
    </div>

    {/* Info */}
    <div className="min-w-0 w-full flex-1 flex flex-col items-center">
      <div className="text-base font-bold text-foreground/80 truncate max-w-[90%] transition-colors group-hover:text-primary">
        {nickname || name}
      </div>
      {(title || name) && (
        <div className="inline-block px-2.5 py-0.5 text-[10px] font-semibold rounded-full bg-secondary/10 text-secondary border border-border mt-1.5 mb-3 uppercase tracking-wide group-hover:bg-primary group-hover:text-white group-hover:border-transparent transition-all">
          {title || name}
        </div>
      )}

      {/* Description & Action hover transition container */}
      <div className="w-full h-12 relative overflow-hidden shrink-0">
        {/* Description - default state */}
        <div className="absolute inset-0 flex items-center justify-center transition-all duration-200 group-hover:translate-y-10 group-hover:opacity-0">
          {description && (
            <p className="text-xs text-secondary/80 line-clamp-2 px-1 leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {/* Actions - hover state */}
        <div className="absolute inset-0 flex items-center justify-center translate-y-10 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            disabled={isAdding}
            className="w-full h-9 text-xs font-semibold rounded-xl bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition-all shadow-sm cursor-pointer"
          >
            {isAdding ? '正在召唤...' : '召唤专家'}
          </button>
        </div>
      </div>

      {/* Tags */}
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1 mt-3 transition-opacity group-hover:opacity-0">
          {tags.slice(0, 3).map((tag, idx) => (
            <span key={idx} className="text-[9px] bg-surface-raised/50 text-secondary/80 px-2 py-0.5 rounded-md border border-border/30 font-medium">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  </div>
);

export default AgentsView;
