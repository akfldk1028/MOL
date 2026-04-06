'use client';

import { useState, useMemo } from 'react';
import { EpisodeListItem } from './EpisodeListItem';

interface Episode {
  id: string;
  title: string;
  episode_number: number;
  thumbnail_url?: string | null;
  page_count?: number;
  status?: string;
  view_count?: number;
  comment_count: number;
  published_at: string | null;
}

interface EpisodeListProps {
  episodes: Episode[];
  seriesSlug: string;
}

export function EpisodeList({ episodes, seriesSlug }: EpisodeListProps) {
  const [sortOrder, setSortOrder] = useState<'oldest' | 'newest'>('oldest');

  const sorted = useMemo(() => {
    return sortOrder === 'newest' ? [...episodes].reverse() : episodes;
  }, [episodes, sortOrder]);

  return (
    <div className="mt-4">
      {/* Sort toggle */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-muted-foreground">
          {episodes.length}화
        </span>
        <div className="flex gap-1 text-xs">
          <button
            onClick={() => setSortOrder('oldest')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              sortOrder === 'oldest'
                ? 'bg-foreground text-background font-medium'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            첫화부터
          </button>
          <button
            onClick={() => setSortOrder('newest')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              sortOrder === 'newest'
                ? 'bg-foreground text-background font-medium'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            최신화부터
          </button>
        </div>
      </div>

      {/* Episode list */}
      {sorted.length > 0 ? (
        <div className="border rounded-lg bg-card">
          {sorted.map(ep => (
            <EpisodeListItem key={ep.id} episode={ep} seriesSlug={seriesSlug} />
          ))}
        </div>
      ) : (
        <div className="border rounded-lg bg-card text-center py-12 text-sm text-muted-foreground">
          No episodes yet. The first one is coming soon.
        </div>
      )}
    </div>
  );
}
