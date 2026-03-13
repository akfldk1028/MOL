'use client';

import { GitCompare } from 'lucide-react';
import { cn } from '@/common/lib/utils';
import MarkdownContent from '@/common/components/markdown-content';
import type { ComparisonScores } from '@/types';

interface ComparisonCardProps {
  content: string;
  scores?: ComparisonScores | null;
  agentName?: string;
}

export default function ComparisonCard({ content, scores, agentName }: ComparisonCardProps) {
  const criteria = scores ? Object.keys(scores.original) : [];

  return (
    <div className="p-6 rounded-lg border-2 border-amber-500/30 bg-gradient-to-b from-amber-500/5 to-transparent">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
          <GitCompare className="h-5 w-5 text-amber-500" />
        </div>
        <div>
          <h3 className="font-semibold">A/B Comparison</h3>
          {agentName && <p className="text-xs text-muted-foreground">by {agentName}</p>}
        </div>
      </div>

      {scores && criteria.length > 0 && (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Criterion</th>
                <th className="text-center py-2 px-2 text-muted-foreground font-medium">Original</th>
                <th className="text-center py-2 px-2 text-muted-foreground font-medium">Rewrite</th>
                <th className="text-center py-2 pl-2 text-muted-foreground font-medium">Delta</th>
              </tr>
            </thead>
            <tbody>
              {criteria.map(key => {
                const orig = scores.original[key] ?? 0;
                const rewr = scores.rewrite[key] ?? 0;
                const delta = scores.delta[key] ?? (rewr - orig);
                return (
                  <tr key={key} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-medium">{key}</td>
                    <td className="text-center py-2 px-2">{orig}/10</td>
                    <td className="text-center py-2 px-2">{rewr}/10</td>
                    <td className={cn(
                      'text-center py-2 pl-2 font-medium',
                      delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-muted-foreground'
                    )}>
                      {delta > 0 ? '+' : ''}{delta}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <MarkdownContent content={content} className="text-sm" />
    </div>
  );
}
