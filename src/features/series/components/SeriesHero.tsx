'use client';

import { useState } from 'react';
import { BookOpen, Image, Music, Palette, Film, FileText, Trophy, Users, Eye, Bell, BellOff, Bot, Clock, ChevronDown, ChevronUp } from 'lucide-react';

const TYPE_ICON: Record<string, { icon: typeof BookOpen; bg: string; color: string; gradient: string; label: string }> = {
  novel: { icon: BookOpen, bg: 'bg-violet-500/10', color: 'text-violet-600 dark:text-violet-400', gradient: 'from-violet-600 to-purple-700', label: 'Novel' },
  webtoon: { icon: Image, bg: 'bg-pink-500/10', color: 'text-pink-600 dark:text-pink-400', gradient: 'from-pink-600 to-rose-700', label: 'Webtoon' },
  book: { icon: FileText, bg: 'bg-sky-500/10', color: 'text-sky-600 dark:text-sky-400', gradient: 'from-sky-600 to-blue-700', label: 'Book' },
  contest: { icon: Trophy, bg: 'bg-amber-500/10', color: 'text-amber-600 dark:text-amber-400', gradient: 'from-amber-600 to-orange-700', label: 'Contest' },
  music: { icon: Music, bg: 'bg-emerald-500/10', color: 'text-emerald-600 dark:text-emerald-400', gradient: 'from-emerald-600 to-teal-700', label: 'Music' },
  illustration: { icon: Palette, bg: 'bg-rose-500/10', color: 'text-rose-600 dark:text-rose-400', gradient: 'from-rose-600 to-red-700', label: 'Art' },
  screenplay: { icon: Film, bg: 'bg-indigo-500/10', color: 'text-indigo-600 dark:text-indigo-400', gradient: 'from-indigo-600 to-blue-700', label: 'Script' },
};

const STATUS_BADGE: Record<string, string> = {
  ongoing: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
  completed: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
  hiatus: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
  dropped: 'bg-muted text-muted-foreground',
};

interface SeriesHeroProps {
  series: {
    title: string;
    description: string | null;
    synopsis?: string | null;
    content_type: string;
    genre: string | null;
    status: string;
    author_name: string | null;
    agent_name: string | null;
    is_autonomous: boolean;
    episode_count: number;
    subscriber_count: number;
    total_views: number;
    schedule_days: string[];
    next_episode_at: string | null;
    cover_image_url?: string | null;
  };
  subscribed: boolean;
  subscribing: boolean;
  onToggleSubscribe: () => void;
}

function timeUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return 'soon';
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return `${Math.floor(diff / 60000)}m`;
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function SeriesHero({ series, subscribed, subscribing, onToggleSubscribe }: SeriesHeroProps) {
  const [descExpanded, setDescExpanded] = useState(false);
  const t = TYPE_ICON[series.content_type] || TYPE_ICON.novel;
  const Icon = t.icon;
  const descText = series.synopsis || series.description;

  return (
    <div className="border-b pb-6">
      {/* Cover / Gradient header */}
      <div className="relative -mx-4 h-40 overflow-hidden rounded-t-lg">
        {series.cover_image_url ? (
          <img src={series.cover_image_url} alt={series.title} className="w-full h-full object-cover" />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${t.gradient} flex items-center justify-center`}>
            <Icon className="h-16 w-16 text-white/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      </div>

      {/* Title + meta overlay */}
      <div className="relative -mt-12 px-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h1 className="text-2xl font-bold">{series.title}</h1>
          <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${STATUS_BADGE[series.status] || STATUS_BADGE.ongoing}`}>
            {series.status}
          </span>
          {series.is_autonomous && (
            <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400">
              <Bot className="h-3 w-3" />
              AI Author
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{series.author_name || series.agent_name || 'anonymous'}</span>
          <span className="text-border">·</span>
          <span className={`${t.color}`}>{t.label}</span>
          {series.genre && (
            <>
              <span className="text-border">·</span>
              <span className="px-1.5 py-0.5 rounded bg-muted text-xs">{series.genre}</span>
            </>
          )}
        </div>

        {/* Description with expand toggle */}
        {descText && (
          <div className="mt-3">
            <p className={`text-sm text-muted-foreground ${descExpanded ? '' : 'line-clamp-3'}`}>
              {descText}
            </p>
            {descText.split('\n').length > 3 || descText.length > 200 ? (
              <button
                onClick={() => setDescExpanded(!descExpanded)}
                className="text-xs text-primary mt-1 flex items-center gap-0.5"
              >
                {descExpanded ? <><ChevronUp className="h-3 w-3" /> 접기</> : <><ChevronDown className="h-3 w-3" /> 더보기</>}
              </button>
            ) : null}
          </div>
        )}

        {/* Stats bar */}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span>{series.episode_count}화</span>
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {series.subscriber_count.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" />
            {series.total_views.toLocaleString()}
          </span>
          {series.schedule_days?.length > 0 && (
            <span>Every {series.schedule_days.join(', ')}</span>
          )}
          {series.is_autonomous && series.next_episode_at && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Next in {timeUntil(series.next_episode_at)}
            </span>
          )}
        </div>

        {/* Subscribe button */}
        <button
          onClick={onToggleSubscribe}
          disabled={subscribing}
          className={`mt-4 flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
            subscribed
              ? 'bg-muted text-muted-foreground hover:bg-muted/80'
              : 'bg-foreground text-background hover:opacity-90'
          }`}
        >
          {subscribed ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          {subscribed ? 'Subscribed' : 'Subscribe'}
        </button>
      </div>
    </div>
  );
}
