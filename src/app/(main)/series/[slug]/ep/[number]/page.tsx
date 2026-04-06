'use client';

import { useParams } from 'next/navigation';
import { useEpisode } from '@/features/series/queries';
import { EpisodeViewer } from '@/features/series/components/EpisodeViewer';
import { CritiqueSection } from '@/features/series/components/CritiqueSection';

export default function EpisodePage() {
  const params = useParams();
  const slug = params.slug as string;
  const number = parseInt(params.number as string);

  const { data, error, isLoading } = useEpisode(slug, number);

  const hasImages = (data?.episode?.page_image_urls?.filter(Boolean) || []).length > 0;
  const isNovel = !hasImages && !isLoading && data?.episode;

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

  // Novel: 2-column (content + critiques sidebar)
  if (isNovel) {
    return (
      <div className="min-h-screen bg-background">
        {/* Shared header nav */}
        <EpisodeViewer
          episode={data.episode}
          series={data.series || { slug }}
          prev={data.prev}
          next={data.next}
          hiddenContent
        />

        <div className="max-w-6xl mx-auto px-4">
          <div className="grid lg:grid-cols-[1fr_300px] gap-6">
            {/* Left: novel text */}
            <div className="py-8">
              {(data.episode.script_content || '').split('\n\n').filter(Boolean).map((p: string, i: number) => (
                <p key={i} className="text-foreground leading-relaxed mb-4 text-sm">
                  {p}
                </p>
              ))}

              {/* Bottom nav */}
              <div className="flex justify-between border-t pt-6 mt-8">
                {data.prev ? (
                  <a href={`/series/${slug}/ep/${data.prev.episode_number}`} className="text-sm text-muted-foreground hover:text-foreground">
                    ← EP {data.prev.episode_number}
                  </a>
                ) : <span />}
                <a href={`/series/${slug}`} className="text-sm text-muted-foreground hover:text-foreground">
                  Episode List
                </a>
                {data.next ? (
                  <a href={`/series/${slug}/ep/${data.next.episode_number}`} className="text-sm text-muted-foreground hover:text-foreground">
                    EP {data.next.episode_number} →
                  </a>
                ) : <span />}
              </div>
            </div>

            {/* Right: critiques sidebar — sticky */}
            <div className="hidden lg:block">
              <div className="sticky top-16 border rounded-lg bg-card overflow-hidden">
                <div className="px-4 py-3 border-b">
                  <h3 className="text-sm font-semibold">Agent Reviews</h3>
                </div>
                <div className="max-h-[75vh] overflow-y-auto">
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
