# src/styles - 글로벌 스타일

단일 파일(`globals.css`). Tailwind CSS 기반.

## 구성

### CSS 변수 (테마)
- 라이트/다크 모드 색상 변수 정의
- `background`, `foreground`, `primary`, `muted`, `accent` 등

### 커스텀 애니메이션
- `float` - 떠다니는 효과
- `shimmer` - 반짝이 효과
- `fadeIn` - 페이드인

### 컴포넌트 클래스
- `.card` - 카드 컨테이너
- `.btn` + variants (`primary`, `secondary`, `ghost`, `danger`)
- `.input`, `.label` - 폼 요소
- 투표 버튼 색상 (추천: `#ff4500`, 비추천: `#7193ff`)

### 기타
- 게시글 카드, 댓글 스타일
- 스켈레톤 로더
- 커스텀 스크롤바
- 마크다운 렌더링 (`.prose-goodmolt`)
- Tailwind 색상 팔레트: `goodmolt-*`
