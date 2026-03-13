'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PageContainer } from '@/common/components/page-container';
import { Spinner } from '@/common/ui';
import { BookOpen, Image, Music, Palette, Film, FileText, Trophy, Users, Eye, Bell, BellOff, ChevronRight } from 'lucide-react';

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

interface SeriesDetail {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  content_type: string;
  genre: string | null;
  status: string;
  author_name: string | null;
  agent_name: string | null;
  episode_count: number;
  subscriber_count: number;
  total_views: number;
  schedule_days: string[];
  created_at: string;
}

interface Episode {
  id: string;
  title: string;
  episode_number: number;
  position: number;
  volume_label: string | null;
  view_count: number;
  comment_count: number;
  published_at: string | null;
  created_at: string;
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

export default function SeriesDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [series, setSeries] = useState<SeriesDetail | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    fetch(`/api/series/${slug}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setSeries(data.series);
          setEpisodes(data.episodes || []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  const toggleSubscribe = async () => {
    setSubscribing(true);
    try {
      const method = subscribed ? 'DELETE' : 'POST';
      const res = await fetch(`/api/series/${slug}/subscribe`, { method });
      if (res.ok) setSubscribed(!subscribed);
    } catch {}
    setSubscribing(false);
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="flex justify-center py-20"><Spinner /></div>
      </PageContainer>
    );
  }

  if (!series) {
    return (
      <PageContainer>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center text-muted-foreground">
          Series not found
        </div>
      </PageContainer>
    );
  }

  const t = TYPE_ICON[series.content_type] || TYPE_ICON.novel;
  const Icon = t.icon;

  // Group episodes by volume_label
  const grouped: { label: string | null; episodes: Episode[] }[] = [];
  let currentLabel: string | null = null;
  let currentGroup: Episode[] = [];

  for (const ep of episodes) {
    if (ep.volume_label !== currentLabel) {
      if (currentGroup.length > 0) {
        grouped.push({ label: currentLabel, episodes: currentGroup });
      }
      currentLabel = ep.volume_label;
      currentGroup = [ep];
    } else {
      currentGroup.push(ep);
    }
  }
  if (currentGroup.length > 0) {
    grouped.push({ label: currentLabel, episodes: currentGroup });
  }

  return (
    <PageContainer>
      <div className="max-w-3xl mx-auto px-4">
        {/* Header */}
        <div className="py-6 border-b">
          <div className="flex items-start gap-4">
            <div className={`shrink-0 w-16 h-16 rounded-xl flex items-center justify-center ${t.bg}`}>
              <Icon className={`h-8 w-8 ${t.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-bold">{series.title}</h1>
                <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${STATUS_BADGE[series.status] || STATUS_BADGE.ongoing}`}>
                  {series.status}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{series.author_name || series.agent_name || 'anonymous'}</span>
                <span className="text-border">·</span>
                <span>{t.label}</span>
                {series.genre && (
                  <>
                    <span className="text-border">·</span>
                    <span>{series.genre}</span>
                  </>
                )}
              </div>
              {series.description && (
                <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{series.description}</p>
              )}
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {series.subscriber_count} subscribers
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  {series.total_views} views
                </span>
                <span>{series.episode_count}화</span>
                {series.schedule_days?.length > 0 && (
                  <span>Every {series.schedule_days.join(', ')}</span>
                )}
              </div>
            </div>
          </div>

          {/* Subscribe button */}
          <button
            onClick={toggleSubscribe}
            disabled={subscribing}
            className={`mt-4 flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              subscribed
                ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                : 'bg-foreground text-background hover:opacity-90'
            }`}
          >
            {subscribed ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            {subscribed ? 'Subscribed' : 'Subscribe'}
          </button>
        </div>

        {/* Episode list */}
        <div className="mt-4">
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
                    <Link
                      key={ep.id}
                      href={`/c/${ep.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors border-b last:border-b-0"
                    >
                      <span className="shrink-0 w-8 text-center text-sm font-medium text-muted-foreground">
                        {ep.episode_number}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium line-clamp-1">{ep.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {timeAgo(ep.published_at || ep.created_at)}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-2 text-xs text-muted-foreground">
                        {ep.view_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" /> {ep.view_count}
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </Link>
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
      </div>
    </PageContainer>
  );
}
