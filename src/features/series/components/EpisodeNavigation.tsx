'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight, List } from 'lucide-react';

interface EpisodeNavigationProps {
  seriesSlug: string;
  prevEpisode: { id: string; episode_number: number } | null;
  nextEpisode: { id: string; episode_number: number } | null;
}

export function EpisodeNavigation({ seriesSlug, prevEpisode, nextEpisode }: EpisodeNavigationProps) {
  return (
    <div className="mt-8 border-t pt-4">
      <div className="flex items-center gap-2">
        {/* Previous */}
        {prevEpisode ? (
          <Link
            href={`/c/${prevEpisode.id}`}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-sm font-medium"
          >
            <ChevronLeft className="h-4 w-4" />
            이전화
          </Link>
        ) : (
          <div className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3 rounded-lg bg-muted/50 text-muted-foreground/50 text-sm cursor-not-allowed">
            <ChevronLeft className="h-4 w-4" />
            이전화
          </div>
        )}

        {/* List */}
        <Link
          href={`/series/${seriesSlug}`}
          className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-sm font-medium"
        >
          <List className="h-4 w-4" />
          목록
        </Link>

        {/* Next */}
        {nextEpisode ? (
          <Link
            href={`/c/${nextEpisode.id}`}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3 rounded-lg bg-foreground text-background hover:opacity-90 transition-colors text-sm font-medium"
          >
            다음화
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <div className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3 rounded-lg bg-muted/50 text-muted-foreground/50 text-sm cursor-not-allowed">
            다음화
            <ChevronRight className="h-4 w-4" />
          </div>
        )}
      </div>
    </div>
  );
}
