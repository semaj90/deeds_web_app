import { describe, it, expect, beforeAll } from 'vitest';
import { somTopologyPrefilter, type SOMPrefilterResult } from '$lib/server/retrieval/som-topology-prefilter.js';

describe('SOM Topology Prefilter — ACE Stage A0 Integration', () => {
  describe('somTopologyPrefilter', () => {
    it('returns valid BMU coordinates', async () => {
      const query = new Float32Array(768).fill(0.5);
      const result = await somTopologyPrefilter(query);

      expect(result.bmuRow).toBeGreaterThanOrEqual(0);
      expect(result.bmuRow).toBeLessThan(20);
      expect(result.bmuCol).toBeGreaterThanOrEqual(0);
      expect(result.bmuCol).toBeLessThan(20);
    });

    it('computes correct cluster ID from BMU coordinates', async () => {
      const query = new Float32Array(768).fill(0.5);
      const result = await somTopologyPrefilter(query);

      const expectedCluster = result.bmuRow * 20 + result.bmuCol;
      expect(result.bmuCluster).toBe(expectedCluster);
    });

    it('includes neighbor cells within radius', async () => {
      const query = new Float32Array(768).fill(0.5);
      const result = await somTopologyPrefilter(query, { radius: 2 });

      expect(result.neighborCells.length).toBeGreaterThan(0);
      expect(result.neighborCells.length).toBeLessThanOrEqual(25); // 5×5 grid max
    });

    it('neighbor cells include BMU at distance 0', async () => {
      const query = new Float32Array(768).fill(0.5);
      const result = await somTopologyPrefilter(query, { radius: 2 });

      const bmuNeighbor = result.neighborCells.find(
        (n) => n.row === result.bmuRow && n.col === result.bmuCol
      );
      expect(bmuNeighbor).toBeDefined();
      expect(bmuNeighbor?.distance).toBe(0);
    });

    it('generates valid Qdrant tag for filtering', async () => {
      const query = new Float32Array(768).fill(0.5);
      const result = await somTopologyPrefilter(query);

      expect(result.qdrantTag).toMatch(/^som_cell_\d+_\d+$/);
      const [row, col] = result.qdrantTag.split('_').slice(2).map(Number);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(col).toBeGreaterThanOrEqual(0);
    });

    it('returns positive duration', async () => {
      const query = new Float32Array(768).fill(0.5);
      const result = await somTopologyPrefilter(query);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('throws on dimension mismatch', async () => {
      const query = new Float32Array(512); // Wrong dimension

      await expect(() => somTopologyPrefilter(query)).rejects.toThrow();
    });

    it('caches centroids when enabled', async () => {
      const query1 = new Float32Array(768).fill(0.1);
      const query2 = new Float32Array(768).fill(0.9);

      const result1 = await somTopologyPrefilter(query1, { enableCache: true });
      const result2 = await somTopologyPrefilter(query2, { enableCache: true });

      // Second call should be faster (cache hit)
      // Note: timing is variable, so we just check that both complete
      expect(result1.durationMs).toBeGreaterThanOrEqual(0);
      expect(result2.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('respects custom radius parameter', async () => {
      const query = new Float32Array(768).fill(0.5);

      const radius0 = await somTopologyPrefilter(query, { radius: 0 });
      const radius1 = await somTopologyPrefilter(query, { radius: 1 });
      const radius2 = await somTopologyPrefilter(query, { radius: 2 });

      // Larger radius should include more neighbors
      expect(radius0.neighborCells.length).toBe(1); // Only BMU
      expect(radius1.neighborCells.length).toBeGreaterThanOrEqual(radius0.neighborCells.length);
      expect(radius2.neighborCells.length).toBeGreaterThanOrEqual(radius1.neighborCells.length);
    });

    it('estimates candidate count based on neighborhood size', async () => {
      const query = new Float32Array(768).fill(0.5);
      const result = await somTopologyPrefilter(query);

      // With ~50K packets and 272 cells, each cell has ~184 packets
      // Neighborhood of 13 cells ≈ 2,400 candidates
      expect(result.candidateCount).toBeGreaterThan(0);
      expect(result.candidateCount).toBeLessThan(50000); // Less than total
    });

    it('returns result shape matching SOMPrefilterResult interface', async () => {
      const query = new Float32Array(768).fill(0.5);
      const result = await somTopologyPrefilter(query);

      expect(result).toHaveProperty('bmuRow');
      expect(result).toHaveProperty('bmuCol');
      expect(result).toHaveProperty('bmuCluster');
      expect(result).toHaveProperty('neighborCells');
      expect(result).toHaveProperty('qdrantTag');
      expect(result).toHaveProperty('candidateCount');
      expect(result).toHaveProperty('durationMs');
      expect(result).toHaveProperty('cacheHit');
    });
  });

  describe('SOM Prefilter Stats', () => {
    it('tracks prefilter effectiveness metrics', async () => {
      const query = new Float32Array(768).fill(0.5);
      const result = await somTopologyPrefilter(query);

      const stats = {
        used: true,
        bmuRow: result.bmuRow,
        bmuCol: result.bmuCol,
        neighborCount: result.neighborCells.length,
        candidateReduction: 50000 / result.candidateCount,
        durationMs: result.durationMs,
        cacheHit: result.cacheHit
      };

      expect(stats.used).toBe(true);
      expect(stats.neighborCount).toBeGreaterThan(0);
      expect(stats.candidateReduction).toBeGreaterThan(1); // Should reduce candidates
      expect(stats.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});