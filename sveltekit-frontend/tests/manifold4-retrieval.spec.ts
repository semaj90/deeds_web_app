// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockExecute = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/db/client', () => ({
  db: { execute: mockExecute },
}));

// ── Lazy imports (after mocks are registered) ─────────────────────────────────

let searchManifold4: typeof import('../src/lib/server/retrieval/manifold4-search.js').searchManifold4;
let computeManifold4Centroid: typeof import('../src/lib/server/retrieval/manifold4-search.js').computeManifold4Centroid;
let blendManifoldScore: typeof import('../src/lib/server/retrieval/manifold4-search.js').blendManifoldScore;

beforeEach(async () => {
  vi.clearAllMocks();
  ({ searchManifold4, computeManifold4Centroid, blendManifoldScore } =
    await import('../src/lib/server/retrieval/manifold4-search.js'));
});

// ── computeManifold4Centroid ──────────────────────────────────────────────────

describe('computeManifold4Centroid', () => {
  it('returns null for empty array', () => {
    expect(computeManifold4Centroid([])).toBeNull();
  });

  it('returns null when all entries are null', () => {
    expect(computeManifold4Centroid([null, null])).toBeNull();
  });

  it('returns the single point as-is', () => {
    expect(computeManifold4Centroid([[0.5, 0.5, 0.5, 0.5]])).toEqual([0.5, 0.5, 0.5, 0.5]);
  });

  it('averages two points correctly', () => {
    const result = computeManifold4Centroid([[0, 0, 0, 0], [1, 1, 1, 1]]);
    expect(result).not.toBeNull();
    expect(result![0]).toBeCloseTo(0.5);
    expect(result![3]).toBeCloseTo(0.5);
  });

  it('skips null entries', () => {
    const result = computeManifold4Centroid([null, [0.4, 0.4, 0.4, 0.4], null]);
    expect(result).toEqual([0.4, 0.4, 0.4, 0.4]);
  });
});

// ── blendManifoldScore ────────────────────────────────────────────────────────

describe('blendManifoldScore', () => {
  it('returns higher score for closer manifold distance', () => {
    const near = blendManifoldScore(0.8, 0.1);
    const far  = blendManifoldScore(0.8, 2.0);
    expect(near).toBeGreaterThan(far);
  });

  it('weights match ACE spine (0.22 vector + 0.16 manifold)', () => {
    // distance 0 → manifold_score = 1.0
    const score = blendManifoldScore(1.0, 0);
    expect(score).toBeCloseTo(0.22 + 0.16, 2);
  });
});

// ── searchManifold4 ───────────────────────────────────────────────────────────

describe('searchManifold4', () => {
  it('returns empty result on DB error', async () => {
    mockExecute.mockRejectedValue(new Error('DB unavailable'));
    const result = await searchManifold4({ center: [0.5, 0.5, 0.5, 0.5] });
    expect(result.hits).toHaveLength(0);
    expect(result.totalFound).toBe(0);
  });

  it('maps DB rows to Manifold4Hit with correct score', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        {
          id: 'abc-123',
          relative_path: 'src/lib/foo.ts',
          chunk_index: 10,
          symbol: 'fooFn',
          kind: 'function',
          content: 'function fooFn() {}',
          signature: 'fooFn(): void',
          semantic_tags: ['api-route'],
          som_cluster: 3,
          gpu_cluster: 7,
          som_bmu_row: 4,
          som_bmu_col: 2,
          page_rank_score: 0.42,
          manifold4: [0.5, 0.5, 0.5, 0.5],
          manifold_distance: 0.0,
        },
      ],
    });

    const result = await searchManifold4({ center: [0.5, 0.5, 0.5, 0.5] });
    expect(result.hits).toHaveLength(1);
    const hit = result.hits[0];
    expect(hit.id).toBe('abc-123');
    expect(hit.relativePath).toBe('src/lib/foo.ts');
    expect(hit.manifoldScore).toBeCloseTo(1.0); // 1/(1+0) = 1
    expect(hit.semanticTags).toContain('api-route');
  });

  it('filters hits below minScore', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        { id: '1', relative_path: 'a.ts', manifold_distance: 5.0, manifold4: [0, 0, 0, 0],
          chunk_index: null, symbol: null, kind: null, content: null, signature: null,
          semantic_tags: [], som_cluster: null, gpu_cluster: null,
          som_bmu_row: null, som_bmu_col: null, page_rank_score: null },
      ],
    });
    // minScore = 0.5 but 1/(1+5) ≈ 0.167 — should be filtered
    const result = await searchManifold4({ center: [0, 0, 0, 0], minScore: 0.5 });
    expect(result.hits).toHaveLength(0);
  });
});
