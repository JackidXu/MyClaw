import { XMarkIcon } from '@heroicons/react/24/outline';
import React, { useEffect, useRef, useState } from 'react';

import { i18nService } from '../services/i18n';
import { createPayOrder, fetchRechargeSpecs, queryPayStatus, RechargeSpecItem } from '../services/tradeService';
import Modal from './common/Modal';

// 局部的简易双语函数，避免污染全局 i18n
const t = (zh: string, en: string) => {
  return i18nService.getLanguage() === 'zh' ? zh : en;
};

interface PayModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const PayModal: React.FC<PayModalProps> = ({ onClose, onSuccess }) => {
  const [specs, setSpecs] = useState<RechargeSpecItem[]>([]);
  const [selectedSpec, setSelectedSpec] = useState<RechargeSpecItem | null>(null);
  const payChannel: 1 | 2 = 2; // 2: 支付宝
  
  const [loadingSpecs, setLoadingSpecs] = useState(true);
  const [loadingQRCode, setLoadingQRCode] = useState(false);
  const [qrcodeUrl, setQrcodeUrl] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<number | string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const checkStatusIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 1. 获取规格列表
  const loadSpecs = async () => {
    setLoadingSpecs(true);
    setErrorMessage(null);
    try {
      const res = await fetchRechargeSpecs();
      if (res.success && res.data.length > 0) {
        setSpecs(res.data);
        setSelectedSpec(res.data[0]);
      } else {
        setErrorMessage(res.error || t('获取充值规格失败', 'Failed to fetch recharge specs'));
      }
    } catch (e: any) {
      console.error('[PayModal] fetchSpecs error:', e);
      setErrorMessage(t('网络请求失败，请检查网络连接', 'Network error, please check connection'));
    } finally {
      setLoadingSpecs(false);
    }
  };

  // 2. 发起下单请求
  const handlePay = async (specId: number, payChannel: 1 | 2) => {
    const userId = localStorage.getItem('heyclaw_user_id');
    if (!userId) {
      setErrorMessage(t('未检测到登录凭证，请重新登录', 'Login credentials missing, please login again'));
      return;
    }

    setLoadingQRCode(true);
    setQrcodeUrl(null);
    setOrderId(null);
    setErrorMessage(null);

    // 清理之前的状态查询
    if (checkStatusIntervalRef.current) {
      clearInterval(checkStatusIntervalRef.current);
      checkStatusIntervalRef.current = null;
    }

    try {
      const res = await createPayOrder({
        versionId: specId,
        payChannel,
        userId,
      });

      if (res.success && res.data) {
        setQrcodeUrl(res.data.qrcode_url);
        setOrderId(res.data.order_id);
      } else {
        setErrorMessage(res.error || t('获取付款码失败，请重试', 'Failed to get payment code, please retry'));
      }
    } catch (e: any) {
      console.error('[PayModal] handlePay error:', e);
      setErrorMessage(t('下单失败，请检查网络', 'Failed to create order, please check network'));
    } finally {
      setLoadingQRCode(false);
    }
  };

  // 3. 轮询订单状态
  const startPolling = (id: number | string) => {
    if (checkStatusIntervalRef.current) {
      clearInterval(checkStatusIntervalRef.current);
    }

    const checkStatus = async () => {
      try {
        const res = await queryPayStatus(id);
        if (res.success && res.paymentStatus === 1) {
          // 支付成功
          if (checkStatusIntervalRef.current) {
            clearInterval(checkStatusIntervalRef.current);
          }
          window.dispatchEvent(
            new CustomEvent('app:showToast', {
              detail: t('🎉 充值成功！点数已自动刷新。', '🎉 Recharge successful! Balance refreshed.'),
            }),
          );
          onSuccess();
          onClose();
        }
      } catch (e) {
        console.error('[PayModal] polling status error:', e);
      }
    };

    checkStatus();
    // 2.5 秒轮询一次
    checkStatusIntervalRef.current = setInterval(checkStatus, 2500);
  };

