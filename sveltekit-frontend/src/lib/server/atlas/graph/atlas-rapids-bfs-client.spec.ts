import { describe, expect, it, vi } from 'vitest';
import { createAtlasRapidsBfsClient } from './atlas-rapids-bfs-client.js';

describe('Atlas RAPIDS BFS client', () => {
  it('rejects unproven reverse directions before transport', async () => {
    const client = createAtlasRapidsBfsClient('http://127.0.0.1:8098');
    await expect(client.bfs({
      graphRevision: 'g1',
      seedNodeKey: 'n1',
      direction: 'both',
    })).rejects.toThrow('ATLAS_BFS_DIRECTION_NOT_PROVEN:both');
  });

  it('rejects duplicate candidate node keys before transport', async () => {
    const client = createAtlasRapidsBfsClient('http://127.0.0.1:8098');
    await expect(client.bfs({
      graphRevision: 'g1',
      seedNodeKey: 'n1',
      candidateNodeKeys: ['n2', 'n2'],
    })).rejects.toThrow('ATLAS_BFS_DUPLICATE_CANDIDATE:n2');
  });

  it('sends a revision-qualified bounded outbound request', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      expect(body.graphRevision).toBe('g-1');
      expect(body.seedNodeKey).toBe('n1');
      expect(body.maxHops).toBe(2);
      expect(body.maxNodes).toBe(32);
      expect(body.direction).toBe('outbound');
      return new Response(JSON.stringify({
        schema: 'atlas.graph-bfs-receipt.v1',
        operation: 'bfs',
        backend: 'cugraph.bfs',
        algorithmRevision: 'atlas.cugraph-bfs.v1',
        graphRevision: 'g-1',
        projectionRevision: 'p-1',
        nodeTableHash: 'nh',
        edgeTableHash: 'eh',
        seedNodeKey: 'n1',
        seedGpuNodeId: 0,
        direction: 'outbound',
        maxHops: 2,
        maxNodes: 32,
        candidateFilterCount: 1,
        nodeCount: 2,
        edgeCount: 1,
        truncated: false,
        results: [{
          rank: 1,
          gpuNodeId: 1,
          nodeKey: 'n2',
          packetKey: 'p2',
          hop: 1,
          predecessorGpuNodeId: 0,
          predecessorNodeKey: 'n1',
          proximity: 0.5,
        }],
        timings: { kernelMs: 1, resultSelectMs: 1 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const client = createAtlasRapidsBfsClient('http://127.0.0.1:8098');
      const receipt = await client.bfs({
        graphRevision: 'g-1',
        seedNodeKey: 'n1',
        candidateNodeKeys: ['n2'],
        maxHops: 2,
        maxNodes: 32,
      });
      expect(receipt.results[0]?.packetKey).toBe('p2');
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
