import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { i18nService } from '../../services/i18n';
import { skillService } from '../../services/skill';
import { RootState } from '../../store';
import { toggleActiveSkill } from '../../store/slices/skillSlice';
import {
  ACTIVE_CONTEXT_BADGE_BUTTON_CLASS,
  ACTIVE_CONTEXT_BADGE_ICON_CLASS,
  ACTIVE_CONTEXT_BADGE_ICON_WRAP_CLASS,
  ACTIVE_CONTEXT_BADGE_REMOVE_ICON_CLASS,
} from '../common/activeContextBadgeStyles';
import SkillIcon from '../icons/SkillIcon';
import XMarkIcon from '../icons/XMarkIcon';

const ActiveSkillBadge: React.FC = () => {
  const dispatch = useDispatch();
  const activeSkillIds = useSelector((state: RootState) => state.skill.activeSkillIds);
  const skills = useSelector((state: RootState) => state.skill.skills);
  const currentAgentId = useSelector((state: RootState) => state.agent.currentAgentId);

  const [isExpanded, setIsExpanded] = useState(false);

  const activeSkills = activeSkillIds
    .map(id => skills.find(s => s.id === id))
    .filter((s): s is NonNullable<typeof s> => s !== undefined);

  if (activeSkills.length === 0) return null;

  const handleRemoveSkill = (e: React.MouseEvent, skillId: string) => {
    e.stopPropagation();
    dispatch(toggleActiveSkill(skillId));
  };

  // 当选了专家（currentAgentId !== 'main'）时，默认收起，点击后才展开
  const shouldCollapse = currentAgentId !== 'main';

  if (shouldCollapse && !isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className={ACTIVE_CONTEXT_BADGE_BUTTON_CLASS}
      >
        <span className={ACTIVE_CONTEXT_BADGE_ICON_WRAP_CLASS}>
          <SkillIcon className="h-3.5 w-3.5 text-primary" />
        </span>
        <span className="min-w-0 truncate">
          {i18nService.getLanguage() === 'zh'
            ? `${activeSkills.length}个专家能力`
            : `${activeSkills.length} Expert Capabilities`}
        </span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {shouldCollapse && (
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          className={`${ACTIVE_CONTEXT_BADGE_BUTTON_CLASS} opacity-80 hover:opacity-100`}
          title={i18nService.getLanguage() === 'zh' ? '收起专家能力' : 'Collapse Capabilities'}
        >
          <span className={ACTIVE_CONTEXT_BADGE_ICON_WRAP_CLASS}>
            <SkillIcon className="h-3.5 w-3.5 text-primary" />
          </span>
          <span className="min-w-0 truncate text-xs text-secondary">
            {i18nService.getLanguage() === 'zh' ? '收起专家能力' : 'Collapse'}
          </span>
        </button>
      )}
      {activeSkills.map(skill => (
        <button
          type="button"
          key={skill.id}
          onClick={(e) => handleRemoveSkill(e, skill.id)}
          className={ACTIVE_CONTEXT_BADGE_BUTTON_CLASS}
          title={i18nService.t('clearSkill')}
        >
          <span className={ACTIVE_CONTEXT_BADGE_ICON_WRAP_CLASS}>
            <SkillIcon className={ACTIVE_CONTEXT_BADGE_ICON_CLASS} />
            <XMarkIcon className={ACTIVE_CONTEXT_BADGE_REMOVE_ICON_CLASS} />
          </span>
          <span className="min-w-0 truncate">
            {skillService.getLocalizedSkillName(skill)}
          </span>
        </button>
      ))}
    </div>
  );
};

export default ActiveSkillBadge;
