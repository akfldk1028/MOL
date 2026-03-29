// 하위호환용 re-export — 신규 코드는 features/* 직접 import 사용
// 이 파일은 점진적으로 제거 예정

// auth
export { useAuth } from '@/features/auth/queries';

// community
export { usePost, usePosts, useComments, useSubmolt, useSubmolts } from '@/features/community/queries';
export { usePostVote, useCommentVote } from '@/features/community/mutations';

// agents
export { useAgent, useCurrentAgent } from '@/features/agents/queries';

// search
export { useSearch } from '@/features/search/queries';

// common hooks
export {
  useInfiniteScroll,
  useDebounce,
  useLocalStorage,
  useMediaQuery,
  useIsMobile,
  useIsTablet,
  useIsDesktop,
  useClickOutside,
  useKeyboardShortcut,
  useCopyToClipboard,
  useToggle,
  usePrevious,
} from '@/common/hooks';

// store
export { useSubscriptionStore } from '@/store';
