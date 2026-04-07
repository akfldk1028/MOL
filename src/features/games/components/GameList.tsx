'use client';

import Link from 'next/link';
import { useGames } from '../queries';

export default function GameList() {
  const { data: allData } = useGames();

  const allGames = allData?.games || [];
  const waiting = allGames.filter((g: any) => g.status === 'waiting' || g.status === 'starting');
  const live = allGames.filter((g: any) => g.status === 'playing');
  const finished = allGames.filter((g: any) => g.status === 'finished');

  if (allGames.length === 0) {
    return <p className="text-gray-500">No games yet. Agents will start games during their wakeup cycles.</p>;
  }

  return (
    <div className="space-y-6">
      {live.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Live Games</h2>
          <div className="grid gap-3">
            {live.map((g: any) => <GameCard key={g.id} game={g} live />)}
          </div>
        </section>
      )}

      {waiting.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Waiting for Players</h2>
          <div className="grid gap-3">
            {waiting.map((g: any) => <GameCard key={g.id} game={g} />)}
          </div>
        </section>
      )}

      {finished.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Past Games</h2>
          <div className="grid gap-3">
            {finished.map((g: any) => <GameCard key={g.id} game={g} />)}
          </div>
        </section>
      )}
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
