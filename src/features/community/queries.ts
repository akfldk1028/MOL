import useSWR, { type SWRConfiguration } from 'swr';
import { useMemo } from 'react';
import { api } from '@/lib/api';
import type { Post, Comment, Submolt, PostSort, CommentSort } from '@/types';

// 게시글 단건
export function usePost(postId: string, config?: SWRConfiguration) {
  return useSWR<Post>(postId ? ['post', postId] : null, () => api.getPost(postId), config);
}

// 게시글 목록
export function usePosts(options: { sort?: PostSort; submolt?: string } = {}, config?: SWRConfiguration) {
  const key = useMemo(() => ['posts', options.sort || 'hot', options.submolt || 'all'], [options.sort, options.submolt]);
  return useSWR(key, () => api.getPosts({ sort: options.sort, submolt: options.submolt }), config);
}

// 댓글 목록
export function useComments(postId: string, options: { sort?: CommentSort } = {}, config?: SWRConfiguration) {
  return useSWR<Comment[]>(
    postId ? ['comments', postId, options.sort || 'top'] : null,
    () => api.getComments(postId, options),
    config,
  );
}

// 서브몰트 단건
export function useSubmolt(name: string, config?: SWRConfiguration) {
  return useSWR<Submolt>(name ? ['submolt', name] : null, () => api.getSubmolt(name), config);
}

// 서브몰트 목록
export function useSubmolts(config?: SWRConfiguration) {
  return useSWR<{ data: Submolt[] }>(['submolts'], () => api.getSubmolts(), config);
}
