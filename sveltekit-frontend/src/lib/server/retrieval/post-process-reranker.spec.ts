import { describe, expect, it } from 'vitest';
import { postProcessCandidates } from './post-process-reranker.js';
import type { ScoredCandidate } from './candidate-scorer.js';

function candidate(packetKey: string, sourceRef: string, blendedScore: number): ScoredCandidate {
  return {
    packetKey,
    sourceRef,
    fusionScore: blendedScore,
    rankBefore: 1,
    score: blendedScore,
    scoreSource: 'test',
    blendedScore,
    scorerVersion: 'test-v1',
    modelScored: false,
  };
}

describe('postProcessCandidates — latent_256 semantic dedup', () => {
  it('removes a lower-scoring candidate whose latent_256 vector is near-identical to a higher-scoring one', () => {
    const candidates = [
      candidate('a', 'src/foo.ts', 0.9),
      candidate('b', 'src/bar.ts', 0.8), // near-duplicate of 'a' by latent_256, different path
      candidate('c', 'src/baz.ts', 0.7),
    ];
    const latent256Map = new Map<string, readonly number[]>([
      ['a', [1, 0, 0]],
      ['b', [1, 0, 0]],
      ['c', [0, 1, 0]],
    ]);

    const result = postProcessCandidates(
      candidates,
      { dedupPrefixDepth: 0, latent256SimilarityThreshold: 0.99 },
      new Map(),
      new Map(),
      undefined,
      latent256Map,
    );

    expect(result.map(r => r.packetKey)).toEqual(['a', 'c']);
    expect(result.every(r => r.adjustments.semanticDedupRemoved === false)).toBe(true);
  });

  it('is a strict no-op at the default config (threshold=0) — zero behavior change for existing callers', () => {
    const candidates = [
      candidate('a', 'src/foo.ts', 0.9),
      candidate('b', 'src/bar.ts', 0.8),
      candidate('c', 'src/baz.ts', 0.7),
    ];
    const latent256Map = new Map<string, readonly number[]>([
      ['a', [1, 0, 0]],
      ['b', [1, 0, 0]], // identical to 'a', but semantic dedup must NOT run at threshold=0
      ['c', [0, 1, 0]],
    ]);

    const result = postProcessCandidates(
      candidates,
      { dedupPrefixDepth: 0 }, // latent256SimilarityThreshold defaults to 0 (disabled)
      new Map(),
      new Map(),
      undefined,
      latent256Map,
    );

    expect(result).toHaveLength(3);
  });

  it('fails open (keeps the candidate) when latent_256 is missing for it, per canonical_authority: false', () => {
    const candidates = [
      candidate('a', 'src/foo.ts', 0.9),
      candidate('b', 'src/bar.ts', 0.8), // no entry in latent256Map
    ];
    const latent256Map = new Map<string, readonly number[]>([
      ['a', [1, 0, 0]],
      // 'b' intentionally absent
    ]);

    const result = postProcessCandidates(
      candidates,
      { dedupPrefixDepth: 0, latent256SimilarityThreshold: 0.5 },
      new Map(),
      new Map(),
      undefined,
      latent256Map,
    );

    expect(result.map(r => r.packetKey)).toEqual(['a', 'b']);
  });

  it('does not run the O(n^2) comparison at all when latent256Map is empty (default), regardless of threshold', () => {
    const candidates = [candidate('a', 'src/foo.ts', 0.9), candidate('b', 'src/bar.ts', 0.8)];

    const result = postProcessCandidates(
      candidates,
      { dedupPrefixDepth: 0, latent256SimilarityThreshold: 0.5 },
      // latent256Map omitted -> defaults to empty Map
    );

    expect(result).toHaveLength(2);
  });

  it('breaks tied blendedScore deterministically by packetKey, independent of input order or Map insertion order', () => {
    const tied = [
      candidate('z-candidate', 'src/z.ts', 0.5),
      candidate('a-candidate', 'src/a.ts', 0.5), // same score, lexically first packetKey
    ];
    // near-duplicate vectors -- whichever survives the sort's tie-break should win the dedup
    const latent256Map = new Map<string, readonly number[]>([
      ['z-candidate', [1, 0, 0]],
      ['a-candidate', [1, 0, 0]],
    ]);

    const result = postProcessCandidates(
      tied,
      { dedupPrefixDepth: 0, latent256SimilarityThreshold: 0.99 },
      new Map(),
      new Map(),
      undefined,
      latent256Map,
    );

    // Step 2's sort tie-breaks by packetKey ascending, so 'a-candidate' sorts first and wins.
    expect(result.map(r => r.packetKey)).toEqual(['a-candidate']);
  });

  it('is deterministic across repeated runs on the same input (same survivors, same order)', () => {
    const candidates = [
      candidate('a', 'src/foo.ts', 0.9),
      candidate('b', 'src/bar.ts', 0.8),
      candidate('c', 'src/baz.ts', 0.85),
    ];
    const latent256Map = new Map<string, readonly number[]>([
      ['a', [1, 0, 0]],
      ['b', [1, 0, 0]],
      ['c', [0, 1, 0]],
    ]);
    const config = { dedupPrefixDepth: 0, latent256SimilarityThreshold: 0.99 };

    const run1 = postProcessCandidates(candidates, config, new Map(), new Map(), undefined, latent256Map);
    const run2 = postProcessCandidates(candidates, config, new Map(), new Map(), undefined, latent256Map);

    expect(run1.map(r => r.packetKey)).toEqual(run2.map(r => r.packetKey));
    expect(run1.map(r => r.finalScore)).toEqual(run2.map(r => r.finalScore));
  });
});
