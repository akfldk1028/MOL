'use client';

import Link from 'next/link';
import { BookOpen, Bot, MessageCircle } from 'lucide-react';
import type { Creation } from '@/types';

const GENRE_COLORS: Record<string, { bg: string; text: string }> = {
  fantasy: { bg: 'from-violet-600 to-indigo-700', text: 'text-violet-100' },
  romance: { bg: 'from-rose-500 to-pink-600', text: 'text-rose-100' },
  thriller: { bg: 'from-gray-700 to-gray-900', text: 'text-gray-100' },
  mystery: { bg: 'from-amber-700 to-yellow-900', text: 'text-amber-100' },
  scifi: { bg: 'from-cyan-600 to-blue-700', text: 'text-cyan-100' },
  horror: { bg: 'from-red-800 to-gray-900', text: 'text-red-100' },
  literary: { bg: 'from-emerald-600 to-teal-700', text: 'text-emerald-100' },
  default: { bg: 'from-slate-600 to-slate-800', text: 'text-slate-100' },
};

function getGenreStyle(genre?: string) {
  if (!genre) return GENRE_COLORS.default;
  const key = genre.toLowerCase().replace(/[^a-z]/g, '');
  return GENRE_COLORS[key] || GENRE_COLORS.default;
}

function formatWordCount(count: number) {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return `${count}`;
}

export function NovelGrid({ creations }: { creations: Creation[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-3">
      {creations.map((creation) => {
        const c = creation as any;
        const imageUrls = c.image_urls || creation.imageUrls || [];
        const cover = imageUrls[0];
        const authorName = c.created_by_name || creation.createdByName || 'anonymous';
        const wordCount = c.word_count ?? creation.wordCount ?? 0;
        const agentCount = c.agent_count ?? creation.agentCount ?? 0;
        const genreStyle = getGenreStyle(creation.genre);

        return (
          <Link
            key={creation.id}
            href={`/c/${creation.id}`}
            className="group rounded-lg border bg-card overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-foreground/10"
          >
            {/* Book cover */}
            <div className="aspect-[3/4] relative overflow-hidden">
              {cover ? (
                <img
                  src={cover}
                  alt={creation.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className={`w-full h-full bg-gradient-to-br ${genreStyle.bg} flex flex-col items-center justify-center p-3 transition-transform duration-300 group-hover:scale-105`}>
                  <BookOpen className={`h-8 w-8 ${genreStyle.text} opacity-40 mb-2`} />
                  <p className={`text-xs font-semibold ${genreStyle.text} text-center line-clamp-3 leading-snug`}>
                    {creation.title}
                  </p>
                  <p className={`text-[10px] ${genreStyle.text} opacity-70 mt-1.5`}>
                    {authorName}
                  </p>
                </div>
              )}
              {/* Genre tag */}
              {creation.genre && (
                <span className="absolute top-2 left-2 px-1.5 py-0.5 text-[10px] font-medium rounded bg-black/60 text-white backdrop-blur-sm">
                  {creation.genre}
                </span>
              )}
              {/* Agent overlay */}
              {agentCount > 0 && (
                <span className="absolute bottom-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-black/60 text-white backdrop-blur-sm">
                  <Bot className="h-3 w-3" />
                  {agentCount}
                </span>
              )}
            </div>

            {/* Info */}
            <div className="p-2.5">
              <h3 className="text-xs font-medium line-clamp-1 group-hover:text-foreground">
                {creation.title}
              </h3>
              <div className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground">
                <span className="truncate">{authorName}</span>
                {wordCount > 0 && (
                  <>
                    <span className="text-border">·</span>
                    <span className="shrink-0">{formatWordCount(wordCount)}</span>
                  </>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
