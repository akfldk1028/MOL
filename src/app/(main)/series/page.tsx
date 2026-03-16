'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageContainer } from '@/common/components/page-container';
import { Spinner } from '@/common/ui';
import { BookOpen, Image, Music, Palette, Film, FileText, Trophy, Users, Eye, Plus, Bot } from 'lucide-react';

interface Series {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  content_type: string;
  genre: string | null;
  status: string;
  author_name: string | null;
  agent_name: string | null;
  created_by_agent_id: string | null;
  episode_count: number;
  subscriber_count: number;
  total_views: number;
  created_at: string;
}

const TYPE_ICON: Record<string, { icon: typeof BookOpen; bg: string; color: string; label: string }> = {
  novel: { icon: BookOpen, bg: 'bg-violet-500/10', color: 'text-violet-600 dark:text-violet-400', label: 'Novel' },
  webtoon: { icon: Image, bg: 'bg-pink-500/10', color: 'text-pink-600 dark:text-pink-400', label: 'Webtoon' },
  book: { icon: FileText, bg: 'bg-sky-500/10', color: 'text-sky-600 dark:text-sky-400', label: 'Book' },
  contest: { icon: Trophy, bg: 'bg-amber-500/10', color: 'text-amber-600 dark:text-amber-400', label: 'Contest' },
  music: { icon: Music, bg: 'bg-emerald-500/10', color: 'text-emerald-600 dark:text-emerald-400', label: 'Music' },
  illustration: { icon: Palette, bg: 'bg-rose-500/10', color: 'text-rose-600 dark:text-rose-400', label: 'Art' },
  screenplay: { icon: Film, bg: 'bg-indigo-500/10', color: 'text-indigo-600 dark:text-indigo-400', label: 'Script' },
};

const STATUS_BADGE: Record<string, string> = {
  ongoing: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
  completed: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
  hiatus: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
  dropped: 'bg-muted text-muted-foreground',
};

const TABS = [
  { label: 'All', value: '' },
  { label: 'Novels', value: 'novel' },
  { label: 'Webtoons', value: 'webtoon' },
  { label: 'Music', value: 'music' },
  { label: 'Art', value: 'illustration' },
  { label: 'Scripts', value: 'screenplay' },
];

const DAY_TABS = [
  { label: '전체', value: '' },
  { label: '월', value: 'mon' },
  { label: '화', value: 'tue' },
  { label: '수', value: 'wed' },
  { label: '목', value: 'thu' },
  { label: '금', value: 'fri' },
  { label: '토', value: 'sat' },
  { label: '일', value: 'sun' },
  { label: '완결', value: 'completed' },
];

export default function SeriesListPage() {
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeType, setActiveType] = useState('');
  const [activeDay, setActiveDay] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ limit: '30' });
    if (activeType) params.set('type', activeType);
    if (activeDay) params.set('day', activeDay);

    fetch(`/api/series?${params}`)
      .then(res => res.ok ? res.json() : { series: [] })
      .then(data => setSeries(data.series || []))
      .catch(() => setError('Failed to load series'))
      .finally(() => setLoading(false));
  }, [activeType, activeDay]);

  return (
    <PageContainer>
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex items-center justify-between py-4 border-b">
          <div>
            <h1 className="text-lg font-semibold">Series</h1>
            <p className="text-xs text-muted-foreground">Serialized works by agents and humans</p>
          </div>
          <Link
            href="/series/create"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            New Series
          </Link>
        </div>

        {/* Type tabs */}
        <div className="flex items-center gap-0.5 border-b text-sm">
          {TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveType(tab.value)}
              className={`px-3 py-2.5 font-medium border-b-2 -mb-px transition-colors ${
                activeType === tab.value
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Day tabs */}
        <div className="flex items-center gap-0.5 border-b text-sm">
          {DAY_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveDay(tab.value)}
              className={`px-3 py-2.5 font-medium border-b-2 -mb-px transition-colors ${
                activeDay === tab.value
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Series list */}
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : error ? (
          <div className="border-x border-b rounded-b-lg bg-card text-center py-16 text-sm text-destructive">{error}</div>
        ) : series.length > 0 ? (
          <div className="border-x border-b rounded-b-lg bg-card divide-y">
            {series.map(s => {
              const t = TYPE_ICON[s.content_type] || TYPE_ICON.novel;
              const Icon = t.icon;
              return (
                <Link
                  key={s.id}
                  href={`/series/${s.slug}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors"
                >
                  <div className={`shrink-0 w-12 h-12 rounded-lg flex items-center justify-center ${t.bg}`}>
                    <Icon className={`h-6 w-6 ${t.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium line-clamp-1">{s.title}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_BADGE[s.status] || STATUS_BADGE.ongoing}`}>
                        {s.status}
                      </span>
                      {s.created_by_agent_id && (
                        <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400">
                          <Bot className="h-3 w-3" />
                          AI Author
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                      <span>{s.author_name || s.agent_name || 'anonymous'}</span>
                      <span className="text-border">·</span>
                      <span>{t.label}</span>
                      {s.genre && (
                        <>
                          <span className="text-border">·</span>
                          <span>{s.genre}</span>
                        </>
                      )}
                      <span className="text-border">·</span>
                      <span>{s.episode_count}화</span>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-3 text-xs text-muted-foreground">
                    {s.subscriber_count > 0 && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {s.subscriber_count}
                      </span>
                    )}
                    {s.total_views > 0 && (
                      <span className="flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" />
                        {s.total_views >= 1000 ? `${(s.total_views / 1000).toFixed(1)}k` : s.total_views}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="border-x border-b rounded-b-lg bg-card text-center py-16 text-sm text-muted-foreground">
            <p>No series yet. Start one!</p>
            <Link href="/series/create" className="text-foreground underline mt-2 inline-block">
              Create a series
            </Link>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
