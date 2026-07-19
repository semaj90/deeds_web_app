// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { scoreCandidates } from '../candidate-scorer.js';
import {
  postProcessCandidates,
  DEFAULT_POST_PROCESS_CONFIG,
  type PostProcessConfig,
} from '../post-process-reranker.js';
import type { FusedCandidateInput } from '../candidate-scorer.js';
import type { ScoredCandidate } from '../candidate-scorer.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCandidate(
  packetKey: string,
  overrides: Partial<FusedCandidateInput> = {},
): FusedCandidateInput {
  return {
    packetKey,
    sourceRef: `src/${packetKey}.ts`,
    fusionScore: 0.5,
    rankBefore: 1,
    score: 0.5,
    scoreSource: 'qdrant',
    ...overrides,
  };
}

function makeScored(
  packetKey: string,
  blendedScore: number,
  overrides: Partial<ScoredCandidate> = {},
): ScoredCandidate {
  return {
    packetKey,
    sourceRef: `src/${packetKey}.ts`,
    fusionScore: blendedScore,
    rankBefore: 1,
    score: blendedScore,
    scoreSource: 'qdrant',
    blendedScore,
    scorerVersion: 'deterministic-v1',
    modelScored: false,
    ...overrides,
  };
}

// ── scoreCandidates ───────────────────────────────────────────────────────────

