import { describe, test, expect, beforeEach } from 'vitest';
import {
  extractSemanticVector,
  extractSemanticVectorFromEmbeddings,
} from '$lib/server/ml/phase17-advanced-features';
import type { Phase17Input } from '$lib/server/ml/phase17-schema';

describe('Phase 17B.2: Semantic Vector Computation', () => {
  describe('extractSemanticVector', () => {
    test('returns undefined for empty cluster cards', async () => {
      const input: Phase17Input = {
        reconciliationResult: {
          aliasId: 'test-1',
          queryHash: 'hash-1',
          sourceRefs: [],
          featureIds: [],
          clusterCards: [],
          packets: [],
          scoreProfile: {
            qdrant: 0.4,
            cluster: 0.35,
            topological: 0.25,
            fusion: 1.0,
          },
        },
        sourceRef: 'src/lib/auth.ts',
        featureId: 'auth.sessions',
        aliasId: 'test-1',
      };

      const vector = await extractSemanticVector(input);
      expect(vector).toBeUndefined();
    });

    test('returns undefined when embeddings not yet wired (Phase 17C)', async () => {
      const input: Phase17Input = {
        reconciliationResult: {
          aliasId: 'test-1',
          queryHash: 'hash-1',
          sourceRefs: ['src/lib/auth.ts'],
          featureIds: ['auth.sessions'],
          clusterCards: [
            {
              centroidId: 'c1',
              sourceRefs: ['src/lib/auth.ts'],
              authorityScore: 0.85,
            },
          ],
          packets: [],
          scoreProfile: {
            qdrant: 0.4,
            cluster: 0.35,
            topological: 0.25,
            fusion: 1.0,
          },
        },
        sourceRef: 'src/lib/auth.ts',
        featureId: 'auth.sessions',
        aliasId: 'test-1',
      };

      const vector = await extractSemanticVector(input);
      expect(vector).toBeUndefined();
    });
  });

  describe('extractSemanticVectorFromEmbeddings', () => {
    test('returns undefined for empty embeddings array', () => {
      const vector = extractSemanticVectorFromEmbeddings([]);
      expect(vector).toBeUndefined();
    });

    test('computes mean of single embedding', () => {
      const embeddings = [[1, 2, 3, 4]];
      const vector = extractSemanticVectorFromEmbeddings(embeddings);

      expect(vector).toBeDefined();
      expect(vector!.length).toBe(4);

      // Mean of single vector is itself, normalized
      const norm = Math.sqrt(1 + 4 + 9 + 16); // sqrt(30)
      expect(vector![0]).toBeCloseTo(1 / norm, 5);
      expect(vector![1]).toBeCloseTo(2 / norm, 5);
      expect(vector![2]).toBeCloseTo(3 / norm, 5);
      expect(vector![3]).toBeCloseTo(4 / norm, 5);
    });

    test('computes mean of multiple embeddings', () => {
      const embeddings = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
      const vector = extractSemanticVectorFromEmbeddings(embeddings);

      expect(vector).toBeDefined();
      expect(vector!.length).toBe(3);

      // Mean: [1/3, 1/3, 1/3]
      // Norm: sqrt(1/9 + 1/9 + 1/9) = sqrt(1/3) = 1/sqrt(3)
      const expectedValue = (1 / 3) / Math.sqrt(1 / 3);
      expect(vector![0]).toBeCloseTo(expectedValue, 5);
      expect(vector![1]).toBeCloseTo(expectedValue, 5);
      expect(vector![2]).toBeCloseTo(expectedValue, 5);
    });

    test('normalizes result to unit length', () => {
      const embeddings = [
        [3, 4],
        [6, 8],
      ];
      const vector = extractSemanticVectorFromEmbeddings(embeddings);

      expect(vector).toBeDefined();

      // Mean: [4.5, 6]
      // Norm: sqrt(20.25 + 36) = sqrt(56.25) = 7.5
      // Normalized: [0.6, 0.8]
      const norm = Math.sqrt(
        vector![0] * vector![0] + vector![1] * vector![1]
      );
      expect(norm).toBeCloseTo(1.0, 5);
    });

    test('handles 768-dimensional vectors', () => {
      const dim = 768;
      const embeddings = [
        new Array(dim).fill(1),
        new Array(dim).fill(2),
      ];
      const vector = extractSemanticVectorFromEmbeddings(embeddings);

      expect(vector).toBeDefined();
      expect(vector!.length).toBe(768);

      // All values should be equal (1.5 mean, normalized)
      const norm = Math.sqrt(
        vector!.reduce((sum, x) => sum + x * x, 0)
      );
      expect(norm).toBeCloseTo(1.0, 5);
    });

    test('returns undefined for mismatched dimensions', () => {
      const embeddings = [
        [1, 2, 3],
        [1, 2], // Wrong dimension
      ];
      const vector = extractSemanticVectorFromEmbeddings(embeddings);
      expect(vector).toBeUndefined();
    });

    test('returns undefined when all embeddings are zero', () => {
      const embeddings = [
        [0, 0, 0],
        [0, 0, 0],
      ];
      const vector = extractSemanticVectorFromEmbeddings(embeddings);
      expect(vector).toBeUndefined(); // Norm is 0, can't normalize
    });

    test('handles negative values in embeddings', () => {
      const embeddings = [
        [-1, 2, -3],
        [1, -2, 3],
      ];
      const vector = extractSemanticVectorFromEmbeddings(embeddings);

      // Mean: [0, 0, 0], norm is 0, so undefined is correct
      expect(vector).toBeUndefined();
    });

    test('preserves relative magnitudes after normalization', () => {
      const embeddings = [
        [1, 1, 1],
        [1, 1, 1],
      ];
      const vector = extractSemanticVectorFromEmbeddings(embeddings);

      expect(vector).toBeDefined();

      // All components equal after normalization
      expect(vector![0]).toBeCloseTo(vector![1], 5);
      expect(vector![1]).toBeCloseTo(vector![2], 5);

      // Verify unit norm
      const norm = Math.sqrt(
        vector!.reduce((sum, x) => sum + x * x, 0)
      );
      expect(norm).toBeCloseTo(1.0, 5);
    });

    test('handles large embedding values', () => {
      const embeddings = [
        [1000, 2000, 3000],
        [4000, 5000, 6000],
      ];
      const vector = extractSemanticVectorFromEmbeddings(embeddings);

      expect(vector).toBeDefined();
      expect(vector!.length).toBe(3);

      // Verify unit norm despite large input values
      const norm = Math.sqrt(
        vector!.reduce((sum, x) => sum + x * x, 0)
      );
      expect(norm).toBeCloseTo(1.0, 5);
    });

    test('handles small embedding values', () => {
      const embeddings = [
        [0.001, 0.002, 0.003],
        [0.0001, 0.0002, 0.0003],
      ];
      const vector = extractSemanticVectorFromEmbeddings(embeddings);

      expect(vector).toBeDefined();
      expect(vector!.length).toBe(3);

      // Verify unit norm despite small input values
      const norm = Math.sqrt(
        vector!.reduce((sum, x) => sum + x * x, 0)
      );
      expect(norm).toBeCloseTo(1.0, 5);
    });

    test('many embeddings converge to stable mean', () => {
      // Create 100 random-like embeddings
      const embeddings = Array.from({ length: 100 }, (_, i) => [
        Math.sin(i),
        Math.cos(i),
        Math.sin(i * 2),
      ]);
      const vector = extractSemanticVectorFromEmbeddings(embeddings);

      expect(vector).toBeDefined();
      expect(vector!.length).toBe(3);

      // Verify unit norm
      const norm = Math.sqrt(
        vector!.reduce((sum, x) => sum + x * x, 0)
      );
      expect(norm).toBeCloseTo(1.0, 5);
    });

    test('orthogonal vectors average to near-zero norm case', () => {
      // Orthogonal unit vectors
      const embeddings = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
        [-1, 0, 0], // Cancels first
        [0, -1, 0], // Cancels second
        [0, 0, -1], // Cancels third
      ];
      const vector = extractSemanticVectorFromEmbeddings(embeddings);

      // Mean is approximately [0, 0, 0], so norm ~= 0
      expect(vector).toBeUndefined();
    });
  });
});
