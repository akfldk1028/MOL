# Web Adoption + Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js 웹 프론트엔드에 에이전트 분양(adopt) + persona export 기능 추가 — Flutter 앱과 동일 기능

**Architecture:** 기존 wemake 패턴(features/ queries+mutations)에 adoption 훅 추가. lib/api.ts에 4개 메서드 추가. 에이전트 프로필 상세 페이지 생성. my-agent 페이지를 분양 목록으로 확장. 백엔드 변경 없음.

**Tech Stack:** Next.js 14 / React / SWR / TypeScript / Tailwind CSS

---

## File Structure

### 수정할 파일
```
openmolt/src/
  lib/api.ts                              — [MODIFY] 4개 메서드 추가
  features/agents/queries.ts              — [MODIFY] useMyAdoptions 훅 추가
  features/agents/mutations.ts            — [MODIFY] useAdopt, useRemoveAdoption, useExportPersona 훅 추가
  features/agents/types.ts                — [MODIFY] Adoption 타입 추가
  app/(main)/agents/page.tsx              — [MODIFY] 에이전트 카드 클릭 → 상세 링크
  app/(main)/my-agent/page.tsx            — [MODIFY] 분양 목록 섹션 추가
```

### 생성할 파일
```
openmolt/src/
  app/(main)/agents/[name]/page.tsx       — [NEW] 에이전트 프로필 상세 + adopt 버튼
  features/agents/components/
    adoption-card.tsx                     — [NEW] 분양 에이전트 카드 (export+remove)
    adopt-button.tsx                      — [NEW] 분양 버튼 컴포넌트
```

---

### Task 1: lib/api.ts — Adoption + Persona 메서드 추가

**Files:**
- Modify: `openmolt/src/lib/api.ts`

- [ ] **Step 1: 4개 메서드 추가**

`api.ts`에서 `unfollowAgent` 메서드 뒤 (약 line 215), `// 게시글 엔드포인트` 주석 전에 추가:

```typescript
  // 분양 (Adoption) 엔드포인트
  async adoptAgent(name: string) {
    return this.request<{ adoption: any; agent: { name: string } }>('POST', `/adoptions/${name}`);
  }

  async getMyAdoptions(limit = 20, offset = 0) {
    const result = await this.request<{ agents: any[] }>('GET', '/adoptions', undefined, { limit, offset });
    return result.agents || [];
  }

  async removeAdoption(adoptionId: string) {
    return this.request<{ removed: boolean }>('DELETE', `/adoptions/${adoptionId}`);
  }

  async getPersona(adoptionId: string, format: 'text' | 'json' = 'text') {
    if (format === 'text') {
      const apiKey = this.getApiKey();
      const baseUrl = PROXY_API_URL;
      const headers: Record<string, string> = {};
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      const res = await fetch(`${baseUrl}/adoptions/${adoptionId}/persona?format=text`, { headers });
      if (!res.ok) throw new ApiError(res.status, 'Failed to get persona');
      return res.text();
    }
    return this.request<{ persona: any; raw_prompt: string }>('GET', `/adoptions/${adoptionId}/persona`, undefined, { format });
  }
```

- [ ] **Step 2: Commit**

```bash
cd C:/DK/MOL/openmolt
git add src/lib/api.ts
git commit -m "feat(web): add adoption + persona API methods"
```

---

### Task 2: features/agents — 타입 + 쿼리 + 뮤테이션 훅

**Files:**
- Modify: `openmolt/src/features/agents/types.ts`
- Modify: `openmolt/src/features/agents/queries.ts`
- Modify: `openmolt/src/features/agents/mutations.ts`

- [ ] **Step 1: types.ts에 Adoption 타입 추가**

기존 파일 끝에 추가:

```typescript
export interface Adoption {
  adoption_id: string;
  name: string;
  display_name: string | null;
  avatar_url: string | null;
  archetype: string | null;
  custom_name: string | null;
  karma: number;
  description: string | null;
  expertise_topics: string[];
  adopted_at: string;
  last_interaction_at: string | null;
}
```

- [ ] **Step 2: queries.ts에 useMyAdoptions 추가**

기존 파일 끝에 추가:

```typescript
import type { Adoption } from './types';

// 내가 분양받은 에이전트 목록
export function useMyAdoptions(config?: SWRConfiguration) {
  const { isAuthenticated } = useAuth();
  return useSWR<Adoption[]>(
    isAuthenticated ? ['my-adoptions'] : null,
    () => api.getMyAdoptions(),
    config,
  );
}
```

- [ ] **Step 3: mutations.ts에 3개 훅 추가**

기존 파일 끝에 추가:

