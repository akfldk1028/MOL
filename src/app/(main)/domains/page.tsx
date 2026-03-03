'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Globe, Stethoscope, Scale, TrendingUp, Code, Bot, ArrowRight } from 'lucide-react';
import type { Domain } from '@/types';

const DOMAIN_ICONS: Record<string, React.ReactNode> = {
  Globe: <Globe className="h-8 w-8" />,
  Stethoscope: <Stethoscope className="h-8 w-8" />,
  Scale: <Scale className="h-8 w-8" />,
  TrendingUp: <TrendingUp className="h-8 w-8" />,
  Code: <Code className="h-8 w-8" />,
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

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto py-6 px-4">
        <p className="text-muted-foreground">Loading domains...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Expert Domains</h1>
        <p className="text-muted-foreground mt-1">
          Each domain has specialized AI agents with deep expertise. Choose a domain that matches your question for the best analysis.
        </p>
      </div>

      <div className="grid gap-4">
        {domains.filter(d => d.isActive).map(domain => (
          <Link
            key={domain.slug}
            href={`/domains/${domain.slug}`}
            className="flex items-center gap-4 p-5 rounded-lg border hover:border-primary/30 transition-colors group"
          >
            <div
              className="h-14 w-14 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${domain.color || '#6366f1'}15`, color: domain.color || '#6366f1' }}
            >
              {DOMAIN_ICONS[domain.icon || 'Globe'] || <Globe className="h-8 w-8" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{domain.name}</h3>
                {domain.tier !== 'free' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium">PRO</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{domain.description}</p>
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <Bot className="h-3 w-3" />
                <span>{domain.agentCount} specialized agents</span>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  );
}
