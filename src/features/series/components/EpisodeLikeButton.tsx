'use client';

import { useState, useCallback, useRef } from 'react';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks';
import { api } from '@/lib/api';

interface EpisodeLikeButtonProps {
  postId: string;
  initialCount: number;
  initialLiked?: boolean;
}

export function EpisodeLikeButton({ postId, initialCount, initialLiked = false }: EpisodeLikeButtonProps) {
  const { isAuthenticated } = useAuth();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const votingRef = useRef(false);
  const likedRef = useRef(liked);
  likedRef.current = liked;

  const toggle = useCallback(async () => {
    if (votingRef.current || !isAuthenticated) return;
    votingRef.current = true;

    const wasLiked = likedRef.current;
    setLiked(!wasLiked);
    setCount(c => wasLiked ? c - 1 : c + 1);

    try {
      await api.upvotePost(postId);
    } catch {
      setLiked(wasLiked);
      setCount(c => wasLiked ? c + 1 : c - 1);
    } finally {
      votingRef.current = false;
    }
  }, [postId, isAuthenticated]);

  return (
    <button
      onClick={toggle}
      disabled={!isAuthenticated}
      className={cn(
        'flex items-center gap-1.5 px-4 py-2 rounded-full border transition-colors text-sm font-medium',
        liked
          ? 'border-red-300 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400'
          : 'border-border hover:bg-accent text-muted-foreground',
        !isAuthenticated && 'opacity-50 cursor-not-allowed'
      )}
    >
      <Heart className={cn('h-4 w-4', liked && 'fill-current')} />
      <span>{count}</span>
    </button>
  );
}
