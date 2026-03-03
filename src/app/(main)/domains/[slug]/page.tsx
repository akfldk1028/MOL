'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Bot, ArrowRight, Globe, Stethoscope, Scale, TrendingUp, Code } from 'lucide-react';
import { Badge } from '@/components/ui';
import type { DomainDetail, DomainAgent } from '@/types';

const DOMAIN_ICONS: Record<string, React.ReactNode> = {
  Globe: <Globe className="h-10 w-10" />,
  Stethoscope: <Stethoscope className="h-10 w-10" />,
  Scale: <Scale className="h-10 w-10" />,
  TrendingUp: <TrendingUp className="h-10 w-10" />,
  Code: <Code className="h-10 w-10" />,
};

const LLM_LABELS: Record<string, { label: string; color: string }> = {
  anthropic: { label: 'Claude', color: 'bg-orange-500/10 text-orange-600' },
  openai: { label: 'GPT', color: 'bg-emerald-500/10 text-emerald-600' },
  google: { label: 'Gemini', color: 'bg-blue-500/10 text-blue-600' },
};

export default function DomainDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [domain, setDomain] = useState<DomainDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/domains/${slug}`)
      .then(res => res.json())
      .then(data => {
        if (data.domain) setDomain(data.domain);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [slug]);

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto py-6 px-4">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!domain) {
    return (
      <div className="max-w-3xl mx-auto py-6 px-4">
        <p className="text-muted-foreground">Domain not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div
          className="h-16 w-16 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${domain.color || '#6366f1'}15`, color: domain.color || '#6366f1' }}
        >
          {DOMAIN_ICONS[domain.icon || 'Globe'] || <Globe className="h-10 w-10" />}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{domain.name}</h1>
            {domain.tier !== 'free' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium">PRO</span>
            )}
          </div>
          <p className="text-muted-foreground mt-1">{domain.description}</p>
        </div>
      </div>

      {/* CTA */}
      <Link
        href={`/ask?domain=${domain.slug}`}
        className="flex items-center justify-between p-4 rounded-lg border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors mb-8"
      >
        <div>
          <p className="font-semibold">Ask a {domain.name} Question</p>
          <p className="text-sm text-muted-foreground">{domain.agents.length} specialized agents ready to discuss</p>
        </div>
        <ArrowRight className="h-5 w-5 text-primary" />
      </Link>

      {/* Agents */}
      <h2 className="text-lg font-semibold mb-4">Specialist Agents</h2>
      <div className="space-y-3">
        {domain.agents.map((agent: DomainAgent) => {
          const llmInfo = agent.llm_provider ? LLM_LABELS[agent.llm_provider] : null;
          return (
            <div key={agent.name} className="p-4 rounded-lg border">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{agent.display_name || agent.name}</span>
                    {llmInfo && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${llmInfo.color}`}>
                        {llmInfo.label}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{agent.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
