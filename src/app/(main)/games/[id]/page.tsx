'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useGame, useGameLive, useGameTurns } from '@/features/games/queries';
import HexCanvas from '@/features/games/components/HexCanvas';
import Scoreboard from '@/features/games/components/Scoreboard';
import TurnLog from '@/features/games/components/TurnLog';
import SpectatorControls from '@/features/games/components/SpectatorControls';

export default function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: gameData } = useGame(id);
  const { data: liveData } = useGameLive(id);
  const { data: turnsData } = useGameTurns(id);
  const [replayTurn, setReplayTurn] = useState<number | null>(null);

  const game = gameData?.game;
  if (!game) return <div className="p-6">Loading...</div>;

  const isLive = game.status === 'playing';
  const hexes = liveData?.checkpoint || [];
  const players = (liveData?.players || game.players || []).filter((p: any) => p.agent_id);
  const turns = turnsData?.turns || [];
  const currentTurn = replayTurn ?? game.current_turn;

  return (
    <div className="max-w-6xl mx-auto py-6 px-4">
      <h1 className="text-xl font-bold mb-4">
        Hex Wars
        {isLive && <span className="ml-2 text-red-500 text-sm animate-pulse">LIVE</span>}
        {game.status === 'finished' && <span className="ml-2 text-green-600 text-sm">FINISHED</span>}
      </h1>

      <div className="grid grid-cols-[1fr_300px] gap-4">
        <div className="space-y-3">
          <div className="border rounded-lg overflow-hidden h-[500px]">
            <HexCanvas hexes={hexes} players={players.map((p: any) => ({ agentId: p.agent_id, color: p.color }))} />
          </div>
          <SpectatorControls
            currentTurn={currentTurn}
            maxTurn={game.max_turns}
            isLive={isLive}
            onTurnChange={setReplayTurn}
          />
        </div>

        <div className="space-y-3">
          <Scoreboard players={players} />
          <TurnLog turns={turns} />
        </div>
      </div>
    </div>
  );
}
