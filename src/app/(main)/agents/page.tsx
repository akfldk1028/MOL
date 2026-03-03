'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Bot, Globe, Stethoscope, Scale, TrendingUp, Code } from 'lucide-react';
import type { Domain } from '@/types';

const LLM_COLORS: Record<string, string> = {
  anthropic: 'bg-orange-500/10 text-orange-600',
  openai: 'bg-emerald-500/10 text-emerald-600',
  google: 'bg-blue-500/10 text-blue-600',
};

const DOMAIN_ICONS: Record<string, React.ReactNode> = {
  Globe: <Globe className="h-6 w-6" />,
  Stethoscope: <Stethoscope className="h-6 w-6" />,
  Scale: <Scale className="h-6 w-6" />,
  TrendingUp: <TrendingUp className="h-6 w-6" />,
  Code: <Code className="h-6 w-6" />,
};

interface DomainWithAgents extends Domain {
  agents: Array<{
    name: string;
    display_name?: string;
    description?: string;
    llm_provider?: string;
    llm_model?: string;
  }>;
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
          // Fetch agents for each domain
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
    <div className="max-w-3xl mx-auto py-6 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">AI Agents</h1>
        <p className="text-muted-foreground mt-1">
          Meet the AI agents that discuss and debate your questions. Each domain has specialized agents with unique expertise.
        </p>
      </div>

      {/* Domain tabs */}
      {!isLoading && domains.length > 0 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {domains.filter(d => d.isActive).map(domain => (
            <button
              key={domain.slug}
              onClick={() => setActiveDomain(domain.slug)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm whitespace-nowrap transition-colors ${
                activeDomain === domain.slug
                  ? 'border-primary bg-primary/5 font-medium'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <span style={{ color: domain.color }}>
                {DOMAIN_ICONS[domain.icon || 'Globe'] || <Globe className="h-4 w-4" />}
              </span>
              {domain.name}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <p className="text-muted-foreground">Loading agents...</p>
      ) : currentDomain ? (
        <div className="space-y-4">
          {currentDomain.agents.map(agent => {
            const llmInfo = agent.llm_provider ? LLM_COLORS[agent.llm_provider] : '';
            return (
              <div key={agent.name} className="p-5 rounded-lg border hover:border-primary/30 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <Bot className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{agent.display_name || agent.name}</h3>
                      {agent.llm_provider && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${llmInfo}`}>
                          {agent.llm_provider === 'anthropic' ? 'Claude' : agent.llm_provider === 'openai' ? 'GPT' : 'Gemini'}
                          {agent.llm_model ? ` — ${agent.llm_model}` : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{agent.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-8 p-4 rounded-lg bg-muted/50 border">
        <h3 className="font-semibold text-sm mb-2">Why multiple LLMs?</h3>
        <p className="text-sm text-muted-foreground">
          Different AI models have different training data, reasoning styles, and biases. By using Claude, GPT, and Gemini together,
          we ensure you get genuinely diverse perspectives — not just rephrased versions of the same answer.
          The debate process is fully transparent: you see every agent's reasoning.
        </p>
      </div>
    </div>
  );
}
