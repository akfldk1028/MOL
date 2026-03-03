'use client';

import Link from 'next/link';
import { BookOpen, Image, FileText, Trophy, Bot, MessageCircle, Clock } from 'lucide-react';
import type { Creation } from '@/types';

const TYPE_CONFIG: Record<string, { icon: typeof BookOpen; color: string; label: string }> = {
  novel: { icon: BookOpen, color: '#8b5cf6', label: 'Novel' },
  webtoon: { icon: Image, color: '#ec4899', label: 'Webtoon' },
  book: { icon: FileText, color: '#0ea5e9', label: 'Book Analysis' },
  contest: { icon: Trophy, color: '#f59e0b', label: 'Contest' },
};

const STATUS_CONFIG = {
  submitted: { color: 'text-yellow-500', label: 'Submitted' },
  reviewing: { color: 'text-blue-500', label: 'Reviewing' },
  critiqued: { color: 'text-green-500', label: 'Critiqued' },
  closed: { color: 'text-muted-foreground', label: 'Closed' },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function CreationCard({ creation }: { creation: Creation }) {
  const typeConfig = TYPE_CONFIG[(creation as any).creation_type || creation.creationType] || TYPE_CONFIG.novel;
  const statusConfig = STATUS_CONFIG[creation.status] || STATUS_CONFIG.submitted;
  const TypeIcon = typeConfig.icon;

  return (
    <Link
      href={`/c/${creation.id}`}
      className="block p-4 rounded-lg border hover:border-primary/50 transition-colors"
    >
      <div className="flex gap-3">
        <div className={`mt-1 ${statusConfig.color}`}>
          <TypeIcon className="h-5 w-5" style={{ color: typeConfig.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium line-clamp-2">{creation.title}</h3>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: `${typeConfig.color}15`, color: typeConfig.color }}
            >
              {typeConfig.label}
            </span>
            {creation.genre && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {creation.genre}
              </span>
            )}
            {creation.tags?.map(tag => (
              <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span>by {creation.createdByName || 'Anonymous'}</span>
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {timeAgo(creation.createdAt)}
            </span>
            {creation.wordCount > 0 && (
              <span>{creation.wordCount.toLocaleString()} words</span>
            )}
            {creation.agentCount > 0 && (
              <span className="flex items-center gap-0.5">
                <Bot className="h-3 w-3" />
                {creation.agentCount}
              </span>
            )}
            {(creation.commentCount ?? 0) > 0 && (
              <span className="flex items-center gap-0.5">
                <MessageCircle className="h-3 w-3" />
                {creation.commentCount}
              </span>
            )}
            {creation.debateStatus && creation.debateStatus !== 'completed' && (
              <span className="text-blue-500">
                Round {creation.currentRound}/{creation.maxRounds}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
