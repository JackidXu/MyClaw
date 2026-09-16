import React, { useState } from 'react';

import avatar1 from '../../assets/avatars/avatar_1.png';
import avatar2 from '../../assets/avatars/avatar_2.png';
import avatar3 from '../../assets/avatars/avatar_3.png';
import avatar4 from '../../assets/avatars/avatar_4.png';
import avatar5 from '../../assets/avatars/avatar_5.png';
import avatar6 from '../../assets/avatars/avatar_6.png';
import avatar7 from '../../assets/avatars/avatar_7.png';
import avatar8 from '../../assets/avatars/avatar_8.png';
import avatar9 from '../../assets/avatars/avatar_9.png';
import avatar10 from '../../assets/avatars/avatar_10.png';
import avatar11 from '../../assets/avatars/avatar_11.png';
import avatar12 from '../../assets/avatars/avatar_12.png';
import avatar13 from '../../assets/avatars/avatar_13.png';
import avatar14 from '../../assets/avatars/avatar_14.png';
import avatar15 from '../../assets/avatars/avatar_15.png';
import avatar16 from '../../assets/avatars/avatar_16.png';

export const AVATAR_IMAGES: Record<string, string> = {
  avatar_1: avatar1,
  avatar_2: avatar2,
  avatar_3: avatar3,
  avatar_4: avatar4,
  avatar_5: avatar5,
  avatar_6: avatar6,
  avatar_7: avatar7,
  avatar_8: avatar8,
  avatar_9: avatar9,
  avatar_10: avatar10,
  avatar_11: avatar11,
  avatar_12: avatar12,
  avatar_13: avatar13,
  avatar_14: avatar14,
  avatar_15: avatar15,
  avatar_16: avatar16,
};

interface AgentAvatarIconProps {
  avatar?: string | null;
  agentId?: string;
  isMain?: boolean;
  className?: string;
  useDefaultWhenEmpty?: boolean;
}

const AgentAvatarIcon: React.FC<AgentAvatarIconProps> = ({
  avatar: avatarProp,
  className = 'h-10 w-10',
}) => {
  const [imgError, setImgError] = useState(false);
  const rawInput = (avatarProp || '').trim();

  let finalUrl = avatar1;

  if (rawInput && !imgError) {
    const avatarMatch = rawInput.match(/avatar_(\d+)(?:\.(png|jpg|jpeg))?/i);
    const matchedKey = avatarMatch ? `avatar_${avatarMatch[1]}` : null;

    if (matchedKey && AVATAR_IMAGES[matchedKey]) {
      finalUrl = AVATAR_IMAGES[matchedKey];
    } else if (
      rawInput.startsWith('http') ||
      rawInput.startsWith('data:') ||
      rawInput.startsWith('/') ||
      rawInput.startsWith('file:')
    ) {
      finalUrl = rawInput;
    }
  }

  const hasCustomRounded = className.includes('rounded-');
  const roundedClass = hasCustomRounded ? '' : 'rounded-full';

  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-slate-100 dark:bg-zinc-800 ${roundedClass} ${className}`}>
      <img
        src={finalUrl}
        alt="Avatar"
        className="w-full h-full object-cover select-none mix-blend-multiply dark:mix-blend-normal"
        onError={(e) => {
          if (!imgError) {
            setImgError(true);
            (e.target as HTMLImageElement).src = avatar1;
          }
        }}
      />
    </span>
  );
};

export default AgentAvatarIcon;
