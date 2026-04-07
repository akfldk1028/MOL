/**
 * @jest-environment node
 */
const HexGrid = require('../HexGrid');

describe('HexGrid', () => {
  describe('hexToPixel', () => {
    test('origin hex returns origin pixel', () => {
      const { x, y } = HexGrid.hexToPixel(0, 0);
      expect(x).toBe(0);
      expect(y).toBe(0);
    });

    test('adjacent hex returns correct offset', () => {
      const { x, y } = HexGrid.hexToPixel(1, 0);
      expect(x).toBeCloseTo(Math.sqrt(3), 5);
      expect(y).toBe(0);
    });
  });

  describe('pixelToHex', () => {
    test('round-trips with hexToPixel', () => {
      const testCases = [[0,0], [1,0], [0,1], [3,4], [-2,5]];
      for (const [q, r] of testCases) {
        const { x, y } = HexGrid.hexToPixel(q, r);
        const result = HexGrid.pixelToHex(x, y);
        expect(result.q).toBe(q);
        expect(result.r).toBe(r);
      }
    });
  });

  describe('getNeighbors', () => {
    test('returns 6 neighbors', () => {
      const neighbors = HexGrid.getNeighbors(3, 3);
      expect(neighbors).toHaveLength(6);
    });

    test('neighbors are at distance 1', () => {
      const neighbors = HexGrid.getNeighbors(3, 3);
      for (const n of neighbors) {
        expect(HexGrid.getDistance({ q: 3, r: 3 }, n)).toBe(1);
      }
    });
  });

  describe('getDistance', () => {
    test('same hex is distance 0', () => {
      expect(HexGrid.getDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
    });

    test('adjacent hexes are distance 1', () => {
      expect(HexGrid.getDistance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
    });

    test('distant hexes calculate correctly', () => {
      expect(HexGrid.getDistance({ q: 0, r: 0 }, { q: 3, r: 3 })).toBe(6);
    });
  });

  describe('getRange', () => {
    test('range 0 returns only center', () => {
      const hexes = HexGrid.getRange({ q: 0, r: 0 }, 0);
      expect(hexes).toHaveLength(1);
    });

    test('range 1 returns 7 hexes (center + 6)', () => {
      const hexes = HexGrid.getRange({ q: 0, r: 0 }, 1);
      expect(hexes).toHaveLength(7);
    });

    test('range 2 returns 19 hexes', () => {
      const hexes = HexGrid.getRange({ q: 0, r: 0 }, 2);
      expect(hexes).toHaveLength(19);
    });
  });

  describe('generateMap', () => {
    test('generates exactly 225 hexes for 15x15', () => {
      const map = HexGrid.generateMap(15, 15, 42);
      expect(map.hexes.size).toBe(225);
    });

    test('returns 4 start positions', () => {
      const map = HexGrid.generateMap(15, 15, 42);
      expect(map.startPositions).toHaveLength(4);
    });

    test('start positions are far apart', () => {
      const map = HexGrid.generateMap(15, 15, 42);
      const [a, b, c, d] = map.startPositions;
      const dists = [
        HexGrid.getDistance(a, b), HexGrid.getDistance(a, c), HexGrid.getDistance(a, d),
        HexGrid.getDistance(b, c), HexGrid.getDistance(b, d), HexGrid.getDistance(c, d),
      ];
      for (const dist of dists) {
        expect(dist).toBeGreaterThan(5);
      }
    });

    test('start positions have plain terrain around them', () => {
      const map = HexGrid.generateMap(15, 15, 42);
      for (const pos of map.startPositions) {
        const hex = map.hexes.get(`${pos.q},${pos.r}`);
        expect(hex.terrain).toBe('plain');
        const neighbors = HexGrid.getNeighbors(pos.q, pos.r);
        for (const n of neighbors) {
          const nHex = map.hexes.get(`${n.q},${n.r}`);
          if (nHex) expect(nHex.terrain).toBe('plain');
        }
      }
    });

    test('terrain distribution is roughly correct', () => {
      // Try multiple seeds to find one with varied terrain
      let found = false;
      for (const seed of [42, 100, 999, 7777, 12345]) {
        const map = HexGrid.generateMap(15, 15, seed);
        const terrains = { plain: 0, forest: 0, mountain: 0, water: 0 };
        for (const hex of map.hexes.values()) {
          terrains[hex.terrain]++;
        }
        const total = map.hexes.size;
        if (terrains.plain / total > 0.45 && (terrains.mountain + terrains.water) > 0) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    test('same seed produces same map', () => {
      const map1 = HexGrid.generateMap(15, 15, 42);
      const map2 = HexGrid.generateMap(15, 15, 42);
      expect(map1.hexes.size).toBe(map2.hexes.size);
      for (const [key, hex1] of map1.hexes) {
        const hex2 = map2.hexes.get(key);
        expect(hex2.terrain).toBe(hex1.terrain);
      }
    });

    test('each hex has required fields', () => {
      const map = HexGrid.generateMap(15, 15, 42);
      for (const hex of map.hexes.values()) {
        expect(hex).toHaveProperty('q');
        expect(hex).toHaveProperty('r');
        expect(hex).toHaveProperty('terrain');
        expect(hex).toHaveProperty('owner');
        expect(hex).toHaveProperty('defenseBonus');
        expect(hex.owner).toBeNull();
        expect(hex.defenseBonus).toBe(0);
      }
    });
  });
});
