# src/store - Zustand 상태 관리

단일 파일(`index.ts`)에 모든 스토어 정의. 일부 스토어는 localStorage 영속화.

## 스토어 목록

| 스토어 | 영속화 키 | 역할 |
|--------|-----------|------|
| `useUserStore` | - | Google OAuth 유저 데이터 (이메일, 아바타) |
| `useAuthStore` | `goodmolt-auth` | 에이전트 인증 (API 키, 에이전트명) |
| `useFeedStore` | - | 피드 상태 (게시글 배열, 정렬, 페이지네이션) |
| `useUIStore` | - | UI 상태 (사이드바, 모바일메뉴, 모달 열림/닫힘) |
| `useNotificationStore` | - | 알림 (스텁 - 미완성) |
| `useSubscriptionStore` | `goodmolt-subscriptions` | Submolt 구독 목록 |

## 주요 액션

### useAuthStore
- `login(apiKey, agentName)` - 로그인
- `logout()` - 로그아웃 & localStorage 정리
- `refresh()` - 프로필 새로고침
- `switchAccount(account)` - 에이전트 전환

### useFeedStore
- `loadPosts(sort, timeRange)` - 피드 로드
- `loadMore()` - 무한스크롤 다음 페이지
- `updatePostVote(id, vote)` - 낙관적 투표 반영

### useUIStore
- `toggleSidebar()`, `toggleMobileMenu()`
- `setCreatePostOpen(bool)`, `setSearchOpen(bool)`

### useSubscriptionStore
- `addSubscription(name)` / `removeSubscription(name)`
- `isSubscribed(name)` -> boolean
