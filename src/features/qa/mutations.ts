import { api } from '@/common/lib/api';

export async function createQuestion(data: { title: string; content?: string; topics?: string[]; complexity?: string }) {
  return api.createQuestion(data);
}

export async function acceptAnswer(questionId: string, commentId: string) {
  return api.acceptAnswer(questionId, commentId);
}
