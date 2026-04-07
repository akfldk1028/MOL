'use client';

import { useRef, useEffect, useCallback, useState } from 'react';

interface HexData {
  q: number;
  r: number;
  terrain: string;
  owner: string | null;
  defenseBonus: number;
}

interface PlayerInfo {
  agentId: string;
  color: string;
}

interface HexCanvasProps {
  hexes: HexData[];
  players: PlayerInfo[];
  currentTurn?: number;
  onHexClick?: (q: number, r: number) => void;
}

const TERRAIN_COLORS: Record<string, string> = {
  plain: '#e8e0d0',
  forest: '#4a7c59',
  mountain: '#8b7355',
  water: '#5b8fa8',
};

const HEX_SIZE = 20;
const SQRT3 = Math.sqrt(3);

function hexToPixel(q: number, r: number): { x: number; y: number } {
  const x = HEX_SIZE * SQRT3 * (q + r / 2);
  const y = HEX_SIZE * (3 / 2) * r;
  return { x, y };
}

function drawHex(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const x = cx + size * Math.cos(angle);
    const y = cy + size * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export default function HexCanvas({ hexes, players, currentTurn = 0, onHexClick }: HexCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);
  const prevHexesRef = useRef<Map<string, string | null>>(new Map());
  const flashRef = useRef<Map<string, { color: string; alpha: number }>>(new Map());
  const animFrameRef = useRef<number>(0);
  const sizeRef = useRef({ w: 0, h: 0 });

  const playerMap = new Map(players.map(p => [p.agentId, p]));

  // Detect changed hexes for flash animation
  useEffect(() => {
    const newOwnerMap = new Map<string, string | null>();
    for (const hex of hexes) {
      const key = `${hex.q},${hex.r}`;
      newOwnerMap.set(key, hex.owner);
      const prevOwner = prevHexesRef.current.get(key);
      if (prevOwner !== undefined && prevOwner !== hex.owner && hex.owner) {
        const player = playerMap.get(hex.owner);
        flashRef.current.set(key, { color: player?.color || '#fff', alpha: 1.0 });
      }
    }
    prevHexesRef.current = newOwnerMap;
  }, [hexes, currentTurn]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = sizeRef.current.w || canvas.getBoundingClientRect().width;
    const h = sizeRef.current.h || canvas.getBoundingClientRect().height;

    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2 + offset.x, h / 2 + offset.y);
    ctx.scale(zoom, zoom);

    for (const hex of hexes) {
      const { x, y } = hexToPixel(hex.q, hex.r);
      const key = `${hex.q},${hex.r}`;

      // Terrain fill
      drawHex(ctx, x, y, HEX_SIZE - 1);
      ctx.fillStyle = TERRAIN_COLORS[hex.terrain] || '#ccc';
      ctx.fill();

      // Owner overlay
      if (hex.owner) {
        const player = playerMap.get(hex.owner);
        if (player) {
          drawHex(ctx, x, y, HEX_SIZE - 1);
          ctx.fillStyle = player.color + '88';
          ctx.fill();
        }
      }

      // Flash effect for recently changed hexes
      const flash = flashRef.current.get(key);
      if (flash && flash.alpha > 0) {
        drawHex(ctx, x, y, HEX_SIZE + 2);
        ctx.fillStyle = flash.color + Math.round(flash.alpha * 255).toString(16).padStart(2, '0');
        ctx.fill();
        // White burst
        drawHex(ctx, x, y, HEX_SIZE - 1);
        ctx.fillStyle = `rgba(255,255,255,${flash.alpha * 0.6})`;
        ctx.fill();
      }

      // Border
      drawHex(ctx, x, y, HEX_SIZE - 1);
      ctx.strokeStyle = hex.owner ? '#00000040' : '#00000015';
      ctx.lineWidth = hex.owner ? 1 : 0.5;
      ctx.stroke();

      // Defense indicator
      if (hex.defenseBonus > 0) {
        ctx.fillStyle = '#3b82f6';
        ctx.font = `${10}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hex.defenseBonus.toString(), x, y);
      }
    }

    ctx.restore();

    // Turn indicator
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Turn ${currentTurn}`, 10, 20);

    // Decay flash alphas
    let hasFlash = false;
    for (const [key, flash] of flashRef.current) {
      flash.alpha -= 0.03;
      if (flash.alpha <= 0) {
        flashRef.current.delete(key);
      } else {
        hasFlash = true;
      }
    }

    if (hasFlash) {
      animFrameRef.current = requestAnimationFrame(render);
    }
  }, [hexes, players, offset, zoom, currentTurn]);

  useEffect(() => {
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [render]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      sizeRef.current = { w: width, h: height };
      render();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [render]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.5, Math.min(3, z - e.deltaY * 0.001)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, offsetX: offset.x, offsetY: offset.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    setOffset({
      x: dragRef.current.offsetX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.offsetY + (e.clientY - dragRef.current.startY),
    });
  };

  const handleMouseUp = () => { dragRef.current = null; };

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-grab active:cursor-grabbing bg-slate-50"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
}
