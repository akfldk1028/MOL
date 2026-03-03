'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn, formatScore, formatRelativeTime, getInitials } from '@/lib/utils';
import { useFeedStore } from '@/store';
import { useInfiniteScroll } from '@/hooks';
import { PostList, FeedSortTabs } from '@/components/post';
import { Card, Spinner, Button, Avatar, AvatarFallback } from '@/components/ui';
import { TrendingUp, Users, Flame, Clock, Zap, ChevronRight } from 'lucide-react';
import type { Post, Submolt, Agent, PostSort } from '@/types';

// 무한 스크롤 피드 컨테이너
export function Feed() {
  const { posts, sort, isLoading, hasMore, setSort, loadMore } = useFeedStore();
  const { ref } = useInfiniteScroll(loadMore, hasMore);

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <FeedSortTabs value={sort} onChange={(v) => setSort(v as PostSort)} />
      </Card>
      
      <PostList posts={posts} isLoading={isLoading && posts.length === 0} />
      
      {hasMore && (
        <div ref={ref} className="flex justify-center py-8">
          {isLoading && <Spinner />}
        </div>
      )}
      
      {!hasMore && posts.length > 0 && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">모든 게시물을 확인했습니다 🎉</p>
        </div>
      )}
    </div>
  );
}

// 인기 게시물 위젯
export function TrendingPosts({ posts }: { posts: Post[] }) {
  if (!posts.length) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">오늘의 인기</h3>
      </div>
      <div className="space-y-3">
        {posts.slice(0, 5).map((post, i) => (
          <Link key={post.id} href={`/post/${post.id}`} className="flex items-start gap-3 group">
            <span className="text-2xl font-bold text-muted-foreground/50 w-6">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">{post.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{formatScore(post.score)} 포인트 • m/{typeof post.submolt === 'string' ? post.submolt : post.submolt.name}</p>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

// 인기 서브몰트 위젯
export function PopularSubmolts({ submolts }: { submolts: Submolt[] }) {
  if (!submolts.length) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">인기 커뮤니티</h3>
        </div>
        <Link href="/submolts" className="text-xs text-primary hover:underline">전체 보기</Link>
      </div>
      <div className="space-y-2">
        {submolts.slice(0, 5).map((submolt, i) => (
          <Link key={submolt.id} href={`/m/${submolt.name}`} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted transition-colors">
            <span className="text-sm font-medium text-muted-foreground w-4">{i + 1}</span>
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs bg-primary/10 text-primary">{getInitials(submolt.name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">m/{submolt.name}</p>
              <p className="text-xs text-muted-foreground">{formatScore(submolt.subscriberCount)} 멤버</p>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

// 활동 중인 에이전트 위젯
export function ActiveAgents({ agents }: { agents: Agent[] }) {
  if (!agents.length) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">활동 중인 에이전트</h3>
      </div>
      <div className="space-y-2">
        {agents.slice(0, 5).map(agent => (
          <Link key={agent.id} href={`/u/${agent.name}`} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted transition-colors">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{getInitials(agent.name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">u/{agent.name}</p>
              <p className="text-xs text-muted-foreground">{formatScore(agent.karma)} 카르마</p>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

// 피드 사이드바
export function FeedSidebar({ trendingPosts, popularSubmolts, activeAgents }: {
  trendingPosts?: Post[];
  popularSubmolts?: Submolt[];
  activeAgents?: Agent[];
}) {
  return (
    <div className="space-y-4">
      {trendingPosts && <TrendingPosts posts={trendingPosts} />}
      {popularSubmolts && <PopularSubmolts submolts={popularSubmolts} />}
      {activeAgents && <ActiveAgents agents={activeAgents} />}
      
      {/* 푸터 링크 */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Link href="/about" className="hover:text-foreground">소개</Link>
          <span>•</span>
          <Link href="/terms" className="hover:text-foreground">이용약관</Link>
          <span>•</span>
          <Link href="/privacy" className="hover:text-foreground">개인정보처리방침</Link>
          <span>•</span>
          <Link href="/api" className="hover:text-foreground">API</Link>
        </div>
        <p className="text-xs text-muted-foreground mt-2">© 2026 Goodmolt</p>
      </Card>
    </div>
  );
}

// 빈 피드 상태 컴포넌트
export function EmptyFeed({ message }: { message?: string }) {
  return (
    <Card className="p-8 text-center">
      <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
        <Flame className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="font-semibold mb-2">아직 게시물이 없습니다</h3>
      <p className="text-sm text-muted-foreground">{message || '첫 번째 게시물을 작성해 보세요!'}</p>
    </Card>
  );
}

// 피드 로딩 상태
export function FeedLoading() {
  return (
    <div className="flex justify-center py-12">
      <Spinner size="lg" />
    </div>
  );
}
