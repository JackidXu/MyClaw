import type { Agent, CoworkStore, CreateAgentRequest, UpdateAgentRequest } from './coworkStore';
import { getLanguage } from './i18n';
import { getExpertTeams, getPaidExperts, getPresetExperts } from './libs/expertStore';
import { type PresetAgent, presetToCreateRequest } from './presetAgents';

/**
 * AgentManager handles CRUD operations for agents and preset agent installation.
 * Agents are stored in the SQLite `agents` table via CoworkStore.
 */
export class AgentManager {
  private store: CoworkStore;

  constructor(store: CoworkStore) {
    this.store = store;
  }

  listAgents(): Agent[] {
    const agents = this.store.listAgents();
    return agents.map(agent => this.enrichPresetAgent(agent));
  }

  getAgent(agentId: string): Agent | null {
    const agent = this.store.getAgent(agentId);
    return agent ? this.enrichPresetAgent(agent) : null;
  }

  private enrichPresetAgent(agent: Agent): Agent {
    if (agent.source === 'preset' || agent.presetId) {
      const presetId = agent.presetId || agent.id;
      const allExperts: any[] = [...getPresetExperts(), ...getPaidExperts(), ...getExpertTeams()];
      const preset = allExperts.find(p => p.id === presetId);
      if (preset) {
        const isEn = getLanguage() === 'en';
        return {
          ...agent,
          name: (isEn && preset.nameEn ? preset.nameEn : preset.name) || agent.name,
          description: (isEn && preset.descriptionEn ? preset.descriptionEn : preset.description) ?? agent.description,
          identity: (isEn && preset.identityEn ? preset.identityEn : preset.identity) ?? agent.identity,
          systemPrompt: (isEn && preset.systemPromptEn ? preset.systemPromptEn : preset.systemPrompt) ?? agent.systemPrompt,
          skillIds: preset.skillIds || agent.skillIds || [],
          subagentAllowAgentIds: preset.subagentAllowAgentIds || agent.subagentAllowAgentIds || [],
          avatar: preset.avatar || agent.avatar,
          department: preset.department ?? agent.department,
        };
      }
    }
    return agent;
  }

