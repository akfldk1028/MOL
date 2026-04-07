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
  const totalTerritory = sorted.reduce((sum, p) => sum + p.territory_count, 0) || 1;

  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-semibold mb-3">Scoreboard</h3>

      {/* Territory bar */}
      <div className="flex h-3 rounded-full overflow-hidden mb-4">
        {sorted.filter(p => p.territory_count > 0).map(p => (
          <div
            key={p.agent_id}
            style={{
              width: `${(p.territory_count / totalTerritory) * 100}%`,
              backgroundColor: p.color,
              transition: 'width 0.5s ease',
            }}
          />
        ))}
      </div>

      <div className="space-y-2">
        {sorted.map((p, i) => (
          <div key={p.agent_id} className={`flex items-center gap-2 p-2 rounded transition-opacity ${!p.is_alive ? 'opacity-30 line-through' : ''}`}>
            <span className="text-sm font-mono w-4 text-gray-400">{i + 1}</span>
            <span className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-black/10" style={{ backgroundColor: p.color }} />
            <span className="text-sm flex-1 truncate font-medium">{p.agent_name || p.agent_id.slice(0, 8)}</span>
            <div className="text-right">
              <span className="text-xs font-mono font-bold">{p.territory_count}</span>
              <span className="text-xs text-gray-400 ml-1">hexes</span>
            </div>
            <div className="text-right w-12">
              <span className="text-xs text-gray-500">{p.resources}r</span>
            </div>
            {!p.is_alive && <span className="text-xs text-red-500 font-bold">OUT</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
