'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEpisode } from '@/features/series/queries';
import { EpisodeViewer } from '@/features/series/components/EpisodeViewer';
import { CritiqueSection } from '@/features/series/components/CritiqueSection';

export default function EpisodePage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const number = parseInt(params.number as string);

  const { data, error, isLoading } = useEpisode(slug, number);

  const hasImages = (data?.episode?.page_image_urls?.filter(Boolean) || []).length > 0;
  const isNovel = !hasImages && !isLoading && data?.episode;

  // Keyboard arrow navigation for novel mode
  useEffect(() => {
    if (!isNovel) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && data?.prev) {
        router.push(`/series/${slug}/ep/${data.prev.episode_number}`);
      } else if (e.key === 'ArrowRight' && data?.next) {
        router.push(`/series/${slug}/ep/${data.next.episode_number}`);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router, slug, data?.prev, data?.next, isNovel]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !data?.episode) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-400">Episode not found</div>
      </div>
    );
  }

  // Novel: compact header + 2-column (content + critiques sidebar)
  if (isNovel) {
    return (
      <div className="min-h-screen bg-background">
        {/* Compact inline header — not sticky, flows with content */}
        <div className="max-w-6xl mx-auto px-4 pt-4 pb-2">
          <div className="flex items-center justify-between text-sm">
            <Link
              href={data.prev ? `/series/${slug}/ep/${data.prev.episode_number}` : '#'}
              className={data.prev ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/30 pointer-events-none'}
            >
              ← Prev
            </Link>
            <Link href={`/series/${slug}`} className="text-muted-foreground hover:text-foreground">
              {slug.replace(/-/g, ' ')}
            </Link>
            <Link
              href={data.next ? `/series/${slug}/ep/${data.next.episode_number}` : '#'}
              className={data.next ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/30 pointer-events-none'}
            >
              Next →
            </Link>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4">
          <div className="grid lg:grid-cols-[1fr_300px] gap-6">
            {/* Left: novel text */}
            <div className="pt-2 pb-8">
              {/* Episode title */}
              <div className="mb-6 border-b pb-4">
                <div className="text-xs text-muted-foreground mb-1">EP {data.episode.episode_number}</div>
                <h1 className="text-lg font-semibold">{data.episode.title}</h1>
              </div>

              {(data.episode.script_content || '').split('\n\n').filter(Boolean).map((p: string, i: number) => (
                <p key={i} className="text-foreground leading-relaxed mb-4 text-sm">
                  {p}
                </p>
              ))}

              {/* Bottom nav */}
              <div className="flex justify-between border-t pt-6 mt-8">
                {data.prev ? (
                  <Link href={`/series/${slug}/ep/${data.prev.episode_number}`} className="text-sm text-muted-foreground hover:text-foreground">
                    ← EP {data.prev.episode_number}
                  </Link>
                ) : <span />}
                <Link href={`/series/${slug}`} className="text-sm text-muted-foreground hover:text-foreground">
                  Episode List
                </Link>
                {data.next ? (
                  <Link href={`/series/${slug}/ep/${data.next.episode_number}`} className="text-sm text-muted-foreground hover:text-foreground">
                    EP {data.next.episode_number} →
                  </Link>
                ) : <span />}
              </div>
            </div>

            {/* Right: critiques sidebar — sticky */}
            <div className="hidden lg:block">
              <div className="sticky top-4 border rounded-lg bg-card overflow-hidden">
                <div className="px-4 py-3 border-b">
                  <h3 className="text-sm font-semibold">Agent Reviews</h3>
                </div>
                <div className="max-h-[80vh] overflow-y-auto">
                  <CritiqueSection seriesSlug={slug} episodeNumber={number} inline />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile: collapsible critiques */}
        <div className="lg:hidden">
          <CritiqueSection seriesSlug={slug} episodeNumber={number} />
        </div>
      </div>
    );
  }

  // Webtoon: single column, critiques below
  return (
    <>
      <EpisodeViewer
        episode={data.episode}
        series={data.series || { slug }}
        prev={data.prev}
        next={data.next}
      />
      <CritiqueSection seriesSlug={slug} episodeNumber={number} />
    </>
  );
}
