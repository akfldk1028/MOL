'use client';

import { useState, useEffect } from 'react';
import { Globe, Stethoscope, Scale, TrendingUp, Code } from 'lucide-react';
import type { Domain } from '@/types';

const DOMAIN_ICONS: Record<string, React.ReactNode> = {
  Globe: <Globe className="h-5 w-5" />,
  Stethoscope: <Stethoscope className="h-5 w-5" />,
  Scale: <Scale className="h-5 w-5" />,
  TrendingUp: <TrendingUp className="h-5 w-5" />,
  Code: <Code className="h-5 w-5" />,
};

interface DomainSelectorProps {
  selected: string;
  onChange: (slug: string) => void;
}

export default function DomainSelector({ selected, onChange }: DomainSelectorProps) {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/domains')
      .then(res => res.json())
      .then(data => {
        if (data.domains) setDomains(data.domains);
      })
      .catch(() => {
        // Fallback to hardcoded domains
        setDomains([
          { slug: 'general', name: 'General', icon: 'Globe', color: '#6366f1', tier: 'free', agentCount: 5, isActive: true },
          { slug: 'medical', name: 'Medical', icon: 'Stethoscope', color: '#ef4444', tier: 'pro', agentCount: 5, isActive: true },
          { slug: 'legal', name: 'Legal', icon: 'Scale', color: '#8b5cf6', tier: 'pro', agentCount: 5, isActive: true },
          { slug: 'investment', name: 'Investment', icon: 'TrendingUp', color: '#10b981', tier: 'pro', agentCount: 5, isActive: true },
          { slug: 'tech', name: 'Technology', icon: 'Code', color: '#f59e0b', tier: 'free', agentCount: 5, isActive: true },
        ]);
      })
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return null;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Domain</label>
      <div className="grid grid-cols-5 gap-2">
        {domains.filter(d => d.isActive).map(domain => (
          <button
            key={domain.slug}
            type="button"
            onClick={() => onChange(domain.slug)}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-center transition-colors ${
              selected === domain.slug
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${domain.color || '#6366f1'}20`, color: domain.color || '#6366f1' }}
            >
              {DOMAIN_ICONS[domain.icon || 'Globe'] || <Globe className="h-5 w-5" />}
            </div>
            <span className="text-xs font-medium">{domain.name}</span>
            {domain.tier !== 'free' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600">PRO</span>
            )}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {selected === 'general' && 'Multi-perspective analysis with 5 diverse house agents.'}
        {selected === 'medical' && 'Evidence-based medical analysis with clinical specialists.'}
        {selected === 'legal' && 'Multi-jurisdictional legal analysis with specialized counsel.'}
        {selected === 'investment' && 'Investment analysis covering fundamental, technical, and macro perspectives.'}
        {selected === 'tech' && 'Software architecture analysis with ADR-style recommendations.'}
      </p>
    </div>
  );
}
