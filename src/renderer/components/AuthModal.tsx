import React, { useState } from 'react';

import { configService } from '../services/config';

interface AuthModalProps {
  isOpen: boolean;
  onSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [activeCode, setActiveCode] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      if (!username.trim() || !password.trim()) {
        throw new Error('请输入账号和密码');
      }

      if (password.trim().length < 8) {
        throw new Error('密码长度至少为 8 位');
      }

      if (!isLogin && !activeCode.trim()) {
        throw new Error('注册需要输入有效的激活码');
      }

      // 无论登录还是注册，先清空浏览器原存的 Cookie 缓存，防止旧账号 Session 凭证干扰
      try {
        await window.electron.artifact.clearBrowserCookies();
      } catch (cookieErr) {
        console.warn('Failed to clear browser cookies on submit:', cookieErr);
      }

      const adminBaseUrl = 'https://admin.claw.chaohui.ai';

      if (!isLogin) {
        // 1. 注册逻辑
        const registerRes = await window.electron.api.fetch({
          url: `${adminBaseUrl}/api/register`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activeCode: activeCode.trim(),
            username: username.trim(),
            password: password.trim(),
          }),
        }) as any;

        if (!registerRes.ok || !registerRes.data || !registerRes.data.success) {
          throw new Error(registerRes.data?.error || '激活注册失败，请检查激活码或账号');
        }
      }

      // 2. 登录逻辑 (安全获取后端托管生成的对话令牌)
      const loginRes = await window.electron.api.fetch({
        url: `${adminBaseUrl}/api/client/login`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
        }),
      }) as any;

      if (!loginRes.ok || !loginRes.data || !loginRes.data.success) {
        throw new Error(loginRes.data?.error || '登录失败，请检查账号密码');
      }

      const userId = loginRes.data.data?.id;
      const apiKey = loginRes.data.data?.token; // 后端已代管生成好的完整明文 sk- 令牌
      const session = loginRes.data.data?.session; // 后端返回的会话 Cookie

      if (!userId || !apiKey || !session) {
        throw new Error('登录成功，但未解析到有效的对话令牌或会话凭证');
      }

      // 保存用户 ID、会话凭证和最权威的对话令牌 heyclaw_api_key
      localStorage.setItem('heyclaw_user_id', String(userId));
      localStorage.setItem('heyclaw_session', session);
      
      const formattedKey = apiKey.startsWith('sk-') ? apiKey : `sk-${apiKey}`;
      localStorage.setItem('heyclaw_api_key', formattedKey);

      // 同步更新系统模型服务 Provider 配置，并拉取同步最新模型，使后续聊天调用该 key 生效且能成功校验
      const currentConfig = configService.getConfig();
      const currentOneapi = (currentConfig.providers?.['oneapi'] || {}) as any;
      const oneapiBaseUrl = currentOneapi.baseUrl?.trim() || 'https://token.chaohui.ai/v1';

      let chatModels: any[] = [];
      let defaultChatModel = '';

      try {
        const cleanBaseUrl = oneapiBaseUrl.replace(/\/+$/, '');
        const testUrl = `${cleanBaseUrl}/models`;
        const checkResp = await window.electron.api.fetch({
          url: testUrl,
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${formattedKey}`,
          },
        }) as any;

        if (checkResp.ok && checkResp.data && Array.isArray(checkResp.data.data)) {
          for (const m of checkResp.data.data) {
            const modelId = m.id;
            const isImage = /dall-e|stable-diffusion|\bsdxl\b|midjourney|\bmj-v\d+|controlnet|\bflux\b|seedream/i.test(modelId);
            const hasVideoKeyword = /cogvideo|seedance|sora|kling|\bluma\b|runway|video-gen/i.test(modelId);
            const isVideoUnderstanding = /chat|understand|vision|vl|multimodal/i.test(modelId);
            const isVideo = hasVideoKeyword && !isVideoUnderstanding;

            if (!isImage && !isVideo) {
              chatModels.push({
                id: modelId,
                name: modelId,
                supportsImage: true,
              });
            }
          }
          defaultChatModel = chatModels[0]?.id || '';
        }
      } catch (modelErr) {
        console.error('[AuthModal] Failed to fetch and sync models on login success:', modelErr);
      }

      await configService.updateConfig({
        providers: {
          ...currentConfig.providers,
          oneapi: {
            ...currentOneapi,
            apiKey: formattedKey,
            enabled: true,
            models: chatModels.length > 0 ? chatModels : (currentOneapi?.models || []),
            baseUrl: oneapiBaseUrl,
          }
        },
        model: {
          ...currentConfig.model,
          defaultModel: defaultChatModel || currentConfig.model?.defaultModel || '',
          defaultModelProvider: 'oneapi',
          availableModels: chatModels.length > 0 
            ? chatModels.map(m => ({ ...m, provider: 'oneapi', providerKey: 'oneapi' }))
            : currentConfig.model?.availableModels,
        }
      });


      // 触发成功回调
      onSuccess();
    } catch (err: any) {
      console.error('[AuthModal] Auth flow error:', err);
      setErrorMsg(err.message || '请求处理异常，请检查网络');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#fcfdfe] select-none">
      <div className="w-full max-w-sm p-8 bg-white border border-gray-150 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.03)] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Title */}
        <div className="text-center mb-8">
          <h2 className="text-xl font-bold text-gray-800 tracking-tight">
            {isLogin ? '登录您的账户' : '注册'}
          </h2>
          <p className="text-xs text-gray-400 mt-1.5">
            {isLogin ? '欢迎回来，请输入您的账号凭证' : '请输入激活码以完成账户注册'}
          </p>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                激活码
              </label>
              <input
                type="text"
                value={activeCode}
                onChange={(e) => setActiveCode(e.target.value)}
                placeholder="请输入激活码"
                disabled={loading}
                className="w-full px-3.5 py-2.5 text-sm bg-gray-50/50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary/50 focus:bg-white transition-all"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              账号
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入您的账号"
              disabled={loading}
              className="w-full px-3.5 py-2.5 text-sm bg-gray-50/50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary/50 focus:bg-white transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex justify-between">
              <span>密码</span>
              <span className="text-[10px] text-gray-400 font-normal">密码长度至少 8 位</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入您的密码（至少8位）"
                disabled={loading}
                className="w-full pl-3.5 pr-10 py-2.5 text-sm bg-gray-50/50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary/50 focus:bg-white transition-all"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors z-10 cursor-pointer"
                title={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4l16 16" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 text-xs font-medium text-red-600 bg-red-50 rounded-xl border border-red-100 break-words">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 mt-4 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary/95 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none transition-all shadow-[0_4px_12px_rgba(59,130,246,0.15)]"
          >
            {loading ? '处理中...' : isLogin ? '立 即 登 录' : '注册并登录'}
          </button>
        </form>

        {/* Footer Navigation */}
        <div className="text-center mt-4">
          {isLogin ? (
            <button
              type="button"
              onClick={() => {
                setIsLogin(false);
                setErrorMsg('');
              }}
              className="text-xs text-gray-400 hover:text-primary transition-colors hover:underline font-medium"
            >
              没有账号？去注册
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsLogin(true);
                setErrorMsg('');
              }}
              className="text-xs text-gray-400 hover:text-primary transition-colors hover:underline font-medium"
            >
              已有账号？立即登录
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
