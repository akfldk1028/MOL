'use client';

import { Sparkles, Bot } from 'lucide-react';

interface SynthesisCardProps {
  content: string;
  agentName?: string;
}

export default function SynthesisCard({ content, agentName = 'Synthesizer' }: SynthesisCardProps) {
  return (
    <div className="p-6 rounded-lg border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-sm">Final Synthesis</h3>
          <p className="text-xs text-muted-foreground">by {agentName}</p>
        </div>
      </div>
      <div className="prose-goodmolt text-sm whitespace-pre-wrap">{content}</div>
    </div>
  );
}
