import {
  AdjustmentsHorizontalIcon,
  CheckIcon,
  PlusIcon,
  UserIcon,
  UserPlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import React, { useCallback, useEffect, useState } from 'react';

import { httpClient } from '../../services/httpClient';
import Modal from '../common/Modal';

// 默认兜底最多支持 50 名员工席位（优先以后端接口返回为准）
const DEFAULT_FALLBACK_STAFF_LIMIT = 50;

interface EnterpriseInfo {
  id: number;
  name: string;
  ownerUserId: number;
  memberCount: number;
  maxMembers?: number;
  quota: number;
  usedQuota: number;
  accountExpireAt: string | null;
  secondBrainExpireAt: string | null;
}

interface EnterpriseMember {
  memberId: number;
  userId: number;
  username: string;
  displayName: string;
  role: string;
  status: string;
  createdAt: string;
  isUnlimitedQuota?: boolean;
  remainQuota?: number;
  usedQuota?: number;
}

export const EnterpriseSection: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [enterpriseInfo, setEnterpriseInfo] = useState<EnterpriseInfo | null>(null);
  const [members, setMembers] = useState<EnterpriseMember[]>([]);

  // 添加员工弹窗状态
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [quotaMode, setQuotaMode] = useState<'unlimited' | 'custom'>('unlimited');
  const [customQuotaAmount, setCustomQuotaAmount] = useState<string>('2000');
  const [adding, setAdding] = useState(false);
  const [addErrorMessage, setAddErrorMessage] = useState<string | null>(null);

  // 调整额度弹窗状态
  const [editingQuotaMember, setEditingQuotaMember] = useState<EnterpriseMember | null>(null);
  const [editQuotaMode, setEditQuotaMode] = useState<'unlimited' | 'custom'>('unlimited');
  const [editCustomAmount, setEditCustomAmount] = useState<string>('2000');
  const [savingQuota, setSavingQuota] = useState(false);
  const [quotaErrorMessage, setQuotaErrorMessage] = useState<string | null>(null);

  const [deletingMember, setDeletingMember] = useState<EnterpriseMember | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sectionErrorMessage, setSectionErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setSectionErrorMessage(null);
    try {
      const [infoRes, membersRes] = await Promise.all([
        httpClient.admin.get<{ success: boolean; data?: EnterpriseInfo; error?: string }>('/api/client/enterprise/info'),
        httpClient.admin.get<{ success: boolean; data?: EnterpriseMember[]; error?: string }>('/api/client/enterprise/members'),
      ]);

      if (infoRes.ok && infoRes.data?.success && infoRes.data.data) {
        setEnterpriseInfo(infoRes.data.data);
      } else {
        setSectionErrorMessage(infoRes.data?.error || '获取企业信息失败');
      }

      if (membersRes.ok && membersRes.data?.success && Array.isArray(membersRes.data.data)) {
        setMembers(membersRes.data.data);
      }
    } catch (err: any) {
      console.error('[EnterpriseSection] fetchData error:', err);
      setSectionErrorMessage(err.message || '网络连接异常');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const currentCount = members.length;
  const maxStaffLimit = enterpriseInfo?.maxMembers && enterpriseInfo.maxMembers > 0 ? enterpriseInfo.maxMembers : DEFAULT_FALLBACK_STAFF_LIMIT;
  const isLimitReached = currentCount >= maxStaffLimit;
  const enterpriseName = enterpriseInfo?.name || '企业';
  const suggestedPlaceholder = `例如: ${enterpriseName}-姓名`;

  const handleOpenAddModal = () => {
    if (isLimitReached) return;
    setAddErrorMessage(null);
    setNewUsername('');
    setQuotaMode('unlimited');
    setCustomQuotaAmount('2000');
    setIsAddModalOpen(true);
  };

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
    setAddErrorMessage(null);
    setNewUsername('');
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;

    if (isLimitReached) {
      setAddErrorMessage(`企业席位已满（最多支持 ${maxStaffLimit} 名员工）`);
      return;
    }

    let quota = -1;
    if (quotaMode === 'custom') {
      const parsed = parseInt(customQuotaAmount, 10);
      if (isNaN(parsed) || parsed <= 0) {
        setAddErrorMessage('请输入有效的正数算力额度');
        return;
      }
      quota = parsed;
    }

    setAdding(true);
    setAddErrorMessage(null);
    try {
      const res = await httpClient.admin.post<{
        success: boolean;
        data?: { userId: number; username: string };
        error?: string;
      }>('/api/client/enterprise/members', {
        username: newUsername.trim(),
        quota,
      });

      if (res.ok && res.data?.success) {
        setIsAddModalOpen(false);
        setNewUsername('');
        fetchData();
      } else {
        setAddErrorMessage(res.data?.error || '添加员工失败');
      }
    } catch (err: any) {
      setAddErrorMessage(err.message || '添加员工请求失败');
    } finally {
      setAdding(false);
    }
  };

  const handleOpenQuotaModal = (m: EnterpriseMember) => {
    setEditingQuotaMember(m);
    setQuotaErrorMessage(null);
    if (m.isUnlimitedQuota) {
      setEditQuotaMode('unlimited');
      setEditCustomAmount('2000');
    } else {
      setEditQuotaMode('custom');
      setEditCustomAmount(String(m.remainQuota && m.remainQuota > 0 ? m.remainQuota : 2000));
    }
  };

  const handleSaveQuota = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuotaMember) return;

    let quota = -1;
    if (editQuotaMode === 'custom') {
      const parsed = parseInt(editCustomAmount, 10);
      if (isNaN(parsed) || parsed <= 0) {
        setQuotaErrorMessage('请输入有效的正数算力额度');
        return;
      }
      quota = parsed;
    }

    setSavingQuota(true);
    setQuotaErrorMessage(null);
    try {
      const res = await httpClient.admin.put<{ success: boolean; error?: string }>(
        `/api/client/enterprise/members/${editingQuotaMember.userId}/quota`,
        { quota }
      );

      if (res.ok && res.data?.success) {
        setEditingQuotaMember(null);
        fetchData();
      } else {
        setQuotaErrorMessage(res.data?.error || '更新额度失败');
      }
    } catch (err: any) {
      setQuotaErrorMessage(err.message || '网络连接异常');
    } finally {
      setSavingQuota(false);
    }
  };

  const handleConfirmDeleteStaff = async () => {
    if (!deletingMember || deleting) return;

    setDeleting(true);
    const userId = deletingMember.userId;
    try {
      const res = await httpClient.admin.delete<{ success: boolean; error?: string }>(
        `/api/client/enterprise/members/${userId}`
      );
      if (res.ok && res.data?.success) {
        setMembers((prev) => prev.filter((m) => m.userId !== userId));
        if (enterpriseInfo) {
          setEnterpriseInfo({ ...enterpriseInfo, memberCount: Math.max(0, enterpriseInfo.memberCount - 1) });
        }
        setDeletingMember(null);
      } else {
        setSectionErrorMessage(res.data?.error || '解绑员工失败');
      }
    } catch (err: any) {
      setSectionErrorMessage(err.message || '解绑员工请求失败');
    } finally {
      setDeleting(false);
    }
  };

  const formatCreatedAt = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-3">
      {/* 模块外部标题栏与添加按钮 */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h2 className="text-base font-bold text-foreground">
            席位与员工绑定
          </h2>
          <span className="text-xs text-secondary">
            平时不用动 · 要绑人、调额度时打开 · 绑定后全量开放，单条隐私去「认知与隐私」单独管
          </span>
        </div>

        <button
          type="button"
          disabled={isLimitReached}
          onClick={handleOpenAddModal}
          className={`self-end sm:self-auto shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg transition shadow-2xs ${
            isLimitReached
              ? 'bg-surface-raised text-secondary border border-border/70 cursor-not-allowed opacity-60'
              : 'text-white bg-primary hover:bg-primary/90 active:scale-[0.98]'
          }`}
          title={isLimitReached ? `已达到最大员工数限制（${maxStaffLimit}人）` : '添加新员工'}
        >
          <PlusIcon className="w-3.5 h-3.5" />
          <span>{isLimitReached ? `席位已满 (${maxStaffLimit}/${maxStaffLimit})` : '添加员工'}</span>
        </button>
      </div>

      <div className="rounded-2xl border border-border/80 bg-surface p-5 md:p-6 shadow-sm space-y-5">
      {/* 原型提示条：绑定 ＝ 全量开放 */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-400 text-xs">
        <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
          <CheckIcon className="w-3 h-3 text-emerald-600 dark:text-emerald-300 stroke-[2.5]" />
        </div>
        <p className="leading-snug">
          <strong className="font-semibold text-emerald-800 dark:text-emerald-300">绑定 ＝ 全量开放。</strong>
          <span className="opacity-90 ml-1">想藏住某条，去「认知与隐私」单独设。</span>
        </p>
      </div>

      {sectionErrorMessage && (
        <div className="p-3 text-xs rounded-xl bg-destructive/10 text-destructive border border-destructive/20 flex items-center justify-between">
          <span>{sectionErrorMessage}</span>
          <button type="button" onClick={() => setSectionErrorMessage(null)} className="text-destructive font-bold text-sm">×</button>
        </div>
      )}

      {/* 顶部概览指标栏（含企业名称，统一高度与基准线） */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-surface border border-border/80 rounded-xl p-3.5 shadow-2xs">
          <div className="text-[11px] text-secondary font-medium mb-1">企业名称</div>
          <div className="h-6 flex items-baseline">
            <span className="text-sm font-bold text-foreground truncate" title={enterpriseInfo?.name || enterpriseName}>
              {enterpriseInfo?.name || enterpriseName}
            </span>
          </div>
        </div>

        <div className="bg-surface border border-border/80 rounded-xl p-3.5 shadow-2xs">
          <div className="text-[11px] text-secondary font-medium mb-1">成员席位配额</div>
          <div className="h-6 flex items-baseline gap-1">
            <span className="text-sm font-bold text-foreground font-mono">{currentCount}</span>
            <span className="text-xs text-secondary font-normal font-mono">/ {maxStaffLimit} 人</span>
          </div>
        </div>

        <div className="bg-surface border border-border/80 rounded-xl p-3.5 shadow-2xs">
          <div className="text-[11px] text-secondary font-medium mb-1">企业账号有效期</div>
          <div className="h-6 flex items-baseline">
            <span className="text-xs font-semibold text-foreground font-mono truncate">
              {enterpriseInfo?.accountExpireAt || '未生效'}
            </span>
          </div>
        </div>

        <div className="bg-surface border border-border/80 rounded-xl p-3.5 shadow-2xs">
          <div className="text-[11px] text-secondary font-medium mb-1">第二大脑有效期</div>
          <div className="h-6 flex items-baseline">
            <span className="text-xs font-semibold text-foreground font-mono truncate">
              {enterpriseInfo?.secondBrainExpireAt || '未生效'}
            </span>
          </div>
        </div>
      </div>

      {/* 员工列表：对齐原型席位绑定与员工管理 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-foreground">席位与员工列表</h3>
          </div>
        </div>

        <div className="border border-border/70 rounded-xl overflow-hidden bg-surface shadow-2xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-raised/50 border-b border-border/70 text-secondary font-medium">
                <th className="py-2.5 px-4 font-medium">席位</th>
                <th className="py-2.5 px-4 font-medium">算力额度</th>
                <th className="py-2.5 px-4 font-medium">状态 / 添加时间</th>
                <th className="py-2.5 px-4 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-secondary">
                    加载席位列表中...
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-secondary">
                    暂无已绑定员工，点击右上角【添加员工】分配成员席位
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr key={m.userId} className="hover:bg-surface-raised/40 transition-colors">
                    {/* 员工席位 */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-foreground/10 text-foreground font-semibold text-xs flex items-center justify-center shrink-0">
                          {m.displayName ? m.displayName.slice(0, 1) : m.username ? m.username.slice(0, 1) : <UserIcon className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">{m.displayName || m.username}</div>
                          <div className="text-[11px] text-secondary">已绑定员工</div>
                        </div>
                      </div>
                    </td>

                    {/* 算力额度 */}
                    <td className="py-3 px-4">
                      {m.isUnlimitedQuota ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-surface-raised text-secondary border border-border/60">
                          无限制
                        </span>
                      ) : (
                        <div className="text-[11px] space-y-0.5">
                          <div>
                            <span className="text-secondary">剩余: </span>
                            <span className="font-semibold text-foreground font-mono">
                              {(m.remainQuota ?? 0).toLocaleString()} 点
                            </span>
                          </div>
                        </div>
                      )}
                    </td>

                    {/* 状态与添加时间 */}
                    <td className="py-3 px-4">
                      <div className="space-y-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          使用中
                        </span>
                        <div className="text-secondary text-[11px] font-mono">
                          {formatCreatedAt(m.createdAt)}
                        </div>
                      </div>
                    </td>

                    {/* 操作列 */}
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenQuotaModal(m)}
                          className="px-2.5 py-1 text-[11px] font-medium text-foreground bg-surface hover:bg-surface-raised border border-border/80 hover:border-primary/40 rounded-lg transition"
                          title="调整算力额度"
                        >
                          调额度
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeletingMember(m)}
                          className="px-2.5 py-1 text-[11px] font-medium text-secondary hover:text-destructive hover:bg-destructive/10 border border-border/70 hover:border-destructive/30 rounded-lg transition"
                          title="解绑并移除员工"
                        >
                          解绑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}

              {/* 原型空席位占位行（当还有剩余席位时展示） */}
              {!loading && !isLimitReached && (
                <tr className="hover:bg-surface-raised/20 transition-colors bg-surface-raised/10">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full border border-dashed border-border/80 flex items-center justify-center text-secondary shrink-0">
                        <PlusIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">
                          空席位 {maxStaffLimit - currentCount} 个
                        </div>
                        <div className="text-[11px] text-secondary">等你分配</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-[11px] text-secondary">
                    待设
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-raised text-secondary border border-border/60">
                      未启用
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={handleOpenAddModal}
                      className="px-3 py-1 text-[11px] font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition shadow-2xs active:scale-[0.98]"
                    >
                      邀请同事
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 原型底部说明脚注 */}
        <p className="text-[11px] text-secondary/90 px-1 pt-1">
          算力额度由公司统一采购、分配 · 员工不付费 · 用到 100% 只停员工、不停你
        </p>
      </div>

      {/* 1. 添加员工弹窗 Modal */}
      {isAddModalOpen && (
        <Modal
          isOpen
          onClose={handleCloseAddModal}
          className="w-[480px] max-w-[92vw] my-auto rounded-2xl bg-surface border border-border/80 shadow-2xl p-5 space-y-4 animate-fade-in"
        >
          <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <UserPlusIcon className="w-4 h-4 text-primary" />
              <span>添加新员工席位</span>
            </div>
            <button
              type="button"
              onClick={handleCloseAddModal}
              className="text-secondary hover:text-foreground"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleAddStaff} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-foreground">员工用户名 / 账号</label>
                <span className="text-[11px] text-secondary">
                  推荐命名：<span className="text-primary font-mono">{enterpriseName}-姓名</span>
                </span>
              </div>
              <input
                type="text"
                required
                autoFocus
                value={newUsername}
                onChange={(e) => {
                  setNewUsername(e.target.value);
                  if (addErrorMessage) setAddErrorMessage(null);
                }}
                placeholder={suggestedPlaceholder}
                className={`w-full px-3 py-2 text-xs rounded-lg border bg-surface text-foreground focus:outline-none transition ${
                  addErrorMessage
                    ? 'border-destructive ring-1 ring-destructive/20'
                    : 'border-border focus:border-primary focus:ring-2 focus:ring-primary/20'
                }`}
              />
              {addErrorMessage && (
                <div className="mt-1.5 text-xs font-medium text-destructive flex items-center gap-1">
                  <span>⚠️ {addErrorMessage}</span>
                </div>
              )}
              <p className="text-[11px] text-secondary mt-1.5">
                系统将为员工分配全新专属账号，初始密码为 <span className="font-mono text-foreground font-medium">12345678</span>
              </p>
            </div>

            {/* 额度分配设置 */}
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">算力额度分配</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setQuotaMode('unlimited')}
                  className={`px-3 py-2 text-xs rounded-lg border text-left transition flex items-center justify-between ${
                    quotaMode === 'unlimited'
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border/60 bg-surface hover:border-border text-foreground'
                  }`}
                >
                  <span>无限制</span>
                  {quotaMode === 'unlimited' && <CheckIcon className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setQuotaMode('custom')}
                  className={`px-3 py-2 text-xs rounded-lg border text-left transition flex items-center justify-between ${
                    quotaMode === 'custom'
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border/60 bg-surface hover:border-border text-foreground'
                  }`}
                >
                  <span>限制额度</span>
                  {quotaMode === 'custom' && <CheckIcon className="w-3.5 h-3.5" />}
                </button>
              </div>

              {quotaMode === 'custom' && (
                <div className="mt-2.5 flex items-center gap-2">
                  <input
                    type="number"
                    min={100}
                    step={100}
                    value={customQuotaAmount}
                    onChange={(e) => setCustomQuotaAmount(e.target.value)}
                    placeholder="例如: 2000"
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-border bg-surface text-foreground focus:outline-none focus:border-primary"
                  />
                  <span className="text-xs text-secondary shrink-0">点算力</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
              <button
                type="button"
                onClick={handleCloseAddModal}
                className="px-3.5 py-1.5 text-xs text-secondary hover:text-foreground rounded-lg transition"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={adding || !newUsername.trim()}
                className="px-4 py-1.5 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition shadow-2xs disabled:opacity-50 active:scale-[0.98]"
              >
                {adding ? '正在创建...' : '确认添加'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 2. 调整额度弹窗 Modal */}
      {editingQuotaMember && (
        <Modal
          isOpen
          onClose={() => setEditingQuotaMember(null)}
          className="w-[420px] max-w-[92vw] my-auto rounded-2xl bg-surface border border-border/80 shadow-2xl p-5 space-y-4 animate-fade-in"
        >
          <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
            <div className="flex items-center gap-2">
              <AdjustmentsHorizontalIcon className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">
                调整额度 - {editingQuotaMember.displayName || editingQuotaMember.username}
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setEditingQuotaMember(null)}
              className="text-secondary hover:text-foreground"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSaveQuota} className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEditQuotaMode('unlimited')}
                className={`px-3 py-2 text-xs rounded-lg border text-left transition flex items-center justify-between ${
                  editQuotaMode === 'unlimited'
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border/60 bg-surface hover:border-border text-foreground'
                }`}
              >
                <span>无限制</span>
                {editQuotaMode === 'unlimited' && <CheckIcon className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => setEditQuotaMode('custom')}
                className={`px-3 py-2 text-xs rounded-lg border text-left transition flex items-center justify-between ${
                  editQuotaMode === 'custom'
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border/60 bg-surface hover:border-border text-foreground'
                }`}
              >
                <span>限制额度</span>
                {editQuotaMode === 'custom' && <CheckIcon className="w-3.5 h-3.5" />}
              </button>
            </div>

            {editQuotaMode === 'custom' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">设定剩余可用算力</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={100}
                    step={100}
                    value={editCustomAmount}
                    onChange={(e) => setEditCustomAmount(e.target.value)}
                    placeholder="例如: 2000"
                    className="flex-1 px-3 py-2 text-xs rounded-lg border border-border bg-surface text-foreground focus:outline-none focus:border-primary"
                  />
                  <span className="text-xs text-secondary shrink-0">点算力</span>
                </div>
              </div>
            )}

            {quotaErrorMessage && (
              <div className="text-xs font-medium text-destructive">⚠️ {quotaErrorMessage}</div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
              <button
                type="button"
                onClick={() => setEditingQuotaMember(null)}
                className="px-3.5 py-1.5 text-xs text-secondary hover:text-foreground rounded-lg transition"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={savingQuota}
                className="px-4 py-1.5 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition shadow-2xs disabled:opacity-50"
              >
                {savingQuota ? '保存中...' : '保存额度'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 3. 解绑员工二次确认 Modal */}
      {deletingMember && (
        <Modal
          isOpen
          onClose={() => !deleting && setDeletingMember(null)}
          className="w-[400px] max-w-[92vw] my-auto rounded-2xl bg-surface border border-border/80 shadow-2xl p-5 space-y-4 animate-fade-in"
        >
          <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
            <h4 className="text-sm font-semibold text-foreground">确认解绑员工</h4>
            <button
              type="button"
              disabled={deleting}
              onClick={() => setDeletingMember(null)}
              className="text-secondary hover:text-foreground"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <p className="text-foreground">
              确定要解绑员工 <span className="font-bold text-primary">{deletingMember.displayName || deletingMember.username}</span> 吗？
            </p>
            <p className="text-secondary text-[11px] leading-relaxed">
              解绑后将立即作废该员工的专属访问凭据与 API Key，并释放回收席位供其他成员绑定。
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setDeletingMember(null)}
              className="px-3.5 py-1.5 text-xs text-secondary hover:text-foreground rounded-lg transition"
            >
              取消
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleConfirmDeleteStaff}
              className="px-4 py-1.5 text-xs font-medium text-white bg-destructive hover:bg-destructive/90 rounded-lg transition shadow-2xs disabled:opacity-50"
            >
              {deleting ? '解绑中...' : '确认解绑'}
            </button>
          </div>
        </Modal>
      )}
      </div>
    </div>
  );
};
