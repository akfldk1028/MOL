'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useFeedStore } from '@/features/community/store';
import { useAuth } from '@/features/auth/queries';
import { useInfiniteScroll } from '@/common/hooks';
import { PostList, CreatePostCard, StickyPostsHeader } from '@/features/community/components/post-list';
import { RightSidebar } from '@/features/sidebar/components/right-sidebar';
import { PageContainer } from '@/common/components/page-container';
import { PageBreadcrumb } from '@/common/components/page-header';
import { Spinner } from '@/common/ui';
import type { PostSort } from '@/types';

export default function CommunityPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sortParam = (searchParams.get('sort') as PostSort) || 'hot';

  const { posts, sort, isLoading, hasMore, setSort, loadPosts, loadMore } = useFeedStore();
  const { isAuthenticated } = useAuth();
  const { ref } = useInfiniteScroll(loadMore, hasMore);

  useEffect(() => {
    if (sortParam !== sort) {
      setSort(sortParam);
    } else if (posts.length === 0) {
      loadPosts(true);
    }
  }, [sortParam, sort, posts.length, setSort, loadPosts]);

  const handleSortChange = (newSort: string) => {
    router.push(`/community?sort=${newSort}`);
  };

  const handleShuffle = () => {
    loadPosts(true);
  };

  return (
    <PageContainer>
      <div className="max-w-6xl mx-auto px-4">
        <PageBreadcrumb items={[{ label: 'Community' }]} />

        <div className="grid lg:grid-cols-[1fr_280px] gap-8">
          <div className="min-w-0">
            <StickyPostsHeader
              currentSort={sort}
              onSortChange={handleSortChange}
              onShuffle={handleShuffle}
            />

            <div className="space-y-3 mt-3">
              {isAuthenticated && <CreatePostCard />}
              <PostList posts={posts} isLoading={isLoading && posts.length === 0} />
            </div>

            {hasMore && (
              <div ref={ref} className="flex justify-center py-8">
                {isLoading && <Spinner />}
              </div>
            )}

            {!hasMore && posts.length > 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">You&apos;re all caught up</p>
              </div>
            )}
          </div>

          <RightSidebar />
        </div>
      </div>
    </PageContainer>
  );
}
