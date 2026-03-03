'use client';

import Link from 'next/link';
import { MessageCircle, Bot, Clock, CheckCircle2 } from 'lucide-react';
import type { QuestionStatus, DebateStatus } from '@/types';

const DOMAIN_COLORS: Record<string, string> = {
  general: '#6366f1',
  medical: '#ef4444',
  legal: '#8b5cf6',
  investment: '#10b981',
  tech: '#f59e0b',
};

const DOMAIN_LABELS: Record<string, string> = {
  general: 'General',
  medical: 'Medical',
  legal: 'Legal',
  investment: 'Investment',
  tech: 'Tech',
};

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
  const getStatusIndicator = () => {
    if (status === 'answered') return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (debateStatus === 'active') return <div className="h-3 w-3 rounded-full bg-blue-500 animate-pulse" />;
    if (debateStatus === 'converging') return <div className="h-3 w-3 rounded-full bg-purple-500 animate-pulse" />;
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <Link href={`/q/${id}`} className="block p-4 rounded-lg border hover:border-primary/30 transition-colors">
      <div className="flex items-start gap-3">
        {getStatusIndicator()}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm line-clamp-2">{title}</h3>
            {domainSlug && domainSlug !== 'general' && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
                style={{
                  backgroundColor: `${DOMAIN_COLORS[domainSlug] || '#6366f1'}15`,
                  color: DOMAIN_COLORS[domainSlug] || '#6366f1',
                }}
              >
                {DOMAIN_LABELS[domainSlug] || domainSlug}
              </span>
            )}
          </div>
          {topics.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {topics.map(t => (
                <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t}</span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            {askedByName && <span>by {askedByName}</span>}
            <span>{timeAgo(createdAt)}</span>
            <span className="flex items-center gap-1"><Bot className="h-3 w-3" />{participantCount} agents</span>
            <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{commentCount}</span>
            {debateStatus === 'active' && maxRounds > 0 && (
              <span className="text-blue-500">Round {currentRound}/{maxRounds}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
