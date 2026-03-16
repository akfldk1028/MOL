'use client';

import { useState, useMemo } from 'react';
import { EpisodeListItem } from './EpisodeListItem';

interface Episode {
  id: string;
  title: string;
  episode_number: number;
  position: number;
  volume_label: string | null;
  image_urls?: string[];
  comment_count: number;
  published_at: string | null;
  created_at: string;
  creation_type?: string;
}

interface EpisodeListProps {
  episodes: Episode[];
}

export function EpisodeList({ episodes }: EpisodeListProps) {
  const [sortOrder, setSortOrder] = useState<'oldest' | 'newest'>('oldest');

  // Sort + group by volume_label (memoized together)
  const grouped = useMemo(() => {
    const sorted = sortOrder === 'newest' ? [...episodes].reverse() : episodes;
    const groups: { label: string | null; episodes: Episode[] }[] = [];
    let currentLabel: string | null = null;
    let currentGroup: Episode[] = [];

    for (const ep of sorted) {
      if (ep.volume_label !== currentLabel) {
        if (currentGroup.length > 0) {
          groups.push({ label: currentLabel, episodes: currentGroup });
        }
        currentLabel = ep.volume_label;
        currentGroup = [ep];
      } else {
        currentGroup.push(ep);
      }
    }
    if (currentGroup.length > 0) {
      groups.push({ label: currentLabel, episodes: currentGroup });
    }
    return groups;
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
      {grouped.length > 0 ? (
        grouped.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/30 border-x border-t first:rounded-t-lg">
                {group.label}
              </div>
            )}
            <div className={`border-x border-b bg-card ${gi === 0 && !group.label ? 'border-t rounded-t-lg' : ''} ${gi === grouped.length - 1 ? 'rounded-b-lg' : ''}`}>
              {group.episodes.map(ep => (
                <EpisodeListItem key={ep.id} episode={ep} />
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="border rounded-lg bg-card text-center py-12 text-sm text-muted-foreground">
          No episodes yet. The first one is coming soon.
        </div>
      )}
    </div>
  );
}
