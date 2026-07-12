import React, { useEffect, useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { agentService } from '../../services/agent';
import { coworkService } from '../../services/cowork';
import AgentAvatarIcon from '../agent/AgentAvatarIcon';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';
import ComposeIcon from '../icons/ComposeIcon';

// 9个核心部门定义
const DEPARTMENTS = [
  '全部',
  '策略部',
  '数据部',
  '设计部',
  '短视频部',
  '直播部',
  '图文部',
  '老板IP部',
  '销售运营部',
  '客户成功部',
];

interface PresetAgent {
  id: string;
  name: string;
  icon: string;
  description: string;
  identity: string;
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
  const [loading, setLoading] = useState(true);
  const [hiringId, setHiringId] = useState<string | null>(null);

  const installedAgents = useSelector((state: RootState) => state.agent.agents);
  const isMac = window.electron.platform === 'darwin';
  const isWindows = window.electron.platform === 'win32';

  // 1. 加载所有内置专家的预置模板
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoading(true);
        // 使用 preload.ts 里的 presetTemplates 接口获取 51 位专家
        const list = await window.electron.agents.presetTemplates();
        setPresets(list || []);
      } catch (err) {
        console.error('Failed to load expert templates:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTemplates();
  }, []);

  // 2. 筛选和搜索过滤
  const filteredExperts = useMemo(() => {
    return presets.filter((expert) => {
      const matchDept = selectedDept === '全部' || expert.department === selectedDept;
      const matchSearch =
        expert.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        expert.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (expert.identity && expert.identity.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchDept && matchSearch;
    });
  }, [presets, selectedDept, searchQuery]);

  // 3. 点击“开始干活”
  const handleStartWork = async (expert: PresetAgent) => {
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
      {/* 头部导航标题 */}
      <div className="draggable flex h-12 items-center justify-between px-4 border-b border-border shrink-0">
        <div className="flex items-center space-x-3 h-8">
          {isSidebarCollapsed && !isWindows && (
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
          <h1 className="text-lg font-semibold text-foreground">AI 专家库</h1>
        </div>

        {/* 右上角搜索框 */}
        <div className="non-draggable flex items-center">
          <div className="relative">
            <input
              type="text"
              placeholder="搜索专家..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-8 pr-3 py-1.5 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary"
            />
            <svg
              className="absolute left-2.5 top-2.5 h-4 w-4 text-secondary"
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
        </div>
      </div>

      {/* 部门过滤滑动标签栏 */}
      <div className="border-b border-border bg-surface shrink-0 py-2.5 px-6 overflow-x-auto scrollbar-hidden">
        <div className="flex space-x-2.5">
          {DEPARTMENTS.map((dept) => {
            const isSelected = selectedDept === dept;
            return (
              <button
                key={dept}
                type="button"
                onClick={() => setSelectedDept(dept)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-sm scale-105'
                    : 'text-secondary bg-surface-raised hover:bg-secondary/10'
                }`}
              >
                {dept}
              </button>
            );
          })}
        </div>
      </div>

      {/* 专家列表卡片网格 */}
      <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable] bg-surface-raised/40">
        <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : filteredExperts.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-secondary">
              <svg
                className="h-12 w-12 text-border mb-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm font-medium">没有找到匹配的专家数字员工</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {filteredExperts.map((expert) => {
                // 级别背景色映射
                const getLevelBadge = (level?: string) => {
                  switch (level) {
                    case '高级':
                      return 'bg-amber-100 text-amber-700 border-amber-200';
                    case '中级':
                      return 'bg-blue-100 text-blue-700 border-blue-200';
                    case '初级':
                      return 'bg-gray-100 text-gray-700 border-gray-200';
                    default:
                      return 'bg-amber-100 text-amber-700 border-amber-200';
                  }
                };

                // 从名称提炼一个显示 tag，比如“首席策略官”
                const shortTag = expert.identity
                  ? expert.identity.split('的')?.[1]?.split('。')?.[0]?.trim() || expert.department
                  : expert.department;

                return (
                  <div
                    key={expert.id}
                    className="group relative flex flex-col items-center justify-between rounded-2xl border border-border/80 bg-surface px-4 py-6 text-center shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden"
                  >
                    {/* 级别标签 */}
                    {expert.level && (
                      <span
                        className={`absolute right-3.5 top-3.5 text-[10px] font-bold px-2 py-0.5 rounded border ${getLevelBadge(
                          expert.level
                        )}`}
                      >
                        {expert.level}
                      </span>
                    )}

                    {/* 圆形专家头像 */}
                    <div className="relative mt-2">
                      <AgentAvatarIcon
                        value={expert.icon}
                        className="h-20 w-20 shadow-md ring-2 ring-background ring-offset-2 transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>

                    {/* 姓名职务与描述 */}
                    <div className="flex flex-col items-center flex-1 mt-4">
                      <h3 className="text-base font-semibold text-foreground">
                        {expert.name}
                      </h3>
                      <span className="mt-1.5 inline-flex items-center rounded-full bg-purple-50 text-purple-600 border border-purple-100 px-2.5 py-0.5 text-xs font-semibold select-none">
                        {shortTag}
                      </span>
                      <p className="mt-3.5 text-xs text-secondary leading-relaxed px-1 line-clamp-3 text-justify">
                        {expert.description}
                      </p>
                    </div>

                    {/*Hover开始干活按钮 */}
                    <div className="w-full mt-5">
                      <button
                        type="button"
                        onClick={() => handleStartWork(expert)}
                        disabled={hiringId !== null}
                        className="w-full flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white py-2 text-xs font-semibold shadow-sm transition-all duration-200 disabled:opacity-50 select-none cursor-pointer"
                      >
                        {hiringId === expert.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                        ) : (
                          '开始干活'
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExpertsView;
