import {
  AgentAvatarSvg,
  DefaultAgentAvatar,
  parseAgentAvatarIcon,
  parseAgentAvatarImageUrl,
} from '@shared/agent/avatar';
import { AgentId } from '@shared/agent/constants';
import React, { useState } from 'react';

import artboardIconUrl from '../../assets/agent-avatars/artboard.svg';
import booksIconUrl from '../../assets/agent-avatars/books.svg';
import brainIconUrl from '../../assets/agent-avatars/brain.svg';
import briefcaseIconUrl from '../../assets/agent-avatars/briefcase.svg';
import codeIconUrl from '../../assets/agent-avatars/code.svg';
import creationIconUrl from '../../assets/agent-avatars/creation.svg';
import dataIconUrl from '../../assets/agent-avatars/data.svg';
import diagnosisIconUrl from '../../assets/agent-avatars/diagnosis.svg';
import documentIconUrl from '../../assets/agent-avatars/document.svg';
import entertainmentIconUrl from '../../assets/agent-avatars/entertainment.svg';
import experimentIconUrl from '../../assets/agent-avatars/experiment.svg';
import fitnessIconUrl from '../../assets/agent-avatars/fitness.svg';
import folderIconUrl from '../../assets/agent-avatars/folder.svg';
import graduationCapIconUrl from '../../assets/agent-avatars/graduation-cap.svg';
import headphonesIconUrl from '../../assets/agent-avatars/headphones.svg';
import heartIconUrl from '../../assets/agent-avatars/heart.svg';
import inspirationIconUrl from '../../assets/agent-avatars/inspiration.svg';
import lightningIconUrl from '../../assets/agent-avatars/lightning.svg';
import lobsterIconUrl from '../../assets/agent-avatars/lobster.svg';
import meditationIconUrl from '../../assets/agent-avatars/meditation.svg';
import musicIconUrl from '../../assets/agent-avatars/music.svg';
import petIconUrl from '../../assets/agent-avatars/pet.svg';
import pottedPlantIconUrl from '../../assets/agent-avatars/potted-plant.svg';
import repairIconUrl from '../../assets/agent-avatars/repair.svg';
import scalesIconUrl from '../../assets/agent-avatars/scales.svg';
import shoppingCartIconUrl from '../../assets/agent-avatars/shopping-cart.svg';
import tagIconUrl from '../../assets/agent-avatars/tag.svg';
import translationIconUrl from '../../assets/agent-avatars/translation.svg';
import translationAltIconUrl from '../../assets/agent-avatars/translation-alt.svg';
import travelIconUrl from '../../assets/agent-avatars/travel.svg';
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

