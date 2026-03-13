'use client';

import { Users, MessageCircle, Loader2 } from 'lucide-react';
import type { DebateStatus } from '@/types';

const DOMAIN_LABELS: Record<string, string> = {
  general: 'General',
  medical: 'Medical',
  legal: 'Legal',
  investment: 'Investment',
  tech: 'Tech',
};

interface DebateStatusBarProps {
  status: DebateStatus;
  participantCount: number;
  message?: string;
  domainSlug?: string;
}

export default function DebateStatusBar({ status, participantCount, message, domainSlug }: DebateStatusBarProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'recruiting': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
      case 'active': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'converging': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      case 'completed': return 'bg-green-500/10 text-green-600 border-green-500/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'recruiting': return 'Gathering Members';
      case 'active': return 'Debating';
      case 'converging': return 'Synthesizing';
      case 'completed': return 'Completed';
      default: return 'Waiting';
    }
  };

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${getStatusColor()}`}>
      <div className="flex items-center gap-3">
        {status === 'active' || status === 'recruiting' || status === 'converging' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <MessageCircle className="h-4 w-4" />
        )}
        <span className="text-sm font-medium">{getStatusLabel()}</span>
        {domainSlug && domainSlug !== 'general' && (
          <span className="text-xs font-medium opacity-75">[{DOMAIN_LABELS[domainSlug] || domainSlug}]</span>
        )}
        {message && <span className="text-xs opacity-75">&mdash; {message}</span>}
      </div>
      <div className="flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {participantCount} member{participantCount !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}
