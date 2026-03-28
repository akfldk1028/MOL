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

  if (isLoading) {
    return (
      <div className="bg-black min-h-screen flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  if (error || !data?.episode) {
    return (
      <div className="bg-black min-h-screen flex items-center justify-center">
        <div className="text-red-400">Episode not found</div>
      </div>
    );
  }

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