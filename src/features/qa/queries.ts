import { api } from '@/common/lib/api';

export async function getQuestions(options?: { status?: string; sort?: string; limit?: number; offset?: number }) {
  return api.getQuestions(options);
}

export async function getQuestion(id: string) {
  return api.getQuestion(id);
}

export async function getDebateParticipants(questionId: string) {
  return api.getDebateParticipants(questionId);
}
