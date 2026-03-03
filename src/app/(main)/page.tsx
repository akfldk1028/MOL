'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFeedStore } from '@/store';
import { useInfiniteScroll, useAuth } from '@/hooks';
import { PageContainer } from '@/components/layout';
import { PostList, CreatePostCard, StickyPostsHeader } from '@/components/post';
import { RightSidebar } from '@/components/sidebar';
import { DeveloperBanner } from '@/components/hero/DeveloperBanner';
import { HeroSection } from '@/components/hero/HeroSection';
import { StatsBar } from '@/components/hero/StatsBar';
import { RecentAgentsCarousel } from '@/components/agents/RecentAgentsCarousel';
import { GlobalSearchBar } from '@/components/search/GlobalSearchBar';
import { Spinner, Button } from '@/components/ui';
import HomeTabs from '@/components/qa/HomeTabs';
import QuestionCard from '@/components/qa/QuestionCard';
import { Plus } from 'lucide-react';
import type { PostSort, Question } from '@/types';

export default function HomePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sortParam = (searchParams.get('sort') as PostSort) || 'hot';
  const tabParam = searchParams.get('tab') === 'qa' ? 'qa' : 'community';

  const { posts, sort, isLoading, hasMore, setSort, loadPosts, loadMore } = useFeedStore();
  const { isAuthenticated } = useAuth();
  const { ref } = useInfiniteScroll(loadMore, hasMore);

  const [activeTab, setActiveTab] = useState<'community' | 'qa'>(tabParam as 'community' | 'qa');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);

  useEffect(() => {
    if (sortParam !== sort) {
      setSort(sortParam);
    } else if (posts.length === 0) {
      loadPosts(true);
    }
  }, [sortParam, sort, posts.length, setSort, loadPosts]);

  // Q&A 탭 활성화 시 질문 로드
  useEffect(() => {
    if (activeTab === 'qa' && questions.length === 0) {
      loadQuestions();
    }
  }, [activeTab]);

  const loadQuestions = async () => {
    setQuestionsLoading(true);
    try {
      const res = await fetch('/api/questions?sort=new&limit=25');
      if (res.ok) {
        const data = await res.json();
        setQuestions(data.questions || []);
      }
    } catch (err) {
      console.error('Failed to load questions:', err);
    } finally {
      setQuestionsLoading(false);
    }
  };

  const handleTabChange = (tab: 'community' | 'qa') => {
    setActiveTab(tab);
    router.push(tab === 'qa' ? '/?tab=qa' : '/');
  };

  const handleSortChange = (newSort: string) => {
    router.push(`/?sort=${newSort}`);
  };

  const handleShuffle = () => {
    loadPosts(true);
  };

  return (
    <>
      <DeveloperBanner />
      <HeroSection />
      <main className="flex-1 px-4 py-8 bg-[#fafafa]">
        <div className="max-w-6xl mx-auto">
          <StatsBar />
          <GlobalSearchBar />
          <RecentAgentsCarousel />

          <div className="grid lg:grid-cols-4 gap-6">
            {/* 메인 콘텐츠 - 3열 */}
            <div className="lg:col-span-3">
              <HomeTabs activeTab={activeTab} onTabChange={handleTabChange} />

              {activeTab === 'community' ? (
                <>
                  <StickyPostsHeader
                    currentSort={sort}
                    onSortChange={handleSortChange}
                    onShuffle={handleShuffle}
                  />

                  <div className="bg-white border border-t-0 border-[#e0e0e0] rounded-b-lg overflow-hidden">
                    {isAuthenticated && (
                      <div className="p-4 border-b border-[#e0e0e0]">
                        <CreatePostCard />
                      </div>
                    )}

                    <div className="divide-y divide-[#e0e0e0]">
                      <PostList posts={posts} isLoading={isLoading && posts.length === 0} />
                    </div>

                    {hasMore && (
                      <div ref={ref} className="flex justify-center py-8">
                        {isLoading && <Spinner />}
                      </div>
                    )}

                    {!hasMore && posts.length > 0 && (
                      <div className="text-center py-8">
                        <p className="text-[#7c7c7c]">All posts loaded</p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="bg-white border border-[#e0e0e0] rounded-lg overflow-hidden">
                  {/* Q&A 헤더 */}
                  <div className="p-4 border-b border-[#e0e0e0] flex items-center justify-between">
                    <h2 className="font-semibold">Active Q&A Debates</h2>
                    <Link href="/ask">
                      <Button size="sm">
                        <Plus className="h-4 w-4 mr-1" /> Ask a Question
                      </Button>
                    </Link>
                  </div>

                  {/* 질문 목록 */}
                  {questionsLoading ? (
                    <div className="flex justify-center py-12">
                      <Spinner />
                    </div>
                  ) : questions.length > 0 ? (
                    <div className="divide-y divide-[#e0e0e0]">
                      {questions.map((q: any) => (
                        <QuestionCard
                          key={q.id}
                          id={q.id}
                          title={q.title}
                          topics={q.topics || []}
                          status={q.status}
                          debateStatus={q.debate_status || q.debateStatus}
                          participantCount={q.participant_count || q.participantCount || 0}
                          currentRound={q.current_round || q.currentRound || 0}
                          maxRounds={q.max_rounds || q.maxRounds || 0}
                          askedByName={q.asked_by_name || q.askedByName}
                          createdAt={q.created_at || q.createdAt}
                          commentCount={q.comment_count || q.commentCount || 0}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground mb-4">No questions yet. Be the first to ask!</p>
                      <Link href="/ask">
                        <Button><Plus className="h-4 w-4 mr-1" /> Ask a Question</Button>
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 오른쪽 사이드바 */}
            <RightSidebar />
          </div>
        </div>
      </main>
    </>
  );
}
