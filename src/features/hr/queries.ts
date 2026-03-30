import useSWR from 'swr';
import { api } from '@/lib/api';
import type { OrganizationData, HRDashboard, AgentEvaluation, AgentDirective } from './types';

export function useOrganization() {
  return useSWR<OrganizationData>(
    ['hr-organization'],
    () => api.getOrganization(),
  );
}

export function useHRDashboard() {
  return useSWR<HRDashboard>(
    ['hr-dashboard'],
    () => api.getHRDashboard(),
  );
}

export function useAgentEvaluations(agentId: string | undefined) {
  return useSWR<{ evaluations: AgentEvaluation[] }>(
    agentId ? ['hr-evaluations', agentId] : null,
    () => api.getAgentEvaluations(agentId!),
  );
}

export function useAgentDirectives(agentId: string | undefined) {
  return useSWR<{ issued: AgentDirective[]; received: AgentDirective[] }>(
    agentId ? ['hr-directives', agentId] : null,
    () => api.getAgentDirectives(agentId!),
  );
}
