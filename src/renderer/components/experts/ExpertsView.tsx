import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { agentService } from '../../services/agent';
import { coworkService } from '../../services/cowork';
import { i18nService } from '../../services/i18n';
import { RootState } from '../../store';
import { setDraftPrompt } from '../../store/slices/coworkSlice';
import type { ExpertTeam } from '../../types/expertTeam';
import AgentAvatarIcon from '../agent/AgentAvatarIcon';
import AgentCreateModal from '../agent/AgentCreateModal';
import AgentSettingsPanel from '../agent/AgentSettingsPanel';
import Modal from '../common/Modal';
import ComposeIcon from '../icons/ComposeIcon';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';
import McpManager from '../mcp/McpManager';
import SkillsManager from '../skills/SkillsManager';

interface PresetAgent {
  id: string;
  name: string;
  avatar?: string;
  description: string;
  identity?: string;
  level?: '高级' | '中级' | '初级';
  department?: string;
  author?: string;
  tags?: string[];
  helps?: string[];
}

interface ExpertsViewProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  updateBadge?: React.ReactNode;
}

const ExpertsView: React.FC<ExpertsViewProps> = ({
  isSidebarCollapsed,
  onToggleSidebar,
  onNewChat,
  updateBadge,
}) => {
  const [selectedDept, setSelectedDept] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [presets, setPresets] = useState<PresetAgent[]>([]);
  const [expertTeams, setExpertTeams] = useState<ExpertTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [hiringId, setHiringId] = useState<string | null>(null);

  // 一级 Tab：专家团 / 专家 / 技能库 / MCP
  const [activeTab, setActiveTab] = useState<'teams' | 'experts' | 'skills' | 'mcp'>('teams');

  // 专家 Tab 内子 Tab：内置 / 我的
  const [expertSubTab, setExpertSubTab] = useState<'preset' | 'custom'>('preset');

  // 专家团详情模态弹窗状态（仅用于专家团）
  const [selectedTeamDetail, setSelectedTeamDetail] = useState<ExpertTeam | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [agentToDelete, setAgentToDelete] = useState<any | null>(null);

  const dispatch = useDispatch();
  const installedAgents = useSelector((state: RootState) => state.agent.agents);
  const currentAgentId = useSelector((state: RootState) => state.agent.currentAgentId);
  const isMac = window.electron.platform === 'darwin';
  const isWindows = window.electron.platform === 'win32';

  // 初始化拉取内置专家列表 + 专家团列表
  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      try {
        setLoading(true);
        const [presetsData, teamsData] = await Promise.all([
          window.electron.agents.presetTemplates(),
          window.electron.agents.getExpertTeams(),
        ]);
        if (active) {
          setPresets(presetsData);
          setExpertTeams(teamsData);
        }
      } catch (err) {
        console.error('[ExpertsView] Failed to load data:', err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void fetchData();
    return () => {
      active = false;
    };
  }, []);

  // 自定义专家列表
  const customExperts = useMemo(() => {
    return installedAgents.filter((a) => a.source === 'custom' && a.id !== 'main');
  }, [installedAgents]);

  // 当前专家 Tab 展示的部门分类
  const departments = useMemo(() => {
    const set = new Set<string>();
    const list = activeTab === 'experts' && expertSubTab === 'preset' ? presets : [];
    list.forEach((p: any) => {
      if (p.department && p.department.trim()) {
        set.add(p.department.trim());
      }
    });
    const result = Array.from(set);
    return result.length > 0 ? ['全部', ...result] : [];
  }, [activeTab, expertSubTab, presets]);

  // 内置专家过滤
  const filteredPresets = useMemo(() => {
    return presets.filter((expert) => {
      const matchDept = selectedDept === '全部' || expert.department === selectedDept;
      const matchSearch =
        expert.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        expert.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (expert.identity && expert.identity.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchDept && matchSearch;
    });
  }, [presets, selectedDept, searchQuery]);

  // 自定义专家过滤
  const filteredCustom = useMemo(() => {
    return customExperts.filter((expert) => {
      const matchSearch =
        expert.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        expert.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (expert.identity && expert.identity.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchSearch;
    });
  }, [customExperts, searchQuery]);

  // 专家团过滤
  const filteredTeams = useMemo(() => {
    return expertTeams.filter((team) => {
      const matchSearch =
        team.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        team.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchSearch;
    });
  }, [expertTeams, searchQuery]);

  // 点击"开始干活"（支持可选携带 initialPrompt 自动填入输入框）
  const handleStartWork = async (expert: PresetAgent | ExpertTeam | any, initialPrompt?: string) => {
    try {
      setHiringId(expert.id);

      // 检查该专家是否已被添加（聘用）
      let installed = installedAgents.find(
        (a) => a.presetId === expert.id || a.id === expert.id
      );

      if (!installed) {
        installed = await window.electron.agents.addPreset(expert.id);
        await agentService.loadAgents();
      } else if (!installed.enabled) {
        await agentService.updateAgent(installed.id, { enabled: true });
        await agentService.loadAgents();
        const latestList = await window.electron.agents.list();
        installed = latestList.find(
          (a: any) => a.presetId === expert.id || a.id === expert.id
        );
      }

      if (installed) {
        agentService.switchAgent(installed.id);
        await coworkService.loadSessions(installed.id);
        coworkService.clearSession({ restoreAgentSkills: true });

        if (selectedTeamDetail) {
          setSelectedTeamDetail(null);
        }

        if (onNewChat) {
          onNewChat();
        }

        // 如果传入了引导问题，将其填入输入框草稿并聚焦到末尾
        if (initialPrompt && initialPrompt.trim()) {
          const trimmedPrompt = initialPrompt.trim();
          dispatch(setDraftPrompt({
            sessionId: '__home__',
            draft: trimmedPrompt,
          }));
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('cowork:focus-input', {
              detail: { clear: false, text: trimmedPrompt, resetCollaborationMode: true },
            }));
          }, 50);
        }
      }
    } catch (err) {
      console.error('[ExpertsView] Failed to start work with expert:', err);
    } finally {
      setHiringId(null);
    }
  };

  const handleTabChange = (tab: 'teams' | 'experts' | 'skills' | 'mcp') => {
    setActiveTab(tab);
    setSelectedDept('全部');
    setSearchQuery('');
  };

  return (
    <div className="flex-1 flex flex-col bg-background h-full overflow-hidden">
      {/* 头部导航标题/页签 */}
      <div className="draggable flex h-12 items-center justify-between px-4 border-b border-border shrink-0">
        <div className="flex items-center space-x-3 h-8">
          {isSidebarCollapsed && !isWindows && (
            <div className={`non-draggable flex items-center gap-1 ${isMac ? 'pl-[68px]' : ''}`}>
              <button
                type="button"
                onClick={onToggleSidebar}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-secondary hover:bg-surface-raised transition-colors"
                title="展开侧边栏"
              >
                <SidebarToggleIcon className="h-4 w-4" isCollapsed={true} />
              </button>
              <button
                type="button"
                onClick={onNewChat}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-secondary hover:bg-surface-raised transition-colors"
                title="新建对话"
              >
                <ComposeIcon className="h-4 w-4" />
              </button>
              {updateBadge}
            </div>
          )}

          {/* 顶层页签：专家团 / 专家 / 技能库 / MCP */}
          <div className="non-draggable flex items-center space-x-4 h-8 text-[13.5px] font-semibold select-none">
            <button
              type="button"
              onClick={() => handleTabChange('teams')}
              className={`relative py-1 transition-colors focus:outline-none cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'teams'
                  ? 'text-foreground font-semibold'
                  : 'text-secondary hover:text-foreground font-medium'
              }`}
            >
              <span>{i18nService.t('expertTabTeams')}</span>
              <span className="text-[9.5px] font-bold text-white bg-amber-500 px-1.5 py-0.5 rounded-full leading-none">
                NEW
              </span>
              <div
                className={`absolute bottom-[-10px] left-0 right-0 h-0.5 rounded-full transition-colors ${
                  activeTab === 'teams' ? 'bg-primary' : 'bg-transparent'
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('experts')}
              className={`relative py-1 transition-colors focus:outline-none cursor-pointer ${
                activeTab === 'experts'
                  ? 'text-foreground font-semibold'
                  : 'text-secondary hover:text-foreground font-medium'
              }`}
            >
              {i18nService.t('expertTabExperts')}
              <div
                className={`absolute bottom-[-10px] left-0 right-0 h-0.5 rounded-full transition-colors ${
                  activeTab === 'experts' ? 'bg-primary' : 'bg-transparent'
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('skills')}
              className={`relative py-1 transition-colors focus:outline-none cursor-pointer ${
                activeTab === 'skills'
                  ? 'text-foreground font-semibold'
                  : 'text-secondary hover:text-foreground font-medium'
              }`}
            >
              技能库
              <div
                className={`absolute bottom-[-10px] left-0 right-0 h-0.5 rounded-full transition-colors ${
                  activeTab === 'skills' ? 'bg-primary' : 'bg-transparent'
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('mcp')}
              className={`relative py-1 transition-colors focus:outline-none cursor-pointer ${
                activeTab === 'mcp'
                  ? 'text-foreground font-semibold'
                  : 'text-secondary hover:text-foreground font-medium'
              }`}
            >
              MCP
              <div
                className={`absolute bottom-[-10px] left-0 right-0 h-0.5 rounded-full transition-colors ${
                  activeTab === 'mcp' ? 'bg-primary' : 'bg-transparent'
                }`}
              />
            </button>
          </div>
        </div>

        {/* 右上角搜索框和创建按钮 */}
        {(activeTab === 'teams' || activeTab === 'experts') && (
          <div className="non-draggable flex items-center space-x-3">
            <div className="relative">
              <input
                type="text"
                placeholder={activeTab === 'teams' ? '搜索专家团...' : '搜索专家...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 pl-8 pr-3 py-1.5 rounded-lg border border-border bg-surface text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary"
              />
              <svg
                className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-secondary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            {activeTab === 'experts' && expertSubTab === 'custom' && (
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-surface hover:bg-secondary/10 text-foreground border border-border text-xs font-semibold rounded-lg shadow-xs transition-all duration-200 cursor-pointer"
              >
                <svg className="h-3.5 w-3.5 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>创建专家</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 专家 Tab 内：内置 / 我的 子 Tab 栏 + 部门过滤 */}
      {activeTab === 'experts' && (
        <div className="border-b border-border bg-surface shrink-0 py-2.5 px-6 flex flex-col gap-2.5">
          <div className="flex bg-secondary/10 p-0.5 rounded-lg w-fit select-none">
            <button
              type="button"
              onClick={() => { setExpertSubTab('preset'); setSelectedDept('全部'); }}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                expertSubTab === 'preset'
                  ? 'bg-surface text-foreground shadow-xs'
                  : 'text-secondary hover:text-foreground'
              }`}
            >
              {i18nService.t('expertSubTabPreset')}
              {presets.length > 0 && (
                <span className="ml-1.5 text-[10px] text-secondary">{presets.length}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { setExpertSubTab('custom'); setSelectedDept('全部'); }}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                expertSubTab === 'custom'
                  ? 'bg-surface text-foreground shadow-xs'
                  : 'text-secondary hover:text-foreground'
              }`}
            >
              {i18nService.t('expertSubTabCustom')}
              {customExperts.length > 0 && (
                <span className="ml-1.5 text-[10px] text-secondary">{customExperts.length}</span>
              )}
            </button>
          </div>

          {/* 部门/分类过滤标签 */}
          {expertSubTab === 'preset' && departments.length > 0 && (
            <div className="overflow-x-auto scrollbar-hidden">
              <div className="flex space-x-2.5">
                {departments.map((dept) => {
                  const isSelected = selectedDept === dept;
                  return (
                    <button
                      key={dept}
                      type="button"
                      onClick={() => setSelectedDept(dept)}
                      className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 cursor-pointer ${
                        isSelected
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : 'bg-surface-raised hover:bg-secondary/10 text-secondary hover:text-foreground'
                      }`}
                    >
                      {dept}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 主体渲染区 */}
      {activeTab === 'skills' ? (
        <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable] bg-background">
          <div className="mx-auto w-full max-w-[1120px] px-6 py-6">
            <SkillsManager />
          </div>
        </div>
      ) : activeTab === 'mcp' ? (
        <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable] bg-background">
          <div className="mx-auto w-full max-w-[1120px] px-6 py-6">
            <McpManager />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable] bg-surface-raised/40">
          <div className="mx-auto w-full max-w-[1240px] px-6 py-6">
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
              </div>
            ) : activeTab === 'teams' ? (
              /* ── 专家团 Hero 卡片列表 ── */
              filteredTeams.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center text-secondary">
                  <p className="text-sm font-medium">{i18nService.t('noExpertTeams')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredTeams.map((team) => (
                    <HeroTeamCard
                      key={team.id}
                      team={team}
                      presetExperts={presets}
                      hiringId={hiringId}
                      onStartWork={handleStartWork}
                      onClick={() => setSelectedTeamDetail(team)}
                    />
                  ))}
                </div>
              )
            ) : expertSubTab === 'preset' ? (
              /* ── 内置专家横排卡片列表（无弹窗，直接召唤） ── */
              filteredPresets.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center text-secondary">
                  <p className="text-sm font-medium">该分类下没有专家</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredPresets.map((expert) => (
                    <PrototypeExpertCard
                      key={expert.id}
                      expert={expert}
                      hiringId={hiringId}
                      isCustom={false}
                      onStartWork={handleStartWork}
                    />
                  ))}
                </div>
              )
            ) : (
              /* ── 我的（自定义）专家列表 ── */
              filteredCustom.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center text-secondary">
                  <p className="text-sm font-medium">还没有自定义专家</p>
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(true)}
                    className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold cursor-pointer hover:opacity-90 transition-opacity"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    创建第一个专家
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* 新增专家虚线引导卡片 */}
                  <div
                    onClick={() => setIsCreateOpen(true)}
                    className="flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 border-dashed border-border hover:border-primary/60 hover:bg-primary/5 transition-all min-h-[140px] cursor-pointer text-center group"
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-surface border border-border group-hover:border-primary group-hover:text-primary transition-colors text-secondary text-xl font-light">
                      +
                    </div>
                    <div className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                      新增专家
                    </div>
                    <div className="text-xs text-secondary">创建属于你自己的专属专家</div>
                  </div>

                  {filteredCustom.map((expert) => (
                    <PrototypeExpertCard
                      key={expert.id}
                      expert={expert as any}
                      hiringId={hiringId}
                      isCustom={true}
                      onStartWork={handleStartWork}
                      onEdit={() => setEditingAgentId(expert.id)}
                      onDelete={() => setAgentToDelete(expert)}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* 专家团详情弹窗（仅点击专家团卡片打开） */}
      {selectedTeamDetail && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedTeamDetail(null)}
          className="w-[620px] max-w-[92vw] max-h-[86vh] bg-surface border border-border p-6 rounded-2xl shadow-xl overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="flex items-start gap-4 pr-6 pb-5 border-b border-border/60">
            <AgentAvatarIcon
              avatar={selectedTeamDetail.avatar}
              className="h-16 w-16 rounded-full shadow-xs shrink-0 ring-2 ring-background ring-offset-2"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground truncate">
                  {selectedTeamDetail.name}
                </h2>
                <span className="text-[10px] font-bold text-white bg-amber-500 px-2 py-0.5 rounded-full">
                  专家团
                </span>
              </div>
              <div className="text-xs text-secondary mt-1">
                作者 · {selectedTeamDetail.author || '黑墙'}
                {selectedTeamDetail.usesCount && (
                  <span className="ml-3">{selectedTeamDetail.usesCount} 次使用</span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleStartWork(selectedTeamDetail)}
              disabled={hiringId !== null}
              className="px-5 py-2.5 rounded-xl bg-foreground text-background text-xs font-bold hover:opacity-90 active:scale-95 transition-all cursor-pointer shrink-0 disabled:opacity-50"
            >
              {hiringId === selectedTeamDetail.id ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-background border-t-transparent"></div>
              ) : (
                '🪄 召唤专家团'
              )}
            </button>
          </div>

          <div className="py-5 space-y-5">
            <div>
              <div className="text-xs font-bold text-amber-600 tracking-wider uppercase mb-1.5">
                团队技能定位
              </div>
              <p className="text-sm text-foreground/90 leading-relaxed text-justify">
                {selectedTeamDetail.description}
              </p>
            </div>

            {/* 标签 */}
            {selectedTeamDetail.tags && selectedTeamDetail.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedTeamDetail.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-2.5 py-0.5 rounded-lg"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* 1. 专家帮你做（参考原型先展示，点击直接带入问题进入对话） */}
            {selectedTeamDetail.helps && selectedTeamDetail.helps.length > 0 && (
              <div>
                <div className="text-xs font-bold text-foreground border-l-2 border-amber-500 pl-2 mb-2">
                  专家帮你做
                </div>
                <div className="space-y-2">
                  {selectedTeamDetail.helps.map((item: string, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-xl bg-surface-raised border border-border hover:border-amber-500/50 hover:bg-amber-500/[0.04] transition-all cursor-pointer group"
                      onClick={() => handleStartWork(selectedTeamDetail, item)}
                    >
                      <div className="flex items-center gap-2 text-xs text-foreground">
                        <span className="text-amber-500">💬</span>
                        <span>{item}</span>
                      </div>
                      <span className="text-secondary group-hover:text-amber-600 transition-colors text-xs font-bold">
                        →
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 2. 团队协同专家阵容 */}
            {(() => {
              const teamMembers = (selectedTeamDetail.subagentAllowAgentIds || [])
                .map((id) => presets.find((e) => e.id === id))
                .filter(Boolean) as PresetAgent[];
              if (teamMembers.length === 0) return null;
              return (
                <div>
                  <div className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-2.5">
                    <span>👥 团队协同专家阵容</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {teamMembers.map((member, idx) => (
                      <div
                        key={member.id}
                        className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-raised border border-border/60"
                      >
                        <AgentAvatarIcon
                          avatar={member.avatar}
                          className="w-8 h-8 rounded-full shadow-xs shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-foreground truncate flex items-center gap-1">
                            <span>{member.name}</span>
                            {idx === 0 && (
                              <span className="text-[9px] bg-amber-500 text-white px-1 py-0.2 rounded-xs font-normal">主理</span>
                            )}
                          </div>
                          <div className="text-[10px] text-secondary truncate">
                            {member.department || '内置专家'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </Modal>
      )}

      {/* 创建专家弹窗 */}
      <AgentCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        source="home_agent_sidebar"
      />

      {/* 编辑专家设置面板 */}
      <AgentSettingsPanel
        agentId={editingAgentId}
        onClose={() => setEditingAgentId(null)}
      />

      {/* 删除专家确认弹窗 */}
      <Modal
        isOpen={!!agentToDelete}
        onClose={() => setAgentToDelete(null)}
        className="w-[320px] bg-surface border border-border p-5 rounded-xl shadow-2xl flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="w-10 h-10 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-3">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">确定要删除该自定义专家吗？</h3>
        <p className="text-xs text-secondary mb-5 max-w-[240px] truncate">
          {agentToDelete?.name}
        </p>
        <div className="flex w-full space-x-3">
          <button
            type="button"
            onClick={() => setAgentToDelete(null)}
            className="flex-1 py-1.5 rounded-lg border border-border bg-surface text-foreground text-xs font-medium hover:bg-secondary/10 active:bg-secondary/15 transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={async () => {
              const targetAgent = agentToDelete;
              setAgentToDelete(null);
              if (targetAgent) {
                const deleted = await agentService.deleteAgent(targetAgent.id);
                if (deleted) {
                  await agentService.loadAgents();
                  if (currentAgentId === targetAgent.id) {
                    agentService.switchAgent('main');
                    await coworkService.loadSessions('main');
                  }
                }
              }
            }}
            className="flex-1 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 active:bg-red-700 transition-colors cursor-pointer"
          >
            确定删除
          </button>
        </div>
      </Modal>
    </div>
  );
};

/* ── 专家团 Hero 大卡片 ── */

const HeroTeamCard: React.FC<{
  team: ExpertTeam;
  presetExperts: PresetAgent[];
  hiringId: string | null;
  onStartWork: (team: ExpertTeam) => void;
  onClick: () => void;
}> = ({ team, presetExperts, hiringId, onStartWork, onClick }) => {
  const allowAgentIds = team.subagentAllowAgentIds || [];
  const teamMembers = allowAgentIds
    .map((agentId) => presetExperts.find((e) => e.id === agentId))
    .filter(Boolean) as PresetAgent[];
  const memberCount = teamMembers.length || allowAgentIds.length;
  const previewMembers = teamMembers.slice(0, 4);

  return (
    <div
      onClick={onClick}
      className="group relative bg-surface border border-border hover:border-amber-500 rounded-2xl p-5 cursor-pointer transition-all duration-150 flex flex-col gap-3.5 shadow-xs hover:shadow-md will-change-transform"
    >
      {/* 头部标题与专家团Badge */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-extrabold text-foreground tracking-wide">{team.name}</h3>
        <span className="text-[10px] font-bold text-white bg-amber-500 px-2 py-0.5 rounded-full">
          专家团
        </span>
      </div>

      {/* 视觉大封面 Cover */}
      {team.coverTitle && (
        <div
          className="relative h-36 rounded-xl overflow-hidden flex flex-col items-center justify-center p-4 text-white bg-slate-800"
          style={team.coverGradient ? { background: team.coverGradient } : undefined}
        >
          <div className="relative z-10 flex flex-col items-center text-center gap-1">
            {team.coverTag && (
              <div className="text-[11px] font-bold tracking-widest px-2.5 py-0.5 rounded-full bg-white/20 border border-white/30">
                {team.coverTag}
              </div>
            )}
            <div className="text-xl font-black tracking-wider text-white">
              {team.coverTitle}
            </div>
            {team.coverSubtitle && (
              <div className="text-xs font-medium tracking-wider opacity-90">
                {team.coverSubtitle}
              </div>
            )}
            <div className="text-[11px] opacity-95 mt-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/15 border border-white/30 font-medium">
              查看示例 →
            </div>
          </div>
        </div>
      )}

      {/* 成员头像与使用量 */}
      <div className="flex items-center justify-between text-xs text-secondary px-0.5">
        <div className="flex items-center gap-2">
          {previewMembers.length > 0 && (
            <div className="flex -space-x-1.5 overflow-hidden">
              {previewMembers.map((m, i) => (
                <AgentAvatarIcon
                  key={m.id || i}
                  avatar={m.avatar}
                  className="w-5 h-5 rounded-full border border-surface shadow-xs"
                />
              ))}
            </div>
          )}
          {memberCount > 0 && (
            <span className="font-semibold text-foreground">{memberCount} 位协同专家</span>
          )}
        </div>
        {team.usesCount && <span>{team.usesCount}次使用</span>}
      </div>

      {/* 作者 */}
      {team.author && (
        <div className="text-xs text-secondary px-0.5">
          作者 · <b className="text-foreground font-semibold">{team.author}</b>
        </div>
      )}

      {/* 技能描述 */}
      <div className="px-0.5 flex-1">
        <div className="text-[11px] font-bold text-amber-500 tracking-wider mb-1">技能描述</div>
        <p className="text-xs text-secondary/90 leading-relaxed line-clamp-2 text-justify">
          {team.description}
        </p>
      </div>

      {/* 查看作者示例链接 */}
      <div className="text-xs font-semibold text-amber-500 hover:opacity-80 transition-opacity px-0.5 flex items-center gap-1">
        查看作者示例效果 →
      </div>

      {/* 召唤专家团按钮 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onStartWork(team);
        }}
        disabled={hiringId !== null}
        className="w-full mt-1 py-2.5 rounded-full bg-foreground text-background font-bold text-xs hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center shadow-xs disabled:opacity-50"
      >
        {hiringId === team.id ? (
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-background border-t-transparent"></div>
        ) : (
          '召唤专家团'
        )}
      </button>
    </div>
  );
};

/* ── 专家卡片（按原型 agent-card 横排左右布局复刻） ── */

const PrototypeExpertCard: React.FC<{
  expert: PresetAgent;
  hiringId: string | null;
  isCustom: boolean;
  onStartWork: (expert: any) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}> = ({ expert, hiringId, isCustom, onStartWork, onEdit, onDelete }) => {
  const department = expert.department && expert.department.trim() !== '其他' ? expert.department.trim() : null;
  const author = expert.author || '黑墙';

  return (
    <div
      className="group relative flex gap-3.5 bg-surface border border-border hover:border-amber-500/80 rounded-2xl p-4 transition-all duration-150 items-start shadow-xs hover:shadow-sm will-change-transform"
    >
      {/* 左侧头像 */}
      <div className="shrink-0 pt-0.5">
        <AgentAvatarIcon
          avatar={expert.avatar}
          className="h-12 w-12 rounded-full shadow-xs ring-1 ring-border group-hover:scale-105 transition-transform"
        />
      </div>

      {/* 右侧内容 */}
      <div className={`flex-1 min-w-0 flex flex-col gap-1 ${isCustom ? 'pr-7' : ''}`}>
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <h4 className="text-sm font-bold text-foreground truncate">{expert.name}</h4>
            {!isCustom ? (
              <span className="text-[10px] font-bold text-white bg-amber-500 px-1.5 py-0.2 rounded-full leading-tight shrink-0">
                官方
              </span>
            ) : (
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded-full leading-tight shrink-0">
                自定义
              </span>
            )}
          </div>

          {/* 鼠标悬停展示统一的“召唤”按钮 */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStartWork(expert);
            }}
            disabled={hiringId !== null}
            className="opacity-0 group-hover:opacity-100 transition-opacity px-2.5 py-1 rounded-full bg-foreground text-background text-[11px] font-semibold hover:opacity-90 active:scale-95 shrink-0 cursor-pointer disabled:opacity-50"
          >
            {hiringId === expert.id ? '...' : '召唤'}
          </button>
        </div>

        {/* 作者 / 部门 */}
        <div className="text-[11px] text-secondary">
          作者 · {author}
        </div>

        {/* 描述摘要 */}
        <p className="text-xs text-secondary/90 leading-relaxed line-clamp-2 text-justify mt-0.5">
          {expert.description}
        </p>

        {/* 标签栏 */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {department && (
            <span className="text-[10.5px] text-amber-700 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900 px-2 py-0.5 rounded-full whitespace-nowrap font-medium">
              {department}
            </span>
          )}
          <span className="text-[10.5px] text-secondary bg-surface-raised border border-border px-2 py-0.5 rounded-full whitespace-nowrap">
            {expert.level || '实战专家'}
          </span>
        </div>
      </div>

      {/* 自定义专家的三点操作菜单（固定在右上角，独立区域，不与召唤按钮重合） */}
      {isCustom && (
        <div className="absolute right-2.5 top-3.5 group/menu cursor-pointer z-20">
          <div className="p-1 rounded-md hover:bg-secondary/15 text-secondary hover:text-foreground transition-colors">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </div>
          <div className="absolute right-0 top-full pt-1 hidden group-hover/menu:block z-30">
            <div className="bg-surface border border-border rounded-lg shadow-lg w-20 py-1 animate-in fade-in duration-100">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
                className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-secondary/15 transition-colors cursor-pointer font-medium"
              >编辑</button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
                className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 transition-colors cursor-pointer font-medium"
              >删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpertsView;