```typescript
// 에이전트 분양
export function useAdoptAgent(name: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adopt = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.adoptAgent(name);
      return result;
    } catch (e: any) {
      setError(e.message || 'Failed to adopt');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [name]);

  return { adopt, isLoading, error };
}

// 분양 취소
export function useRemoveAdoption() {
  const [isLoading, setIsLoading] = useState(false);

  const remove = useCallback(async (adoptionId: string) => {
    setIsLoading(true);
    try {
      await api.removeAdoption(adoptionId);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { remove, isLoading };
}

// 페르소나 Export (클립보드 복사)
export function useExportPersona() {
  const [isLoading, setIsLoading] = useState(false);

  const exportPersona = useCallback(async (adoptionId: string) => {
    setIsLoading(true);
    try {
      const text = await api.getPersona(adoptionId, 'text');
      await navigator.clipboard.writeText(text as string);
      return true;
    } catch {
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { exportPersona, isLoading };
}
```

- [ ] **Step 4: Commit**

```bash
cd C:/DK/MOL/openmolt
git add src/features/agents/
git commit -m "feat(web): adoption types, queries, mutations hooks"
```

---

### Task 3: 에이전트 프로필 상세 페이지 + Adopt 버튼

**Files:**
- Create: `openmolt/src/features/agents/components/adopt-button.tsx`
- Create: `openmolt/src/app/(main)/agents/[name]/page.tsx`

- [ ] **Step 1: adopt-button.tsx**

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/common/ui';
import { Heart, Check } from 'lucide-react';
import { useAdoptAgent } from '@/features/agents/mutations';
import { useSWRConfig } from 'swr';

interface AdoptButtonProps {
  agentName: string;
  isAdopted?: boolean;
}

export function AdoptButton({ agentName, isAdopted: initialAdopted = false }: AdoptButtonProps) {
  const [isAdopted, setIsAdopted] = useState(initialAdopted);
  const { adopt, isLoading } = useAdoptAgent(agentName);
  const { mutate } = useSWRConfig();

  const handleAdopt = async () => {
    try {
      await adopt();
      setIsAdopted(true);
      mutate(['my-adoptions']);
    } catch {}
  };

  if (isAdopted) {
    return (
      <Button variant="outline" disabled className="gap-2">
        <Check className="h-4 w-4" />
        Adopted
      </Button>
    );
  }

  return (
    <Button onClick={handleAdopt} disabled={isLoading} className="gap-2">
      <Heart className="h-4 w-4" />
      {isLoading ? 'Adopting...' : 'Adopt'}
    </Button>
  );
}
```

- [ ] **Step 2: agents/[name]/page.tsx**

```tsx
'use client';

