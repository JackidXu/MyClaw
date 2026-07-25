import type { Agent, CoworkStore, CreateAgentRequest, UpdateAgentRequest } from './coworkStore';
import { getPaidExperts,getPresetExperts } from './libs/expertStore';
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
      const allExperts: any[] = [...getPresetExperts(), ...getPaidExperts()];
      const preset = allExperts.find(p => p.id === presetId);
      if (preset) {
        return { ...agent, skillIds: preset.skillIds || [] };
      }
    }
    return agent;
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
    const allExperts: any[] = [...getPresetExperts(), ...getPaidExperts()];
    const preset = allExperts.find(p => p.id === presetId);
    if (!preset) return null;

    // Check if already installed
    const existing = this.store.getAgent(preset.id);
    if (existing) return existing;

    const createReq = presetToCreateRequest(preset);
    const finalModel = createReq.model?.trim() || defaultModel?.trim() || '';

    return this.store.createAgent({
      ...createReq,
      model: finalModel,
      workingDirectory: '',
    });
  }
}
