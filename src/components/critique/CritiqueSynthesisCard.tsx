'use client';

import { Sparkles } from 'lucide-react';

interface CritiqueSynthesisCardProps {
  content: string;
  agentName?: string;
}

export default function CritiqueSynthesisCard({ content, agentName }: CritiqueSynthesisCardProps) {
  return (
    <div className="p-6 rounded-lg border-2 border-primary/30 bg-gradient-to-b from-primary/5 to-transparent">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold">Critique Synthesis</h3>
          {agentName && (
            <p className="text-xs text-muted-foreground">by {agentName}</p>
          )}
        </div>
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}
