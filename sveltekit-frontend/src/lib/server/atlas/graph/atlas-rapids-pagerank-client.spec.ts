import { describe, expect, it, vi } from 'vitest';
import { createAtlasRapidsPageRankClient } from './atlas-rapids-pagerank-client.js';

describe('Atlas RAPIDS PageRank client', () => {
  it('rejects duplicate seed identities before transport', async () => {
    const client = createAtlasRapidsPageRankClient('http://127.0.0.1:8098');
    await expect(client.pagerank({
      graphRevision: 'g1',
      seeds: [{ nodeKey: 'n1' }, { nodeKey: 'n1' }],
      candidateNodeKeys: ['n1'],
    })).rejects.toThrow('ATLAS_PAGERANK_DUPLICATE_SEED:n1');
  });

  it('rejects more than 512 candidate node keys before transport', async () => {
    const client = createAtlasRapidsPageRankClient('http://127.0.0.1:8098');
    await expect(client.pagerank({
      graphRevision: 'g1',
      candidateNodeKeys: Array.from({ length: 513 }, (_, index) => `n${index}`),
    })).rejects.toThrow('ATLAS_PAGERANK_TOO_MANY_CANDIDATES:513');
  });

  it('sends revision-qualified bounded defaults', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      expect(body.graphRevision).toBe('g-339');
      expect(body.alpha).toBe(0.85);
      expect(body.tol).toBe(1e-6);
      expect(body.maxIter).toBe(100);
      expect(body.candidateNodeKeys).toEqual(['n1', 'n2']);
      return new Response(JSON.stringify({
        schema: 'atlas.graph-pagerank-receipt.v1',
        operation: 'personalized_pagerank',
        backend: 'cugraph.pagerank',
        algorithmRevision: 'atlas.cugraph-pagerank.v1',
        graphRevision: 'g-339',
        projectionRevision: 'p1',
        nodeTableHash: 'n',
        edgeTableHash: 'e',
        seedChecksum: 's',
        seedCount: 1,
        candidateFilterCount: 2,
        alpha: 0.85,
        tol: 1e-6,
        maxIter: 100,
        didConverge: true,
        precomputedOutWeight: true,
        cacheHit: false,
        nodeCount: 2,
        edgeCount: 1,
        results: [],
        timings: { kernelMs: 1, resultSelectMs: 1 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = createAtlasRapidsPageRankClient('http://127.0.0.1:8098');
    const receipt = await client.pagerank({
      graphRevision: 'g-339',
      seeds: [{ nodeKey: 'n1' }],
      candidateNodeKeys: ['n1', 'n2'],
      topK: 2,
    });
    expect(receipt.graphRevision).toBe('g-339');
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('performs resident-only BFS with every expected graph checksum', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('http://127.0.0.1:8098/v1/graph/bfs');
      expect(JSON.parse(String(init?.body))).toEqual({
        graphRevision: 'g-1',
        projectionRevision: 'p-1',
        projectionChecksum: 'sha256:projection',
        startNodeKey: 'node:1',
        depthLimit: 2,
        expectedArtifactChecksum: 'sha256:artifact',
        expectedGraphOrdinalMapChecksum: 'sha256:ordinals',
      });
      return new Response(JSON.stringify({
        schema: 'atlas.graph-bfs-receipt.v1',
        operation: 'bfs',
        backend: 'cugraph.bfs',
        graphRevision: 'g-1',
        projectionRevision: 'p-1',
        artifactChecksum: 'sha256:artifact',
        graphOrdinalMapChecksum: 'sha256:ordinals',
        startNodeKey: 'node:1',
        depthLimit: 2,
        results: [],
        writesPerformed: false,
        canonicalAuthority: false,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const receipt = await createAtlasRapidsPageRankClient('http://127.0.0.1:8098').bfs({
      graphRevision: 'g-1',
      projectionRevision: 'p-1',
      projectionChecksum: 'sha256:projection',
      startNodeKey: 'node:1',
      depthLimit: 2,
      expectedArtifactChecksum: 'sha256:artifact',
      expectedGraphOrdinalMapChecksum: 'sha256:ordinals',
    });
    expect(receipt.canonicalAuthority).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('rejects resident BFS requests without checksums or within unsafe depth bounds', async () => {
    const client = createAtlasRapidsPageRankClient('http://127.0.0.1:8098');
    await expect(client.bfs({
      graphRevision: 'g-1',
      projectionRevision: 'p-1',
      projectionChecksum: 'sha256:p',
      startNodeKey: 'node:1',
      depthLimit: 3,
      expectedArtifactChecksum: 'sha256:a',
      expectedGraphOrdinalMapChecksum: 'sha256:o',
    })).rejects.toThrow('ATLAS_GRAPH_BFS_DEPTH_OUT_OF_BOUNDS');
  });

  it('rejects a resident BFS receipt for a different graph revision', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      schema: 'atlas.graph-bfs-receipt.v1',
      operation: 'bfs',
      backend: 'cugraph.bfs',
      graphRevision: 'other-graph',
      projectionRevision: 'p-1',
      artifactChecksum: 'sha256:artifact',
      graphOrdinalMapChecksum: 'sha256:ordinals',
      startNodeKey: 'node:1',
      depthLimit: 1,
      results: [],
      writesPerformed: false,
      canonicalAuthority: false,
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    await expect(createAtlasRapidsPageRankClient('http://127.0.0.1:8098').bfs({
      graphRevision: 'g-1',
      projectionRevision: 'p-1',
      projectionChecksum: 'sha256:p',
      startNodeKey: 'node:1',
      depthLimit: 1,
      expectedArtifactChecksum: 'sha256:artifact',
      expectedGraphOrdinalMapChecksum: 'sha256:ordinals',
    })).rejects.toThrow('ATLAS_GRAPH_BFS_RECEIPT_MISMATCH');
    vi.unstubAllGlobals();
  });

  it('resolves all exact sourceRef matches against caller-pinned revisions', async () => {
    const input = {
      graphRevision: 'g-1',
      projectionRevision: 'p-1',
      projectionChecksum: 'sha256:projection',
      sourceRef: 'src/a.ts',
      expectedSourceRevision: 'source:r1',
      expectedWorkspaceRevision: 'workspace:r1',
      depthLimit: 1,
      expectedArtifactChecksum: 'sha256:artifact',
      expectedGraphOrdinalMapChecksum: 'sha256:ordinals',
    };
    const traversal = {
      schema: 'atlas.graph-bfs-receipt.v1',
      operation: 'bfs',
      backend: 'cugraph.bfs',
      graphRevision: 'g-1',
      projectionRevision: 'p-1',
      artifactChecksum: 'sha256:artifact',
      graphOrdinalMapChecksum: 'sha256:ordinals',
      startNodeKey: 'packet:a',
      depthLimit: 1,
      results: [],
      writesPerformed: false,
      canonicalAuthority: false,
    };
    const receipt = {
      schema: 'atlas.graph-source-ref-bfs-receipt.v1',
      sourceRef: 'src/a.ts',
      sourceRevision: 'source:r1',
      workspaceRevision: 'workspace:r1',
      graphRevision: 'g-1',
      projectionRevision: 'p-1',
      projectionChecksum: 'sha256:projection',
      artifactChecksum: 'sha256:artifact',
      graphOrdinalMapChecksum: 'sha256:ordinals',
      matches: [
        { graphOrdinal: 0, nodeKey: 'packet:a', packetKey: 'packet:a', sourceRef: 'src/a.ts', sourceRevision: 'source:r1', workspaceRevision: 'workspace:r1', traversal },
        { graphOrdinal: 1, nodeKey: 'symbol:a', packetKey: 'packet:a', sourceRef: 'src/a.ts', sourceRevision: 'source:r1', workspaceRevision: 'workspace:r1', traversal: { ...traversal, startNodeKey: 'symbol:a' } },
      ],
      writesPerformed: false,
      canonicalAuthority: false,
    };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('http://127.0.0.1:8098/v1/graph/source-ref-bfs');
      expect(JSON.parse(String(init?.body))).toEqual({ ...input, matchLimit: 16 });
      return new Response(JSON.stringify(receipt), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const actual = await createAtlasRapidsPageRankClient('http://127.0.0.1:8098').sourceRefBfs(input);
    expect(actual.matches.map(({ nodeKey }) => nodeKey)).toEqual(['packet:a', 'symbol:a']);
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('rejects sourceRef receipts containing a mismatched source revision', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      schema: 'atlas.graph-source-ref-bfs-receipt.v1',
      sourceRef: 'src/a.ts',
      sourceRevision: 'source:stale',
      workspaceRevision: 'workspace:r1',
      graphRevision: 'g-1',
      projectionRevision: 'p-1',
      projectionChecksum: 'sha256:projection',
      artifactChecksum: 'sha256:artifact',
      graphOrdinalMapChecksum: 'sha256:ordinals',
      matches: [],
      writesPerformed: false,
      canonicalAuthority: false,
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    await expect(createAtlasRapidsPageRankClient('http://127.0.0.1:8098').sourceRefBfs({
      graphRevision: 'g-1',
      projectionRevision: 'p-1',
      projectionChecksum: 'sha256:projection',
      sourceRef: 'src/a.ts',
      expectedSourceRevision: 'source:r1',
      expectedWorkspaceRevision: 'workspace:r1',
      depthLimit: 1,
      expectedArtifactChecksum: 'sha256:artifact',
      expectedGraphOrdinalMapChecksum: 'sha256:ordinals',
    })).rejects.toThrow('ATLAS_GRAPH_SOURCE_REF_BFS_RECEIPT_MISMATCH');
    vi.unstubAllGlobals();
  });
});
