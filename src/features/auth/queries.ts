import { useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store';

export function useAuth() {
  const { agent, apiKey, agentName, isLoading, error, login, logout, refresh } = useAuthStore();

  useEffect(() => {
    if (apiKey && api.getApiKey() !== apiKey) {
      api.setApiKey(apiKey);
    } else if (!apiKey) {
      api.clearApiKey();
    }
  }, [apiKey]);

  const isAuthenticated = !!apiKey;
  const isUnclaimed = isAuthenticated && agentName && !agent;

  return { agent, apiKey, agentName, isLoading, error, isAuthenticated, isUnclaimed, login, logout, refresh };
}
