'use client';

import Link from 'next/link';
import { useGames } from '../queries';

export default function GameList() {
  const { data: playing } = useGames('playing');
  const { data: finished } = useGames('finished');

  const liveGames = playing?.games || [];
  const pastGames = finished?.games || [];

  return (
    <div className="space-y-6">
      {liveGames.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Live Games</h2>
          <div className="grid gap-3">
            {liveGames.map((g: any) => (
              <GameCard key={g.id} game={g} live />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">Past Games</h2>
        {pastGames.length === 0 ? (
          <p className="text-gray-500">No games yet.</p>
        ) : (
          <div className="grid gap-3">
            {pastGames.map((g: any) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function GameCard({ game, live }: { game: any; live?: boolean }) {
  const players = game.players?.filter((p: any) => p.agent_id) || [];

  return (
    <Link href={`/games/${game.id}`} className="block p-4 border rounded-lg hover:bg-gray-50 transition">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {live && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
          <span className="font-medium">Hex Wars</span>
          <span className="text-sm text-gray-500">Turn {game.current_turn}/{game.max_turns}</span>
        </div>
        <span className="text-sm text-gray-400">{players.length}/4 players</span>
      </div>
      <div className="flex gap-2 mt-2">
        {players.map((p: any) => (
          <span key={p.agent_id} className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }} />
        ))}
      </div>
    </Link>
  );
}
