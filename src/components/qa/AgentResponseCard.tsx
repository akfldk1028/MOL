'use client';

import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, Badge } from '@/components/ui';
import { Bot } from 'lucide-react';
import type { DebateRole } from '@/types';

interface AgentResponseCardProps {
  agentName: string;
  displayName?: string;
  avatarUrl?: string;
  role: DebateRole;
  content: string;
  round: number;
  llmProvider?: string;
  llmModel?: string;
  isNew?: boolean;
  isExternal?: boolean;
}

const ROLE_LABELS: Record<DebateRole, { label: string; color: string }> = {
  respondent: { label: 'Respondent', color: 'bg-blue-500/10 text-blue-600' },
  devil_advocate: { label: "Devil's Advocate", color: 'bg-red-500/10 text-red-600' },
  synthesizer: { label: 'Synthesizer', color: 'bg-purple-500/10 text-purple-600' },
  fact_checker: { label: 'Fact Checker', color: 'bg-green-500/10 text-green-600' },
};

const LLM_LABELS: Record<string, { label: string; color: string }> = {
  anthropic: { label: 'Claude', color: 'bg-orange-500/10 text-orange-600' },
  openai: { label: 'GPT', color: 'bg-emerald-500/10 text-emerald-600' },
  google: { label: 'Gemini', color: 'bg-blue-500/10 text-blue-600' },
};

export default function AgentResponseCard({
  agentName, displayName, avatarUrl, role, content, round, llmProvider, llmModel, isNew, isExternal,
}: AgentResponseCardProps) {
  const [displayed, setDisplayed] = useState(isNew ? '' : content);

  // Typing animation (only for new responses)
  useEffect(() => {
    if (!isNew) return;
    let i = 0;
    const interval = setInterval(() => {
      i += 3;
      if (i >= content.length) {
        setDisplayed(content);
        clearInterval(interval);
      } else {
        setDisplayed(content.slice(0, i));
      }
    }, 10);
    return () => clearInterval(interval);
  }, [content, isNew]);

  const roleInfo = ROLE_LABELS[role] || ROLE_LABELS.respondent;
  const llmInfo = llmProvider ? LLM_LABELS[llmProvider] : null;

  return (
    <div className={`p-4 rounded-lg border transition-all ${isNew ? 'animate-fade-in border-primary/30 bg-primary/5' : 'border-border'}`}>
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 border-2 border-primary/20">
          {avatarUrl ? (
            <img src={avatarUrl} alt={agentName} className="rounded-full" />
          ) : (
            <AvatarFallback className="bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </AvatarFallback>
          )}
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-sm">{displayName || agentName}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${roleInfo.color}`}>{roleInfo.label}</span>
            {llmInfo && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${llmInfo.color}`}>{llmInfo.label}</span>
            )}
            {isExternal && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">External</span>
            )}
            <span className="text-xs text-muted-foreground">Round {round}</span>
          </div>
          <div className="prose-goodmolt text-sm mt-2 whitespace-pre-wrap">{displayed}</div>
        </div>
      </div>
    </div>
  );
}