export const AGENT_AVATAR_SVG_OPTIONS: Array<{ svg: AgentAvatarSvg; labelKey: string }> = [
  { svg: AgentAvatarSvg.Lobster, labelKey: 'agentAvatarSvgLobster' },
  { svg: AgentAvatarSvg.Code, labelKey: 'agentAvatarSvgCode' },
  { svg: AgentAvatarSvg.Repair, labelKey: 'agentAvatarSvgRepair' },
  { svg: AgentAvatarSvg.Briefcase, labelKey: 'agentAvatarSvgBriefcase' },
  { svg: AgentAvatarSvg.ShoppingCart, labelKey: 'agentAvatarSvgShoppingCart' },
  { svg: AgentAvatarSvg.Data, labelKey: 'agentAvatarSvgData' },
  { svg: AgentAvatarSvg.Document, labelKey: 'agentAvatarSvgDocument' },
  { svg: AgentAvatarSvg.Folder, labelKey: 'agentAvatarSvgFolder' },
  { svg: AgentAvatarSvg.Tag, labelKey: 'agentAvatarSvgTag' },
  { svg: AgentAvatarSvg.Brain, labelKey: 'agentAvatarSvgBrain' },
  { svg: AgentAvatarSvg.GraduationCap, labelKey: 'agentAvatarSvgGraduationCap' },
  { svg: AgentAvatarSvg.Books, labelKey: 'agentAvatarSvgBooks' },
  { svg: AgentAvatarSvg.Experiment, labelKey: 'agentAvatarSvgExperiment' },
  { svg: AgentAvatarSvg.Diagnosis, labelKey: 'agentAvatarSvgDiagnosis' },
  { svg: AgentAvatarSvg.Scales, labelKey: 'agentAvatarSvgScales' },
  { svg: AgentAvatarSvg.Translation, labelKey: 'agentAvatarSvgTranslation' },
  { svg: AgentAvatarSvg.TranslationAlt, labelKey: 'agentAvatarSvgTranslationAlt' },
  { svg: AgentAvatarSvg.Creation, labelKey: 'agentAvatarSvgCreation' },
  { svg: AgentAvatarSvg.Artboard, labelKey: 'agentAvatarSvgArtboard' },
  { svg: AgentAvatarSvg.Music, labelKey: 'agentAvatarSvgMusic' },
  { svg: AgentAvatarSvg.Entertainment, labelKey: 'agentAvatarSvgEntertainment' },
  { svg: AgentAvatarSvg.Headphones, labelKey: 'agentAvatarSvgHeadphones' },
  { svg: AgentAvatarSvg.Inspiration, labelKey: 'agentAvatarSvgInspiration' },
  { svg: AgentAvatarSvg.Lightning, labelKey: 'agentAvatarSvgLightning' },
  { svg: AgentAvatarSvg.Travel, labelKey: 'agentAvatarSvgTravel' },
  { svg: AgentAvatarSvg.Fitness, labelKey: 'agentAvatarSvgFitness' },
  { svg: AgentAvatarSvg.Meditation, labelKey: 'agentAvatarSvgMeditation' },
  { svg: AgentAvatarSvg.Heart, labelKey: 'agentAvatarSvgHeart' },
  { svg: AgentAvatarSvg.PottedPlant, labelKey: 'agentAvatarSvgPottedPlant' },
  { svg: AgentAvatarSvg.Pet, labelKey: 'agentAvatarSvgPet' },
];

const AGENT_AVATAR_SVG_URLS: Record<AgentAvatarSvg, string> = {
  [AgentAvatarSvg.Lobster]: lobsterIconUrl,
  [AgentAvatarSvg.Code]: codeIconUrl,
  [AgentAvatarSvg.Repair]: repairIconUrl,
  [AgentAvatarSvg.Briefcase]: briefcaseIconUrl,
  [AgentAvatarSvg.ShoppingCart]: shoppingCartIconUrl,
  [AgentAvatarSvg.Data]: dataIconUrl,
  [AgentAvatarSvg.Document]: documentIconUrl,
  [AgentAvatarSvg.Folder]: folderIconUrl,
  [AgentAvatarSvg.Tag]: tagIconUrl,
  [AgentAvatarSvg.Brain]: brainIconUrl,
  [AgentAvatarSvg.GraduationCap]: graduationCapIconUrl,
  [AgentAvatarSvg.Books]: booksIconUrl,
  [AgentAvatarSvg.Experiment]: experimentIconUrl,
  [AgentAvatarSvg.Diagnosis]: diagnosisIconUrl,
  [AgentAvatarSvg.Scales]: scalesIconUrl,
  [AgentAvatarSvg.Translation]: translationIconUrl,
  [AgentAvatarSvg.TranslationAlt]: translationAltIconUrl,
  [AgentAvatarSvg.Creation]: creationIconUrl,
  [AgentAvatarSvg.Artboard]: artboardIconUrl,
  [AgentAvatarSvg.Music]: musicIconUrl,
  [AgentAvatarSvg.Entertainment]: entertainmentIconUrl,
  [AgentAvatarSvg.Headphones]: headphonesIconUrl,
  [AgentAvatarSvg.Inspiration]: inspirationIconUrl,
  [AgentAvatarSvg.Lightning]: lightningIconUrl,
  [AgentAvatarSvg.Travel]: travelIconUrl,
  [AgentAvatarSvg.Fitness]: fitnessIconUrl,
  [AgentAvatarSvg.Meditation]: meditationIconUrl,
  [AgentAvatarSvg.Heart]: heartIconUrl,
  [AgentAvatarSvg.PottedPlant]: pottedPlantIconUrl,
  [AgentAvatarSvg.Pet]: petIconUrl,
};

