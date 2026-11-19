import { BuildingOfficeIcon, PlusIcon, TrashIcon, UserIcon, XMarkIcon } from '@heroicons/react/24/outline';
import React, { useCallback, useEffect, useState } from 'react';

import { httpClient } from '../services/httpClient';
import { i18nService } from '../services/i18n';
import Modal from './common/Modal';

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
  accountExpireAt: string | null;
  hasSecondBrain: boolean;
  secondBrainExpireAt: string | null;
}

interface EnterpriseModalProps {
  onClose: () => void;
}

export const EnterpriseModal: React.FC<EnterpriseModalProps> = ({ onClose }) => {
  const [loading, setLoading] = useState(true);
  const [enterpriseInfo, setEnterpriseInfo] = useState<EnterpriseInfo | null>(null);
  const [members, setMembers] = useState<EnterpriseMember[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [enableBrain, setEnableBrain] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [infoRes, membersRes] = await Promise.all([
        httpClient.admin.get<{ success: boolean; data?: EnterpriseInfo; error?: string }>('/api/client/enterprise/info'),
        httpClient.admin.get<{ success: boolean; data?: EnterpriseMember[]; error?: string }>('/api/client/enterprise/members'),
      ]);

      if (infoRes.ok && infoRes.data?.success && infoRes.data.data) {
        setEnterpriseInfo(infoRes.data.data);
      } else {
        setErrorMessage(infoRes.data?.error || '获取企业信息失败');
      }

      if (membersRes.ok && membersRes.data?.success && Array.isArray(membersRes.data.data)) {
        setMembers(membersRes.data.data);
      }
    } catch (err: any) {
      console.error('[EnterpriseModal] fetchData error:', err);
      setErrorMessage(err.message || '网络连接异常');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;

    setAdding(true);
    setErrorMessage(null);
    try {
      const res = await httpClient.admin.post<{
        success: boolean;
        data?: { userId: number; username: string; isNewCreated: boolean; defaultPassword?: string };
        error?: string;
      }>('/api/client/enterprise/members', {
        username: newUsername.trim(),
        enableBrain,
      });

      if (res.ok && res.data?.success) {
        setIsAddModalOpen(false);
        setNewUsername('');
        fetchData();
      } else {
        setErrorMessage(res.data?.error || '添加员工失败');
      }
    } catch (err: any) {
      setErrorMessage(err.message || '添加员工请求失败');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteStaff = async (userId: number, username: string) => {
    if (!window.confirm(`确定要将员工【${username}】从企业中移除吗？移除后将回收该员工的席位与权限。`)) {
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

  return (
    <Modal isOpen onClose={onClose} className="w-[720px] max-w-[95vw] rounded-2xl bg-surface border border-border/80 shadow-2xl p-0 overflow-hidden flex flex-col max-h-[85vh]">
      {/* 弹窗头部 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <BuildingOfficeIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {enterpriseInfo?.name || i18nService.t('sidebarMyEnterprise')}
            </h2>
            <p className="text-xs text-secondary">
              企业成员共享主额度池，第二大脑与账号有效期随企业所有者同步
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-secondary hover:text-foreground hover:bg-surface-raised transition-colors"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* 弹窗主体内容 */}
      <div className="p-6 overflow-y-auto flex-1 space-y-6">
        {errorMessage && (
          <div className="p-3 text-xs rounded-xl bg-destructive/10 text-destructive border border-destructive/20">
            {errorMessage}
          </div>
        )}

        {/* 概览卡片 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 rounded-xl bg-surface-raised/50 border border-border/60">
            <div className="text-xs text-secondary mb-1">企业成员</div>
            <div className="text-xl font-semibold text-foreground">
              {enterpriseInfo?.memberCount ?? '--'} <span className="text-xs font-normal text-secondary">人</span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-surface-raised/50 border border-border/60">
            <div className="text-xs text-secondary mb-1">账号有效期</div>
            <div className="text-sm font-semibold text-foreground truncate">
              {enterpriseInfo?.accountExpireAt || '未生效'}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-surface-raised/50 border border-border/60">
            <div className="text-xs text-secondary mb-1">第二大脑有效期</div>
            <div className="text-sm font-semibold text-foreground truncate">
              {enterpriseInfo?.secondBrainExpireAt || '未生效'}
            </div>
          </div>
        </div>

        {/* 员工列表区 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">员工列表</h3>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition shadow-sm"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>添加员工</span>
            </button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-secondary">加载员工列表中...</div>
          ) : members.length === 0 ? (
            <div className="py-12 text-center text-xs text-secondary rounded-xl border border-dashed border-border/80">
              暂无企业员工，点击右上角【添加员工】为企业添加成员席位
            </div>
          ) : (
            <div className="border border-border/60 rounded-xl divide-y divide-border/40 overflow-hidden">
              {members.map((m) => (
                <div key={m.userId} className="flex items-center justify-between p-3.5 hover:bg-surface-raised/40 transition">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-secondary/15 flex items-center justify-center text-secondary shrink-0">
                      <UserIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-foreground flex items-center gap-2">
                        <span>{m.displayName || m.username}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-raised text-secondary font-normal">
                          UID: {m.userId}
                        </span>
                      </div>
                      <div className="text-[11px] text-secondary mt-0.5 flex items-center gap-2">
                        <span>额度模式: 共享总池</span>
                        <span>•</span>
                        <span>第二大脑: {m.hasSecondBrain ? '已开通' : '未开通'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right text-[11px] text-secondary">
                      <div>账号至: {m.accountExpireAt || '--'}</div>
                    </div>
                    <button
                      type="button"
                      disabled={deletingUserId === m.userId}
                      onClick={() => handleDeleteStaff(m.userId, m.displayName || m.username)}
                      className="p-1.5 text-secondary hover:text-destructive hover:bg-destructive/10 rounded-lg transition disabled:opacity-50"
                      title="移除员工"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 添加员工二级弹窗 */}
      {isAddModalOpen && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-surface border border-border rounded-xl shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">添加新员工</h4>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-secondary hover:text-foreground"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddStaff} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  员工用户名 / 账号
                </label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="例如: staff_01"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-surface-raised focus:outline-none focus:border-primary text-foreground"
                />
                <p className="text-[11px] text-secondary mt-1">
                  系统将为员工创建全新账号，初始密码为 12345678（员工登录后可自行修改）
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  额度消耗模式
                </label>
                <div className="text-xs text-secondary px-3 py-2 rounded-lg bg-surface-raised/60 border border-border/40">
                  共享老板企业总额度池（实时从企业主池扣减）
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-foreground">开通第二大脑席位</span>
                <input
                  type="checkbox"
                  checked={enableBrain}
                  onChange={(e) => setEnableBrain(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-secondary hover:text-foreground rounded-lg transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={adding || !newUsername.trim()}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
                >
                  {adding ? '添加中...' : '确认添加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Modal>
  );
};
