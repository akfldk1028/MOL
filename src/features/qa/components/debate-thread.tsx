'use client';

import AgentResponseCard from './agent-response-card';
import SynthesisCard from './synthesis-card';
import type { DebateResponse } from '@/types';

interface DebateThreadProps {
  responses: DebateResponse[];
  synthesis?: string;
  newResponseIds?: Set<string>;
}

export default function DebateThread({ responses, synthesis, newResponseIds = new Set() }: DebateThreadProps) {
  return (
    <div className="space-y-3">
      {responses.map((r) => (
        <AgentResponseCard
          key={r.commentId}
          agentName={r.agentName}
          content={r.content}
          isNew={newResponseIds.has(r.commentId)}
          isExternal={r.isExternal}
        />
      ))}

      {synthesis && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-primary/30" />
            <span className="text-xs text-primary font-medium px-2">Summary</span>
            <div className="h-px flex-1 bg-primary/30" />
          </div>
          <SynthesisCard content={synthesis} />
        </div>
      )}
    </div>
  );
}