export const getAgentAvatarSvgUrl = (svg: AgentAvatarSvg): string => {
  return AGENT_AVATAR_SVG_URLS[svg] ?? AGENT_AVATAR_SVG_URLS[DefaultAgentAvatar.svg];
};

interface AgentAvatarIconProps {
  avatar?: string | null;
  value?: string | null;
  agentId?: string;
  isMain?: boolean;
  className?: string;
  iconClassName?: string;
  useDefaultWhenEmpty?: boolean;
  /** Tint the SVG avatar with the parent's text color instead of the foreground color. */
  inheritColor?: boolean;
  /** Opt in for preset experts only; existing custom and main avatars stay unchanged. */
  expertFallback?: boolean;
}

const AgentAvatarIcon: React.FC<AgentAvatarIconProps> = ({
  avatar: avatarProp,
  value: valueProp,
  agentId,
  isMain,
  className = 'h-10 w-10',
  iconClassName = 'h-5 w-5',
  inheritColor = false,
  expertFallback = false,
}) => {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const target = (valueProp !== undefined ? valueProp : avatarProp) ?? '';
  const rawInput = (target || '').trim();

  // 1. 如果匹配到 HeyClaw 3D 头像库 (avatar_1 ~ avatar_16)
  if (rawInput) {
    const avatarMatch = rawInput.match(/avatar_(\d+)(?:\.(png|jpg|jpeg))?/i);
    const matchedKey = avatarMatch ? `avatar_${avatarMatch[1]}` : null;
    if (matchedKey && AVATAR_IMAGES[matchedKey]) {
      const hasCustomRounded = className.includes('rounded-');
      const roundedClass = hasCustomRounded ? '' : 'rounded-full';
      return (
        <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-slate-100 dark:bg-zinc-800 ${roundedClass} ${className}`}>
          <img
            src={AVATAR_IMAGES[matchedKey]}
            alt="Avatar"
            className="w-full h-full object-cover select-none mix-blend-multiply dark:mix-blend-normal"
          />
        </span>
      );
    }
  }

  // 2. 如果是外部 URL 或本地图片路径
  const imageUrl = parseAgentAvatarImageUrl(rawInput)
    || (rawInput.startsWith('http') || rawInput.startsWith('data:') || rawInput.startsWith('/') || rawInput.startsWith('file:') ? rawInput : null);

  if (imageUrl && failedImage !== imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailedImage(imageUrl)}
        className={`inline-block shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  // 3. 模版或兜底渲染：若是主专家、启用 expertFallback、未指定图标、或者是龙虾图标（有道历史默认遗留），统一展示专家头像
  const isMainAgent = isMain || agentId === 'main' || agentId === AgentId.Main;
  const parsedAvatar = parseAgentAvatarIcon(rawInput);
  const isLobsterOrEmpty = !parsedAvatar || parsedAvatar.svg === AgentAvatarSvg.Lobster;

  if (isMainAgent || expertFallback || isLobsterOrEmpty) {
    const hasCustomRounded = className.includes('rounded-');
    const roundedClass = hasCustomRounded ? '' : 'rounded-full';
    return (
      <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-slate-100 dark:bg-zinc-800 ${roundedClass} ${className}`}>
        <img
          src={avatar1}
          alt="Avatar"
          className="w-full h-full object-cover select-none mix-blend-multiply dark:mix-blend-normal"
        />
      </span>
    );
  }

  // 4. SVG 模版图标渲染（代码、修理、书本等非龙虾图标）
  const iconUrl = getAgentAvatarSvgUrl(parsedAvatar.svg);
  const maskStyle: React.CSSProperties = {
    WebkitMaskImage: `url("${iconUrl}")`,
    WebkitMaskPosition: 'center',
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskSize: 'contain',
    backgroundColor: 'currentColor',
    maskImage: `url("${iconUrl}")`,
    maskPosition: 'center',
    maskRepeat: 'no-repeat',
    maskSize: 'contain',
  };

  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full ${inheritColor ? '' : 'text-foreground'} ${className}`}>
      <span aria-hidden="true" className={`inline-block ${iconClassName}`} style={maskStyle} />
    </span>
  );
};

export default AgentAvatarIcon;
