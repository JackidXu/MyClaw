import React from 'react';

import { i18nService } from '../../services/i18n';
import Modal from '../common/Modal';

interface ChatLoginExperienceModalProps {
  loginPending: boolean;
  onClose: () => void;
  onStart: () => void;
}

const ChatLoginExperienceModal: React.FC<ChatLoginExperienceModalProps> = ({
  loginPending,
  onClose,
  onStart,
}) => {
  return (
    <Modal
      onClose={onClose}
      onEscape={onClose}
      overlayClassName="non-draggable fixed inset-0 z-[10050] flex items-center justify-center bg-black/35 px-6 backdrop-blur-[1px]"
      className="modal-content relative w-full max-w-[560px] overflow-hidden rounded-[28px] border border-border bg-surface px-6 pb-12 pt-12 text-center text-foreground shadow-modal sm:px-8 sm:pb-16 sm:pt-14"
    >
      <div className="relative z-10 flex flex-col items-center">
        <img
          src="logo.png"
          alt="LobsterAI"
          width={72}
          height={72}
          className="rounded-2xl select-none"
          draggable={false}
        />
        <h2 className="mt-8 text-[30px] font-semibold leading-[1.28] tracking-normal sm:text-[32px]">
          <span className="block">{i18nService.t('chatLoginExperienceTitlePrefix')}</span>
          <span className="block text-[36px] font-bold leading-[1.2] sm:text-[38px]">LobsterAI</span>
        </h2>
        <p className="mt-16 text-lg leading-[1.85] tracking-normal sm:mt-24 sm:text-xl">
          <span className="block">{i18nService.t('chatLoginExperiencePromoLine1')}</span>
          <span className="block">{i18nService.t('chatLoginExperiencePromoLine2')}</span>
        </p>
        <button
          type="button"
          onClick={onStart}
          disabled={loginPending}
          className="relative mt-12 h-[56px] w-full max-w-[310px] overflow-hidden rounded-[20px] bg-foreground px-8 text-[26px] font-medium leading-none text-surface shadow-[0_14px_28px_rgba(0,0,0,0.12)] transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70 active:scale-[0.99] sm:h-[58px] sm:text-[30px]"
        >
          <span
            className="pointer-events-none absolute inset-x-6 bottom-[-18px] h-8 bg-[linear-gradient(90deg,#26E6A5,#31A8FF,#C53BFF,#FF4C7A)] blur-xl"
            aria-hidden="true"
          />
          <span className="relative">
            {i18nService.t(loginPending ? 'chatLoginExperienceStarting' : 'chatLoginExperienceStart')}
          </span>
        </button>
      </div>
    </Modal>
  );
};

export default ChatLoginExperienceModal;
