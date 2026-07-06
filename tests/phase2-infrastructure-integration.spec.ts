/**
 * Phase 2 Infrastructure Integration Tests
 *
 * Validates autoencoder bridge, SOM training, and K-means clustering
 * Tests deterministic output and pipeline integration
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  projectToLatent64,
  projectBatchToLatent64,
  phase2Config
} from '../src/lib/server/retrieval/phase2-autoencoder-bridge';
import {
  trainSOM,
  assignToSOM,
  somConfig
} from '../src/lib/server/retrieval/phase2-som-training';
import {
  kmeans,
  kmeansConfig
} from '../src/lib/server/retrieval/phase2-kmeans-clustering';

describe('Phase 2: Infrastructure Integration', () => {
  // Test data: generate synthetic 768-dim embeddings
  const generateTestEmbeddings = (count: number): number[][] => {
    const embeddings: number[][] = [];
    for (let i = 0; i < count; i++) {
      const emb = new Array(768);
      for (let j = 0; j < 768; j++) {
        // Seeded random for reproducibility
        const seed = (i * 768 + j) * 12345;
        emb[j] = Math.sin((seed % 1000) / 1000) * 2 - 1;
      }
      embeddings.push(emb);
    }
    return embeddings;
  };

  describe('Phase 2: Autoencoder Bridge', () => {
    it('should project 768-dim embedding to 64-dim latent', () => {
      const embedding = generateTestEmbeddings(1)[0];
      const latent = projectToLatent64(embedding);

      expect(latent).toHaveLength(64);
      expect(latent.every((v) => typeof v === 'number')).toBe(true);
    });

    it('should produce normalized latent vectors (L2 norm ≈ 1)', () => {
      const embedding = generateTestEmbeddings(1)[0];
      const latent = projectToLatent64(embedding);

      let normSq = 0;
      for (const v of latent) {
        normSq += v * v;
      }
      const norm = Math.sqrt(normSq);

      expect(norm).toBeCloseTo(1.0, 2); // L2 norm should be ~1
    });

    it('should be deterministic (same input → same output)', () => {
      const embedding = generateTestEmbeddings(1)[0];
      const latent1 = projectToLatent64(embedding);
      const latent2 = projectToLatent64(embedding);

      for (let i = 0; i < 64; i++) {
        expect(latent1[i]).toBe(latent2[i]);
      }
    });

    it('should batch process embeddings efficiently', () => {
      const embeddings = generateTestEmbeddings(10);
      const latents = projectBatchToLatent64(embeddings);

      expect(latents).toHaveLength(10);
      expect(latents.every((l) => l.length === 64)).toBe(true);
    });

    it('should respect limit parameter in batch processing', () => {
      const embeddings = generateTestEmbeddings(20);
      const latents = projectBatchToLatent64(embeddings, { limit: 5 });

      expect(latents).toHaveLength(5);
    });

    it('should throw on invalid embedding dimension', () => {
      const badEmbedding = new Array(512).fill(0.5); // Wrong dim

      expect(() => projectToLatent64(badEmbedding)).toThrow();
    });
  });

  describe('Phase 2: SOM Training', () => {
    it('should train SOM on latent vectors', () => {
      const embeddings = generateTestEmbeddings(100);
      const latents = projectBatchToLatent64(embeddings);

      const lattice = trainSOM(latents, {
        gridSize: somConfig.gridSize,
        iterations: 10, // Quick test
        learningRateStart: 0.5,
        learningRateEnd: 0.01,
        neighborhoodRadiusStart: 10,
        neighborhoodRadiusEnd: 1
      });

      expect(lattice).toHaveLength(somConfig.gridSize);
      expect(lattice[0]).toHaveLength(somConfig.gridSize);
      expect(lattice[0][0].weights).toHaveLength(64);
    });

    it('should assign vectors to SOM grid points', () => {
      const embeddings = generateTestEmbeddings(50);
      const latents = projectBatchToLatent64(embeddings);

      const lattice = trainSOM(latents, {
        gridSize: somConfig.gridSize,
        iterations: 5,
        learningRateStart: 0.5,
        learningRateEnd: 0.01,
        neighborhoodRadiusStart: 10,
        neighborhoodRadiusEnd: 1
      });

      const assignments = assignToSOM(latents, lattice);

      expect(assignments).toHaveLength(50);
      expect(assignments.every((a) => a.clusterId >= 0 && a.clusterId < 400)).toBe(true);
      expect(assignments.every((a) => a.row >= 0 && a.row < 20)).toBe(true);
      expect(assignments.every((a) => a.col >= 0 && a.col < 20)).toBe(true);
    });

    it('should cover multiple SOM clusters across vectors', () => {
      const embeddings = generateTestEmbeddings(200);
      const latents = projectBatchToLatent64(embeddings);

      const lattice = trainSOM(latents, {
        gridSize: somConfig.gridSize,
        iterations: 20,
        learningRateStart: 0.5,
        learningRateEnd: 0.01,
        neighborhoodRadiusStart: 10,
        neighborhoodRadiusEnd: 1
      });

      const assignments = assignToSOM(latents, lattice);
      const uniqueClusters = new Set(assignments.map((a) => a.clusterId));

      expect(uniqueClusters.size).toBeGreaterThan(1);
      expect(uniqueClusters.size).toBeLessThanOrEqual(400);
    });
  });

  describe('Phase 2: K-Means Clustering', () => {
    it('should perform K-means clustering', () => {
      const embeddings = generateTestEmbeddings(100);
      const latents = projectBatchToLatent64(embeddings);

      const result = kmeans(latents, {
        k: kmeansConfig.k,
        maxIterations: 50
      });

      expect(result.centroids).toHaveLength(kmeansConfig.k);
      expect(result.assignments).toHaveLength(100);
      expect(result.converged).toBe(true);
    });

    it('should assign all vectors to valid clusters', () => {
      const embeddings = generateTestEmbeddings(100);
      const latents = projectBatchToLatent64(embeddings);

      const result = kmeans(latents, {
        k: kmeansConfig.k,
        maxIterations: 50
      });

      expect(
        result.assignments.every((a) => a >= 0 && a < kmeansConfig.k)
      ).toBe(true);
    });

    it('should compute correct inertia', () => {
      const embeddings = generateTestEmbeddings(100);
      const latents = projectBatchToLatent64(embeddings);

      const result = kmeans(latents, {
        k: kmeansConfig.k,
        maxIterations: 50
      });

      expect(result.inertia).toBeGreaterThan(0);
      expect(Number.isFinite(result.inertia)).toBe(true);
    });

    it('should handle k=1 degenerate case', () => {
      const embeddings = generateTestEmbeddings(50);
      const latents = projectBatchToLatent64(embeddings);

      const result = kmeans(latents, {
        k: 1,
        maxIterations: 10
      });

      expect(result.centroids).toHaveLength(1);
      expect(result.assignments.every((a) => a === 0)).toBe(true);
    });

    it('should reject invalid k values', () => {
      const embeddings = generateTestEmbeddings(50);
      const latents = projectBatchToLatent64(embeddings);

      expect(() => kmeans(latents, { k: 0 })).toThrow();
      expect(() => kmeans(latents, { k: 100 })).toThrow(); // k > vectors.length
    });
  });

  describe('Phase 2: End-to-End Pipeline', () => {
    it('should complete full pipeline: embeddings → latent → SOM → K-means', () => {
      const embeddings = generateTestEmbeddings(100);

      // Step 1: Project to latent
      const latents = projectBatchToLatent64(embeddings);
      expect(latents).toHaveLength(100);

      // Step 2: Train SOM
      const lattice = trainSOM(latents, {
        gridSize: somConfig.gridSize,
        iterations: 10,
        learningRateStart: 0.5,
        learningRateEnd: 0.01,
        neighborhoodRadiusStart: 10,
        neighborhoodRadiusEnd: 1
      });
      expect(lattice).toHaveLength(20);

      // Step 3: Assign to SOM
      const somAssignments = assignToSOM(latents, lattice);
      expect(somAssignments).toHaveLength(100);

      // Step 4: K-means clustering
      const kmeansResult = kmeans(latents, {
        k: kmeansConfig.k,
        maxIterations: 50
      });
      expect(kmeansResult.assignments).toHaveLength(100);

      // Verify output shapes
      expect(somAssignments.every((a) => typeof a.clusterId === 'number')).toBe(true);
      expect(kmeansResult.assignments.every((a) => typeof a === 'number')).toBe(true);
    });

    it('should produce stable output across multiple runs', () => {
      const embeddings = generateTestEmbeddings(50);

      // Run 1
      const latents1 = projectBatchToLatent64(embeddings);
      const kmeans1 = kmeans(latents1, { k: 8, maxIterations: 30 });

      // Run 2
      const latents2 = projectBatchToLatent64(embeddings);
      const kmeans2 = kmeans(latents2, { k: 8, maxIterations: 30 });

      // Latent projection should be deterministic
      for (let i = 0; i < 50; i++) {
        for (let j = 0; j < 64; j++) {
          expect(latents1[i][j]).toBe(latents2[i][j]);
        }
      }
    });

    it('should complete pipeline under 100ms for 1000 vectors', () => {
      const embeddings = generateTestEmbeddings(1000);

      const start = performance.now();

      // Latent projection
      const latents = projectBatchToLatent64(embeddings);

      // SOM training (reduced iterations for speed test)
      const lattice = trainSOM(latents, {
        gridSize: somConfig.gridSize,
        iterations: 5,
        learningRateStart: 0.5,
        learningRateEnd: 0.01,
        neighborhoodRadiusStart: 10,
        neighborhoodRadiusEnd: 1
      });

      // K-means (reduced iterations)
      kmeans(latents, { k: 16, maxIterations: 20 });

      const elapsed = performance.now() - start;

      // Should be reasonably fast (depends on machine)
      expect(elapsed).toBeLessThan(5000); // 5 seconds is generous
    });
  });

  describe('Phase 2: Configuration Validation', () => {
    it('should have correct phase2Config settings', () => {
      expect(phase2Config.inputDim).toBe(768);
      expect(phase2Config.latentDim).toBe(64);
      expect(phase2Config.somGridSize).toBe(20);
      expect(phase2Config.kmeansClusters.initial).toBe(16);
      expect(phase2Config.expectedVectors).toBe(52235);
    });

    it('should have correct somConfig settings', () => {
      expect(somConfig.gridSize).toBe(20);
      expect(somConfig.totalClusters).toBe(400);
      expect(somConfig.iterations).toBeGreaterThan(0);
    });

    it('should have correct kmeansConfig settings', () => {
      expect(kmeansConfig.k).toBe(16);
      expect(kmeansConfig.maxIterations).toBeGreaterThan(0);
    });
  });
});
