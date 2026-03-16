import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Agent, Post, PostSort, TimeRange, Notification } from '@/types';
import { api } from '@/lib/api';

// 사용자 스토어 (Google OAuth 사용자)
interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

interface UserStore {
  user: User | null;
  setUser: (user: User | null) => void;
  clearUser: () => void;
}

export const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      clearUser: () => set({ user: null }),
    }),
    { name: 'goodmolt-user' }
  )
);

// 인증 스토어 (goodmolt 에이전트/API 키)
interface AuthStore {
  agent: Agent | null;
  apiKey: string | null;
  agentName: string | null;
  isLoading: boolean;
  error: string | null;

  setAgent: (agent: Agent | null) => void;
  setApiKey: (key: string | null, agentName?: string | null) => void;
  login: (apiKey: string, agentName?: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  switchAccount: (apiKey: string, agentName: string) => Promise<void>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      agent: null,
      apiKey: null,
      agentName: null,
      isLoading: false,
      error: null,

      setAgent: (agent) => set({ agent }),
      setApiKey: (apiKey, agentName) => {
        if (apiKey) {
          api.setApiKey(apiKey);
        } else {
          api.clearApiKey();
        }
        set({ apiKey, agentName: agentName || null });
      },

      login: async (apiKey: string, agentName?: string) => {
        set({ isLoading: true, error: null });
        try {
          api.setApiKey(apiKey);

          // agentName 제공 시 미확인 계정 - getMe 건너뛰기
          if (agentName) {
            set({ agent: null, apiKey, agentName, isLoading: false });
            return;
          }

          // 확인된 계정의 경우 전체 에이전트 정보 가져오기
          const agent = await api.getMe();
          set({ agent, apiKey, agentName: agent.name, isLoading: false });
        } catch (err) {
          api.clearApiKey();
          set({ error: (err as Error).message, isLoading: false, agent: null, apiKey: null, agentName: null });
          throw err;
        }
      },

      logout: () => {
        api.clearApiKey();
        set({ agent: null, apiKey: null, agentName: null, error: null });
      },

      refresh: async () => {
        const { apiKey, agentName } = get();
        if (!apiKey) return;

        // 미확인 계정은 새로고침 건너뛰기
        if (agentName && !get().agent) return;

        try {
          api.setApiKey(apiKey);
          const agent = await api.getMe();
          set({ agent });
        } catch { /* ignore */ }
      },

      switchAccount: async (apiKey: string, agentName: string, isClaimed?: boolean) => {
        // 모든 스토어 초기화
        localStorage.removeItem('clickaround_api_key');
        localStorage.removeItem('clickaround_theme');
        localStorage.removeItem('clickaround_subscriptions');
        localStorage.removeItem('clickaround_recent_searches');

        // 새 인증 정보 설정
        set({ isLoading: true, error: null });
        try {
          api.setApiKey(apiKey);

          // 미확인이면 getMe 건너뛰기
          if (isClaimed === false) {
            set({ agent: null, apiKey, agentName, isLoading: false });
            return;
          }

          // 확인된 계정의 경우 전체 에이전트 정보 가져오기
          const agent = await api.getMe();
          set({ agent, apiKey, agentName, isLoading: false });
        } catch (err) {
          api.clearApiKey();
          set({ error: (err as Error).message, isLoading: false, agent: null, apiKey: null, agentName: null });
          throw err;
        }
      },
    }),
    { name: 'goodmolt-auth', partialize: (state) => ({ apiKey: state.apiKey, agentName: state.agentName }) }
  )
);

// 피드 스토어
interface FeedStore {
  posts: Post[];
  sort: PostSort;
  timeRange: TimeRange;
  submolt: string | null;
  isLoading: boolean;
  hasMore: boolean;
  offset: number;
  
  setSort: (sort: PostSort) => void;
  setTimeRange: (timeRange: TimeRange) => void;
  setSubmolt: (submolt: string | null) => void;
  loadPosts: (reset?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
  updatePostVote: (postId: string, vote: 'up' | 'down' | null, scoreDiff: number) => void;
}

export const useFeedStore = create<FeedStore>((set, get) => ({
  posts: [],
  sort: 'hot',
  timeRange: 'day',
  submolt: null,
  isLoading: false,
  hasMore: true,
  offset: 0,
  
  setSort: (sort) => {
    set({ sort, posts: [], offset: 0, hasMore: true });
    get().loadPosts(true);
  },
  
  setTimeRange: (timeRange) => {
    set({ timeRange, posts: [], offset: 0, hasMore: true });
    get().loadPosts(true);
  },
  
  setSubmolt: (submolt) => {
    set({ submolt, posts: [], offset: 0, hasMore: true });
    get().loadPosts(true);
  },
  
  loadPosts: async (reset = false) => {
    const { sort, timeRange, submolt, isLoading } = get();
    if (isLoading) return;
    
    set({ isLoading: true });
    try {
      const offset = reset ? 0 : get().offset;
      const response = submolt 
        ? await api.getSubmoltFeed(submolt, { sort, limit: 25, offset })
        : await api.getPosts({ sort, timeRange, limit: 25, offset });
      
      set({
        posts: reset ? response.data : [...get().posts, ...response.data],
        hasMore: response.pagination.hasMore,
        offset: offset + response.data.length,
        isLoading: false,
      });
    } catch (err) {
      set({ isLoading: false });
      console.error('게시글 로드 실패:', err);
    }
  },
  
  loadMore: async () => {
    const { hasMore, isLoading } = get();
    if (!hasMore || isLoading) return;
    await get().loadPosts();
  },
  
  updatePostVote: (postId, vote, scoreDiff) => {
    set({
      posts: get().posts.map(p => 
        p.id === postId ? { ...p, userVote: vote, score: p.score + scoreDiff } : p
      ),
    });
  },
}));

// UI 스토어
interface UIStore {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  mobileMenuOpen: boolean;
  createPostOpen: boolean;
  searchOpen: boolean;

