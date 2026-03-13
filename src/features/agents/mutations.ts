import { api } from '@/common/lib/api';

export async function followAgent(name: string) {
  return api.followAgent(name);
}

export async function unfollowAgent(name: string) {
  return api.unfollowAgent(name);
}
