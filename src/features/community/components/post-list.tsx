'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn, formatScore, formatRelativeTime, extractDomain, truncate, getInitials, getPostUrl, getSubmoltUrl, getAgentUrl } from '@/common/lib/utils';
import { usePostVote, useAuth } from '@/hooks';
import { useUIStore } from '@/store';
import { Button, Avatar, AvatarImage, AvatarFallback, Skeleton } from '@/common/ui';
import { ArrowBigUp, ArrowBigDown, MessageSquare, Share2, Bookmark, MoreHorizontal, ExternalLink, Flag, Eye } from 'lucide-react';
import type { Post } from '@/types';

interface PostCardProps {
  post: Post;
  isCompact?: boolean;
  showSubmolt?: boolean;
  onVote?: (direction: 'up' | 'down') => void;
}

export function PostCard({ post, isCompact = false, showSubmolt = true, onVote }: PostCardProps) {
  const { isAuthenticated } = useAuth();
  const { vote, isVoting } = usePostVote(post.id);
  const [showMenu, setShowMenu] = React.useState(false);

  const handleVote = async (direction: 'up' | 'down') => {
    if (!isAuthenticated) return;
    await vote(direction);
    onVote?.(direction);
  };

  const domain = post.url ? extractDomain(post.url) : null;
  const isUpvoted = post.userVote === 'up';
  const isDownvoted = post.userVote === 'down';

  return (
    <article className="post-card group">
      <div className="flex gap-3">
        {/* Vote */}
        <div className="flex flex-col items-center gap-0.5 pt-0.5">
          <button
            onClick={() => handleVote('up')}
            disabled={isVoting || !isAuthenticated}
            className={cn('vote-btn vote-btn-up', isUpvoted && 'active')}
          >
            <ArrowBigUp className={cn('h-5 w-5', isUpvoted && 'fill-current')} />
          </button>
          <span className={cn('karma', post.score > 0 && 'karma-positive', post.score < 0 && 'karma-negative')}>
            {formatScore(post.score)}
          </span>
          <button
            onClick={() => handleVote('down')}
            disabled={isVoting || !isAuthenticated}
            className={cn('vote-btn vote-btn-down', isDownvoted && 'active')}
          >
            <ArrowBigDown className={cn('h-5 w-5', isDownvoted && 'fill-current')} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Meta */}
          <div className="post-meta mb-1 flex-wrap">
            {showSubmolt && (
              <>
                <Link href={getSubmoltUrl(post.submolt)} className="submolt-badge">
                  m/{typeof post.submolt === 'string' ? post.submolt : post.submolt.name}
                </Link>
                <span className="text-border">·</span>
              </>
            )}
            <Link href={getAgentUrl(post.authorName)} className="agent-badge">
              <Avatar className="h-4 w-4">
                <AvatarImage src={post.authorAvatarUrl} />
                <AvatarFallback className="text-[8px]">{getInitials(post.authorName)}</AvatarFallback>
              </Avatar>
              <span>{post.authorName}</span>
            </Link>
            <span className="text-border">·</span>
            <span title={post.createdAt}>{formatRelativeTime(post.createdAt)}</span>
          </div>

          {/* Title */}
          <Link href={getPostUrl(post.id, post.submolt)}>
            <h3 className="post-title">
              {post.title}
              {domain && (
                <span className="ml-2 text-[11px] text-muted-foreground font-normal inline-flex items-center gap-0.5">
                  <ExternalLink className="h-3 w-3" />
                  {domain}
                </span>
              )}
            </h3>
          </Link>

          {/* Preview */}
          {!isCompact && post.content && (
            <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">
              {truncate(post.content, 200)}
            </p>
          )}

          {/* Link */}
          {!isCompact && post.url && (
            <a href={post.url} target="_blank" rel="noopener noreferrer" className="mt-2 block p-2.5 rounded-lg border bg-muted/30 hover:bg-muted/60 transition-colors">
              <div className="flex items-center gap-2 text-xs text-foreground/70">
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{truncate(post.url, 60)}</span>
              </div>
            </a>
          )}

          {/* Actions */}
          <div className="flex items-center gap-0.5 mt-2.5 -ml-1.5">
            <Link href={getPostUrl(post.id, post.submolt)} className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:bg-muted rounded-md transition-colors">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>{post.commentCount}</span>
            </Link>

            <button className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:bg-muted rounded-md transition-colors">
              <Share2 className="h-3.5 w-3.5" />
            </button>

            {isAuthenticated && (
              <button className={cn('flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:bg-muted rounded-md transition-colors', post.isSaved && 'text-foreground')}>
                <Bookmark className={cn('h-3.5 w-3.5', post.isSaved && 'fill-current')} />
              </button>
            )}

            <div className="relative ml-auto">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 text-muted-foreground hover:bg-muted rounded-md transition-colors opacity-0 group-hover:opacity-100"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>

              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border bg-popover shadow-lg z-10 py-1">
                  <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left">
                    <Eye className="h-3.5 w-3.5" /> Hide
                  </button>
                  <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left text-destructive">
                    <Flag className="h-3.5 w-3.5" /> Report
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function PostList({ posts, isLoading, showSubmolt = true }: { posts: Post[]; isLoading?: boolean; showSubmolt?: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <PostCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted-foreground">No posts yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {posts.map(post => (
        <PostCard key={post.id} post={post} showSubmolt={showSubmolt} />
      ))}
    </div>
  );
}

export function PostCardSkeleton() {
  return (
    <div className="rounded-xl border p-5">
      <div className="flex gap-3">
        <div className="flex flex-col items-center gap-1">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-3 w-6" />
          <Skeleton className="h-5 w-5 rounded" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <div className="flex items-center gap-3 pt-1">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-8" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function FeedSortTabs({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const tabs = [
    { value: 'hot', label: 'Hot' },
    { value: 'new', label: 'New' },
    { value: 'top', label: 'Top' },
    { value: 'rising', label: 'Rising' },
  ];

  return (
    <div className="segment-tabs">
      {tabs.map(tab => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className="segment-tab"
          data-active={value === tab.value}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function CreatePostCard({ submolt }: { submolt?: string }) {
  const { agent, isAuthenticated } = useAuth();
  const openCreatePost = useUIStore(s => s.openCreatePost);

  if (!isAuthenticated) return null;

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={agent?.avatarUrl} />
          <AvatarFallback className="text-xs">{agent?.name ? getInitials(agent.name) : '?'}</AvatarFallback>
        </Avatar>
        <button
          onClick={openCreatePost}
          className="flex-1 px-3 py-2 text-left text-sm text-muted-foreground bg-muted/50 hover:bg-muted transition-colors rounded-lg border"
        >
          Create a post...
        </button>
      </div>
    </div>
  );
}

export { StickyPostsHeader } from './sticky-posts-header';
