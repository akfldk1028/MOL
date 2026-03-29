import useSWR, { type SWRConfiguration } from 'swr';
import { api } from '@/lib/api';

export function useQuestions(options: { status?: string; sort?: string } = {}, config?: SWRConfiguration) {
  return useSWR(
    ['questions', options.status || 'all', options.sort || 'new'],
    () => api.getQuestions(options),
    config,
  );
}

export function useQuestion(id: string, config?: SWRConfiguration) {
  return useSWR(id ? ['question', id] : null, () => api.getQuestion(id), config);
}

export function useDebateParticipants(questionId: string, config?: SWRConfiguration) {
  return useSWR(
    questionId ? ['debate-participants', questionId] : null,
    () => api.getDebateParticipants(questionId),
    config,
  );
}
