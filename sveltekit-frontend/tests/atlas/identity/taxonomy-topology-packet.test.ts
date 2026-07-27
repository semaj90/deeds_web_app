// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPoolQuery, mockWriteAcePacket, mockRedisHgetall } = vi.hoisted(() => ({
  mockPoolQuery: vi.fn(),
  mockWriteAcePacket: vi.fn(),
  mockRedisHgetall: vi.fn(),
}));

vi.mock('$lib/server/db/client.js', () => ({
  pool: {
    query: mockPoolQuery,
  },
}));

vi.mock('$lib/server/ace/ace-packet-store.js', () => ({
  writeAcePacket: mockWriteAcePacket,
  makeQueryHash: (query: string) => `hash:${query}`,
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    hgetall: mockRedisHgetall,
  }),
}));

describe('buildTaxonomyTopologyPacket', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [
          {
            node_key: 'topo:retrieval',
            level: 1,
            parent_key: 'root',
            display_name: 'Retrieval',
            member_count: 42,
            metadata: {
              som_cluster: '3:4',
              kmeans_cluster: 7,
              domain_class: 'retrieval',
              naive_bayes_confidence: 0.82,
              ontology_tags: ['retrieval', 'hypergraph', 'qdrant'],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { node_key: 'root', level: 0, parent_key: null, display_name: 'Root' },
          { node_key: 'topo:retrieval', level: 1, parent_key: 'root', display_name: 'Retrieval' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            node_key: 'byte:retrieval:12',
            level: 2,
            parent_key: 'topo:retrieval',
            display_name: 'Retrieval Byte 12',
            member_count: 10,
            metadata: {},
          },
          {
            node_key: 'byte:retrieval:17',
            level: 2,
            parent_key: 'topo:retrieval',
            display_name: 'Retrieval Byte 17',
            member_count: 8,
            metadata: {},
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            centroid_distance_mean: 0.23,
            summary: 'Retrieval cluster summary',
            purpose: 'Routes retrieval context',
            patterns: ['rrf', 'qdrant'],
            warnings: [],
            tags: ['retrieval'],
            summary_model: 'gemma4',
            metadata: { domain_class: 'retrieval', domain_confidence: 0.82 },
          },
        ],
      });

    mockWriteAcePacket.mockImplementation(async (packet: Record<string, unknown>) => ({
      packet_id: 'packet-1',
      created_at: '2026-07-26T00:00:00.000Z',
      ...packet,
    }));
    mockRedisHgetall.mockImplementation(async (key: string) => {
      if (key === 'gpu:autoencoder:centroids_64_meta') {
        return { count: '400', dim: '64', trainedAt: '2026-07-26T12:00:00.000Z' };
      }
      if (key === 'gpu:karpathy:scores') {
        return {
          'src/lib/retrieval.ts': JSON.stringify({ blend: 0.91 }),
          'src/lib/qdrant.ts': JSON.stringify({ blend: 0.67 }),
        };
      }
      return {};
    });
  });

  it('builds a compact taxonomy/topology packet with linked tuples and SOM fanout metadata', async () => {
    const mod = await import('../../../src/lib/server/atlas/taxonomy-topology-packet.js');
    const result = await mod.buildTaxonomyTopologyPacket({
      featureId: 'hyperrag-fusion',
      nodeKey: 'topo:retrieval',
    });

    expect(result.summary.nodeKey).toBe('topo:retrieval');
    expect(result.summary.topology.somCluster).toBe('3:4');
    expect(result.summary.topology.neighborCells).toContainEqual([3, 4]);
    expect(result.summary.topology.kmeansClusters).toEqual([7]);
    expect(result.summary.linkedTuples.some((tuple) => tuple.relation === 'HAS_ONTOLOGY_TAG')).toBe(true);
    expect(result.summary.classifier.domainClass).toBe('retrieval');
    expect(result.summary.classifier.domainClassifierTier).toBe('naive_bayes');
    expect(result.summary.centroid.redisCentroidCount).toBe(400);
    expect(result.summary.centroid.centroidDistanceMean).toBe(0.23);
    expect(result.summary.centroid.karpathyBlendMax).toBe(0.91);

    expect(mockWriteAcePacket).toHaveBeenCalledOnce();
    const written = mockWriteAcePacket.mock.calls[0][0];
    expect(written.feature_ids).toEqual(['hyperrag-fusion']);
    expect(written.lane_ids).toContain('taxonomy-topology');
    expect(written.cluster_id).toBe('3:4');
    expect(written.used_concepts).toContain('retrieval');
    expect(written.redis_hot_keys).toContain('gpu:autoencoder:centroids_64_meta');
    expect(String(written.prompt_context)).toContain('Linked tuples');
  });
});
