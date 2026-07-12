import {
  AgentAvatarSvg,
  DefaultAgentAvatar,
  parseAgentAvatarIcon,
} from '@shared/agent/avatar';
import React from 'react';

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

export const AVATAR_IMAGES: Record<string, string> = {
  avatar_1: avatar1,
  avatar_2: avatar2,
  avatar_3: avatar3,
  avatar_4: avatar4,
  avatar_5: avatar5,
  avatar_6: avatar6,
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
  value?: string | null;
  className?: string;
  iconClassName?: string;
  legacyClassName?: string;
  fallbackText?: string;
  useDefaultWhenEmpty?: boolean;
}

const AgentAvatarIcon: React.FC<AgentAvatarIconProps> = ({
  value,
  className = 'h-10 w-10',
  iconClassName = 'h-5 w-5',
  legacyClassName = 'text-2xl',
  fallbackText = 'A',
  useDefaultWhenEmpty = true,
}) => {
  void iconClassName;
  void legacyClassName;
  const normalized = value?.trim() ?? '';

  // 1. 如果值是 avatar_x 的图片名称或有效路径
  if (normalized && AVATAR_IMAGES[normalized]) {
    return (
      <span className={`inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden ${className}`}>
        <img src={AVATAR_IMAGES[normalized]} alt="Avatar" className="w-full h-full object-cover select-none" />
      </span>
    );
  }

  // 2. 兼容如果是图片 URL 或带 http / data: 等的路径
  if (normalized.startsWith('http') || normalized.startsWith('data:') || normalized.startsWith('/') || normalized.startsWith('file:')) {
    return (
      <span className={`inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden ${className}`}>
        <img src={normalized} alt="Avatar" className="w-full h-full object-cover select-none" />
      </span>
    );
  }

  // 3. 兼容旧 SVG 头像，将其映射为新图片
  const parsedAvatar = parseAgentAvatarIcon(normalized);
  const avatar = parsedAvatar ?? (!normalized && useDefaultWhenEmpty ? DefaultAgentAvatar : null);

  if (avatar) {
    const getMappedAvatarImage = (svg: string): string => {
      switch (svg) {
        case 'lobster':
        case 'document':
        case 'briefcase':
        case 'books':
        case 'scales':
          return avatar1;
        case 'data':
        case 'folder':
        case 'tag':
        case 'diagnosis':
          return avatar2;
        case 'creation':
        case 'artboard':
        case 'inspiration':
        case 'potted-plant':
          return avatar3;
        case 'music':
        case 'entertainment':
        case 'headphones':
        case 'lightning':
          return avatar4;
        case 'pet':
        case 'fitness':
        case 'meditation':
        case 'travel':
        case 'heart':
          return avatar5;
        default:
          return avatar6;
      }
    };

    const imageUrl = getMappedAvatarImage(avatar.svg);
    return (
      <span className={`inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden ${className}`}>
        <img src={imageUrl} alt="Avatar" className="w-full h-full object-cover select-none" />
      </span>
    );
  }

  return (
    <span className={`inline-flex shrink-0 items-center justify-center leading-none ${className} ${legacyClassName}`}>
      {normalized || fallbackText}
    </span>
  );
};

export default AgentAvatarIcon;
