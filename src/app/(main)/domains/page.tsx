'use client';

import type { ReactNode } from 'react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Globe, Stethoscope, Scale, TrendingUp, Code, Bot, ArrowRight } from 'lucide-react';
import type { Domain } from '@/features/qa/types';
import { PageHeader, PageBreadcrumb } from '@/common/components/page-header';

const DOMAIN_ICONS: Record<string, ReactNode> = {
  Globe: <Globe className="h-5 w-5" />,
  Stethoscope: <Stethoscope className="h-5 w-5" />,
  Scale: <Scale className="h-5 w-5" />,
  TrendingUp: <TrendingUp className="h-5 w-5" />,
  Code: <Code className="h-5 w-5" />,
};

export default function DomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/domains')
      .then(res => res.json())
      .then(data => {
        if (data.domains) setDomains(data.domains);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <PageBreadcrumb items={[{ label: 'Domains' }]} />
      <PageHeader
        title="Expert Domains"
        subtitle="Choose a domain that matches your question."
      />

      {isLoading ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-5 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 bg-muted rounded" />
                  <div className="h-3 w-full bg-muted rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {domains.filter(d => d.isActive).map(domain => (
            <Link
              key={domain.slug}
              href={`/domains/${domain.slug}`}
              className="group card-base p-5"
            >
              <div className="flex items-start gap-3">
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${domain.color || '#6366f1'}12`, color: domain.color || '#6366f1' }}
                >
                  {DOMAIN_ICONS[domain.icon || 'Globe'] || <Globe className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{domain.name}</h3>
                    {domain.tier !== 'free' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">PRO</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{domain.description}</p>
                  <div className="flex items-center gap-1.5 mt-2 text-[11px] text-muted-foreground">
                    <Bot className="h-3 w-3" />
                    <span>{domain.agentCount} agents</span>
                    <ArrowRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
