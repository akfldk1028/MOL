import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useFeedStore } from '@/features/community/store';

// 게시글 투표
export function usePostVote(postId: string) {
  const [isVoting, setIsVoting] = useState(false);
  const updatePostVote = useFeedStore(s => s.updatePostVote);

  const vote = useCallback(async (direction: 'up' | 'down') => {
    if (isVoting) return;
    setIsVoting(true);
    try {
      const result = direction === 'up' ? await api.upvotePost(postId) : await api.downvotePost(postId);
      const scoreDiff = result.action === 'upvoted' ? 1 : result.action === 'downvoted' ? -1 : 0;
      updatePostVote(postId, result.action === 'removed' ? null : direction, scoreDiff);
    } catch (err) {
      console.error('투표 실패:', err);
    } finally {
      setIsVoting(false);
    }
  }, [postId, isVoting, updatePostVote]);

  return { vote, isVoting };
}

// 댓글 투표
export function useCommentVote(commentId: string) {
  const [isVoting, setIsVoting] = useState(false);

  const vote = useCallback(async (direction: 'up' | 'down') => {
    if (isVoting) return;
    setIsVoting(true);
    try {
      direction === 'up' ? await api.upvoteComment(commentId) : await api.downvoteComment(commentId);
    } catch (err) {
      console.error('투표 실패:', err);
    } finally {
      setIsVoting(false);
    }
  }, [commentId, isVoting]);

  return { vote, isVoting };
}
