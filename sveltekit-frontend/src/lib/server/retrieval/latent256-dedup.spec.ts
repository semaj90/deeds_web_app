import { describe, expect, it } from 'vitest';
import { applyLatent256SemanticDedup, type Latent256DedupCandidate } from './latent256-dedup.js';
import type { Latent256CandidateProviderV1, Latent256HydrateInput, Latent256HydrateResult } from './latent256-candidate-provider.js';

function fakeProvider(vectors: Record<string, number[]>): Latent256CandidateProviderV1 {
  return {
    async hydrate(input: Latent256HydrateInput): Promise<Latent256HydrateResult> {
      const map = new Map<string, readonly number[]>();
      let found = 0;
      for (const key of input.packetKeys) {
        if (vectors[key]) {
          map.set(key, vectors[key]);
          found++;
        }
      }
      return {
        vectors: map,
        requested: input.packetKeys.length,
        found,
        missing: input.packetKeys.length - found,
        revisionMismatch: 0,
        invalidShape: 0,
        receiptChecksum: 'test-checksum',
      };
    },
  };
}

describe('applyLatent256SemanticDedup', () => {
  it('removes a lower-relevance near-duplicate and records duplicateOfPacketKey', async () => {
    const candidates: Latent256DedupCandidate[] = [
      { packetKey: 'a', sourceRef: 'src/foo.ts', relevanceScore: 0.9 },
      { packetKey: 'b', sourceRef: 'src/bar.ts', relevanceScore: 0.8 },
      { packetKey: 'c', sourceRef: 'src/baz.ts', relevanceScore: 0.7 },
    ];
    const provider = fakeProvider({ a: [1, 0, 0], b: [1, 0, 0], c: [0, 1, 0] });

    const result = await applyLatent256SemanticDedup(candidates, { threshold: 0.99, provider });

    expect(result.survivors.map(c => c.packetKey)).toEqual(['a', 'c']);
    expect(result.removed).toEqual([
      expect.objectContaining({ packetKey: 'b', duplicateOfPacketKey: 'a' }),
    ]);
  });

  it('candidates with no hydrated vector always survive (fail-open)', async () => {
    const candidates: Latent256DedupCandidate[] = [
      { packetKey: 'a', sourceRef: 'src/foo.ts', relevanceScore: 0.9 },
      { packetKey: 'b', sourceRef: 'src/bar.ts', relevanceScore: 0.8 },
    ];
    const provider = fakeProvider({ a: [1, 0, 0] }); // 'b' has no vector

    const result = await applyLatent256SemanticDedup(candidates, { threshold: 0.5, provider });

    expect(result.survivors.map(c => c.packetKey)).toEqual(['a', 'b']);
  });

  it('is deterministic across repeated calls on the same input', async () => {
    const candidates: Latent256DedupCandidate[] = [
      { packetKey: 'z', sourceRef: 'src/z.ts', relevanceScore: 0.5 },
      { packetKey: 'a', sourceRef: 'src/a.ts', relevanceScore: 0.5 },
    ];
    const provider = fakeProvider({ z: [1, 0], a: [1, 0] });

    const run1 = await applyLatent256SemanticDedup(candidates, { threshold: 0.99, provider });
    const run2 = await applyLatent256SemanticDedup(candidates, { threshold: 0.99, provider });

    expect(run1.survivors.map(c => c.packetKey)).toEqual(run2.survivors.map(c => c.packetKey));
    // tie-break by packetKey ascending -> 'a' sorts before 'z' and wins
    expect(run1.survivors.map(c => c.packetKey)).toEqual(['a']);
  });

  it('defaults to EVALUATED_LATENT256_SIMILARITY_THRESHOLD when no threshold is passed', async () => {
    const candidates: Latent256DedupCandidate[] = [
      { packetKey: 'a', sourceRef: 'src/foo.ts', relevanceScore: 0.9 },
    ];
    const provider = fakeProvider({ a: [1, 0, 0] });

    const result = await applyLatent256SemanticDedup(candidates, { provider });

    expect(result.thresholdUsed).toBe(0.9);
  });
});
