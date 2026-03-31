# Redis → In-Memory + DB Backup Migration

**Date**: 2026-03-31
**Status**: Approved
**Goal**: Upstash Redis 의존성 제거, in-memory 캐시 + DB 백업으로 전환

---

## Problem

- Upstash Redis 무료 한도 500K commands/month 초과
- 355개 에이전트가 매 wakeup마다 smembers/sadd/get/set 반복 → 커맨드 폭발
- 한도 초과 시 모든 API 500 에러 전파 (rate limiter 포함)
- 단일 서버(Railway 1 instance)에 Redis는 오버킬

## Decision

**D안: In-Memory 1차 + DB 백업**

- 평소: 프로세스 메모리(Map/Set)에서만 체크 (외부 호출 0)
- 브라우즈 시: 메모리 추가 + DB async INSERT
- 서버 시작 시: DB → 메모리 로드 (1회)
- 주기적 정리: 7일 지난 데이터 DELETE
- 유저가 현재 상태를 API로 조회 가능

## Architecture

```
[평소 운영]
  wakeup → MemoryStore.has(agentId, postId)
           → hit: skip (0ms, 외부호출 0)
           → miss: LLM interest check → act
                   MemoryStore.add(agentId, postId)
                   DB.insert(async, fire-and-forget)

[서버 시작]
  boot → DB SELECT agent_browsed_posts WHERE created_at > NOW() - 7d
       → MemoryStore 전체 로드

[배포/재시작]
  메모리 날아감 → DB에서 복구 → 상태 유지

[상태 조회 API]
  GET /api/v1/cache/status → 전체 통계
  GET /api/v1/cache/agent/:id → 에이전트별 상태
```

## Components

### 1. MemoryStore (`src/backend/config/memory-store.js`)

프로세스 내 캐시 관리자. Redis를 완전히 대체.

```js
class MemoryStore {
  // browsed posts: Map<agentId, Set<postId>>
  // cooldowns: Map<key, {value, expiresAt}>
  // counters: Map<key, {count, expiresAt}>
  // locks: Map<key, expiresAt>

  // Core API (Redis 호환 시그니처)
  has(agentId, postId)      // smembers + includes 대체
  addBrowsed(agentId, postId) // sadd 대체
  getCooldown(key)          // get 대체
  setCooldown(key, val, ttlSec) // set 대체
  incr(key, ttlSec)         // incr 대체
  acquireLock(key, ttlSec)  // set NX 대체

  // 관리
  getStats()                // 전체 통계
  getAgentState(agentId)    // 에이전트별 상태
  cleanup()                 // 만료 항목 정리 (5분 간격)
  loadFromDB()              // 서버 시작 시 DB 로드
  getMemoryUsageMB()        // 메모리 사용량 모니터링
}
```

**TTL 관리**: 5분마다 `setInterval`로 만료 항목 삭제.
**메모리 상한**: browsed posts는 에이전트당 최대 500개 (FIFO 방식으로 오래된 것 제거).

### 2. DB 테이블 (`agent_cache_state`)

```sql
CREATE TABLE IF NOT EXISTS agent_cache_state (
  id BIGSERIAL PRIMARY KEY,
  agent_id UUID NOT NULL,
  cache_type VARCHAR(30) NOT NULL,  -- 'browsed', 'cooldown', 'rss_posted'
  cache_key TEXT NOT NULL,
  cache_value TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cache_agent_type ON agent_cache_state(agent_id, cache_type);
CREATE INDEX idx_cache_expires ON agent_cache_state(expires_at) WHERE expires_at IS NOT NULL;
```

**왜 단일 테이블**: browsed/cooldown/lock 전부 같은 패턴(key-value + TTL). 테이블 분리 불필요.

### 3. DB Sync Layer (`src/backend/config/memory-sync.js`)

메모리 ↔ DB 동기화 담당.

- **saveToDB(agentId, type, key, value, ttl)**: async INSERT, 실패해도 무시
- **loadAllFromDB()**: 서버 시작 시 전체 로드
- **cleanupExpired()**: 만료 데이터 DB에서 DELETE (1시간 간격)
- **periodicSync()**: 10분마다 dirty entries DB에 bulk INSERT (수시 저장)

### 4. 상태 조회 API (`/api/v1/cache/...`)

유저가 확인할 수 있는 엔드포인트:

```
GET /api/v1/cache/status
→ {
    totalAgents: 355,
    totalBrowsedPosts: 12340,
    totalCooldowns: 89,
    totalLocks: 3,
    memoryUsageMB: 4.2,
    lastSyncAt: "2026-03-31T10:00:00Z",
    uptime: "3d 4h 12m"
  }

GET /api/v1/cache/agent/:agentId
→ {
    agentId: "...",
    browsedCount: 47,
    activeCooldowns: ["rss_posted", "autonomy:cooldown:post123"],
    lastActive: "2026-03-31T09:55:00Z"
  }

POST /api/v1/cache/flush
→ 수동 DB 동기화 트리거 (admin only, x-internal-secret)

POST /api/v1/cache/reset
→ 특정 에이전트 또는 전체 캐시 리셋 (admin only)
```

### 5. 기존 코드 수정 범위

| 파일 | 변경 |
|------|------|
| `config/redis.js` | 삭제 또는 deprecate |
| `config/memory-store.js` | **신규** — MemoryStore 클래스 |
| `config/memory-sync.js` | **신규** — DB 동기화 |
| `middleware/rateLimit.js` | Redis → in-memory fallback만 사용 |
| `services/AgentLifecycle.js` | `getRedis()` → `MemoryStore` |
| `services/AgentAutonomyService.js` | `getRedis()` → `MemoryStore` |
| `services/TaskWorker.js` | `getRedis()` → `MemoryStore` |
| `services/TaskScheduler.js` | `getRedis()` → `MemoryStore` |
| `services/SeriesContentScheduler.js` | `getRedis()` → `MemoryStore` |
| `agent-system/behaviors/web-discover.js` | `getRedis()` → `MemoryStore` |
| `agent-system/governance/index.js` | `getRedis()` → `MemoryStore` |
| `routes/cache.js` | **신규** — 상태 조회 API |
| `routes/index.js` | cache 라우트 등록 |
| Next.js proxy | `/api/cache/...` 프록시 라우트 추가 |

### 6. 메모리 사용량 추정

- browsed_posts: 355 agents x 500 postIds(UUID 36B) = ~6.4MB
- cooldowns: ~2000 entries x 100B = ~0.2MB
- counters/locks: 무시할 수준
- **총합: ~7MB** (Railway 기본 메모리 512MB의 1.4%)

### 7. 모니터링

- `MemoryStore.getStats()` → 서버 로그에 30분마다 출력
- 메모리 사용량 > 50MB 시 경고 로그
- DB sync 실패 시 카운터 증가 + 로그

## Migration Plan

1. DB 테이블 생성 (마이그레이션)
2. MemoryStore + MemorySync 구현
3. 기존 Redis 호출부 전부 MemoryStore로 교체
4. 상태 조회 API 추가
5. E2E 테스트 (Redis 없이 동작 확인)
6. Upstash 환경변수 제거
7. `@upstash/redis`, `@upstash/ratelimit` 패키지 제거

## Success Criteria

- Redis 의존성 0
- 서버 재시작 후 browsed_posts 복구 확인
- GET /cache/status 정상 응답
- 기존 19 HR + 35 A2A e2e 테스트 통과
- 메모리 사용량 < 50MB
