import React, { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import { agentService } from '../../services/agent';
import { coworkService } from '../../services/cowork';
import { expertService } from '../../services/expertService';
import { vipService } from '../../services/vipService';
import { RootState } from '../../store';
import type { PaidExpert } from '../../types/paidExpert';
import AgentAvatarIcon from '../agent/AgentAvatarIcon';
import AgentCreateModal from '../agent/AgentCreateModal';
import AgentSettingsPanel from '../agent/AgentSettingsPanel';
import Modal from '../common/Modal';
import ComposeIcon from '../icons/ComposeIcon';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';
import SkillsView from '../skills/SkillsView';
import { PremiumGuideModal } from './PremiumGuideModal';

interface PresetAgent {
  id: string;
  name: string;
  avatar?: string;
  description: string;
  identity?: string;
  level?: '高级' | '中级' | '初级';
  department?: string;
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
  const [paidExpertList, setPaidExpertList] = useState<PaidExpert[]>([]);
  const [loading, setLoading] = useState(true);
  const [hiringId, setHiringId] = useState<string | null>(null);

  // 子视图 Tab 状态
  const [activeTab, setActiveTab] = useState<'experts' | 'skills' | 'mcp'>('experts');
  
  // 付费专家 / 内置专家 / 自定义专家 Tab 状态 (默认显示付费专家)
  const [expertType, setExpertType] = useState<'paid' | 'preset' | 'custom'>('paid');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [agentToDelete, setAgentToDelete] = useState<any | null>(null);

  // VIP 开通弹窗状态
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [selectedPaidExpert, setSelectedPaidExpert] = useState<PresetAgent | any | null>(null);
  const [, setVipState] = useState(vipService.getState());

  // 监听 VIP 状态
  useEffect(() => {
    return vipService.subscribe(state => setVipState(state));
  }, []);

  const installedAgents = useSelector((state: RootState) => state.agent.agents);
  const currentAgentId = useSelector((state: RootState) => state.agent.currentAgentId);
  const isMac = window.electron.platform === 'darwin';
  const isWindows = window.electron.platform === 'win32';

  // 1. 初始化拉取 Preset 专家模版列表 + 付费专家列表
  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      try {
        setLoading(true);
        const [presetsData, paidData] = await Promise.all([
          window.electron.agents.presetTemplates(),
          window.electron.agents.getPaidExperts(),
        ]);
        if (active) {
          setPresets(presetsData);
          setPaidExpertList(paidData);
        }
      } catch (err) {
        console.error('Failed to load presets:', err);
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

  // 付费/高级专家列表（从云端动态获取）
  const paidExperts = paidExpertList;

  // 动态提取当前 Tab（高级专家或默认专家）下的部门分类列表并去重
  const departments = useMemo(() => {
    const set = new Set<string>();
    const list = expertType === 'paid' ? paidExperts : presets;
    list.forEach((p: any) => {
      if (p.department && p.department.trim()) {
        set.add(p.department.trim());
      }
    });
    const result = Array.from(set);
    return result.length > 0 ? ['全部', ...result] : [];
  }, [expertType, presets, paidExperts]);

  // 2. 根据所选部门及搜索关键字进行多维度模糊过滤
  const filteredExperts = useMemo(() => {
    if (expertType === 'paid') {
      return paidExperts.filter((expert: any) => {
        const matchDept = selectedDept === '全部' || expert.department === selectedDept;
        const matchSearch =
          expert.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          expert.description.toLowerCase().includes(searchQuery.toLowerCase());
        return matchDept && matchSearch;
      });
    } else if (expertType === 'preset') {
      return presets.filter((expert) => {
        if (expertService.isPaidExpert(expert.id)) return false;
        const matchDept = selectedDept === '全部' || expert.department === selectedDept;
        const matchSearch =
          expert.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          expert.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (expert.identity && expert.identity.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchDept && matchSearch;
      });
    } else {
      return customExperts.filter((expert) => {
        const matchSearch =
          expert.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          expert.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (expert.identity && expert.identity.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchSearch;
      });
    }
  }, [presets, paidExperts, customExperts, selectedDept, searchQuery, expertType]);

  // 3. 点击“开始干活”
  const handleStartWork = async (expert: PresetAgent | any) => {
    // 如果是付费专家且未解锁，弹出购买引导
    if (expertService.isPaidExpert(expert.id) && !vipService.isExpertUnlocked(expert.id)) {
      setSelectedPaidExpert(expert);
      setIsGuideOpen(true);
      return;
    }

    try {
      setHiringId(expert.id);
      
      // 检查该专家是否已被添加（聘用）
      let installed = installedAgents.find(
        (a) => a.presetId === expert.id || a.id === expert.id
      );

      if (!installed) {
        // 如果未添加，调用 addPreset 接口安装专家到本地 SQLite 数据库中
        installed = await window.electron.agents.addPreset(expert.id);
        // 重新加载本地已添加的 agent 列表
        await agentService.loadAgents();
      } else if (!installed.enabled) {
        // 如果已经添加，但是在我的专家墙被隐藏/召回了，重新开启启用它！
        await agentService.updateAgent(installed.id, { enabled: true });
        await agentService.loadAgents();
        
        // 通过 electron 接口重新拉取以获取最新 enabled: true 的 installed 对象
        const latestList = await window.electron.agents.list();
        installed = latestList.find(
          (a: any) => a.presetId === expert.id || a.id === expert.id
        );
      }

      if (installed) {
        // 切换当前专家为这个 agent 并加载会话
        agentService.switchAgent(installed.id);
        await coworkService.loadSessions(installed.id);
        
        // 清空当前对话草稿状态，开启全新会话任务
        coworkService.clearSession({ restoreAgentSkills: true });
        
        // 触发回退到 cowork 视图的聊天界面
        if (onNewChat) {
          onNewChat();
        }
      }
    } catch (err) {
      console.error('Failed to start work with expert:', err);
    } finally {
      setHiringId(null);
    }
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
          
          {/* 页签选择组 */}
          <div className="non-draggable flex items-center space-x-4 h-8 text-[13.5px] font-semibold select-none">
            <button
              type="button"
              onClick={() => setActiveTab('experts')}
              className={`relative py-1 transition-colors focus:outline-none cursor-pointer ${
                activeTab === 'experts'
                  ? 'text-foreground font-semibold'
                  : 'text-secondary hover:text-foreground font-medium'
              }`}
            >
              AI 专家库
              <div
                className={`absolute bottom-[-10px] left-0 right-0 h-0.5 rounded-full transition-colors ${
                  activeTab === 'experts' ? 'bg-primary' : 'bg-transparent'
                }`}
              />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('skills')}
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
              onClick={() => setActiveTab('mcp')}
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

        {/* 右上角搜索框和创建专家按钮 (仅在 AI 专家库下展示) */}
        {activeTab === 'experts' && (
          <div className="non-draggable flex items-center space-x-3">
            <div className="relative">
              <input
                type="text"
                placeholder="搜索专家..."
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
            {expertType === 'custom' && (
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-surface hover:bg-secondary/10 text-foreground border border-border text-xs font-semibold rounded-lg shadow-sm transition-all duration-200 cursor-pointer"
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

      {/* 部门/专家类型标签栏 (仅在 AI 专家库下展示) */}
      {activeTab === 'experts' && (
        <div className="border-b border-border bg-surface shrink-0 py-2.5 px-6 flex flex-col gap-2.5">
          {/* 高级/默认/自定义分类 Tab */}
          <div className="flex bg-secondary/10 p-0.5 rounded-lg w-fit select-none">
            <button
              type="button"
              onClick={() => { setExpertType('paid'); setSelectedDept('全部'); }}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                expertType === 'paid'
                  ? 'bg-surface text-amber-600 shadow-sm'
                  : 'text-secondary hover:text-foreground'
              }`}
            >
              <span>💎</span>
              <span>高级专家</span>
            </button>
            <button
              type="button"
              onClick={() => { setExpertType('preset'); setSelectedDept('全部'); }}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                expertType === 'preset'
                  ? 'bg-surface text-foreground shadow-sm'
                  : 'text-secondary hover:text-foreground'
              }`}
            >
              默认专家
            </button>
            <button
              type="button"
              onClick={() => { setExpertType('custom'); setSelectedDept('全部'); }}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                expertType === 'custom'
                  ? 'bg-surface text-foreground shadow-sm'
                  : 'text-secondary hover:text-foreground'
              }`}
            >
              自定义专家
            </button>
          </div>

          {/* 部门/分类过滤滑动标签栏 (在包含分类时展示，如高级专家的“黑墙IP战略”或默认专家的“策略部”等) */}
          {departments.length > 0 && (
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
                          ? 'bg-primary text-primary-foreground shadow-sm'
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
        <SkillsView
          activeTab="skills"
          hideHeader={true}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={onToggleSidebar}
          onNewChat={onNewChat}
        />
      ) : activeTab === 'mcp' ? (
        <SkillsView
          activeTab="mcp"
          hideHeader={true}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={onToggleSidebar}
          onNewChat={onNewChat}
        />
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable] bg-surface-raised/40">
          <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
              </div>
            ) : filteredExperts.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-secondary">
                <p className="text-sm font-medium">该分类下没有专家</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {filteredExperts.map((expert) => {
                  const getLevelBadge = (level?: string) => {
                    switch (level) {
                      case '高级': return 'bg-amber-100 text-amber-700 border-amber-200';
                      case '中级': return 'bg-blue-100 text-blue-700 border-blue-200';
                      case '初级': return 'bg-gray-100 text-gray-700 border-gray-200';
                      default: return 'bg-amber-100 text-amber-700 border-amber-200';
                    }
                  };

                  const department = 'department' in expert ? (expert as any).department : undefined;
                  const tagText = department && department.trim() && department !== '其他' && department !== 'undefined' ? department.trim() : null;

                  const isPaid = expertType === 'paid';
                  const isUnlocked = isPaid ? vipService.isExpertUnlocked(expert.id) : true;
                  const isLocked = isPaid && !isUnlocked;

                  return (
                    <div
                      key={expert.id}
                      className={`group relative flex flex-col items-center rounded-2xl p-6 text-center shadow-sm transition-all duration-300 overflow-hidden ${
                        isLocked
                          ? 'bg-gradient-to-b from-amber-500/[0.05] via-surface to-amber-500/[0.02] border border-amber-500/30 hover:border-amber-500/60 hover:shadow-xl hover:shadow-amber-500/10'
                          : 'bg-surface border border-border hover:shadow-md hover:border-primary/20'
                      }`}
                    >
                      {/* 专家角标状态 */}
                      {isPaid ? (
                        <span
                          className={`absolute right-3.5 top-3.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 shadow-2xs select-none backdrop-blur-sm z-10 ${
                            isUnlocked
                              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                              : 'bg-gradient-to-r from-amber-500/15 to-purple-500/15 text-amber-700 border-amber-500/40 shadow-amber-500/10'
                          }`}
                        >
                          {isUnlocked ? '✓ 已开通' : '✨ PRO 专属'}
                        </span>
                      ) : expertType === 'preset' ? (
                        ('level' in expert && (expert as PresetAgent).level) && (
                          <span
                            className={`absolute right-3.5 top-3.5 text-[10px] font-bold px-2 py-0.5 rounded border z-10 ${getLevelBadge(
                              (expert as PresetAgent).level!
                            )}`}
                          >
                            {(expert as PresetAgent).level}
                          </span>
                        )
                      ) : (
                        <div className="absolute right-3.5 top-3.5 group/menu cursor-pointer z-20">
                          <div className="p-1 rounded hover:bg-secondary/15 text-secondary hover:text-foreground">
                            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                            </svg>
                          </div>
                          {/* 增加 pt-1 透明阻挡垫片，防止鼠标下滑过程离焦关闭 */}
                          <div className="absolute right-0 top-full pt-1 hidden group-hover/menu:block z-30">
                            <div className="bg-surface border border-border rounded-lg shadow-lg w-20 py-1 animate-in fade-in duration-100">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setEditingAgentId(expert.id); }}
                                className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-secondary/15 transition-colors cursor-pointer font-medium"
                              >编辑</button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setAgentToDelete(expert); }}
                                className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 transition-colors cursor-pointer font-medium"
                              >删除</button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 头像区域：全量统一圆形头像，清爽简洁 */}
                      <div className="relative mt-2 z-10">
                        <AgentAvatarIcon
                          avatar={expert.avatar}
                          className="h-20 w-20 rounded-full shadow-md ring-2 ring-background ring-offset-2 transition-transform duration-300 group-hover:scale-105"
                        />
                      </div>

                      <div className="flex flex-col items-center flex-1 mt-4 z-10">
                        <h3 className="text-base font-semibold text-foreground flex items-center gap-1.5">
                          {expert.name}
                        </h3>
                        {tagText && (
                          <span className="mt-1.5 inline-flex items-center rounded-full bg-amber-500/10 text-amber-800 border border-amber-500/20 px-2.5 py-0.5 text-xs font-semibold select-none">
                            {tagText}
                          </span>
                        )}
                        <p className="mt-3.5 text-xs text-secondary leading-relaxed px-1 line-clamp-3 text-justify">
                          {expert.description}
                        </p>
                      </div>

                      {/* 操作按钮区 */}
                      <div className="w-full mt-5 z-10">
                        {isLocked ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPaidExpert(expert);
                              setIsGuideOpen(true);
                            }}
                            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:brightness-110 text-slate-950 py-2.5 text-xs font-extrabold shadow-md shadow-amber-500/25 active:scale-[0.98] transition-all duration-200 select-none cursor-pointer"
                          >
                            <span>✨ 立即解锁</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStartWork(expert)}
                            disabled={hiringId !== null}
                            className="w-full flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white py-2.5 text-xs font-semibold shadow-sm active:scale-[0.98] transition-all duration-200 disabled:opacity-50 select-none cursor-pointer"
                          >
                            {hiringId === expert.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                            ) : (
                              '开始干活'
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
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

      {/* 删除专家的确认轻量弹窗 */}
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

      {/* VIP 订阅购买引导弹窗 */}
      <PremiumGuideModal
        isOpen={isGuideOpen}
        expertName={selectedPaidExpert?.name}
        expertDescription={selectedPaidExpert?.description}
        onClose={() => setIsGuideOpen(false)}
      />
    </div>
  );
};

export default ExpertsView;
