import React, { useState } from 'react';

import { getChangePasswordUrl } from '../services/endpoints';

interface PasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const PasswordModal: React.FC<PasswordModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!oldPassword.trim()) {
      setErrorMsg('请输入原密码');
      return;
    }

    if (newPassword.length < 8) {
      setErrorMsg('新密码长度不能少于 8 位');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('两次输入的新密码不一致');
      return;
    }

    setLoading(true);
    const apiKey = localStorage.getItem('heyclaw_api_key');
    const userId = localStorage.getItem('heyclaw_user_id');

    try {
      if (!apiKey || !userId) {
        throw new Error('未检测到您的登录凭证，请重新登录');
      }

      // 通过管理后台代理修改密码
      const targetUrl = getChangePasswordUrl();

      const res = await window.electron.api.fetch({
        url: targetUrl,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          oldPassword: oldPassword.trim(),
          newPassword: newPassword.trim(),
        }),
      }) as any;

      if (!res.ok || !res.data || !res.data.success) {
        throw new Error(res.data?.error || res.data?.message || '修改密码失败，请检查原密码或格式');
      }

      // 修改成功后的处理：清除缓存并引导退出登录
      localStorage.removeItem('heyclaw_user_id');
      localStorage.removeItem('heyclaw_api_key');
      localStorage.removeItem('heyclaw_session');
      localStorage.removeItem('heyclaw_user_balance');

      onSuccess();
    } catch (err: any) {
      console.error('[PasswordModal] Update password error:', err);
      setErrorMsg(err.message || '修改失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm select-none">
      <div className="w-full max-w-sm p-8 bg-white border border-gray-150 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.03)] animate-in fade-in zoom-in-95 duration-200">
        <h3 className="text-sm font-semibold text-gray-800 mb-6">修改登录密码</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              原密码
            </label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="请输入当前的原密码"
              disabled={loading}
              className="w-full px-3.5 py-2.5 text-sm bg-gray-50/50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary/50 focus:bg-white transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              新密码
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="请输入新密码（不少于8位）"
              disabled={loading}
              className="w-full px-3.5 py-2.5 text-sm bg-gray-50/50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary/50 focus:bg-white transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              确认新密码
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="请再次输入新密码"
              disabled={loading}
              className="w-full px-3.5 py-2.5 text-sm bg-gray-50/50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary/50 focus:bg-white transition-all"
              required
            />
          </div>

          {errorMsg && (
            <div className="p-2.5 text-xs font-medium text-destructive bg-destructive/10 rounded-xl border border-destructive/20 break-words">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 text-xs font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200/80 rounded-xl active:scale-[0.98] transition-all"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary/95 rounded-xl active:scale-[0.98] transition-all"
            >
              {loading ? '修改中...' : '确认修改'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
