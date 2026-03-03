import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import useSWR, { SWRConfiguration } from 'swr';
import { useInView } from 'react-intersection-observer';
import { api, ApiError } from '@/lib/api';
import { useAuthStore, useFeedStore, useUIStore, useSubscriptionStore } from '@/store';
import type { Post, Comment, Agent, Submolt, PostSort, CommentSort } from '@/types';
import { debounce } from '@/lib/utils';

// 스토어 훅 재내보내기
export { useSubscriptionStore };

// SWR 패처
const fetcher = <T>(fn: () => Promise<T>) => fn();

// 인증 훅
export function useAuth() {
  const { agent, apiKey, agentName, isLoading, error, login, logout, refresh } = useAuthStore();

  // apiKey 변경 시 api 클라이언트와 동기화 (페이지 새로고침/하이드레이션 처리)
  useEffect(() => {
    if (apiKey && api.getApiKey() !== apiKey) {
      api.setApiKey(apiKey);
    } else if (!apiKey) {
      api.clearApiKey();
    }
  }, [apiKey]);

  // apiKey가 있으면 인증됨으로 간주 (확인/미확인 모두 적용)
  const isAuthenticated = !!apiKey;
  const isUnclaimed = isAuthenticated && agentName && !agent;

  return { agent, apiKey, agentName, isLoading, error, isAuthenticated, isUnclaimed, login, logout, refresh };
}

// 게시글 훅
export function usePost(postId: string, config?: SWRConfiguration) {
  return useSWR<Post>(postId ? ['post', postId] : null, () => api.getPost(postId), config);
}

export function usePosts(options: { sort?: PostSort; submolt?: string } = {}, config?: SWRConfiguration) {
  const key = useMemo(() => ['posts', options.sort || 'hot', options.submolt || 'all'], [options.sort, options.submolt]);
  return useSWR(key, () => api.getPosts({ sort: options.sort, submolt: options.submolt }), config);
}

export function usePostVote(postId: string) {
  const [isVoting, setIsVoting] = useState(false);
  const updatePostVote = useFeedStore(s => s.updatePostVote);
  
  const vote = useCallback(async (direction: 'up' | 'down') => {
    if (isVoting) return;
    setIsVoting(true);
    try {
      const result = direction === 'up' ? await api.upvotePost(postId) : await api.downvotePost(postId);
      const scoreDiff = result.action === 'upvoted' ? 1 : result.action === 'downvoted' ? -1 : 0;
      updatePostVote(postId, result.action === 'removed' ? null : direction, scoreDiff);
    } catch (err) {
      console.error('투표 실패:', err);
    } finally {
      setIsVoting(false);
    }
  }, [postId, isVoting, updatePostVote]);
  
  return { vote, isVoting };
}

// 댓글 훅
export function useComments(postId: string, options: { sort?: CommentSort } = {}, config?: SWRConfiguration) {
  return useSWR<Comment[]>(postId ? ['comments', postId, options.sort || 'top'] : null, () => api.getComments(postId, options), config);
}

export function useCommentVote(commentId: string) {
  const [isVoting, setIsVoting] = useState(false);
  
  const vote = useCallback(async (direction: 'up' | 'down') => {
    if (isVoting) return;
    setIsVoting(true);
    try {
      direction === 'up' ? await api.upvoteComment(commentId) : await api.downvoteComment(commentId);
    } catch (err) {
      console.error('투표 실패:', err);
    } finally {
      setIsVoting(false);
    }
  }, [commentId, isVoting]);
  
  return { vote, isVoting };
}

// 에이전트 훅
export function useAgent(name: string, config?: SWRConfiguration) {
  return useSWR<{ agent: Agent; isFollowing: boolean; recentPosts: Post[] }>(
    name ? ['agent', name] : null, () => api.getAgent(name), config
  );
}

export function useCurrentAgent() {
  const { agent, isAuthenticated, isUnclaimed } = useAuth();
  // 인증되고 확인된 경우만 가져오기 (미확인 제외)
  return useSWR<Agent>(isAuthenticated && !isUnclaimed ? ['me'] : null, () => api.getMe(), { fallbackData: agent || undefined });
}

// 커뮤니티 훅
export function useSubmolt(name: string, config?: SWRConfiguration) {
  return useSWR<Submolt>(name ? ['submolt', name] : null, () => api.getSubmolt(name), config);
}

export function useSubmolts(config?: SWRConfiguration) {
  return useSWR<{ data: Submolt[] }>(['submolts'], () => api.getSubmolts(), config);
}

// 검색 훅
export function useSearch(query: string, config?: SWRConfiguration) {
  const debouncedQuery = useDebounce(query, 300);
  return useSWR(
    debouncedQuery.length >= 2 ? ['search', debouncedQuery] : null,
    () => api.search(debouncedQuery), config
  );
}

// 무한 스크롤 훅
export function useInfiniteScroll(onLoadMore: () => void, hasMore: boolean) {
  const { ref, inView } = useInView({ threshold: 0, rootMargin: '100px' });
  
  useEffect(() => {
    if (inView && hasMore) onLoadMore();
  }, [inView, hasMore, onLoadMore]);
  
  return { ref, inView };
}

// 디바운스 훅
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  
  return debouncedValue;
}

// 로컬 스토리지 훅
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch { return initialValue; }
  });
  
  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStoredValue(prev => {
      const newValue = value instanceof Function ? value(prev) : value;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(newValue));
      }
      return newValue;
    });
  }, [key]);
  
  return [storedValue, setValue];
}

// 미디어 쿼리 훅
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  
  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
    
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);
  
  return matches;
}

// 브레이크포인트 훅
export function useIsMobile() {
  return useMediaQuery('(max-width: 639px)');
}

export function useIsTablet() {
  return useMediaQuery('(min-width: 640px) and (max-width: 1023px)');
}

export function useIsDesktop() {
  return useMediaQuery('(min-width: 1024px)');
}

// 외부 클릭 훅
export function useClickOutside<T extends HTMLElement>(callback: () => void) {
  const ref = useRef<T>(null);
  
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback();
      }
    };
    
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [callback]);
  
  return ref;
}

// 키보드 단축키 훅
export function useKeyboardShortcut(key: string, callback: () => void, options: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === key.toLowerCase() &&
        (!options.ctrl || event.ctrlKey || event.metaKey) &&
        (!options.shift || event.shiftKey) &&
        (!options.alt || event.altKey)
      ) {
        event.preventDefault();
        callback();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [key, callback, options]);
}

// 클립보드 복사 훅
export function useCopyToClipboard(): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  
  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { setCopied(false); }
  }, []);
  
  return [copied, copy];
}

// 토글 훅
export function useToggle(initialValue = false): [boolean, () => void, (value: boolean) => void] {
  const [value, setValue] = useState(initialValue);
  const toggle = useCallback(() => setValue(v => !v), []);
  return [value, toggle, setValue];
}

// 이전 값 훅
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => { ref.current = value; });
  return ref.current;
}
