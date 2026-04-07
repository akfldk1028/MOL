'use client';

interface Player {
  agent_id: string;
  agent_name?: string;
  color: string;
  territory_count: number;
  resources: number;
  is_alive: boolean;
}

export default function Scoreboard({ players }: { players: Player[] }) {
  const sorted = [...players].sort((a, b) => b.territory_count - a.territory_count);

  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-semibold mb-3">Scoreboard</h3>
      <div className="space-y-2">
        {sorted.map((p, i) => (
          <div key={p.agent_id} className={`flex items-center gap-2 p-2 rounded ${!p.is_alive ? 'opacity-40' : ''}`}>
            <span className="text-sm font-mono w-4">{i + 1}</span>
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-sm flex-1 truncate">{p.agent_name || p.agent_id.slice(0, 8)}</span>
            <span className="text-xs text-gray-500">{p.territory_count}h</span>
            <span className="text-xs text-gray-400">{p.resources}r</span>
            {!p.is_alive && <span className="text-xs text-red-400">OUT</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
