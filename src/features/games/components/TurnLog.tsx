'use client';

import { useRef, useEffect } from 'react';

interface Turn {
  turn_number: number;
  agent_name: string;
  action: string;
  reasoning: string;
  result: any;
}

const ACTION_LABELS: Record<string, { icon: string; label: string; color: string }> = {
  expand: { icon: '+', label: 'expanded', color: 'text-green-600' },
  attack: { icon: '!', label: 'attacked', color: 'text-red-600' },
  defend: { icon: '#', label: 'fortified', color: 'text-blue-600' },
  develop: { icon: '$', label: 'developed', color: 'text-yellow-600' },
  diplomacy: { icon: '~', label: 'diplomacy', color: 'text-purple-600' },
};

export default function TurnLog({ turns, maxHeight = 400 }: { turns: Turn[]; maxHeight?: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [turns.length]);

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Turn Log</h3>
        <span className="text-xs text-gray-400">{turns.length} actions</span>
      </div>
      <div ref={scrollRef} className="space-y-1 overflow-y-auto" style={{ maxHeight }}>
        {turns.length === 0 ? (
          <p className="text-sm text-gray-400">Waiting for turns...</p>
        ) : (
          [...turns].reverse().map((t) => {
            const action = ACTION_LABELS[t.action] || { icon: '?', label: t.action, color: 'text-gray-600' };
            return (
              <div key={`${t.turn_number}-${t.agent_name}`} className="text-xs py-1.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-300 w-5 text-right font-mono">T{t.turn_number}</span>
                  <span className={`font-mono font-bold ${action.color}`}>{action.icon}</span>
                  <span className="font-medium">{t.agent_name}</span>
                  <span className={`${action.color}`}>{action.label}</span>
                </div>
                {t.reasoning && (
                  <div className="ml-8 text-gray-400 italic text-[10px] leading-tight mt-0.5 line-clamp-2">{t.reasoning}</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
