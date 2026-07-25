import React from 'react';

interface PremiumGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  expertName?: string;
  expertDescription?: string;
  title?: string;
  description?: string;
}

export const PremiumGuideModal: React.FC<PremiumGuideModalProps> = ({
  isOpen,
  onClose,
  expertName,
  expertDescription,
  title,
  description,
}) => {
  if (!isOpen) return null;

  const displayTitle = title || (expertName ? `解锁【${expertName}】付费专家` : '解锁付费专家');
  const displayDescription = description || expertDescription || '解锁高端专有商业情报、竞争洞察与定制 AI 技能。';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200 select-none">
      <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-gray-100 flex flex-col items-center text-center relative">
        
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
        >
          ✕
        </button>

        {/* 标题与描述 */}
        <h3 className="text-xl font-bold text-gray-900 tracking-tight mb-2 pt-2">{displayTitle}</h3>
        <p className="text-sm text-gray-500 w-full max-w-sm mb-6 whitespace-nowrap truncate">
          {displayDescription}
        </p>

        {/* 权益亮点 */}
        <div className="w-full bg-amber-50/60 border border-amber-100/80 rounded-xl p-3.5 mb-6 text-left space-y-2">
          <div className="flex items-center text-xs text-amber-900 font-medium">
            <span className="text-amber-500 mr-2">✓</span> 包含深度商业情报及竞争洞察 Skill 套件
          </div>
          <div className="flex items-center text-xs text-amber-900 font-medium">
            <span className="text-amber-500 mr-2">✓</span> 一对一专属技术客服与服务支持
          </div>
        </div>

        {/* 客服二维码 / 联系引导 */}
        <div className="w-full bg-gray-50 rounded-xl p-4 flex flex-col items-center justify-center border border-gray-100 mb-4">
          <div className="w-36 h-36 bg-white border border-gray-200 rounded-xl p-1.5 flex items-center justify-center shadow-sm mb-2 overflow-hidden">
            <img
              src="https://scrm0.cdn.banchengyun.com/heyclaw/server-assets/customer-service-qrcode.jpg"
              alt="客服二维码"
              className="w-full h-full object-cover rounded-lg select-none"
            />
          </div>
          <p className="text-xs text-gray-500 font-medium">请扫码联系专属客服完成开通或续费</p>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-medium text-sm transition-colors"
        >
          我知道了
        </button>

      </div>
    </div>
  );
};