describe('scoreCandidates', () => {
  it('attaches a blendedScore in [0,1] to every candidate', async () => {
    const candidates = [
      makeCandidate('a', { denseScore: 0.9, fusionScore: 0.9, rankBefore: 1 }),
      makeCandidate('b', { denseScore: 0.6, fusionScore: 0.6, rankBefore: 2 }),
      makeCandidate('c', { denseScore: 0.3, fusionScore: 0.3, rankBefore: 3 }),
    ];
    const scored = await scoreCandidates('test query', candidates);
    expect(scored).toHaveLength(3);
    for (const s of scored) {
      expect(s.blendedScore).toBeGreaterThanOrEqual(0);
      expect(s.blendedScore).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic: same input → same output', async () => {
    const candidates = [
      makeCandidate('x', { denseScore: 0.7, bm25Score: 0.4, rankBefore: 1, fusionScore: 0.65 }),
      makeCandidate('y', { denseScore: 0.5, bm25Score: 0.8, rankBefore: 2, fusionScore: 0.60 }),
    ];
    const run1 = await scoreCandidates('query', candidates);
    const run2 = await scoreCandidates('query', candidates);
    expect(run1[0].blendedScore).toBe(run2[0].blendedScore);
    expect(run1[1].blendedScore).toBe(run2[1].blendedScore);
  });

  it('preserves input order (does not sort)', async () => {
    const candidates = [
      makeCandidate('low', { denseScore: 0.1, rankBefore: 1, fusionScore: 0.1 }),
      makeCandidate('high', { denseScore: 0.9, rankBefore: 2, fusionScore: 0.9 }),
    ];
    const scored = await scoreCandidates('query', candidates);
    expect(scored[0].packetKey).toBe('low');
    expect(scored[1].packetKey).toBe('high');
  });

  it('never mutates packetKey or sourceRef', async () => {
    const candidates = [
      makeCandidate('immutable:001', { sourceRef: 'src/immutable.ts', rankBefore: 1, fusionScore: 0.5 }),
    ];
    const scored = await scoreCandidates('query', candidates);
    expect(scored[0].packetKey).toBe('immutable:001');
    expect(scored[0].sourceRef).toBe('src/immutable.ts');
  });

  it('returns empty array for empty input', async () => {
    const scored = await scoreCandidates('query', []);
    expect(scored).toHaveLength(0);
  });

  it('model scorer override replaces deterministic score', async () => {
    const candidates = [
      makeCandidate('m1', { rankBefore: 1, fusionScore: 0.1 }),
      makeCandidate('m2', { rankBefore: 2, fusionScore: 0.1 }),
    ];
    const modelScores = [0.95, 0.42];
    const scored = await scoreCandidates('query', candidates, {
      modelScorer: {
        modelVersion: 'test-model-v1',
        score: async () => modelScores,
      },
    });
    expect(scored[0].blendedScore).toBeCloseTo(0.95);
    expect(scored[1].blendedScore).toBeCloseTo(0.42);
    expect(scored[0].modelScored).toBe(true);
    expect(scored[0].scorerVersion).toBe('test-model-v1');
  });

  it('falls back to deterministic when model scorer returns null', async () => {
    const candidates = [makeCandidate('p1', { rankBefore: 1, fusionScore: 0.5 })];
    const scored = await scoreCandidates('query', candidates, {
      modelScorer: {
        modelVersion: 'broken',
        score: async () => null,
      },
    });
    expect(scored[0].modelScored).toBe(false);
    expect(scored[0].scorerVersion).toBe('deterministic-v1');
  });
});

// ── postProcessCandidates ─────────────────────────────────────────────────────

describe('postProcessCandidates', () => {
  it('assigns 1-based finalRank to every output candidate', () => {
    const candidates = [
      makeScored('a', 0.9),
      makeScored('b', 0.7),
      makeScored('c', 0.5),
    ];
    const result = postProcessCandidates(candidates);
    result.forEach((r, i) => expect(r.finalRank).toBe(i + 1));
  });

  it('sorts output descending by finalScore', () => {
    const candidates = [
      makeScored('low', 0.2),
      makeScored('high', 0.9),
      makeScored('mid', 0.6),
    ];
    const result = postProcessCandidates(candidates);
    expect(result[0].packetKey).toBe('high');
    expect(result[1].packetKey).toBe('mid');
    expect(result[2].packetKey).toBe('low');
  });

  it('never mutates packetKey or sourceRef', () => {
    const candidates = [makeScored('locked:key', 0.8, { sourceRef: 'src/locked.ts' })];
    const result = postProcessCandidates(candidates);
    expect(result[0].packetKey).toBe('locked:key');
    expect(result[0].sourceRef).toBe('src/locked.ts');
  });

  it('never changes blendedScore (only finalScore)', () => {
    const original = 0.75;
    const candidates = [makeScored('stable', original)];
    const result = postProcessCandidates(candidates);
    expect(result[0].blendedScore).toBe(original);
  });

  it('freshness boost raises finalScore for recently updated candidates', () => {
    const now = new Date();
    const recentKey = 'recent:001';
    const staleKey = 'stale:002';
    const candidates = [makeScored(staleKey, 0.5), makeScored(recentKey, 0.5)];
    const updatedAtMap = new Map([[recentKey, now]]);
    const result = postProcessCandidates(
      candidates,
      { freshnessBoost: 0.2, freshnessWindowMs: 60_000 },
      updatedAtMap,
    );
    const recentResult = result.find(r => r.packetKey === recentKey)!;
    const staleResult = result.find(r => r.packetKey === staleKey)!;
    expect(recentResult.finalScore).toBeGreaterThan(staleResult.finalScore);
    expect(recentResult.adjustments.freshnessApplied).toBe(true);
    expect(staleResult.adjustments.freshnessApplied).toBe(false);
  });

  it('dislike penalty suppresses disliked candidates', () => {
    const dislikedKey = 'disliked:001';
    const goodKey = 'good:002';
    const candidates = [makeScored(dislikedKey, 0.9), makeScored(goodKey, 0.5)];
    const result = postProcessCandidates(
      candidates,
      { dislikedPacketKeys: new Set([dislikedKey]), dislikePenalty: 0.9 },
    );
    const dislikedResult = result.find(r => r.packetKey === dislikedKey)!;
    const goodResult = result.find(r => r.packetKey === goodKey)!;
    expect(dislikedResult.adjustments.dislikeApplied).toBe(true);
    // After 90% penalty applied to 0.9: 0.9 * (1-0.9) = 0.09 < 0.5
    expect(dislikedResult.finalScore).toBeLessThan(goodResult.finalScore);
    expect(dislikedResult.finalRank).toBeGreaterThan(goodResult.finalRank);
  });

  it('dedup removes lower-scoring near-duplicate sourceRefs', () => {
    const candidates = [
      makeScored('a1', 0.9, { sourceRef: 'src/auth/login.ts' }),
      makeScored('a2', 0.7, { sourceRef: 'src/auth/session.ts' }),  // same src/auth prefix
      makeScored('b1', 0.6, { sourceRef: 'src/db/client.ts' }),
    ];
    const result = postProcessCandidates(candidates, { dedupPrefixDepth: 2 });
    // a1 wins (higher score), a2 removed (same src/auth prefix), b1 kept
    expect(result.length).toBe(2);
    const keys = result.map(r => r.packetKey);
    expect(keys).toContain('a1');
    expect(keys).toContain('b1');
    expect(keys).not.toContain('a2');
    expect(result.find(r => r.packetKey === 'a1')!.adjustments.dedupWinner).toBe(true);
  });

  it('anti-cluster caps per-cluster candidates', () => {
    const candidates = [
      makeScored('c1', 0.9, { sourceRef: 'src/cluster/a.ts' }),
      makeScored('c2', 0.8, { sourceRef: 'src/cluster/b.ts' }),
      makeScored('c3', 0.7, { sourceRef: 'src/cluster/c.ts' }),
      makeScored('c4', 0.6, { sourceRef: 'src/cluster/d.ts' }),  // 4th from same cluster
      makeScored('other', 0.5, { sourceRef: 'src/other/e.ts' }),
    ];
    const result = postProcessCandidates(candidates, {
      dedupPrefixDepth: 0,  // disable dedup to isolate anti-cluster
      maxPerCluster: 3,
    });
    const clusterCandidates = result.filter(r => r.packetKey.startsWith('c'));
    const antiClustered = clusterCandidates.filter(r => r.adjustments.antiClusterApplied);
    expect(antiClustered.length).toBeGreaterThanOrEqual(1);
    // The 4th cluster candidate should be pushed to end (lower rank than 'other')
    const c4Rank = result.find(r => r.packetKey === 'c4')!.finalRank;
    const otherRank = result.find(r => r.packetKey === 'other')!.finalRank;
    expect(c4Rank).toBeGreaterThan(otherRank);
  });

  it('returns empty array for empty input', () => {
    expect(postProcessCandidates([])).toHaveLength(0);
  });

  it('default config matches DEFAULT_POST_PROCESS_CONFIG', () => {
    const candidates = [makeScored('x', 0.5)];
    const withDefault = postProcessCandidates(candidates);
    const withExplicit = postProcessCandidates(candidates, DEFAULT_POST_PROCESS_CONFIG);
    expect(withDefault[0].finalScore).toBeCloseTo(withExplicit[0].finalScore);
  });
});
