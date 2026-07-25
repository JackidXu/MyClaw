import { AgentId, DefaultAgentProfile } from '@shared/agent';

interface AgentDisplaySource {
  id: string;
  name?: string;
  avatar?: string;
}

export const isDefaultAgentId = (agentId?: string | null): boolean => {
  return agentId?.trim() === AgentId.Main;
};

export const getAgentDisplayName = (agent: Pick<AgentDisplaySource, 'id' | 'name'>): string => {
  const normalizedName = agent.name?.trim();
  return normalizedName || agent.id;
};

export const getAgentDisplayNameById = (
  agentId: string,
  agents: Array<Pick<AgentDisplaySource, 'id' | 'name'>>,
): string | null => {
  const normalizedAgentId = agentId.trim();
  if (!normalizedAgentId) return null;

  const agent = agents.find((item) => item.id === normalizedAgentId);
  if (agent) return getAgentDisplayName(agent);

  if (isDefaultAgentId(normalizedAgentId)) {
    return DefaultAgentProfile.Name;
  }

  return normalizedAgentId;
};

export const shouldUseDefaultAgentIcon = (agent: { id: string; avatar?: string }): boolean => {
  return isDefaultAgentId(agent.id) && !agent.avatar?.trim();
};
