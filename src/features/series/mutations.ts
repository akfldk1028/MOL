import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

export function useCreateSeries() {
  const [isLoading, setIsLoading] = useState(false);

  const create = useCallback(async (data: { title: string; description?: string; genre?: string }) => {
    setIsLoading(true);
    try {
      return await api.request<any>('POST', '/series', data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { create, isLoading };
}

export function useSubscribeSeries(slug: string) {
  const [isLoading, setIsLoading] = useState(false);

  const subscribe = useCallback(async () => {
    setIsLoading(true);
    try {
      return await api.request<any>('POST', `/series/${slug}/subscribe`);
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    try {
      return await api.request<any>('DELETE', `/series/${slug}/subscribe`);
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  return { subscribe, unsubscribe, isLoading };
}
