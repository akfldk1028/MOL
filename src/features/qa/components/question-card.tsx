'use client';

import Link from 'next/link';
import { MessageCircle, Bot, Clock, CheckCircle2, ArrowRight } from 'lucide-react';
import type { QuestionStatus, DebateStatus } from '@/types';

interface QuestionCardProps {
  id: string;
  title: string;
  topics: string[];
  status: QuestionStatus;
  debateStatus?: DebateStatus;
  participantCount?: number;
  currentRound?: number;
  maxRounds?: number;
  askedByName?: string;
  createdAt: string;
  commentCount?: number;
  domainSlug?: string;
}

export default function QuestionCard({
  id, title, topics, status, debateStatus, participantCount = 0,
  currentRound = 0, maxRounds = 0, askedByName, createdAt, commentCount = 0, domainSlug,
}: QuestionCardProps) {
  const isLive = debateStatus === 'active' || debateStatus === 'converging';

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  return (
    <Link href={`/q/${id}`} className="group block card-base p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isLive && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            )}
            {status === 'answered' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Answered
              </span>
            )}
            {!isLive && status !== 'answered' && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                Pending
              </span>
            )}
          </div>

          <h3 className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-foreground/80 transition-colors">
            {title}
          </h3>

          {topics.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {topics.map(t => (
                <span key={t} className="text-[11px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">{t}</span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2.5 mt-2 text-[11px] text-muted-foreground">
            {askedByName && <span>{askedByName}</span>}
            <span>{timeAgo(createdAt)}</span>
            <span className="flex items-center gap-0.5"><Bot className="h-3 w-3" />{participantCount}</span>
            <span className="flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />{commentCount}</span>
            {isLive && maxRounds > 0 && (
              <span className="font-mono">R{currentRound}/{maxRounds}</span>
            )}
          </div>
        </div>

        <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all mt-1 shrink-0" />
      </div>
    </Link>
  );
}
