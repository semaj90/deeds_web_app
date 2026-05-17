// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const mockRedisHkeys = vi.fn();
const mockRedisHmget = vi.fn();

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    hkeys: mockRedisHkeys,
    hmget: mockRedisHmget,
  }),
}));

const mockQdrantScroll = vi.fn();
vi.mock('$lib/server/vector/qdrant-manager.js', () => {
  return {
    QdrantManager: class {
      client = {
        scroll: mockQdrantScroll,
      };
    },
  };
});

const mockReadLatestQdrantClusterTags = vi.fn();
vi.mock('./cluster-tags-cache.js', () => ({
  readLatestQdrantClusterTags: mockReadLatestQdrantClusterTags,
}));

describe('rg-cluster-pivot — Centroid Similarity Expansion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('loadAutoencoderCentroids', () => {
    it('defensively parses multiple centroid formats correctly', async () => {
      mockRedisHkeys.mockResolvedValue([
        'centroid_cluster_12',
        'centroid_cluster_34',
        'centroid_cluster_56',
        'centroid_cluster_invalid',
      ]);

      const csvCentroid = Array.from({ length: 64 }, (_, i) => i * 0.01).join(',');
      const jsonArrayCentroid = JSON.stringify(Array.from({ length: 64 }, (_, i) => i * 0.02));
      const jsonObjectCentroid = JSON.stringify({
        vector: Array.from({ length: 64 }, (_, i) => i * 0.03),
      });

      mockRedisHmget.mockResolvedValue([
        csvCentroid,
        jsonArrayCentroid,
        jsonObjectCentroid,
        'malformed_data_here',
      ]);

      const { loadAutoencoderCentroids } = await import('$lib/server/ace/rg-cluster-pivot.js');
      const redis = {
        hkeys: mockRedisHkeys,
        hmget: mockRedisHmget,
      };

      const centroids = await loadAutoencoderCentroids(redis);

      expect(centroids.size).toBe(3);
      expect(centroids.get(12)).toHaveLength(64);
      expect(centroids.get(12)![1]).toBeCloseTo(0.01);
      expect(centroids.get(34)![1]).toBeCloseTo(0.02);
      expect(centroids.get(56)![1]).toBeCloseTo(0.03);
      expect(centroids.get(999)).toBeUndefined();
    });

    it('returns empty map when Redis throws or is empty', async () => {
      mockRedisHkeys.mockRejectedValue(new Error('Redis Down'));
      const { loadAutoencoderCentroids } = await import('$lib/server/ace/rg-cluster-pivot.js');
      const centroids = await loadAutoencoderCentroids({
        hkeys: mockRedisHkeys,
        hmget: mockRedisHmget,
      });
      expect(centroids.size).toBe(0);
    });
  });

  describe('clusterPivot', () => {
    it('returns empty result immediately for empty fastAstFilePaths', async () => {
      const { clusterPivot } = await import('$lib/server/ace/rg-cluster-pivot.js');
      const result = await clusterPivot([], new Set());
      expect(result.hits).toHaveLength(0);
      expect(result.pivotClusters).toHaveLength(0);
      expect(result.anchoredFiles).toBe(0);
    });

    it('performs full expansion using pre-computed centroids', async () => {
      // 1. Mock cluster membership retrieval
      mockQdrantScroll.mockImplementation(async (collection: string, options: any) => {
        if (options.filter?.must?.[0]?.key === 'file_path') {
          // getClusterMembership scroll
          return {
            points: [
              {
                payload: {
                  file_path: 'src/lib/auth.ts',
                  som_cluster: 5,
                  topoClass: 'security',
                },
              },
            ],
          };
        } else if (options.filter?.must?.[0]?.key === 'som_cluster') {
          // expandClusters scroll
          return {
            points: [
              {
                payload: {
                  file_path: 'src/lib/oauth.ts',
                  som_cluster: 5,
                  topoClass: 'security',
                  tags: ['oauth', 'auth'],
                  summary: 'OAuth flows integration',
                },
              },
              {
                payload: {
                  file_path: 'src/lib/session.ts',
                  som_cluster: 8,
                  topoClass: 'security',
                  tags: ['session', 'cookie'],
                  summary: 'Session management and validation',
                },
              },
            ],
          };
        }
        return { points: [] };
      });

      // 2. Mock Redis centroids and Karpathy scores
      mockRedisHkeys.mockResolvedValue(['centroid_cluster_5', 'centroid_cluster_8']);
      
      const v5 = Array.from({ length: 64 }, () => 0.1);
      const v8 = Array.from({ length: 64 }, () => 0.11); // very high cosine similarity to v5
      mockRedisHmget.mockImplementation(async (key: string, ...fields: string[]) => {
        if (key === 'gpu:autoencoder:centroids_64') {
          return [v5.join(','), v8.join(',')];
        }
        if (key === 'gpu:karpathy:scores') {
          return [JSON.stringify({ blend: 0.8 }), JSON.stringify({ blend: 0.9 })];
        }
        return fields.map(() => null);
      });

      mockReadLatestQdrantClusterTags.mockReturnValue([
        { clusterKey: 'cluster:gpu:5', topFiles: ['src/lib/auth.ts'] },
        { clusterKey: 'cluster:gpu:8', topFiles: ['src/lib/session.ts'] },
      ]);

      const { clusterPivot } = await import('$lib/server/ace/rg-cluster-pivot.js');
      const result = await clusterPivot(['src/lib/auth.ts'], new Set(['src/lib/auth.ts']));

      expect(result.anchoredFiles).toBe(1);
      expect(result.pivotClusters).toContain('cluster:gpu:5');
      expect(result.pivotClusters).toContain('cluster:gpu:8');
      expect(result.hits.length).toBeGreaterThan(0);

      const hit = result.hits.find((h) => h.filePath === 'src/lib/oauth.ts');
      expect(hit).toBeDefined();
      expect(hit!.score).toBeGreaterThanOrEqual(0.07);
      expect(hit!.score).toBeLessThanOrEqual(0.12);
      expect(hit!.metadata.retrievalLane).toBe('rg_cluster_pivot');
      expect(hit!.metadata.som_cluster).toBe(5);
    });

    it('falls back gracefully to dynamic dynamic centroid calculation when Redis has no precomputed centroids', async () => {
      // 1. Mock cluster membership
      mockQdrantScroll.mockImplementation(async (collection: string, options: any) => {
        if (options.filter?.must?.[0]?.key === 'file_path') {
          return {
            points: [{ payload: { file_path: 'src/lib/db.ts', som_cluster: 20 } }],
          };
        }
        return { points: [] };
      });

      // 2. Redis precomputed centroids are empty
      mockRedisHkeys.mockResolvedValue([]);
      
      // Redis fallback: load file-level 64d vectors
      mockRedisHmget.mockImplementation(async (key: string, ...fields: string[]) => {
        if (key === 'gpu:karpathy:encoded') {
          // Return valid 64d vectors for dynamic mean calculation
          return fields.map(() => Array.from({ length: 64 }, () => 0.25).join(','));
        }
        return fields.map(() => null);
      });

      mockReadLatestQdrantClusterTags.mockReturnValue([
        { clusterKey: 'cluster:gpu:20', topFiles: ['src/lib/db.ts'] },
      ]);

      const { clusterPivot } = await import('$lib/server/ace/rg-cluster-pivot.js');
      const result = await clusterPivot(['src/lib/db.ts'], new Set());

      expect(result.anchoredFiles).toBe(1);
      expect(result.pivotClusters).toContain('cluster:gpu:20');
    });
  });
});
