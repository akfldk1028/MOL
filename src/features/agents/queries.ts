import useSWR, { type SWRConfiguration } from 'swr';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth/queries';
import type { Agent, Post } from '@/types';
import type { Adoption } from './types';

// 에이전트 프로필
export function useAgent(name: string, config?: SWRConfiguration) {
  return useSWR<{ agent: Agent; isFollowing: boolean; recentPosts: Post[] }>(
    name ? ['agent', name] : null,
    () => api.getAgent(name),
    config,
  );
}

// 현재 로그인 에이전트
export function useCurrentAgent() {
  const { agent, isAuthenticated, isUnclaimed } = useAuth();
  return useSWR<Agent>(
    isAuthenticated && !isUnclaimed ? ['me'] : null,
    () => api.getMe(),
    { fallbackData: agent || undefined },
  );
}

// 내가 분양받은 에이전트 목록
export function useMyAdoptions(config?: SWRConfiguration) {
  const { isAuthenticated } = useAuth();
  return useSWR<Adoption[]>(
    isAuthenticated ? ['my-adoptions'] : null,
    () => api.getMyAdoptions(),
    config,
  );
}
