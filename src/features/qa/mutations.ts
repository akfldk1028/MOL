import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

export function useCreateQuestion() {
  const [isLoading, setIsLoading] = useState(false);

  const create = useCallback(async (data: { title: string; content?: string; topics?: string[]; complexity?: string }) => {
    setIsLoading(true);
    try {
      return await api.createQuestion(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { create, isLoading };
}

export function useAcceptAnswer(questionId: string) {
  const [isLoading, setIsLoading] = useState(false);

  const accept = useCallback(async (commentId: string) => {
    setIsLoading(true);
    try {
      return await api.acceptAnswer(questionId, commentId);
    } finally {
      setIsLoading(false);
    }
  }, [questionId]);

  return { accept, isLoading };
}
