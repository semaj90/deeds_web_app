// @vitest-environment node
/**
 * rg-atlas.spec.ts
 *
 * Unit tests for the RG-Atlas search pipeline modules.
 *
 * Coverage:
 *   - cosineBlend (pure function — no mocks needed)
 *   - rewriteQuery (mocked Ollama)
 *   - persistRgAtlasResult (mocked Drizzle DB)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock external I/O dependencies ────────────────────────────────────────────

vi.mock('$lib/server/ollama-cached.js', () => ({
  ollamaCachedChat: vi.fn()
}));

vi.mock('$lib/server/db/client.js', () => ({
  db: { transaction: vi.fn() }
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
  rgSearchRuns: {},
  rgSearchHits: {}
}));

// Lazy imports so mocks are in place first
let cosineBlend: typeof import('$lib/server/rg-atlas/cosine-blend.js').cosineBlend;
let DEFAULT_WEIGHTS: typeof import('$lib/server/rg-atlas/cosine-blend.js').DEFAULT_WEIGHTS;
let rewriteQuery: typeof import('$lib/server/rg-atlas/multi-query.js').rewriteQuery;
let persistRgAtlasResult: typeof import('$lib/server/rg-atlas/persist.js').persistRgAtlasResult;
let ollamaCachedChat: ReturnType<typeof vi.fn>;
let db: { transaction: ReturnType<typeof vi.fn> };

beforeEach(async () => {
  vi.clearAllMocks();
  ({ cosineBlend, DEFAULT_WEIGHTS } = await import('$lib/server/rg-atlas/cosine-blend.js'));
  ({ rewriteQuery } = await import('$lib/server/rg-atlas/multi-query.js'));
  ({ persistRgAtlasResult } = await import('$lib/server/rg-atlas/persist.js'));
  ({ ollamaCachedChat } = await import('$lib/server/ollama-cached.js') as { ollamaCachedChat: ReturnType<typeof vi.fn> });
  ({ db } = await import('$lib/server/db/client.js') as { db: { transaction: ReturnType<typeof vi.fn> } });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHit(overrides: Partial<{
  filePath: string;
  source: 'rg' | 'qdrant' | 'union';
  marco: number;
  karpathy: number;
  qdrantCosine: number;
  langExtract: number;
}> = {}) {
  return {
    filePath: overrides.filePath ?? 'src/lib/test.ts',
    source: overrides.source ?? 'rg' as const,
    scores: {
      rgMatch: 1,
      karpathy: overrides.karpathy ?? 0.5,
      qdrantCosine: overrides.qdrantCosine ?? 0.7,
      marco: overrides.marco ?? 0.8,
      langExtract: overrides.langExtract ?? 0.6,
      final: 0  // will be computed
    },
    clusterId: -1 as number
  };
}

function makeAtlasResult(hitCount = 2) {
  return {
    runId: `rg_${Date.now()}_abcd1234`,
    query: 'drag-drop upload zone',
    hits: Array.from({ length: hitCount }, (_, i) => ({
      filePath: `src/lib/file${i}.ts`,
      source: 'rg' as const,
      scores: { rgMatch: 1, karpathy: 0.5, qdrantCosine: 0.7, marco: 0.8, langExtract: 0.6, final: 0.69 },
      clusterId: 0
    })),
    clusters: [{ id: 0, centroid: new Array(768).fill(0), memberFiles: ['src/lib/file0.ts'] }],
    diagnostics: {
      rgMs: 10, embedMs: 20, gpuMs: 5, qdrantMs: 30,
      marcoMs: 15, langExtractMs: 12, totalMs: 92,
      rgHitCount: 2, qdrantHitCount: 5, finalHitCount: 2,
      persistedToDb: false
    }
  };
}

// ── cosineBlend ───────────────────────────────────────────────────────────────

describe('cosineBlend', () => {
  it('computes weighted final score correctly', () => {
    const hit = makeHit({ marco: 0.8, karpathy: 0.5, qdrantCosine: 0.7, langExtract: 0.6 });
    const [result] = cosineBlend([hit], DEFAULT_WEIGHTS);
    // 0.4*0.8 + 0.3*0.5 + 0.2*0.7 + 0.1*0.6 = 0.32+0.15+0.14+0.06 = 0.67
    expect(result.scores.final).toBeCloseTo(0.67, 5);
  });

  it('sorts hits by final score descending', () => {
    const low  = makeHit({ marco: 0.1, karpathy: 0.1, qdrantCosine: 0.1, langExtract: 0.1 });
    const high = makeHit({ marco: 1.0, karpathy: 1.0, qdrantCosine: 1.0, langExtract: 1.0, filePath: 'src/high.ts' });
    const results = cosineBlend([low, high], DEFAULT_WEIGHTS);
    expect(results[0].filePath).toBe('src/high.ts');
    expect(results[0].scores.final).toBeGreaterThan(results[1].scores.final);
  });

  it('clamps component scores to [0, 1] before weighting', () => {
    const hit = makeHit({ marco: 1.5, karpathy: -0.3, qdrantCosine: 2.0, langExtract: 0.5 });
    const [result] = cosineBlend([hit], DEFAULT_WEIGHTS);
    // clamped: marco=1, karpathy=0, cos=1, lang=0.5
    // 0.4*1 + 0.3*0 + 0.2*1 + 0.1*0.5 = 0.4+0+0.2+0.05 = 0.65
    expect(result.scores.final).toBeCloseTo(0.65, 5);
  });

  it('returns empty array for empty input', () => {
    expect(cosineBlend([], DEFAULT_WEIGHTS)).toEqual([]);
  });

  it('fills missing clusterId with -1', () => {
    const hit = { ...makeHit(), clusterId: undefined as unknown as number };
    const [result] = cosineBlend([hit]);
    expect(result.clusterId).toBe(-1);
  });

  it('respects custom weight overrides', () => {
    const hit = makeHit({ marco: 1.0, karpathy: 0, qdrantCosine: 0, langExtract: 0 });
    const weights = { marco: 1.0, karpathy: 0, cos: 0, lang: 0 };
    const [result] = cosineBlend([hit], weights);
    expect(result.scores.final).toBeCloseTo(1.0, 5);
  });
});

// ── rewriteQuery ──────────────────────────────────────────────────────────────

describe('rewriteQuery', () => {
  it('prepends original query and returns variants from JSON response', async () => {
    (ollamaCachedChat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      '["drag drop file input", "upload zone component", "file drop handler"]'
    );
    const variants = await rewriteQuery('drag-drop upload zone', 3);
    expect(variants[0]).toBe('drag-drop upload zone');
    expect(variants.length).toBeGreaterThan(1);
  });

  it('falls back to [originalQuery] when Ollama returns non-JSON', async () => {
    (ollamaCachedChat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      'Sorry I cannot help with that.'
    );
    const variants = await rewriteQuery('some query', 3);
    expect(variants).toEqual(['some query']);
  });

  it('falls back to [originalQuery] when Ollama throws', async () => {
    (ollamaCachedChat as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Ollama unavailable')
    );
    const variants = await rewriteQuery('some query', 3);
    expect(variants).toEqual(['some query']);
  });

  it('limits variants to variantCount', async () => {
    (ollamaCachedChat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      '["v1","v2","v3","v4","v5"]'
    );
    const variants = await rewriteQuery('test', 2);
    // original + at most 2 variants = 3 max
    expect(variants.length).toBeLessThanOrEqual(3);
  });
});

// ── persistRgAtlasResult ──────────────────────────────────────────────────────

describe('persistRgAtlasResult', () => {
  it('returns true on successful transaction', async () => {
    db.transaction.mockResolvedValueOnce(undefined);
    const result = await persistRgAtlasResult(makeAtlasResult(), 1);
    expect(result).toBe(true);
    expect(db.transaction).toHaveBeenCalledOnce();
  });

  it('returns false when transaction throws', async () => {
    db.transaction.mockRejectedValueOnce(new Error('DB connection lost'));
    const result = await persistRgAtlasResult(makeAtlasResult(), 1);
    expect(result).toBe(false);
  });

  it('accepts undefined userId (anonymous run)', async () => {
    db.transaction.mockResolvedValueOnce(undefined);
    const result = await persistRgAtlasResult(makeAtlasResult());
    expect(result).toBe(true);
  });

  it('handles zero hits gracefully', async () => {
    db.transaction.mockResolvedValueOnce(undefined);
    const result = await persistRgAtlasResult(makeAtlasResult(0));
    expect(result).toBe(true);
  });
});
