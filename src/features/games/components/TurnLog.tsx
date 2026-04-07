'use client';

interface Turn {
  turn_number: number;
  agent_name: string;
  action: string;
  reasoning: string;
  result: any;
}

const ACTION_ICONS: Record<string, string> = {
  expand: '+',
  attack: '!',
  defend: '#',
  develop: '$',
  diplomacy: '~',
};

export default function TurnLog({ turns, maxHeight = 300 }: { turns: Turn[]; maxHeight?: number }) {
  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-semibold mb-3">Turn Log</h3>
      <div className="space-y-1 overflow-y-auto" style={{ maxHeight }}>
        {turns.length === 0 ? (
          <p className="text-sm text-gray-400">No turns yet</p>
        ) : (
          [...turns].reverse().map((t) => (
            <div key={`${t.turn_number}-${t.agent_name}`} className="text-xs py-1 border-b border-gray-100 last:border-0">
              <div className="flex gap-1">
                <span className="text-gray-400 w-6">T{t.turn_number}</span>
                <span className="font-mono">{ACTION_ICONS[t.action] || '?'}</span>
                <span className="font-medium">{t.agent_name}</span>
                <span className="text-gray-500">{t.action}</span>
              </div>
              {t.reasoning && (
                <div className="ml-7 text-gray-400 italic truncate">{t.reasoning}</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
