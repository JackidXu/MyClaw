import React, { useEffect, useRef, useState } from 'react';

import AgentAvatarIcon from './AgentAvatarIcon';

interface AgentAvatarPickerProps {
  value: string;
  onChange: (value: string) => void;
}

const AgentAvatarPicker: React.FC<AgentAvatarPickerProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside, true);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [isOpen]);

  const AVATAR_OPTIONS = [
    'avatar_1',
    'avatar_2',
    'avatar_3',
    'avatar_4',
    'avatar_5',
    'avatar_6',
    'avatar_7',
    'avatar_8',
    'avatar_9',
    'avatar_10',
    'avatar_11',
    'avatar_12',
    'avatar_13',
    'avatar_14',
    'avatar_15',
    'avatar_16',
  ];

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title="选择专家头像"
        aria-label="选择专家头像"
        className={`w-11 h-11 flex items-center justify-center rounded-full shrink-0 overflow-hidden transition-shadow hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 ${
          isOpen ? 'ring-2 ring-primary/60 ring-offset-1' : ''
        }`}
      >
        <AgentAvatarIcon
          value={value || 'avatar_1'}
          className="h-11 w-11 rounded-full shadow-sm"
          useDefaultWhenEmpty
        />
      </button>

      {isOpen && (
        <div
          className="absolute left-0 top-full z-50 mt-2 w-[285px] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <div className="grid grid-cols-4 gap-x-3 gap-y-4 px-4 py-5 justify-items-center">
            {AVATAR_OPTIONS.map((avatarName) => {
              const isSelected = value === avatarName;

              return (
                <button
                  key={avatarName}
                  type="button"
                  onClick={() => {
                    onChange(avatarName);
                    setIsOpen(false);
                  }}
                  className={`flex h-12 w-12 items-center justify-center rounded-full transition-all focus:outline-none ${
                    isSelected
                      ? 'shadow-md ring-2 ring-primary ring-offset-1 scale-105'
                      : 'hover:scale-105'
                  }`}
                >
                  <AgentAvatarIcon
                    value={avatarName}
                    className="h-12 w-12 rounded-full"
                    useDefaultWhenEmpty={false}
                  />
                </button>
              );
            })}
          </div>

          <div className="border-t border-border px-5 py-3 flex justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-xs font-semibold text-secondary hover:text-primary transition-colors cursor-pointer"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentAvatarPicker;
