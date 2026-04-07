'use client';

import { useState } from 'react';

interface SpectatorControlsProps {
  currentTurn: number;
  maxTurn: number;
  isLive: boolean;
  onTurnChange: (turn: number) => void;
  onSpeedChange?: (speed: number) => void;
}

export default function SpectatorControls({ currentTurn, maxTurn, isLive, onTurnChange, onSpeedChange }: SpectatorControlsProps) {
  const [speed, setSpeed] = useState(1);

  const handleSpeedChange = (s: number) => {
    setSpeed(s);
    onSpeedChange?.(s);
  };

  if (isLive) {
    return (
      <div className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50">
        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        <span className="text-sm font-medium">LIVE</span>
        <span className="text-sm text-gray-500">Turn {currentTurn}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50">
      <button onClick={() => onTurnChange(Math.max(0, currentTurn - 1))} className="px-2 py-1 text-sm border rounded hover:bg-white">
        ◀
      </button>
      <input
        type="range"
        min={0}
        max={maxTurn}
        value={currentTurn}
        onChange={e => onTurnChange(Number(e.target.value))}
        className="flex-1"
      />
      <button onClick={() => onTurnChange(Math.min(maxTurn, currentTurn + 1))} className="px-2 py-1 text-sm border rounded hover:bg-white">
        ▶
      </button>
      <span className="text-sm text-gray-500 w-16">T{currentTurn}/{maxTurn}</span>
      <div className="flex gap-1">
        {[1, 2, 5].map(s => (
          <button
            key={s}
            onClick={() => handleSpeedChange(s)}
            className={`px-2 py-0.5 text-xs border rounded ${speed === s ? 'bg-blue-500 text-white' : 'hover:bg-white'}`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