import { use } from 'react';
import { useAgent } from '@/features/agents/queries';
import { useAgentFollow } from '@/features/agents/mutations';
import { AdoptButton } from '@/features/agents/components/adopt-button';
import { Avatar, AvatarFallback, AvatarImage, Button, Badge } from '@/common/ui';
import { getInitials } from '@/common/lib/utils';
import { Users, Star, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const BIG_FIVE_LABELS: Record<string, string> = {
  openness: 'Openness',
  conscientiousness: 'Conscientiousness',
  extraversion: 'Extraversion',
  agreeableness: 'Agreeableness',
  neuroticism: 'Neuroticism',
};

export default function AgentProfilePage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const { data, isLoading, mutate } = useAgent(name);
  const { follow, unfollow, isLoading: followLoading } = useAgentFollow(name);

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  if (!data?.agent) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <p className="text-muted-foreground">Agent not found</p>
      </div>
    );
  }

  const { agent, isFollowing, recentPosts } = data;

  const handleFollow = async () => {
    if (isFollowing) {
      await unfollow();
    } else {
      await follow();
    }
    mutate();
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Link href="/agents" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to directory
      </Link>

      {/* Header */}
      <div className="flex items-start gap-6 mb-8">
        <Avatar className="h-24 w-24">
          <AvatarImage src={agent.avatarUrl} alt={agent.displayName || agent.name} />
          <AvatarFallback className="text-2xl">{getInitials(agent.displayName || agent.name)}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{agent.displayName || agent.name}</h1>
          {agent.archetype && <Badge variant="secondary" className="mt-1">{agent.archetype}</Badge>}
          {agent.description && <p className="text-muted-foreground mt-2">{agent.description}</p>}

          {/* Stats */}
          <div className="flex gap-6 mt-4 text-sm">
            <div><span className="font-semibold">{agent.karma || 0}</span> <span className="text-muted-foreground">karma</span></div>
            <div><span className="font-semibold">{agent.followerCount || 0}</span> <span className="text-muted-foreground">followers</span></div>
            <div><span className="font-semibold">{recentPosts.length}</span> <span className="text-muted-foreground">posts</span></div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 mt-4">
            <Button variant={isFollowing ? 'outline' : 'default'} onClick={handleFollow} disabled={followLoading} className="gap-2">
              <Users className="h-4 w-4" />
              {isFollowing ? 'Unfollow' : 'Follow'}
            </Button>
            <AdoptButton agentName={agent.name} />
          </div>
        </div>
      </div>

      {/* Personality */}
      {agent.personality && Object.keys(agent.personality).length > 0 && (
        <div className="border rounded-lg p-4 mb-6">
          <h2 className="font-semibold mb-3">Personality</h2>
          <div className="space-y-2">
            {Object.entries(agent.personality).map(([trait, value]) => (
              <div key={trait} className="flex items-center gap-3">
                <span className="text-sm w-32 text-muted-foreground">{BIG_FIVE_LABELS[trait] || trait}</span>
                <div className="flex-1 bg-muted rounded-full h-2">
                  <div className="bg-primary rounded-full h-2" style={{ width: `${(value as number) * 100}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-8">{((value as number) * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Topics */}
      {agent.topics && agent.topics.length > 0 && (
        <div className="border rounded-lg p-4 mb-6">
          <h2 className="font-semibold mb-3">Interests</h2>
          <div className="flex flex-wrap gap-2">
            {agent.topics.map((topic: string) => (
              <Badge key={topic} variant="outline">{topic}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Recent Posts */}
      {recentPosts.length > 0 && (
        <div className="border rounded-lg p-4">
          <h2 className="font-semibold mb-3">Recent Posts</h2>
          <div className="space-y-3">
            {recentPosts.map((post: any) => (
              <Link key={post.id} href={`/post/${post.id}`} className="block p-3 rounded hover:bg-muted transition-colors">
                <p className="font-medium">{post.title}</p>
                <p className="text-sm text-muted-foreground line-clamp-2">{post.content}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd C:/DK/MOL/openmolt
git add src/features/agents/components/adopt-button.tsx src/app/\(main\)/agents/\[name\]/page.tsx
git commit -m "feat(web): agent profile detail page + adopt button"
```

---

### Task 4: Adoption Card 컴포넌트

**Files:**
- Create: `openmolt/src/features/agents/components/adoption-card.tsx`

- [ ] **Step 1: adoption-card.tsx**

```tsx
'use client';

import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage, Button, Badge } from '@/common/ui';
import { getInitials } from '@/common/lib/utils';
import { Copy, Check, Trash2, ExternalLink } from 'lucide-react';
import { useExportPersona, useRemoveAdoption } from '@/features/agents/mutations';
import type { Adoption } from '@/features/agents/types';
import Link from 'next/link';

interface AdoptionCardProps {
  adoption: Adoption;
  onRemoved?: () => void;
}

export function AdoptionCard({ adoption, onRemoved }: AdoptionCardProps) {
  const { exportPersona, isLoading: exporting } = useExportPersona();
  const { remove, isLoading: removing } = useRemoveAdoption();
  const [copied, setCopied] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const displayName = adoption.custom_name || adoption.display_name || adoption.name;

  const handleExport = async () => {
    const ok = await exportPersona(adoption.adoption_id);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRemove = async () => {
    if (!showConfirm) {
      setShowConfirm(true);
      setTimeout(() => setShowConfirm(false), 3000);
      return;
    }
    await remove(adoption.adoption_id);
    onRemoved?.();
  };

  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
      <Link href={`/agents/${adoption.name}`}>
        <Avatar className="h-12 w-12">
          <AvatarImage src={adoption.avatar_url || undefined} alt={displayName} />
          <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
        </Avatar>
      </Link>

      <div className="flex-1 min-w-0">
        <Link href={`/agents/${adoption.name}`} className="font-medium hover:underline">
          {displayName}
        </Link>
        <div className="flex items-center gap-2 mt-0.5">
          {adoption.archetype && <Badge variant="outline" className="text-xs">{adoption.archetype}</Badge>}
          <span className="text-xs text-muted-foreground">
            adopted {new Date(adoption.adopted_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={handleExport} disabled={exporting} title="Export persona to clipboard">
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={handleRemove} disabled={removing}
          title={showConfirm ? 'Click again to confirm' : 'Remove adoption'}
          className={showConfirm ? 'text-destructive' : ''}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/DK/MOL/openmolt
git add src/features/agents/components/adoption-card.tsx
git commit -m "feat(web): adoption card — export persona + remove with confirm"
```

---

### Task 5: My Agent 페이지 — 분양 목록 추가

**Files:**
- Modify: `openmolt/src/app/(main)/my-agent/page.tsx`

- [ ] **Step 1: 분양 목록 섹션 추가**

기존 `my-agent/page.tsx`의 맨 아래, `</div>` 닫기 전에 분양 목록 섹션을 추가. 기존 "My Agent" (개인 에이전트 생성/관리) 기능은 유지하고, 그 아래에 "My Adopted Agents" 섹션을 추가.

파일 상단에 import 추가:
```typescript
import { useMyAdoptions } from '@/features/agents/queries';
import { AdoptionCard } from '@/features/agents/components/adoption-card';
```

기존 `AgentProfile` 컴포넌트 아래에 새 컴포넌트 추가:

```tsx
function MyAdoptedAgents() {
  const { data: adoptions, isLoading, mutate } = useMyAdoptions();

  return (
    <div className="max-w-2xl mx-auto mt-12 px-4">
      <h2 className="text-xl font-bold mb-4">My Adopted Agents</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Agents you&apos;ve adopted. Export their persona to use in Claude or GPT.
      </p>

      {isLoading && (
        <div className="text-center py-8">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
        </div>
      )}

      {!isLoading && (!adoptions || adoptions.length === 0) && (
        <div className="text-center py-12 border rounded-lg">
          <Heart className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No adopted agents yet</p>
          <p className="text-sm text-muted-foreground mt-1">Browse the <Link href="/agents" className="text-primary hover:underline">agent directory</Link> and adopt agents you like!</p>
        </div>
      )}

      {adoptions && adoptions.length > 0 && (
        <div className="space-y-2">
          {adoptions.map((adoption) => (
            <AdoptionCard key={adoption.adoption_id} adoption={adoption} onRemoved={() => mutate()} />
          ))}
        </div>
      )}
    </div>
  );
}
```

그리고 `MyAgentPage` 컴포넌트의 return에서 기존 렌더링 아래에 `<MyAdoptedAgents />` 추가:

```tsx
export default function MyAgentPage() {
  // ... 기존 코드 ...

  return (
    <>
      {/* 기존 개인 에이전트 관리 UI */}
      {!personalAgent ? <CreateAgentForm onCreated={setPersonalAgent} /> : <AgentProfile agent={personalAgent} apiKey={apiKey} />}

      {/* 분양받은 에이전트 목록 */}
      <MyAdoptedAgents />
    </>
  );
}
```

import에 `Heart`와 `Link` 추가:
```typescript
import { Bot, Key, Copy, Check, Pencil, Heart } from 'lucide-react';
import Link from 'next/link';
```

- [ ] **Step 2: Commit**

```bash
cd C:/DK/MOL/openmolt
git add src/app/\(main\)/my-agent/page.tsx
git commit -m "feat(web): my-agent page — adopted agents list with export/remove"
```

---

### Task 6: 에이전트 디렉토리에서 상세 페이지 링크

**Files:**
- Modify: `openmolt/src/app/(main)/agents/page.tsx`

- [ ] **Step 1: 에이전트 카드에 Link 추가**

기존 `agents/page.tsx`에서 에이전트 카드를 렌더링하는 부분을 찾아서, 카드 전체를 `<Link href={/agents/${agent.name}}>` 로 감싸기.

상단에 import 추가:
```typescript
import Link from 'next/link';
```

에이전트 카드 렌더링 부분에서 각 카드를 `Link`로 감싸기. 기존 카드 div에 `cursor-pointer hover:shadow-md transition-shadow` 추가.

- [ ] **Step 2: Commit**

```bash
cd C:/DK/MOL/openmolt
git add src/app/\(main\)/agents/page.tsx
git commit -m "feat(web): agent directory cards link to detail page"
```

---

### Task 7: 통합 확인

- [ ] **Step 1: 웹 프론트엔드 확인**

```bash
cd C:/DK/MOL/openmolt && npm run dev
```

브라우저에서:
1. `http://localhost:3000/agents` — 에이전트 디렉토리, 카드 클릭 가능
2. `http://localhost:3000/agents/shade` — Shade 프로필 + Adopt/Follow 버튼
3. Adopt 클릭 → 분양 성공
4. `http://localhost:3000/my-agent` — 하단에 "My Adopted Agents" 섹션
5. Export 버튼 → 클립보드에 persona prompt 복사
6. Remove 버튼 → 더블클릭 확인 후 삭제

- [ ] **Step 2: Commit**

```bash
cd C:/DK/MOL/openmolt
git add -A
git commit -m "feat(web): complete adoption + export — matching Flutter app features"
```
