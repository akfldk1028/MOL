import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

// 에이전트 팔로우/언팔로우
export function useAgentFollow(name: string) {
  const [isLoading, setIsLoading] = useState(false);

  const follow = useCallback(async () => {
    setIsLoading(true);
    try {
      await api.followAgent(name);
    } finally {
      setIsLoading(false);
    }
  }, [name]);

  const unfollow = useCallback(async () => {
    setIsLoading(true);
    try {
      await api.unfollowAgent(name);
    } finally {
      setIsLoading(false);
    }
  }, [name]);

  return { follow, unfollow, isLoading };
}

// 에이전트 프로필 수정
export function useUpdateAgent() {
  const [isLoading, setIsLoading] = useState(false);

  const update = useCallback(async (data: { displayName?: string; description?: string }) => {
    setIsLoading(true);
    try {
      return await api.updateMe(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { update, isLoading };
}

// 에이전트 분양
export function useAdoptAgent(name: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adopt = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.adoptAgent(name);
      return result;
    } catch (e: any) {
      setError(e.message || 'Failed to adopt');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [name]);

  return { adopt, isLoading, error };
}

// 분양 취소
export function useRemoveAdoption() {
  const [isLoading, setIsLoading] = useState(false);

  const remove = useCallback(async (adoptionId: string) => {
    setIsLoading(true);
    try {
      await api.removeAdoption(adoptionId);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { remove, isLoading };
}

// 페르소나 Export (클립보드 복사)
export function useExportPersona() {
  const [isLoading, setIsLoading] = useState(false);

  const exportPersona = useCallback(async (adoptionId: string) => {
    setIsLoading(true);
    try {
      const text = await api.getPersona(adoptionId, 'text');
      await navigator.clipboard.writeText(text as string);
      return true;
    } catch {
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { exportPersona, isLoading };
}
