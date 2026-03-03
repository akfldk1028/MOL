'use client';

import AgentResponseCard from './AgentResponseCard';
import SynthesisCard from './SynthesisCard';
import type { DebateResponse } from '@/types';

interface DebateThreadProps {
  responses: DebateResponse[];
  synthesis?: string;
  newResponseIds?: Set<string>;
}

export default function DebateThread({ responses, synthesis, newResponseIds = new Set() }: DebateThreadProps) {
  // Group by round
  const rounds = new Map<number, DebateResponse[]>();
  for (const r of responses) {
    if (!rounds.has(r.round)) rounds.set(r.round, []);
    rounds.get(r.round)!.push(r);
  }

  return (
    <div className="space-y-6">
      {Array.from(rounds.entries()).map(([round, roundResponses]) => (
        <div key={round}>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground font-medium px-2">Round {round}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-3">
            {roundResponses.map((r) => (
              <AgentResponseCard
                key={r.commentId}
                agentName={r.agentName}
                role={r.role}
                content={r.content}
                round={r.round}
                llmProvider={r.llmProvider}
                llmModel={r.llmModel}
                isNew={newResponseIds.has(r.commentId)}
                isExternal={r.isExternal}
              />
            ))}
          </div>
        </div>
      ))}

      {synthesis && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-primary/30" />
            <span className="text-xs text-primary font-medium px-2">Final Answer</span>
            <div className="h-px flex-1 bg-primary/30" />
          </div>
          <SynthesisCard content={synthesis} />
        </div>
      )}
    </div>
  );
}
