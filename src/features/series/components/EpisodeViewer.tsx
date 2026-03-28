'use client';

import Link from 'next/link';

interface EpisodeViewerProps {
  episode: {
    title: string;
    episode_number: number;
    page_image_urls: string[];
    script_content?: string;
  };
  series: { slug: string };
  prev?: { episode_number: number; title: string } | null;
  next?: { episode_number: number; title: string } | null;
}

export function EpisodeViewer({ episode, series, prev, next }: EpisodeViewerProps) {
  const pages = episode.page_image_urls?.filter(Boolean) || [];
  const hasImages = pages.length > 0;

  return (
    <div className="bg-black min-h-screen">
      {/* Header nav */}
      <div className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur px-4 py-3 flex items-center justify-between text-white">
        <Link
          href={prev ? `/series/${series.slug}/ep/${prev.episode_number}` : '#'}
          className={`text-sm ${prev ? 'text-zinc-300 hover:text-white' : 'text-zinc-600 pointer-events-none'}`}
        >
          ← Prev
        </Link>
        <div className="text-center">
          <div className="text-xs text-zinc-500">EP {episode.episode_number}</div>
          <div className="text-sm font-medium truncate max-w-[200px]">{episode.title}</div>
        </div>
        <Link
          href={next ? `/series/${series.slug}/ep/${next.episode_number}` : '#'}
          className={`text-sm ${next ? 'text-zinc-300 hover:text-white' : 'text-zinc-600 pointer-events-none'}`}
        >
          Next →
        </Link>
      </div>

      {/* Page images — vertical scroll, no gap */}
      {hasImages ? (
        <div className="max-w-2xl mx-auto">
          {pages.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`Page ${i + 1}`}
              className="w-full block"
              loading={i < 2 ? 'eager' : 'lazy'}
            />
          ))}
        </div>
      ) : (
        <div className="max-w-2xl mx-auto px-6 py-8">
          {(episode.script_content || '').split('\n\n').filter(Boolean).map((p, i) => (
            <p key={i} className="text-zinc-200 leading-relaxed mb-4 text-sm">
              {p}
            </p>
          ))}
        </div>
      )}

      {/* Bottom nav */}
      <div className="max-w-2xl mx-auto px-4 py-6 flex justify-between border-t border-zinc-800">
        {prev ? (
          <Link href={`/series/${series.slug}/ep/${prev.episode_number}`} className="text-zinc-400 hover:text-white text-sm">
            ← EP {prev.episode_number}
          </Link>
        ) : <span />}
        <Link href={`/series/${series.slug}`} className="text-zinc-500 hover:text-white text-sm">
          Episode List
        </Link>
        {next ? (
          <Link href={`/series/${series.slug}/ep/${next.episode_number}`} className="text-zinc-400 hover:text-white text-sm">
            EP {next.episode_number} →
          </Link>
        ) : <span />}
      </div>
    </div>
  );
}