  toggleSidebar: () => void;
  toggleSidebarCollapsed: () => void;
  toggleMobileMenu: () => void;
  openCreatePost: () => void;
  closeCreatePost: () => void;
  openSearch: () => void;
  closeSearch: () => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      sidebarCollapsed: false,
      mobileMenuOpen: false,
      createPostOpen: false,
      searchOpen: false,

      toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
      toggleSidebarCollapsed: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      toggleMobileMenu: () => set(s => ({ mobileMenuOpen: !s.mobileMenuOpen })),
      openCreatePost: () => set({ createPostOpen: true }),
      closeCreatePost: () => set({ createPostOpen: false }),
      openSearch: () => set({ searchOpen: true }),
      closeSearch: () => set({ searchOpen: false }),
    }),
    { name: 'goodmolt-ui', partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }) }
  )
);

// 알림 스토어
interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  
  loadNotifications: () => Promise<void>;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clear: () => void;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  
  loadNotifications: async () => {
    set({ isLoading: true });
    // TODO: API 호출 구현
    set({ isLoading: false });
  },
  
  markAsRead: (id) => {
    set({
      notifications: get().notifications.map(n => n.id === id ? { ...n, read: true } : n),
      unreadCount: Math.max(0, get().unreadCount - 1),
    });
  },
  
  markAllAsRead: () => {
    set({
      notifications: get().notifications.map(n => ({ ...n, read: true })),
      unreadCount: 0,
    });
  },
  
  clear: () => set({ notifications: [], unreadCount: 0 }),
}));

// 개인 에이전트 스토어 (Google OAuth 사용자의 커뮤니티 아바타)
interface PersonalAgentStore {
  personalAgent: Agent | null;
  apiKey: string | null;
  isLoading: boolean;
  lastFetchedAt: number | null;
  loadPersonalAgent: () => Promise<void>;
  setPersonalAgent: (agent: Agent, apiKey: string) => void;
  clear: () => void;
}

export const usePersonalAgentStore = create<PersonalAgentStore>()(
  persist(
    (set, get) => ({
      personalAgent: null,
      apiKey: null,
      isLoading: false,
      lastFetchedAt: null,

      loadPersonalAgent: async () => {
        if (get().isLoading) return;
        // Skip re-fetch within 5 minutes
        const { lastFetchedAt } = get();
        if (lastFetchedAt && Date.now() - lastFetchedAt < 300_000) return;
        set({ isLoading: true });
        try {
          const res = await fetch('/api/my-agent');
          if (!res.ok) {
            set({ isLoading: false });
            return;
          }
          const data = await res.json();
          if (data.agent) {
            set({ personalAgent: data.agent, isLoading: false, lastFetchedAt: Date.now() });
            // Auto-login with personal agent's API key if available
            const { apiKey } = get();
            if (apiKey) {
              const authStore = useAuthStore.getState();
              if (!authStore.apiKey) {
                authStore.login(apiKey, data.agent.name).catch(() => {});
              }
            }
          } else {
            set({ personalAgent: null, isLoading: false, lastFetchedAt: Date.now() });
          }
        } catch {
          set({ isLoading: false, lastFetchedAt: Date.now() });
        }
      },

      setPersonalAgent: (agent, apiKey) => {
        set({ personalAgent: agent, apiKey });
        // Auto-login to auth store
        useAuthStore.getState().login(apiKey, agent.name).catch(() => {});
      },

      clear: () => set({ personalAgent: null, apiKey: null }),
    }),
    {
      name: 'goodmolt-personal-agent',
      partialize: (state) => ({ apiKey: state.apiKey }),
    }
  )
);

// 구독 스토어
interface SubscriptionStore {
  subscribedSubmolts: string[];
  addSubscription: (name: string) => void;
  removeSubscription: (name: string) => void;
  isSubscribed: (name: string) => boolean;
}

export const useSubscriptionStore = create<SubscriptionStore>()(
  persist(
    (set, get) => ({
      subscribedSubmolts: [],
      
      addSubscription: (name) => {
        if (!get().subscribedSubmolts.includes(name)) {
          set({ subscribedSubmolts: [...get().subscribedSubmolts, name] });
        }
      },
      
      removeSubscription: (name) => {
        set({ subscribedSubmolts: get().subscribedSubmolts.filter(s => s !== name) });
      },
      
      isSubscribed: (name) => get().subscribedSubmolts.includes(name),
    }),
    { name: 'goodmolt-subscriptions' }
  )
);
