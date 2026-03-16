'use client';

import Link from 'next/link';
import { BookOpen, Image, FileText, Trophy, Music, Palette, Film, Bot, MessageCircle } from 'lucide-react';
import type { Creation } from '@/types';

const TYPE_ICON: Record<string, { icon: typeof BookOpen; bg: string; color: string }> = {
  novel: { icon: BookOpen, bg: 'bg-violet-500/10', color: 'text-violet-600 dark:text-violet-400' },
  webtoon: { icon: Image, bg: 'bg-pink-500/10', color: 'text-pink-600 dark:text-pink-400' },
  book: { icon: FileText, bg: 'bg-sky-500/10', color: 'text-sky-600 dark:text-sky-400' },
  contest: { icon: Trophy, bg: 'bg-amber-500/10', color: 'text-amber-600 dark:text-amber-400' },
  music: { icon: Music, bg: 'bg-emerald-500/10', color: 'text-emerald-600 dark:text-emerald-400' },
  illustration: { icon: Palette, bg: 'bg-rose-500/10', color: 'text-rose-600 dark:text-rose-400' },
  screenplay: { icon: Film, bg: 'bg-indigo-500/10', color: 'text-indigo-600 dark:text-indigo-400' },
};

const STATUS_TEXT: Record<string, string> = {
  submitted: 'Pending',
  reviewing: 'Reviewing',
  critiqued: 'Done',
  published: 'Published',
  closed: 'Closed',
};

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

export default function CreationCard({ creation }: { creation: Creation }) {
  const c = creation as any;
  const type = c.creation_type || creation.creationType || 'novel';
  const { icon: Icon, bg, color } = TYPE_ICON[type] || TYPE_ICON.novel;
  const status = STATUS_TEXT[creation.status] || creation.status;
  const authorName = c.created_by_name || creation.createdByName || 'anonymous';
  const createdAt = c.created_at || creation.createdAt;
  const wordCount = c.word_count ?? creation.wordCount ?? 0;
  const agentCount = c.agent_count ?? creation.agentCount ?? 0;
  const commentCount = c.comment_count ?? creation.commentCount ?? 0;

  return (
    <Link
      href={`/c/${creation.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors border-b"
    >
      {/* Type icon — Product Hunt style square */}
      <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${bg}`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium leading-snug line-clamp-1">
          {creation.title}
        </div>
        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
          <span>{authorName}</span>
          <span className="text-border">·</span>
          <span>{createdAt ? timeAgo(createdAt) : ''}</span>
          {creation.genre && (
            <>
              <span className="text-border">·</span>
              <span>{creation.genre}</span>
            </>
          )}
          {wordCount > 0 && (
            <>
              <span className="text-border">·</span>
              <span>{wordCount >= 1000 ? `${(wordCount / 1000).toFixed(1)}k` : wordCount} words</span>
            </>
          )}
        </div>
      </div>

      {/* Right side — engagement counts */}
      <div className="shrink-0 flex items-center gap-3 text-xs text-muted-foreground">
        {agentCount > 0 && (
          <span className="flex items-center gap-1">
            <Bot className="h-3.5 w-3.5" />
            {agentCount}
          </span>
        )}
        {commentCount > 0 && (
          <span className="flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" />
            {commentCount}
          </span>
        )}
        <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
          status === 'Reviewing' ? 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400' :
          status === 'Done' || status === 'Published' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' :
          'bg-muted text-muted-foreground'
        }`}>
          {status}
        </span>
      </div>
    </Link>
  );
}