  /**
   * 同步云端最新的预设专家与专家团配置到本地 SQLite 数据库
   * 当检测到任何字段（System Prompt、人设、名称、技能、模型等）有差异时，执行全面覆盖更新
   */
  syncPresetAgentsFromCloud(): number {
    const allExperts: any[] = [...getPresetExperts(), ...getPaidExperts(), ...getExpertTeams()];
    if (allExperts.length === 0) return 0;

    const expertMap = new Map<string, any>();
    for (const exp of allExperts) {
      if (exp && exp.id) {
        expertMap.set(exp.id, exp);
      }
    }

    const isEn = getLanguage() === 'en';
    const existingAgents = this.store.listAgents();
    let updatedCount = 0;

    for (const agent of existingAgents) {
      const presetId = agent.presetId || (agent.source === 'preset' ? agent.id : '');
      if (!presetId) continue;

      const preset = expertMap.get(presetId);
      if (!preset) continue;

      const targetName = (isEn && preset.nameEn ? preset.nameEn : preset.name) || agent.name;
      const targetDesc = (isEn && preset.descriptionEn ? preset.descriptionEn : preset.description) || '';
      const targetIdentity = (isEn && preset.identityEn ? preset.identityEn : preset.identity) || '';
      const targetPrompt = (isEn && preset.systemPromptEn ? preset.systemPromptEn : preset.systemPrompt) || '';
      const targetAvatar = preset.avatar || '';
      const targetSkills = preset.skillIds || [];
      const targetSubagents = preset.subagentAllowAgentIds || [];
      const targetModel = preset.model !== undefined ? preset.model : (agent.model || '');
      const targetDept = preset.department !== undefined ? preset.department : (agent.department || '');
      const targetLevel = preset.level !== undefined ? preset.level : (agent.level || '');

      const currentSkills = agent.skillIds || [];
      const currentSubagents = agent.subagentAllowAgentIds || [];

      // 检查是否有任何字段变更
      const nameChanged = targetName !== agent.name;
      const descChanged = targetDesc !== (agent.description || '');
      const identityChanged = targetIdentity !== (agent.identity || '');
      const promptChanged = targetPrompt !== (agent.systemPrompt || '');
      const avatarChanged = targetAvatar !== '' && targetAvatar !== (agent.avatar || '');
      const skillsChanged = JSON.stringify(targetSkills) !== JSON.stringify(currentSkills);
      const subagentsChanged = JSON.stringify(targetSubagents) !== JSON.stringify(currentSubagents);
      const modelChanged = preset.model !== undefined && targetModel !== (agent.model || '');
      const deptChanged = preset.department !== undefined && targetDept !== (agent.department || '');
      const levelChanged = preset.level !== undefined && targetLevel !== (agent.level || '');

      if (
        nameChanged ||
        descChanged ||
        identityChanged ||
        promptChanged ||
        avatarChanged ||
        skillsChanged ||
        subagentsChanged ||
        modelChanged ||
        deptChanged ||
        levelChanged
      ) {
        this.store.updateAgent(agent.id, {
          ...(nameChanged ? { name: targetName } : {}),
          ...(descChanged ? { description: targetDesc } : {}),
          ...(identityChanged ? { identity: targetIdentity } : {}),
          ...(promptChanged ? { systemPrompt: targetPrompt } : {}),
          ...(avatarChanged ? { avatar: targetAvatar } : {}),
          ...(skillsChanged ? { skillIds: targetSkills } : {}),
          ...(subagentsChanged ? { subagentAllowAgentIds: targetSubagents } : {}),
          ...(modelChanged ? { model: targetModel } : {}),
          ...(deptChanged ? { department: targetDept } : {}),
          ...(levelChanged ? { level: targetLevel } : {}),
        });
        updatedCount++;
      }
    }

    return updatedCount;
  }

  getDefaultAgent(): Agent {
    const agents = this.store.listAgents();
    return agents.find(a => a.isDefault) || agents[0];
  }

  createAgent(request: CreateAgentRequest, defaultModel?: string): Agent {
    return this.store.createAgent({
      ...request,
      model: request.model?.trim() || defaultModel?.trim() || '',
      workingDirectory: request.workingDirectory?.trim() || '',
    });
  }

  updateAgent(agentId: string, updates: UpdateAgentRequest): Agent | null {
    return this.store.updateAgent(agentId, {
      ...updates,
      ...(updates.workingDirectory !== undefined
        ? { workingDirectory: updates.workingDirectory.trim() }
        : {}),
    });
  }

  reorderAgents(agentIds: string[]): Agent[] {
    return this.store.reorderAgents(agentIds);
  }

  deleteAgent(agentId: string): boolean {
    return this.store.deleteAgent(agentId);
  }

  // --- Preset agents ---

  getPresetAgents(): PresetAgent[] {
    const existingAgents = this.store.listAgents();
    const existingPresetIds = new Set(
      existingAgents.filter(a => a.source === 'preset').map(a => a.presetId)
    );
    // Only return presets that haven't been added yet
    return getPresetExperts().filter(p => !existingPresetIds.has(p.id));
  }

  getAllPresetAgents(): PresetAgent[] {
    return getPresetExperts();
  }

  addPresetAgent(presetId: string, defaultModel?: string): Agent | null {
    const allExperts: any[] = [...getPresetExperts(), ...getPaidExperts(), ...getExpertTeams()];
    const preset = allExperts.find(p => p.id === presetId);
    if (!preset) return null;

    // Check if already installed
    const existing = this.store.getAgent(preset.id);
    if (existing) {
      this.syncPresetAgentsFromCloud();
      return this.getAgent(preset.id) || existing;
    }

    const createReq = presetToCreateRequest(preset);
    const finalModel = createReq.model?.trim() || defaultModel?.trim() || '';

    return this.store.createAgent({
      ...createReq,
      model: finalModel,
      workingDirectory: '',
    });
  }
}