  // 支付宝 iframe 渲染
  useEffect(() => {
    if (payChannel === 2 && qrcodeUrl && iframeRef.current) {
      const doc = iframeRef.current.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(qrcodeUrl);
        doc.close();
      }
    }
  }, [payChannel, qrcodeUrl]);

  // 当 orderId 改变时启动轮询
  useEffect(() => {
    if (orderId) {
      startPolling(orderId);
    }
    return () => {
      if (checkStatusIntervalRef.current) {
        clearInterval(checkStatusIntervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // 组件挂载时获取规格列表
  useEffect(() => {
    void loadSpecs();
    return () => {
      if (checkStatusIntervalRef.current) {
        clearInterval(checkStatusIntervalRef.current);
      }
    };
  }, []);

  // 切换规格或渠道时自动下单
  const handleSpecSelect = (spec: RechargeSpecItem) => {
    setSelectedSpec(spec);
    void handlePay(spec.version_id, payChannel);
  };

  const handleSpecSelectRef = useRef(handleSpecSelect);
  useEffect(() => {
    handleSpecSelectRef.current = handleSpecSelect;
  });

  // 当初始加载完毕并选中默认规格时，自动下单获取微信付款码
  const initPayTriggeredRef = useRef(false);
  useEffect(() => {
    if (selectedSpec && !initPayTriggeredRef.current) {
      initPayTriggeredRef.current = true;
      handleSpecSelectRef.current(selectedSpec);
    }
  }, [selectedSpec]);


  return (
    <Modal
      onClose={onClose}
      className="w-full max-w-[460px] mx-4 bg-surface rounded-2xl shadow-xl overflow-hidden border border-border/40 animate-fade-in flex flex-col"
    >
      {/* 头部标题 */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 shrink-0">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-1.5">
          <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          {t('自助充值', 'Wallet Recharge')}
        </h3>
        <button
          onClick={onClose}
          className="p-1.5 text-secondary hover:text-foreground rounded-lg hover:bg-surface-raised transition-colors"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      {/* 主体内容 */}
      <div className="px-6 py-5 flex flex-col space-y-5 overflow-y-auto">
        {loadingSpecs ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <svg className="animate-spin h-6 w-6 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-xs text-secondary">{t('正在载入规格列表...', 'Loading specs list...')}</span>
          </div>
        ) : errorMessage && !specs.length ? (
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-2">
            <div className="text-sm font-medium text-red-500">{errorMessage}</div>
            <button
              onClick={loadSpecs}
              className="text-xs text-primary hover:underline font-medium"
            >
              {t('重新加载', 'Reload')}
            </button>
          </div>
        ) : (
          <>
            {/* 充值规格选择 */}
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-secondary">{t('选择充值额度', 'Select Amount')}</div>
              <div className="grid grid-cols-3 gap-2.5">
                {specs.map((spec) => {
                  const isSelected = selectedSpec?.version_id === spec.version_id;
                  return (
                    <button
                      key={spec.version_id}
                      onClick={() => handleSpecSelect(spec)}
                      className={`p-3.5 rounded-xl border-2 text-center transition-all flex flex-col items-center justify-center select-none duration-150 ${
                        isSelected
                          ? 'border-primary bg-primary/5 text-primary shadow-sm'
                          : 'border-border/60 bg-transparent text-foreground hover:border-border hover:bg-surface-raised active:scale-95'
                      }`}
                    >
                      <span className="text-sm font-bold truncate max-w-full">{spec.name}</span>
                      <span className={`text-xs mt-1.5 font-medium ${isSelected ? 'text-primary/95' : 'text-secondary'}`}>
                        ¥{spec.amount / 100}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>


            {/* 付款码展示区域 */}
            <div className="border border-border/40 rounded-2xl bg-surface-raised/30 p-5 flex flex-col items-center justify-center min-h-[230px] relative overflow-hidden">
              {loadingQRCode ? (
                <div className="flex flex-col items-center justify-center space-y-2.5">
                  <svg className="animate-spin h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-[11px] text-secondary font-medium">{t('正在获取付款码...', 'Generating code...')}</span>
                </div>
              ) : errorMessage ? (
                <div className="text-center p-4">
                  <div className="text-xs font-semibold text-red-500">{errorMessage}</div>
                  <button
                    onClick={() => selectedSpec && handlePay(selectedSpec.version_id, payChannel)}
                    className="text-xs text-primary hover:underline mt-2 font-medium block mx-auto"
                  >
                    {t('重试下单', 'Retry Order')}
                  </button>
                </div>
              ) : qrcodeUrl ? (
                <div className="flex flex-col items-center justify-center space-y-3.5 w-full">
                  {/* 支付宝 iframe */}
                  <div className="w-[160px] h-[160px] bg-white rounded-xl shadow-md border border-border/10 overflow-hidden flex items-center justify-center mx-auto">
                    <iframe
                      ref={iframeRef}
                      className="w-[160px] h-[160px] border-0 shrink-0 select-none pointer-events-none"
                      scrolling="no"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                    </span>
                    {t('请使用支付宝扫码支付', 'Please scan with Alipay to pay')}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-secondary font-medium">
                  {t('选择上方规格即可开始生成付款码', 'Select a spec above to generate code')}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default PayModal;
