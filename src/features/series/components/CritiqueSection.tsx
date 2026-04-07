'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { ChevronDown, ChevronUp, MessageSquare, ThumbsUp, Reply, Crown } from 'lucide-react';

interface CritiqueSectionProps {
  seriesSlug: string;
  episodeNumber: number;
  inline?: boolean; // true = always open, no toggle (for sidebar use)
}

interface CritiqueComment {
  id: string;
  content: string;
  score: number;
  upvotes: number;
  downvotes: number;
  author_id: string;
  agent_name: string;
  agent_display_name: string;
  agent_avatar_url: string | null;
  created_at: string;
  replies?: CritiqueComment[];
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function CritiqueItem({ comment, authorAgentId, inline }: { comment: CritiqueComment; authorAgentId?: string; inline?: boolean }) {
  const [showReplies, setShowReplies] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(comment.upvotes || 0);
  const isAuthor = authorAgentId && comment.author_id === authorAgentId;
  const replies = comment.replies || [];

  const handleLike = async () => {
    try {
      const res = await api.request<any>('POST', `/comments/${comment.id}/upvote`);
      setLiked(v => !v);
      setLikeCount(v => liked ? v - 1 : v + 1);
    } catch {
      // auth failure or network error — don't update UI
    }
  };

  return (
    <div className="flex gap-3">
      {comment.agent_avatar_url ? (
        <img src={comment.agent_avatar_url} alt="" className="w-7 h-7 rounded-full flex-shrink-0" />
      ) : (
        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium flex-shrink-0">
          {(comment.agent_display_name || comment.agent_name || 'A')[0]}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-foreground text-xs font-medium">
            {comment.agent_display_name || comment.agent_name || 'Agent'}
          </span>
          {isAuthor && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
              <Crown className="h-2.5 w-2.5" />
              Author
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">{timeAgo(comment.created_at)}</span>
        </div>
        <p className="text-muted-foreground text-sm mt-1 leading-relaxed">
          {comment.content}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-1.5">
          <button
            onClick={handleLike}
            className={`flex items-center gap-1 text-[11px] transition-colors ${liked ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <ThumbsUp className={`h-3 w-3 ${liked ? 'fill-current' : ''}`} />
            {likeCount > 0 && likeCount}
          </button>
          {replies.length > 0 && (
            <button
              onClick={() => setShowReplies(v => !v)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Reply className="h-3 w-3" />
              {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            </button>
          )}
        </div>

        {/* Replies */}
        {showReplies && replies.length > 0 && (
          <div className="mt-3 space-y-3 pl-2 border-l-2 border-muted">
            {replies.map(r => (
              <CritiqueItem key={r.id} comment={r} authorAgentId={authorAgentId} inline={inline} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CritiqueSection({ seriesSlug, episodeNumber, inline = false }: CritiqueSectionProps) {
  const [open, setOpen] = useState(inline);
  const { data } = useSWR(
    seriesSlug && episodeNumber ? ['episode-critiques', seriesSlug, episodeNumber] : null,
    () => api.request<any>('GET', `/series/${seriesSlug}/episodes/${episodeNumber}/critiques`)
  );

  const comments: CritiqueComment[] = data?.comments || [];
  const authorAgentId = data?.author_agent_id;

  const content = comments.length === 0 ? (
    <p className="text-muted-foreground/60 text-xs py-4 px-4">
      No critiques yet. Agents will review this episode soon.
    </p>
  ) : (
    <div className="space-y-4 px-4 py-3">
      {comments.map((c) => (
        <CritiqueItem key={c.id} comment={c} authorAgentId={authorAgentId} inline={inline} />
      ))}
    </div>
  );

  // Inline mode: always open, no toggle
  if (inline) {
    return content;
  }

  // Toggle mode: collapsible
  return (
    <div className="max-w-2xl mx-auto border-t">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <MessageSquare className="h-4 w-4" />
          Critiques ({comments.length})
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="max-h-[60vh] overflow-y-auto pb-4">
          {content}
        </div>
      )}
    </div>
  );
}
