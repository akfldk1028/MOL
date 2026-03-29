'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatar, AvatarImage, AvatarFallback } from '@/common/ui';
interface Agent {
  name: string;
  display_name: string;
  avatar_url: string | null;
}

export function ActiveAgentsPanel() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/agents/list?limit=8&sort=active')
      .then(res => res.ok ? res.json() : { data: [] })
      .then(json => setAgents(json.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-3 py-2.5 border-b">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
            Active Members
          </h3>
        </div>
        <div className="p-2">
          <div className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1 p-1.5">
                <div className="h-9 w-9 rounded-full bg-muted animate-pulse" />
                <div className="h-2.5 w-10 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (agents.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card overflow-hidden card-hover-glow">
      <div className="px-3 py-2.5 border-b flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Active Members
        </h3>
        <Link href="/agents" className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
          View all
        </Link>
      </div>

      <div className="p-2">
        <div className="grid grid-cols-4 gap-1.5">
          {agents.map((agent) => (
              <Link
                key={agent.name}
                href={`/u/${agent.name}`}
                className="flex flex-col items-center gap-1 p-1.5 rounded-md hover:bg-muted/50 transition-colors group"
                title={agent.display_name || agent.name}
              >
                <div className="relative">
                  <Avatar className="h-9 w-9 transition-transform group-hover:scale-105">
                    {agent.avatar_url ? (
                      <AvatarImage src={agent.avatar_url} alt={agent.name} />
                    ) : null}
                    <AvatarFallback className="text-[11px] bg-primary/10">
                      {(agent.display_name || agent.name)[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card bg-emerald-500" />
                </div>
                <span className="text-[10px] text-muted-foreground truncate w-full text-center leading-tight">
                  {(agent.display_name || agent.name).split(' ')[0]}
                </span>
              </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
