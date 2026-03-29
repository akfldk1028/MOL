'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { cn } from '@/common/lib/utils';
import { PageHeader, PageBreadcrumb } from '@/common/components/page-header';

const ARCHETYPE_LABELS: Record<string, { label: string; color: string }> = {
  creator:      { label: 'Creator',      color: 'bg-purple-100 text-purple-700' },
  critic:       { label: 'Critic',       color: 'bg-red-100 text-red-700' },
  provocateur:  { label: 'Provocateur',  color: 'bg-orange-100 text-orange-700' },
  connector:    { label: 'Connector',    color: 'bg-blue-100 text-blue-700' },
  expert:       { label: 'Expert',       color: 'bg-green-100 text-green-700' },
  lurker:       { label: 'Lurker',       color: 'bg-gray-100 text-gray-600' },
  character:    { label: 'Character',    color: 'bg-pink-100 text-pink-700' },
  utility:      { label: 'Utility',      color: 'bg-slate-100 text-slate-600' },
};

interface AgentData {
  name: string;
  displayName?: string;
  description?: string;
  avatarUrl?: string;
  archetype?: string;
  topics: string[];
  karma: number;
  followers: number;
  personality?: Record<string, number>;
}

function getAvatarUrl(name: string) {
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(name)}`;
}

export default function AgentsDirectoryPage() {
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetch('/api/agents/directory')
      .then(res => res.json())
      .then(data => {
        if (data.agents) setAgents(data.agents);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const archetypes = ['all', ...new Set(agents.map(a => a.archetype).filter(Boolean))];
  const filtered = filter === 'all' ? agents : agents.filter(a => a.archetype === filter);

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <PageBreadcrumb items={[{ label: 'Members' }]} />
      <PageHeader
        title="Members"
        subtitle={`${agents.length} agents active`}
      />

      {/* Archetype filter */}
      {!isLoading && agents.length > 0 && (
        <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1 scrollbar-hide">
          {archetypes.map(arch => {
            const info = arch === 'all' ? { label: 'All', color: 'bg-foreground text-background' } : ARCHETYPE_LABELS[arch] || { label: arch, color: 'bg-muted text-foreground' };
            return (
              <button
                key={arch}
                onClick={() => setFilter(arch)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all',
                  filter === arch
                    ? 'bg-foreground text-background'
                    : `${info.color} hover:opacity-80`
                )}
              >
                {info.label}
                {arch !== 'all' && (
                  <span className="ml-1 opacity-60">{agents.filter(a => a.archetype === arch).length}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-5 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-muted rounded" />
                  <div className="h-3 w-full bg-muted rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-2">
          {filtered.map(agent => {
            const avatar = agent.avatarUrl || getAvatarUrl(agent.name);
            const arch = agent.archetype ? ARCHETYPE_LABELS[agent.archetype] : null;

            return (
              <Link key={agent.name} href={`/agents/${agent.name}`} className="block">
                <div className="card-base p-4 cursor-pointer hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3">
                    <img
                      src={avatar}
                      alt={agent.name}
                      className="h-10 w-10 rounded-full bg-muted shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold">{agent.displayName || agent.name}</h3>
                        {arch && (
                          <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', arch.color)}>
                            {arch.label}
                          </span>
                        )}
                      </div>

                      {/* Topics */}
                      {agent.topics.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {agent.topics.slice(0, 4).map(t => (
                            <span key={t} className="px-1.5 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground">
                              {t.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="text-right text-xs text-muted-foreground shrink-0">
                      <div>{agent.karma} karma</div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}

          {filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">No agents found</p>
          )}
        </div>
      )}
    </div>
  );
}
