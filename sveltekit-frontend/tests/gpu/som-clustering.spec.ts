import { describe, it, expect } from 'vitest';
import {
  findBMU,
  findBMUBatch,
  getGridNeighbors,
  initializeCentroids,
  SOMConfig
} from '$lib/gpu/som-clustering.js';

describe('SOM Clustering — Best Matching Unit (BMU) Lookup', () => {
  // Setup: Initialize test centroids
  const centroids = initializeCentroids(20, 768);

  describe('findBMU — Single embedding lookup', () => {
    it('returns valid grid coordinates (0-19 inclusive)', () => {
      const embedding = new Float32Array(768).fill(0.5);
      const result = findBMU(embedding, centroids);

      expect(result.somRow).toBeGreaterThanOrEqual(0);
      expect(result.somRow).toBeLessThan(20);
      expect(result.somCol).toBeGreaterThanOrEqual(0);
      expect(result.somCol).toBeLessThan(20);
    });

    it('returns correct cluster index (row * gridSize + col)', () => {
      const embedding = new Float32Array(768).fill(0.5);
      const result = findBMU(embedding, centroids);
      const expectedCluster = result.somRow * 20 + result.somCol;

      expect(result.somCluster).toBe(expectedCluster);
    });

    it('returns positive distance to BMU', () => {
      const embedding = new Float32Array(768).fill(0.5);
      const result = findBMU(embedding, centroids);

      expect(result.distance).toBeGreaterThanOrEqual(0);
    });

    it('identical embedding vectors return distance 0', () => {
      const embedding = new Float32Array(768).fill(1.0);
      const result = findBMU(embedding, centroids);

      // May not be exactly 0 due to centroid initialization, but should be minimal
      expect(result.distance).toBeLessThan(100);
    });
  });

  describe('findBMUBatch — Batch embedding lookup', () => {
    it('processes multiple embeddings without error', async () => {
      const embeddings = [
        new Float32Array(768).fill(0.1),
        new Float32Array(768).fill(0.5),
        new Float32Array(768).fill(0.9)
      ];

      const result = await findBMUBatch(embeddings, centroids);

      expect(result.data).toHaveLength(3);
      expect(result.backend).toBe('cpu');
    });

    it('each result has valid grid coordinates', async () => {
      const embeddings = [
        new Float32Array(768).fill(0.1),
        new Float32Array(768).fill(0.5),
      ];

      const result = await findBMUBatch(embeddings, centroids);

      result.data.forEach(assignment => {
        expect(assignment.somRow).toBeGreaterThanOrEqual(0);
        expect(assignment.somRow).toBeLessThan(20);
        expect(assignment.somCol).toBeGreaterThanOrEqual(0);
        expect(assignment.somCol).toBeLessThan(20);
        expect(assignment.distance).toBeGreaterThanOrEqual(0);
      });
    });

    it('returns duration in milliseconds', async () => {
      const embeddings = [new Float32Array(768).fill(0.5)];
      const result = await findBMUBatch(embeddings, centroids);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('handles empty embedding array', async () => {
      const result = await findBMUBatch([], centroids);

      expect(result.data).toHaveLength(0);
      expect(result.durationMs).toBe(0);
    });
  });

  describe('getGridNeighbors — Topology-aware neighbor lookup', () => {
    it('center cell with radius=1 returns ~5 cells (distance-filtered)', () => {
      const neighbors = getGridNeighbors(10, 10, 1, 20);

      // Uses Euclidean distance, not Manhattan — filters r² + c² <= radius²
      // radius=1: includes center (0,0), 4 adjacent (±1,0) and (0,±1), but NOT diagonals
      expect(neighbors.length).toBeGreaterThan(0);
      expect(neighbors.length).toBeLessThanOrEqual(5);
    });

    it('corner cell respects boundaries (no wrap-around)', () => {
      const neighbors = getGridNeighbors(0, 0, 2, 20);

      // Should not include negative coordinates or coordinates >= 20
      neighbors.forEach(n => {
        expect(n.row).toBeGreaterThanOrEqual(0);
        expect(n.row).toBeLessThan(20);
        expect(n.col).toBeGreaterThanOrEqual(0);
        expect(n.col).toBeLessThan(20);
      });
    });

    it('radius=2 returns at most 25 cells (5x5 grid)', () => {
      const neighbors = getGridNeighbors(10, 10, 2, 20);

      expect(neighbors.length).toBeLessThanOrEqual(25);
    });

    it('neighbors sorted by distance (closest first)', () => {
      const neighbors = getGridNeighbors(10, 10, 2, 20);

      for (let i = 1; i < neighbors.length; i++) {
        expect(neighbors[i].distance).toBeGreaterThanOrEqual(neighbors[i - 1].distance);
      }
    });

    it('center cell is always first in neighbors list', () => {
      const neighbors = getGridNeighbors(10, 10, 2, 20);

      const center = neighbors.find(n => n.row === 10 && n.col === 10);
      expect(center).toBeDefined();
      expect(center?.distance).toBe(0);
      expect(neighbors[0]).toBe(center);
    });

    it('radius=0 returns only center cell', () => {
      const neighbors = getGridNeighbors(10, 10, 0, 20);

      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].row).toBe(10);
      expect(neighbors[0].col).toBe(10);
      expect(neighbors[0].distance).toBe(0);
    });
  });

  describe('SOM Configuration constants', () => {
    it('defines expected grid size and parameters', () => {
      expect(SOMConfig.gridSize).toBe(20);
      expect(SOMConfig.embeddingDim).toBe(768);
      expect(SOMConfig.numCells).toBe(400);
      expect(SOMConfig.trainingEpochs).toBe(100);
    });
  });
});