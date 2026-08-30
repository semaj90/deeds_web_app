import { describe, expect, it } from 'vitest';
import { selectDiverseCandidates, type RankedCandidate } from './latent256-dedup.js';
import type { Latent256CandidateProviderV1, Latent256HydrateInput, Latent256HydrateResult } from './latent256-candidate-provider.js';

function fakeProvider(vectors: Record<string, number[]>): Latent256CandidateProviderV1 {
  return {
    async hydrate(input: Latent256HydrateInput): Promise<Latent256HydrateResult> {
      const map = new Map<string, readonly number[]>();
      let found = 0;
      for (const key of input.candidateIds) {
        if (vectors[key]) {
          map.set(key, vectors[key]);
          found++;
        }
      }
      return {
        vectors: map,
        requested: input.candidateIds.length,
        found,
        missing: input.candidateIds.length - found,
        vectorsChecksum: 'test-vectors',
        revisionMismatch: 0,
        invalidShape: 0,
        receiptChecksum: 'test-checksum',
      };
    },
  };
}

const PROVENANCE = {
  checkpointRevision: 'fixture-checkpoint-v1',
  candidateSnapshotRevision: 'fixture-snapshot-v1',
  representationRevision: 'fixture-latent256-v1',
};

describe('selectDiverseCandidates', () => {
  it('refills: a skipped semantic duplicate is replaced by the next-ranked candidate, finalK is still met', async () => {
    // Rank order: a, b(dup of a), c, d, e -- pool of 5, finalK=3.
    // Without refill: top-3-then-prune would yield [a, c] (b removed, no replacement) = 2 results.
    // With refill: b is skipped and c/d fill in -> [a, c, d] = 3 results, finalK honored.
    const candidates: RankedCandidate[] = [
      { candidateId: 'a', packetKey: 'a', sourceRef: 'src/a.ts' },
      { candidateId: 'b', packetKey: 'b', sourceRef: 'src/b.ts' },
      { candidateId: 'c', packetKey: 'c', sourceRef: 'src/c.ts' },
      { candidateId: 'd', packetKey: 'd', sourceRef: 'src/d.ts' },
      { candidateId: 'e', packetKey: 'e', sourceRef: 'src/e.ts' },
    ];
    const provider = fakeProvider({
      a: [1, 0, 0], b: [1, 0, 0], // b is a near-duplicate of a
      c: [0, 1, 0], d: [0, 0, 1], e: [0.5, 0.5, 0],
    });

    const result = await selectDiverseCandidates({
      candidates, finalK: 3, candidatePoolK: 5, threshold: 0.99, provider, ...PROVENANCE,
    });

    expect(result.selected.map(c => c.packetKey)).toEqual(['a', 'c', 'd']);
    expect(result.selected).toHaveLength(3);
    expect(result.poolExhaustedBeforeFinalK).toBe(false);
    expect(result.skippedSemanticDuplicate).toEqual([
      expect.objectContaining({ packetKey: 'b', duplicateOfPacketKey: 'a' }),
    ]);
  });

  it('reports poolExhaustedBeforeFinalK honestly when the pool is too small to refill from', async () => {
    const candidates: RankedCandidate[] = [
      { candidateId: 'a', packetKey: 'a', sourceRef: 'src/a.ts' },
      { candidateId: 'b', packetKey: 'b', sourceRef: 'src/b.ts' }, // dup of a, nothing left to refill with
    ];
    const provider = fakeProvider({ a: [1, 0], b: [1, 0] });

    const result = await selectDiverseCandidates({
      candidates, finalK: 2, candidatePoolK: 2, threshold: 0.99, provider, ...PROVENANCE,
    });

    expect(result.selected).toHaveLength(1);
    expect(result.poolExhaustedBeforeFinalK).toBe(true);
  });

  it('Stage A exact content-hash collapse runs before Stage B and needs no representation', async () => {
    const candidates: RankedCandidate[] = [
      { candidateId: 'a', packetKey: 'a', sourceRef: 'src/a.ts', contentHash: 'hash-1' },
      { candidateId: 'b', packetKey: 'b', sourceRef: 'src/b.ts', contentHash: 'hash-1' }, // exact duplicate of a
      { candidateId: 'c', packetKey: 'c', sourceRef: 'src/c.ts', contentHash: 'hash-2' },
    ];
    const provider = fakeProvider({}); // no latent_256 for anyone -- Stage A alone should still collapse b

    const result = await selectDiverseCandidates({
      candidates, finalK: 3, candidatePoolK: 3, provider, ...PROVENANCE,
    });

    expect(result.selected.map(c => c.packetKey)).toEqual(['a', 'c']);
    expect(result.skippedExactDuplicate).toEqual([
      expect.objectContaining({ packetKey: 'b', duplicateOfPacketKey: 'a' }),
    ]);
  });

  it('collapseExactContentHash: false disables Stage A entirely', async () => {
    const candidates: RankedCandidate[] = [
      { candidateId: 'a', packetKey: 'a', sourceRef: 'src/a.ts', contentHash: 'hash-1' },
      { candidateId: 'b', packetKey: 'b', sourceRef: 'src/b.ts', contentHash: 'hash-1' },
    ];
    const provider = fakeProvider({});

    const result = await selectDiverseCandidates({
      candidates, finalK: 2, candidatePoolK: 2, provider, collapseExactContentHash: false, ...PROVENANCE,
    });

    expect(result.selected.map(c => c.packetKey)).toEqual(['a', 'b']);
    expect(result.skippedExactDuplicate).toHaveLength(0);
  });

  it('candidates with no hydrated latent_256 always survive Stage B (fail-open)', async () => {
    const candidates: RankedCandidate[] = [
      { candidateId: 'a', packetKey: 'a', sourceRef: 'src/a.ts' },
      { candidateId: 'b', packetKey: 'b', sourceRef: 'src/b.ts' },
    ];
    const provider = fakeProvider({ a: [1, 0, 0] }); // 'b' has no vector

    const result = await selectDiverseCandidates({
      candidates, finalK: 2, candidatePoolK: 2, threshold: 0.5, provider, ...PROVENANCE,
    });

    expect(result.selected.map(c => c.packetKey)).toEqual(['a', 'b']);
  });

  it('never reorders by relevance -- selection preserves input rank order', async () => {
    const candidates: RankedCandidate[] = [
      { candidateId: 'z', packetKey: 'z', sourceRef: 'src/z.ts' },
      { candidateId: 'a', packetKey: 'a', sourceRef: 'src/a.ts' },
    ];
    const provider = fakeProvider({ z: [1, 0], a: [0, 1] }); // not near-duplicates of each other

    const result = await selectDiverseCandidates({
      candidates, finalK: 2, candidatePoolK: 2, threshold: 0.99, provider, ...PROVENANCE,
    });

    // 'z' ranked first in input, must stay first in output -- no packetKey-based re-sort like
    // the pure-function reranker uses for tie-breaking (this function has no notion of score).
    expect(result.selected.map(c => c.packetKey)).toEqual(['z', 'a']);
  });

  it('is deterministic across repeated calls on the same input', async () => {
    const candidates: RankedCandidate[] = [
      { candidateId: 'a', packetKey: 'a', sourceRef: 'src/a.ts' },
      { candidateId: 'b', packetKey: 'b', sourceRef: 'src/b.ts' },
      { candidateId: 'c', packetKey: 'c', sourceRef: 'src/c.ts' },
    ];
    const provider = fakeProvider({ a: [1, 0, 0], b: [1, 0, 0], c: [0, 1, 0] });

    const run1 = await selectDiverseCandidates({ candidates, finalK: 2, candidatePoolK: 3, threshold: 0.99, provider, ...PROVENANCE });
    const run2 = await selectDiverseCandidates({ candidates, finalK: 2, candidatePoolK: 3, threshold: 0.99, provider, ...PROVENANCE });

    expect(run1.selected.map(c => c.packetKey)).toEqual(run2.selected.map(c => c.packetKey));
  });

  it('defaults to EVALUATED_LATENT256_SIMILARITY_THRESHOLD when no threshold is passed', async () => {
    const candidates: RankedCandidate[] = [{ candidateId: 'a', packetKey: 'a', sourceRef: 'src/a.ts' }];
    const provider = fakeProvider({ a: [1, 0, 0] });

    const result = await selectDiverseCandidates({ candidates, finalK: 1, provider, ...PROVENANCE });

    expect(result.thresholdUsed).toBe(0.9);
  });

  it('rejects invalid selection configuration before hydration', async () => {
    const candidates: RankedCandidate[] = [{ candidateId: 'a', packetKey: 'a', sourceRef: 'src/a.ts' }];
    const provider = fakeProvider({});
    await expect(selectDiverseCandidates({ candidates, finalK: 0, ...PROVENANCE, provider })).rejects.toThrow('LATENT256_FINAL_K_INVALID');
    await expect(selectDiverseCandidates({ candidates, finalK: 2, candidatePoolK: 1, ...PROVENANCE, provider })).rejects.toThrow('LATENT256_CANDIDATE_POOL_LT_FINAL_K');
    await expect(selectDiverseCandidates({ candidates, finalK: 1, threshold: 2, ...PROVENANCE, provider })).rejects.toThrow('LATENT256_SIMILARITY_THRESHOLD_INVALID');
  });
});
