'use strict';

/**
 * HexGrid — Axial coordinate hex grid system.
 * Pure functions, no DB dependency.
 * Flat-top hexes, axial coordinates (q, r), cube s = -(q+r).
 */

const SIZE = 1;
const SQRT3 = Math.sqrt(3);

/** Axial hex → pixel position (flat-top) */
function hexToPixel(q, r) {
  const x = SIZE * SQRT3 * (q + r / 2);
  const y = SIZE * (3 / 2) * r;
  return { x, y };
}

/** Pixel → axial hex (nearest) */
function pixelToHex(x, y) {
  const q_frac = (SQRT3 / 3 * x - 1 / 3 * y) / SIZE;
  const r_frac = (2 / 3 * y) / SIZE;
  return axialRound(q_frac, r_frac);
}

/** Round fractional axial to nearest hex */
function axialRound(q_frac, r_frac) {
  const s_frac = -q_frac - r_frac;
  let q = Math.round(q_frac);
  let r = Math.round(r_frac);
  let s = Math.round(s_frac);
  const q_diff = Math.abs(q - q_frac);
  const r_diff = Math.abs(r - r_frac);
  const s_diff = Math.abs(s - s_frac);
  if (q_diff > r_diff && q_diff > s_diff) {
    q = -r - s;
  } else if (r_diff > s_diff) {
    r = -q - s;
  }
  return { q, r };
}

/** 6 axial neighbor directions (flat-top) */
const DIRECTIONS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

/** Get 6 neighbors of a hex */
function getNeighbors(q, r) {
  return DIRECTIONS.map(d => ({ q: q + d.q, r: r + d.r }));
}

/** Manhattan distance between two hexes */
function getDistance(a, b) {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

/** All hexes within radius of center (inclusive) */
function getRange(center, radius) {
  const results = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      results.push({ q: center.q + q, r: center.r + r });
    }
  }
  return results;
}

// ── Seeded PRNG (mulberry32) ──

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ── Simple seeded Perlin noise (2D) ──

function makeNoise2D(rng) {
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const p = [...perm, ...perm];

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + t * (b - a); }
  function grad(hash, x, y) {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }

  return function noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    return lerp(
      lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
      lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
      v
    );
  };
}

// ── Map Generation ──

/**
 * Generate a hex map with terrain.
 * @param {number} rows
 * @param {number} cols
 * @param {number} seed
 * @returns {{ hexes: Map<string, HexData>, startPositions: {q,r}[] }}
 */
function generateMap(rows = 15, cols = 15, seed = 1) {
  const rng = mulberry32(seed);
  const noise = makeNoise2D(rng);
  const hexes = new Map();
  const SCALE = 0.35;

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const q = col - Math.floor(row / 2);
      const r = row;
      const key = `${q},${r}`;

      const n = noise(col * SCALE, row * SCALE);
      const elevation = (n + 1) / 2;

      let terrain;
      if (elevation < 0.25) terrain = 'water';
      else if (elevation > 0.78) terrain = 'mountain';
      else if (elevation > 0.60) terrain = 'forest';
      else terrain = 'plain';

      hexes.set(key, { q, r, terrain, owner: null, defenseBonus: 0 });
    }
  }

  const corners = [
    { col: 2, row: 2 },
    { col: cols - 3, row: 2 },
    { col: 2, row: rows - 3 },
    { col: cols - 3, row: rows - 3 },
  ];

  const startPositions = corners.map(({ col, row }) => {
    const q = col - Math.floor(row / 2);
    const r = row;
    return { q, r };
  });

  for (const pos of startPositions) {
    const nearby = getRange(pos, 2);
    for (const h of nearby) {
      const key = `${h.q},${h.r}`;
      if (hexes.has(key)) {
        hexes.get(key).terrain = 'plain';
      }
    }
  }

  return { hexes, startPositions };
}

module.exports = { hexToPixel, pixelToHex, getNeighbors, getDistance, getRange, axialRound, generateMap, SIZE, SQRT3 };
