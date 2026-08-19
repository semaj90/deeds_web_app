import { describe, expect, it } from 'vitest';
import { chooseSemanticSeedExecutor } from './semantic-seed-policy.js';
import { buildOneHopFrontier, scoreGraphFrontierCandidate } from './semantic-graph-frontier.js';

describe('semantic seed policy', () => {
  it('never selects brute force as the production semantic executor', () => {
    const decision = chooseSemanticSeedExecutor({
      candidatePoolEstimate: 100_000,
      topK: 256,
      hotShardAvailable: false,
      cagraProven: false,
      qdrantAvailable: true,
      freeGpuBytes: 512 * 1024 * 1024,
      requireExactOracle: true,
    });
    expect(decision.executor).toBe('QDRANT');
    expect(decision.oracle).toBe('CUVS_BRUTE_FORCE');
    expect(decision.semanticVoteKey).toBe('semantic');
  });

  it('uses CAGRA only for a proven hot shard that fits GPU budget', () => {
    const decision = chooseSemanticSeedExecutor({
      candidatePoolEstimate: 50_000,
      topK: 256,
      hotShardAvailable: true,
      cagraProven: true,
      qdrantAvailable: true,
      freeGpuBytes: 900_000_000,
      estimatedShardBytes: 400_000_000,
    });
    expect(decision.executor).toBe('CAGRA_HOT_SHARD');
    expect(decision.semanticVoteKey).toBe('semantic');
  });
});

describe('weighted graph frontier', () => {
  const seed = { canonicalOrdinal: 1, canonicalId: 'seed', sourceRef: 'seed.ts', semanticScore: 0.9, latent128Score: 0.7, latent64Score: 0.6 };

  it('penalizes deeper hops', () => {
    const n = { canonicalOrdinal: 2, canonicalId: 'n', sourceRef: 'n.ts', relationType: 'CALLS', relationWeight: 0.8, pagerank: 0.5, ontologyMatch: 0.5 };
    expect(scoreGraphFrontierCandidate(seed, n, 1)).toBeGreaterThan(scoreGraphFrontierCandidate(seed, n, 2));
  });

  it('deduplicates canonical nodes and keeps the stronger path', () => {
    const out = buildOneHopFrontier({
      seeds: [seed, { ...seed, canonicalOrdinal: 3, canonicalId: 'seed2', semanticScore: 0.4 }],
      neighborsBySeed: new Map([
        ['seed', [{ canonicalOrdinal: 10, canonicalId: 'target', sourceRef: 'target.ts', relationType: 'CALLS', relationWeight: 0.9 }]],
        ['seed2', [{ canonicalOrdinal: 10, canonicalId: 'target', sourceRef: 'target.ts', relationType: 'CALLS', relationWeight: 0.2 }]],
      ]),
      budget: { maxDepth: 2, maxEdgesVisited: 10, maxFrontier: 10, maxHyperedges: 10 },
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.seedCanonicalId).toBe('seed');
  });
});
