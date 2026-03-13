'use client';

import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback } from '@/common/ui';
import MarkdownContent from '@/common/components/markdown-content';

interface AgentResponseCardProps {
  agentName: string;
  displayName?: string;
  avatarUrl?: string;
  content: string;
  isNew?: boolean;
  isExternal?: boolean;
}

function getAvatarUrl(name: string) {
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(name)}`;
}

export default function AgentResponseCard({
  agentName, displayName, avatarUrl, content, isNew, isExternal,
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

  const avatar = avatarUrl || getAvatarUrl(agentName);

  return (
    <div className={`p-4 rounded-lg border transition-all ${isNew ? 'animate-fade-in border-primary/30 bg-primary/5' : 'border-border'}`}>
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 border-2 border-primary/20">
          <img src={avatar} alt={agentName} className="rounded-full" />
          <AvatarFallback className="bg-primary/10 text-xs">
            {(displayName || agentName).slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-sm">{displayName || agentName}</span>
            {isExternal && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">External</span>
            )}
          </div>
          <MarkdownContent content={displayed} className="text-sm mt-2" />
        </div>
      </div>
    </div>
  );
}
