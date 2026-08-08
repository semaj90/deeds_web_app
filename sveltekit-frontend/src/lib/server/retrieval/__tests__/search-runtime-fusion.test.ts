import { describe, expect, it } from 'vitest';

import { fuseSearchRuntimeCandidates, getFusionIdentityKey } from '../search-runtime.js';
import type { Candidate } from '../search-runtime.js';

function candidate(overrides: Partial<Candidate> & Pick<Candidate, 'id' | 'packetKey' | 'sourceRef' | 'score' | 'scoreSource'>): Candidate {
  return {
    summary: '',
    content: '',
    ...overrides,
  };
}

describe('getFusionIdentityKey', () => {
  it('prefers symbolVersionId over packetKey over id', () => {
    expect(
      getFusionIdentityKey(
        candidate({ id: 'qdrant-1', packetKey: 'pkt:1', symbolVersionId: 'sym:1', sourceRef: 'a.ts', score: 1, scoreSource: 'qdrant' })
      )
    ).toBe('sym:1');
  });
});

describe('fuseSearchRuntimeCandidates — within-lane best-rank fix', () => {
  it('keeps the BEST rank for a duplicate identity within one lane, not the worst', () => {
    // Same lane (qdrant), same identity (packetKey pkt:shared), two chunk projections.
    // Sorted best-first: rank 1 should win, not rank 2.
    const candidates = [
      candidate({ id: 'q1', packetKey: 'pkt:shared', sourceRef: 'a.ts', score: 0.95, scoreSource: 'qdrant' }),
      candidate({ id: 'q2', packetKey: 'pkt:shared', sourceRef: 'a.ts', score: 0.10, scoreSource: 'qdrant' }),
    ];

    const fused = fuseSearchRuntimeCandidates(candidates);
    expect(fused).toHaveLength(1);

    // Best rank (1) -> 1/(60+1); worst rank (2) -> 1/(60+2). If the bug were still present,
    // the worse rank would win and fusionScore would be the smaller value.
    const expectedBestRankScore = 1 / (60 + 1);
    const expectedWorstRankScore = 1 / (60 + 2);
    expect(fused[0]!.fusionScore).toBeCloseTo(expectedBestRankScore, 10);
    expect(fused[0]!.fusionScore).not.toBeCloseTo(expectedWorstRankScore, 10);
  });

  it('does not let a same-lane duplicate cast more than one lane contribution', () => {
    const candidates = [
      candidate({ id: 'q1', packetKey: 'pkt:shared', sourceRef: 'a.ts', score: 0.95, scoreSource: 'qdrant' }),
      candidate({ id: 'q2', packetKey: 'pkt:shared', sourceRef: 'a.ts', score: 0.10, scoreSource: 'qdrant' }),
      candidate({ id: 'b1', packetKey: 'pkt:shared', sourceRef: 'a.ts', score: 0.80, scoreSource: 'postgres_trigram' }),
    ];

    const fused = fuseSearchRuntimeCandidates(candidates);
    expect(fused).toHaveLength(1);
    // One vote from qdrant (best of the two duplicates) + one vote from postgres_trigram.
    const expected = 1 / (60 + 1) + 1 / (60 + 1);
    expect(fused[0]!.fusionScore).toBeCloseTo(expected, 10);
    expect(fused[0]!.contributingLanes).toEqual(expect.arrayContaining(['qdrant', 'postgres_trigram']));
  });
});

describe('fuseSearchRuntimeCandidates — identity status propagation', () => {
  it('marks a fused candidate canonical when the winning candidate has canonical identity', () => {
    const candidates = [
      candidate({
        id: 'q1',
        packetKey: 'pkt:1',
        sourceRef: 'a.ts',
        score: 0.9,
        scoreSource: 'qdrant',
        identityStatus: 'canonical',
        identitySource: 'packet_key',
      }),
    ];
    const [fused] = fuseSearchRuntimeCandidates(candidates);
    expect(fused!.identityStatus).toBe('canonical');
    expect(fused!.identitySource).toBe('packet_key');
  });

  it('marks a fused candidate degraded when its only occurrence is degraded', () => {
    const candidates = [
      candidate({
        id: 'q1',
        packetKey: 'q1', // packetKey collapsed to the raw id — this is the degraded case
        sourceRef: 'a.ts',
        score: 0.9,
        scoreSource: 'qdrant',
        identityStatus: 'degraded',
        identitySource: 'lane_id_fallback',
      }),
    ];
    const [fused] = fuseSearchRuntimeCandidates(candidates);
    expect(fused!.identityStatus).toBe('degraded');
    expect(fused!.identitySource).toBe('lane_id_fallback');
  });

  it('promotes to canonical when a later-merged lane proves real identity for a degraded base', () => {
    // Highest-scoring occurrence (wins as base) has degraded identity; a lower-scoring
    // occurrence of the SAME fused entity from another lane has real canonical identity.
    // The fused candidate must not stay degraded just because the base occurrence was weak.
    const candidates = [
      candidate({
        id: 'pkt:shared',
        packetKey: 'pkt:shared',
        sourceRef: 'a.ts',
        score: 0.95,
        scoreSource: 'qdrant',
        identityStatus: 'degraded',
        identitySource: 'lane_id_fallback',
      }),
      candidate({
        id: 'bm25-row-9',
        packetKey: 'pkt:shared',
        sourceRef: 'a.ts',
        score: 0.50,
        scoreSource: 'postgres_trigram',
        identityStatus: 'canonical',
        identitySource: 'packet_key',
      }),
    ];
    const [fused] = fuseSearchRuntimeCandidates(candidates);
    expect(fused!.identityStatus).toBe('canonical');
    expect(fused!.identitySource).toBe('packet_key');
  });

  it('treats absent identityStatus as canonical for backward compatibility', () => {
    const candidates = [
      candidate({ id: 'q1', packetKey: 'pkt:1', sourceRef: 'a.ts', score: 0.9, scoreSource: 'qdrant' }),
    ];
    const [fused] = fuseSearchRuntimeCandidates(candidates);
    expect(fused!.identityStatus).toBe('canonical');
  });
});
