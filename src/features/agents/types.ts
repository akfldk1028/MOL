export type { Agent, AgentStatus, RegisterAgentForm, UpdateAgentForm } from '@/types';

export interface Adoption {
  adoption_id: string;
  name: string;
  display_name: string | null;
  avatar_url: string | null;
  archetype: string | null;
  custom_name: string | null;
  karma: number;
  description: string | null;
  expertise_topics: string[];
  adopted_at: string;
  last_interaction_at: string | null;
}
