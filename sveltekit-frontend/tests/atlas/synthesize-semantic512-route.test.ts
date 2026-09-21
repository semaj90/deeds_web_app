// @vitest-environment node
/**
 * Regression guard (codereview-semantic-dimension-regression-aug22 task 2.3):
 * the semantic512 exact-rerank branch of POST /api/admin/atlas/synthesize must
 * call the 512-dim client with representationId 'semantic_512' and only feed it
 * 512-dim vectors. An Aug-2026 mechanical 512->768 flip left the literal and the
 * client inconsistent (always-throws) and was only caught by manual review.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  exactKnn: vi.fn(),
  requireAdmin: vi.fn(),
}));

const vec = (n: number) => Array.from({ length: n }, (_, i) => (i % 7) / 7);
const score = (packetKey: string, dim: number) => ({
  packetKey, score: 0.9, vector: vec(dim), sourceRevision: 'sha256:' + 'a'.repeat(64),
  symbolVersionId: null, treeNodeId: null, featureLabel: 'f',
});

vi.mock('$lib/server/auth-utils.js', () => ({ requireAdmin: m.requireAdmin }));
vi.mock('$lib/server/atlas/gpu/atlas-rapids-memory-client.js', () => ({
  createAtlasRapidsMemoryClient: () => ({ readTelemetry: async () => null }),
}));
vi.mock('$lib/server/atlas/gpu/gpu-residency-budget.js', () => ({
  planGpuResidencyV1: () => ({ executionTarget: 'gpu', maxCandidateBucket: 128 }),
}));
vi.mock('$lib/server/atlas/graph/graph-traversal.js', () => ({
  traverseGraphV1: async () => ({
    queryId: 'q1',
    nodes: [
      { id: 'n1', packetKey: 'pk1', sourceRef: 'src/a.ts', hop: 0 },
      { id: 'n2', packetKey: 'pk2', sourceRef: 'src/b.ts', hop: 1 },
    ],
  }),
}));
vi.mock('$lib/server/atlas/graph/graph-feature-snapshot.js', () => ({ loadGraphFeatureSnapshotV1: async () => new Map() }));
vi.mock('$lib/server/atlas/graph/mutation-awareness.js', () => ({ loadMutationAwarenessV1: async () => ({ entries: [] }) }));
vi.mock('$lib/server/atlas/graph/atlas-rapids-pagerank-client.js', () => ({
  createAtlasRapidsPageRankClient: () => ({ pagerank: async () => null }),
}));
vi.mock('$lib/server/atlas/retrieval/postgres-lexical-scorer.js', () => ({ scorePostgresLexicalCandidatesV1: async () => null }));
vi.mock('$lib/server/atlas/retrieval/atlas-rapids-semantic512-client.js', () => ({
  createAtlasRapidsSemantic512Client: () => ({ exactKnn: m.exactKnn }),
}));

let scores: ReturnType<typeof score>[] = [];
vi.mock('$lib/server/atlas/retrieval/qdrant-semantic-scorer.js', () => ({
  scoreQdrantSemanticCandidatesV1: async () => ({
    queryVector: vec(512), representationRevision: 'rev1', scores,
  }),
}));

async function post() {
  const { POST } = await import('../../src/routes/api/admin/atlas/synthesize/+server.js');
  const request = new Request('http://localhost/api/admin/atlas/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshotId: 's1', query: 'q', seedNodeKeys: ['n1'] }),
  });
  return POST({ request, locals: {}, url: new URL(request.url), params: {} } as never);
}

describe('POST /api/admin/atlas/synthesize — semantic512 exact-rerank branch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.exactKnn.mockResolvedValue({ results: [{ packetKey: 'pk1', cosineSimilarity: 0.99 }] });
  });

  it("calls the 512 client with representationId 'semantic_512' and 512-dim rows", async () => {
    scores = [score('pk1', 512), score('pk2', 512)];
    const res = await post();
    expect(res.status).toBe(200);
    expect(m.exactKnn).toHaveBeenCalledTimes(1);
    const arg = m.exactKnn.mock.calls[0][0];
    expect(arg.query.representationId).toBe('semantic_512');
    expect(arg.query.vector).toHaveLength(512);
    expect(arg.corpus).toHaveLength(2);
    expect(arg.corpus.every((r: { vector: number[] }) => r.vector.length === 512)).toBe(true);
  });

  it('skips the exact branch (no throw) when rows are not 512-dim', async () => {
    scores = [score('pk1', 768)];
    const res = await post();
    expect(res.status).toBe(200);
    expect(m.exactKnn).not.toHaveBeenCalled();
  });

  it('fails open with 200 when the exact client throws', async () => {
    scores = [score('pk1', 512)];
    m.exactKnn.mockRejectedValue(new Error('boom'));
    const res = await post();
    expect(res.status).toBe(200);
  });
});
