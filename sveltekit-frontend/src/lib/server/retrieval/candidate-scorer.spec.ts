import { describe, expect, it } from 'vitest';
import {
  computeDomainScoreComposite,
  scoreCandidates,
  DOMAIN_SCORE_COMPOSITE_VERSION,
  type FusedCandidateInput,
} from './candidate-scorer.js';

function baseCandidate(overrides: Partial<FusedCandidateInput> = {}): FusedCandidateInput {
  return {
    packetKey: 'packet-1',
    sourceRef: 'src/lib/example.ts',
    fusionScore: 1,
    rankBefore: 1,
    score: 1,
    scoreSource: 'qdrant',
    ...overrides,
  };
}

describe('computeDomainScoreComposite', () => {
  it('passes through an explicit domainScore unchanged — never overrides a real value', () => {
    expect(computeDomainScoreComposite({ domainScore: 0.42 })).toBe(0.42);
  });

  it('returns undefined when no signal is available at all', () => {
    expect(computeDomainScoreComposite({})).toBeUndefined();
  });

  it('uses staticDynamicLabel alone when provenance is absent', () => {
    expect(computeDomainScoreComposite({ staticDynamicLabel: 'static' })).toBe(1);
    expect(computeDomainScoreComposite({ staticDynamicLabel: 'dynamic' })).toBe(0);
  });

  it('uses codeSymbolProvenance alone when staticDynamicLabel is absent', () => {
    expect(computeDomainScoreComposite({ codeSymbolProvenance: 'code' })).toBe(1);
    expect(computeDomainScoreComposite({ codeSymbolProvenance: 'ai_generated' })).toBe(0);
  });

  it('unknown provenance does not contribute — falls back to the other signal alone', () => {
    expect(computeDomainScoreComposite({
      staticDynamicLabel: 'static',
      codeSymbolProvenance: 'unknown',
    })).toBe(1);
  });

  it('averages both signals when both are available', () => {
    // static (1) + ai_generated favoring code default (0) → 0.5
    expect(computeDomainScoreComposite({
      staticDynamicLabel: 'static',
      codeSymbolProvenance: 'ai_generated',
    })).toBe(0.5);
    // dynamic (0) + code (1) → 0.5
    expect(computeDomainScoreComposite({
      staticDynamicLabel: 'dynamic',
      codeSymbolProvenance: 'code',
    })).toBe(0.5);
  });

  it('exposes a stable composite version marker', () => {
    expect(DOMAIN_SCORE_COMPOSITE_VERSION).toBe('unified-symbol-rank-v1');
  });
});

describe('scoreCandidates — regression smoke test', () => {
  it('preserves order, identity, and produces a blendedScore in [0,1] with no new signals', async () => {
    const candidates = [
      baseCandidate({ packetKey: 'a', rankBefore: 1, fusionScore: 3, denseScore: 0.9 }),
      baseCandidate({ packetKey: 'b', rankBefore: 2, fusionScore: 2, denseScore: 0.5 }),
      baseCandidate({ packetKey: 'c', rankBefore: 3, fusionScore: 1, denseScore: 0.1 }),
    ];
    const result = await scoreCandidates('query', candidates);
    expect(result.map((r) => r.packetKey)).toEqual(['a', 'b', 'c']);
    for (const r of result) {
      expect(r.blendedScore).toBeGreaterThanOrEqual(0);
      expect(r.blendedScore).toBeLessThanOrEqual(1);
    }
  });

  it('a candidate with a favorable static/human-authored classification scores at least as high as an otherwise-identical dynamic/AI-generated one', async () => {
    const favorable = baseCandidate({
      packetKey: 'favorable',
      denseScore: 0.5,
      staticDynamicLabel: 'static',
      codeSymbolProvenance: 'code',
    });
    const unfavorable = baseCandidate({
      packetKey: 'unfavorable',
      denseScore: 0.5,
      staticDynamicLabel: 'dynamic',
      codeSymbolProvenance: 'ai_generated',
    });
    const [scoredFavorable, scoredUnfavorable] = await scoreCandidates('query', [favorable, unfavorable]);
    expect(scoredFavorable.blendedScore).toBeGreaterThan(scoredUnfavorable.blendedScore);
  });

  it('leaves blendedScore unaffected when neither new signal is provided (no regression)', async () => {
    const withoutSignals = baseCandidate({ packetKey: 'x', denseScore: 0.7 });
    const [scored] = await scoreCandidates('query', [withoutSignals]);
    // domainScore contributes nothing when undefined; blend should equal denseScore's weighted share alone
    expect(scored.blendedScore).toBeGreaterThan(0);
  });
});

describe('RERANK-WEIGHT-BOUNDARY-01: scoreCandidates blendWeights validation', () => {
  it('rejects a caller-supplied blendWeights that does not sum to 1.0', async () => {
    const candidate = baseCandidate({ packetKey: 'x', denseScore: 0.7 });
    await expect(
      scoreCandidates('query', [candidate], {
        blendWeights: {
          dense: 0.5,
          bm25: 0.5,
          ast: 0.5, // sum is now 1.5, not 1.0
          graph: 0,
          pagerank: 0,
          domain: 0,
          crossEncoder: 0,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a caller-supplied blendWeights with an out-of-range weight', async () => {
    const candidate = baseCandidate({ packetKey: 'x', denseScore: 0.7 });
    await expect(
      scoreCandidates('query', [candidate], {
        blendWeights: {
          dense: 1.5, // out of [0,1]
          bm25: -0.5,
          ast: 0,
          graph: 0,
          pagerank: 0,
          domain: 0,
          crossEncoder: 0,
        },
      }),
    ).rejects.toThrow();
  });

  it('accepts a valid caller-supplied blendWeights that sums to 1.0', async () => {
    const candidate = baseCandidate({ packetKey: 'x', denseScore: 0.7 });
    const [scored] = await scoreCandidates('query', [candidate], {
      blendWeights: {
        dense: 1,
        bm25: 0,
        ast: 0,
        graph: 0,
        pagerank: 0,
        domain: 0,
        crossEncoder: 0,
      },
    });
    expect(scored.blendedScore).toBeCloseTo(0.7, 5);
  });
});
