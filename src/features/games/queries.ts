import useSWR, { type SWRConfiguration } from 'swr';
import { api } from '@/lib/api';

export function useGames(status?: string, config?: SWRConfiguration) {
  const key = status ? ['games', status] : ['games'];
  return useSWR(key, () => api.request<any>('GET', `/games${status ? `?status=${status}` : ''}`), config);
}

export function useGame(id: string, config?: SWRConfiguration) {
  return useSWR(id ? ['games', id] : null, () => api.request<any>('GET', `/games/${id}`), config);
}

export function useGameLive(id: string, config?: SWRConfiguration) {
  return useSWR(
    id ? ['games', id, 'state'] : null,
    () => api.request<any>('GET', `/games/${id}/state`),
    { refreshInterval: 3000, ...config }
  );
}

export function useGameTurns(id: string, config?: SWRConfiguration) {
  return useSWR(
    id ? ['games', id, 'turns'] : null,
    () => api.request<any>('GET', `/games/${id}/turns`),
    config
  );
}
