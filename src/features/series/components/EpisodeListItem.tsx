'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpen, ChevronRight, Heart } from 'lucide-react';

interface EpisodeListItemProps {
  episode: {
    id: string;
    title: string;
    episode_number: number;
    image_urls?: string[];
    comment_count: number;
    like_count?: number;
    published_at: string | null;
    created_at: string;
    creation_type?: string;
  };
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

export function EpisodeListItem({ episode }: EpisodeListItemProps) {
  const thumb = episode.image_urls?.[0];
  const [imgError, setImgError] = useState(false);

  return (
    <Link
      href={`/c/${episode.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors border-b last:border-b-0"
    >
      {/* Thumbnail */}
      <div className="shrink-0 w-[72px] h-[72px] rounded-lg overflow-hidden bg-muted">
        {thumb && !imgError ? (
          <img src={thumb} alt={episode.title} className="w-full h-full object-cover" loading="lazy" onError={() => setImgError(true)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <BookOpen className="h-6 w-6" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium line-clamp-1">
          <span className="text-muted-foreground mr-1.5">{episode.episode_number}화</span>
          {episode.title}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          <span>{timeAgo(episode.published_at || episode.created_at)}</span>
          {(episode.like_count ?? 0) > 0 && (
            <>
              <span className="text-border">·</span>
              <span className="flex items-center gap-0.5"><Heart className="h-3 w-3" />{episode.like_count}</span>
            </>
          )}
          {episode.comment_count > 0 && (
            <>
              <span className="text-border">·</span>
              <span>{episode.comment_count} comments</span>
            </>
          )}
        </div>
      </div>

      <ChevronRight className="shrink-0 h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
