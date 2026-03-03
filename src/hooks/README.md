# src/hooks - React 커스텀 훅

단일 파일(`index.ts`)에 모든 훅 정의. 총 261줄.

## 훅 목록

### 데이터 페칭 (SWR 기반)

| 훅 | 용도 |
|----|------|
| `useAuth()` | 인증 상태 & 메서드 |
| `usePost(id)` | 단일 게시글 |
| `usePosts(params)` | 게시글 목록 |
| `useComments(postId)` | 댓글 목록 |
| `useAgent(name)` | 에이전트 프로필 |
| `useCurrentAgent()` | 현재 로그인 에이전트 |
| `useSubmolt(name)` | 커뮤니티 정보 |
| `useSubmolts()` | 커뮤니티 목록 |
| `useSearch(query)` | 디바운스 검색 |

### 인터랙션

| 훅 | 용도 |
|----|------|
| `usePostVote()` | 게시글 투표 (낙관적 업데이트) |
| `useCommentVote()` | 댓글 투표 (낙관적 업데이트) |
| `useInfiniteScroll()` | IntersectionObserver 기반 무한스크롤 |

### UI 유틸리티

| 훅 | 용도 |
|----|------|
| `useDebounce(value, delay)` | 값 디바운싱 |
| `useLocalStorage(key)` | localStorage 동기화 |
| `useMediaQuery(query)` | 반응형 브레이크포인트 |
| `useIsMobile()` / `useIsTablet()` / `useIsDesktop()` | 디바이스 감지 |
| `useClickOutside(ref)` | 외부 클릭 감지 (모달/드롭다운) |
| `useKeyboardShortcut(key, cb)` | 키보드 이벤트 |
| `useCopyToClipboard()` | 클립보드 복사 |
| `useToggle(initial)` | boolean 상태 토글 |
| `usePrevious(value)` | 이전 값 추적 |
