import {
  AdjustmentsHorizontalIcon,
  BuildingOfficeIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
  UserIcon,
  UserPlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import React, { useCallback, useEffect, useState } from 'react';

import { httpClient } from '../../services/httpClient';
import { i18nService } from '../../services/i18n';
import Modal from '../common/Modal';

const MAX_STAFF_LIMIT = 5;

interface EnterpriseInfo {
  id: number;
  name: string;
  ownerUserId: number;
  memberCount: number;
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

  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
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
  const isLimitReached = currentCount >= MAX_STAFF_LIMIT;
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
      setAddErrorMessage(`企业席位已满（最多支持 ${MAX_STAFF_LIMIT} 名员工）`);
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

  const handleDeleteStaff = async (userId: number, username: string) => {
    if (!window.confirm(`确定要移除员工【${username}】吗？移除后将作废其专属 API Key 并回收席位。`)) {
      return;
    }

    setDeletingUserId(userId);
    try {
      const res = await httpClient.admin.delete<{ success: boolean; error?: string }>(
        `/api/client/enterprise/members/${userId}`
      );
      if (res.ok && res.data?.success) {
        setMembers((prev) => prev.filter((m) => m.userId !== userId));
        if (enterpriseInfo) {
          setEnterpriseInfo({ ...enterpriseInfo, memberCount: Math.max(0, enterpriseInfo.memberCount - 1) });
        }
      } else {
        alert(res.data?.error || '移除员工失败');
      }
    } catch (err: any) {
      alert(err.message || '移除员工请求失败');
    } finally {
      setDeletingUserId(null);
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
    <div className="rounded-2xl border border-border/80 bg-surface p-5 md:p-6 shadow-sm space-y-6">
      {/* 头部标题区 */}
      <div className="flex items-center justify-between pb-4 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/25 flex items-center justify-center text-primary shadow-2xs">
            <BuildingOfficeIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground">
                {enterpriseInfo?.name || i18nService.t('sidebarMyEnterprise')}
              </h2>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/25">
                企业版
              </span>
            </div>
            <p className="text-xs text-secondary mt-0.5">
              企业成员共享第二大脑与企业主算力池，支持精细化分配员工额度
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={isLimitReached}
          onClick={handleOpenAddModal}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg transition shadow-2xs ${
            isLimitReached
              ? 'bg-surface-raised text-secondary border border-border/70 cursor-not-allowed opacity-60'
              : 'text-white bg-primary hover:bg-primary/90 active:scale-[0.98]'
          }`}
          title={isLimitReached ? `已达到最大员工数限制（${MAX_STAFF_LIMIT}人）` : '添加新员工'}
        >
          <PlusIcon className="w-3.5 h-3.5" />
          <span>{isLimitReached ? '席位已满 (5/5)' : '添加员工'}</span>
        </button>
      </div>

      {sectionErrorMessage && (
        <div className="p-3 text-xs rounded-xl bg-destructive/10 text-destructive border border-destructive/20 flex items-center justify-between">
          <span>{sectionErrorMessage}</span>
          <button type="button" onClick={() => setSectionErrorMessage(null)} className="text-destructive font-bold text-sm">×</button>
        </div>
      )}

      {/* 顶部概览指标栏 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-surface-raised/40 border border-border/50">
        <div>
          <div className="text-[11px] text-secondary font-medium">成员席位配额</div>
          <div className="text-lg font-bold text-foreground mt-0.5">
            {currentCount} <span className="text-xs font-normal text-secondary">/ {MAX_STAFF_LIMIT} 人</span>
          </div>
        </div>
        <div>
          <div className="text-[11px] text-secondary font-medium">企业账号有效期</div>
          <div className="text-xs font-semibold text-foreground mt-1 truncate">
            {enterpriseInfo?.accountExpireAt || '未生效'}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-secondary font-medium">第二大脑有效期</div>
          <div className="text-xs font-semibold text-foreground mt-1 truncate">
            {enterpriseInfo?.secondBrainExpireAt || '未生效'}
          </div>
        </div>
      </div>

      {/* 员工列表：AntD 经典现代风格表格 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-foreground">员工列表</h3>
        </div>

        <div className="border border-border/70 rounded-xl overflow-hidden bg-surface shadow-2xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-raised/50 border-b border-border/70 text-secondary font-medium">
                <th className="py-2.5 px-4">员工账号</th>
                <th className="py-2.5 px-4">算力额度</th>
                <th className="py-2.5 px-4">添加时间</th>
                <th className="py-2.5 px-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-secondary">
                    加载员工列表中...
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-secondary">
                    暂无企业员工，点击右上角【添加员工】分配成员账号
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr key={m.userId} className="hover:bg-surface-raised/40 transition-colors">
                    {/* 员工信息 */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
                          {m.displayName ? m.displayName.slice(0, 1) : <UserIcon className="w-3.5 h-3.5" />}
                        </div>
                        <span className="font-semibold text-foreground">{m.displayName || m.username}</span>
                      </div>
                    </td>

                    {/* 额度 */}
                    <td className="py-3 px-4">
                      {m.isUnlimitedQuota ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-surface-raised text-secondary border border-border/60">
                          无限制
                        </span>
                      ) : (
                        <div className="text-[11px]">
                          <span className="text-secondary">剩余点数: </span>
                          <span className="font-semibold text-foreground font-mono">
                            {(m.remainQuota ?? 0).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* 添加时间 */}
                    <td className="py-3 px-4 text-secondary text-[11px] font-mono">
                      {formatCreatedAt(m.createdAt)}
                    </td>

                    {/* 操作列 */}
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenQuotaModal(m)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-foreground bg-surface-raised hover:bg-primary/10 hover:text-primary border border-border/70 hover:border-primary/30 rounded-lg transition"
                          title="调整算力额度"
                        >
                          <AdjustmentsHorizontalIcon className="w-3.5 h-3.5" />
                          <span>调整额度</span>
                        </button>

                        <button
                          type="button"
                          disabled={deletingUserId === m.userId}
                          onClick={() => handleDeleteStaff(m.userId, m.displayName || m.username)}
                          className="p-1.5 text-secondary hover:text-destructive hover:bg-destructive/10 rounded-lg transition disabled:opacity-50"
                          title="移除员工"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
    </div>
  );
};
