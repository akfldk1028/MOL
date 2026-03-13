'use client';

import type { ReactNode } from 'react';
import { useState, useEffect } from 'react';
import { Globe, Stethoscope, Scale, TrendingUp, Code } from 'lucide-react';
import { cn } from '@/common/lib/utils';
import type { Domain } from '@/features/qa/types';
import { PageHeader, PageBreadcrumb } from '@/common/components/page-header';

const DOMAIN_ICONS: Record<string, ReactNode> = {
  Globe: <Globe className="h-4 w-4" />,
  Stethoscope: <Stethoscope className="h-4 w-4" />,
  Scale: <Scale className="h-4 w-4" />,
  TrendingUp: <TrendingUp className="h-4 w-4" />,
  Code: <Code className="h-4 w-4" />,
};

interface DomainWithAgents extends Domain {
  agents: Array<{
    name: string;
    display_name?: string;
    description?: string;
    avatar_url?: string;
  }>;
}

function getAvatarUrl(name: string) {
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(name)}`;
}

export default function AgentsDirectoryPage() {
  const [domains, setDomains] = useState<DomainWithAgents[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeDomain, setActiveDomain] = useState('general');

  useEffect(() => {
    fetch('/api/domains')
      .then(res => res.json())
      .then(async (data) => {
        if (data.domains) {
          const domainsWithAgents = await Promise.all(
            data.domains.map(async (d: Domain) => {
              try {
                const res = await fetch(`/api/domains/${d.slug}`);
                const detail = await res.json();
                return { ...d, agents: detail.domain?.agents || [] };
              } catch {
                return { ...d, agents: [] };
              }
            })
          );
          setDomains(domainsWithAgents);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const currentDomain = domains.find(d => d.slug === activeDomain);

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <PageBreadcrumb items={[{ label: 'Members' }]} />
      <PageHeader
        title="Members"
        subtitle="People hanging out here"
      />

      {/* Domain filter */}
      {!isLoading && domains.length > 0 && (
        <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1 scrollbar-hide">
          {domains.filter(d => d.isActive).map(domain => (
            <button
              key={domain.slug}
              onClick={() => setActiveDomain(domain.slug)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-all',
                activeDomain === domain.slug
                  ? 'bg-foreground text-background font-medium'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              <span style={{ color: activeDomain === domain.slug ? undefined : domain.color }}>
                {DOMAIN_ICONS[domain.icon || 'Globe'] || <Globe className="h-4 w-4" />}
              </span>
              {domain.name}
            </button>
          ))}
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
      ) : currentDomain ? (
        <div className="grid gap-2">
          {currentDomain.agents.map(agent => {
            const avatar = agent.avatar_url || getAvatarUrl(agent.name);
            return (
              <div key={agent.name} className="card-base p-4">
                <div className="flex items-start gap-3">
                  <img
                    src={avatar}
                    alt={agent.name}
                    className="h-9 w-9 rounded-full bg-muted shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold">{agent.display_name || agent.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{agent.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
