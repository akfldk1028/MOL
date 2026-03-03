/**
 * World Map — 2D 에이전트 월드 시스템
 *
 * 에이전트가 자유롭게 이동할 수 있는 2D 공간
 * Stanford Generative Agents의 Maze 시스템 참고하되
 * openmolt의 토론/비평 UX에 맞게 설계
 *
 * 초기: 토론 스테이지 중심
 * 확장: 커뮤니티 타운 (카페, 광장, 도서관 등)
 */

import type { Position, WorldTile, DebateStage } from '../types';

// ─── World Definition ───

export interface WorldConfig {
  width: number;                 // 타일 수
  height: number;
  tileSize: number;              // 픽셀
  tiles: WorldTile[][];
  stages: DebateStage[];         // 토론 스테이지들
  landmarks: Landmark[];         // 특별 장소
}

export interface Landmark {
  id: string;
  name: string;
  type: 'cafe' | 'library' | 'plaza' | 'stage' | 'workshop' | 'garden';
  position: Position;
  size: { width: number; height: number };
  description: string;           // LLM이 참고할 장소 설명
}

/**
 * 기본 토론 스테이지 생성
 * 원형 배치 — 에이전트들이 둘러앉는 형태
 */
export function createDebateStage(
  id: string,
  name: string,
  center: Position,
  seatCount: number
): DebateStage {
  const seats: Position[] = [];
  const radius = Math.max(3, Math.ceil(seatCount / 2));

  for (let i = 0; i < seatCount; i++) {
    const angle = (2 * Math.PI * i) / seatCount;
    seats.push({
      x: Math.round(center.x + radius * Math.cos(angle)),
      y: Math.round(center.y + radius * Math.sin(angle)),
    });
  }

  return {
    id,
    name,
    seats,
    stageCenter: center,
    audienceArea: [
      { x: center.x, y: center.y + radius + 3 },
      { x: center.x - 3, y: center.y + radius + 3 },
      { x: center.x + 3, y: center.y + radius + 3 },
    ],
  };
}

// ─── Pathfinding (A* Algorithm) ───

interface PathNode {
  position: Position;
  g: number; // start까지 비용
  h: number; // end까지 추정 비용
  f: number; // g + h
  parent: PathNode | null;
}

/**
 * A* 경로 탐색
 * 에이전트가 자유롭게 목적지를 정하면 이 함수로 경로 생성
 */
export function findPath(
  world: WorldConfig,
  start: Position,
  end: Position
): Position[] {
  if (!isWalkable(world, end)) {
    // 목적지가 벽이면 가장 가까운 걸을 수 있는 타일 찾기
    const nearest = findNearestWalkable(world, end);
    if (!nearest) return [];
    end = nearest;
  }

  const openSet: PathNode[] = [];
  const closedSet = new Set<string>();

  const startNode: PathNode = {
    position: start,
    g: 0,
    h: heuristic(start, end),
    f: heuristic(start, end),
    parent: null,
  };

  openSet.push(startNode);

  while (openSet.length > 0) {
    // f값이 가장 작은 노드 선택
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift()!;

    const key = posKey(current.position);
    if (key === posKey(end)) {
      return reconstructPath(current);
    }

    closedSet.add(key);

    // 4방향 이웃
    const neighbors = getNeighbors(current.position);

    for (const neighbor of neighbors) {
      const nKey = posKey(neighbor);

      if (closedSet.has(nKey)) continue;
      if (!isWalkable(world, neighbor)) continue;

      const g = current.g + 1;
      const existing = openSet.find(n => posKey(n.position) === nKey);

      if (!existing) {
        openSet.push({
          position: neighbor,
          g,
          h: heuristic(neighbor, end),
          f: g + heuristic(neighbor, end),
          parent: current,
        });
      } else if (g < existing.g) {
        existing.g = g;
        existing.f = g + existing.h;
        existing.parent = current;
      }
    }
  }

  return []; // 경로 없음
}

function heuristic(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); // Manhattan distance
}

function posKey(p: Position): string {
  return `${p.x},${p.y}`;
}

function getNeighbors(p: Position): Position[] {
  return [
    { x: p.x + 1, y: p.y },
    { x: p.x - 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x, y: p.y - 1 },
  ];
}

function reconstructPath(node: PathNode): Position[] {
  const path: Position[] = [];
  let current: PathNode | null = node;

  while (current) {
    path.unshift(current.position);
    current = current.parent;
  }

  return path;
}

function isWalkable(world: WorldConfig, pos: Position): boolean {
  if (pos.x < 0 || pos.x >= world.width || pos.y < 0 || pos.y >= world.height) {
    return false;
  }
  const tile = world.tiles[pos.y]?.[pos.x];
  return tile ? tile.type !== 'wall' : false;
}

function findNearestWalkable(world: WorldConfig, pos: Position): Position | null {
  for (let r = 1; r <= 5; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const candidate = { x: pos.x + dx, y: pos.y + dy };
        if (isWalkable(world, candidate)) return candidate;
      }
    }
  }
  return null;
}

// ─── World Presets ───

/**
 * openmolt 기본 월드: 토론 광장
 * 중앙에 토론 스테이지, 주변에 에이전트 대기 공간
 */
export function createDefaultWorld(): WorldConfig {
  const width = 30;
  const height = 20;
  const tileSize = 32;

  // 기본 타일맵 — 전부 floor
  const tiles: WorldTile[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ({
      x, y,
      type: 'floor' as const,
    }))
  );

  // 외벽
  for (let x = 0; x < width; x++) {
    tiles[0][x].type = 'wall';
    tiles[height - 1][x].type = 'wall';
  }
  for (let y = 0; y < height; y++) {
    tiles[y][0].type = 'wall';
    tiles[y][width - 1].type = 'wall';
  }

  const stages = [
    createDebateStage('main-stage', 'Main Debate Stage', { x: 15, y: 10 }, 6),
  ];

  const landmarks: Landmark[] = [
    {
      id: 'plaza',
      name: 'Central Plaza',
      type: 'plaza',
      position: { x: 15, y: 10 },
      size: { width: 10, height: 8 },
      description: 'The main gathering area where debates take place.',
    },
    {
      id: 'cafe',
      name: 'Agent Cafe',
      type: 'cafe',
      position: { x: 5, y: 5 },
      size: { width: 6, height: 4 },
      description: 'A cozy cafe where agents discuss casually between debates.',
    },
    {
      id: 'library',
      name: 'Knowledge Library',
      type: 'library',
      position: { x: 25, y: 5 },
      size: { width: 4, height: 4 },
      description: 'A quiet space where agents reflect and research.',
    },
  ];

  return { width, height, tileSize, tiles, stages, landmarks };
}
