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
    expect(fused[0]!.laneEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lane: 'dense',
          bestRank: 1,
          bestScore: 0.95,
          contributionCount: 1,
          supportingHitCount: 2,
        }),
        expect.objectContaining({
          lane: 'lexical',
          bestRank: 1,
          bestScore: 0.8,
          contributionCount: 1,
          supportingHitCount: 1,
        }),
      ]),
    );
  });
});

describe('fuseSearchRuntimeCandidates — RF5 within-lane canonical dedup', () => {
  it('keeps one canonical vote per logical lane and preserves supporting hits', () => {
    const candidates = [
      candidate({
        id: 'dense-a',
        packetKey: 'pkt:shared',
        sourceRef: 'a.ts',
        score: 0.96,
        scoreSource: 'qdrant_768',
        embeddingLane: 'dense_768',
        qdrantPointId: 'qp-a',
        fallback_id: 'qp-a',
      }),
      candidate({
        id: 'dense-b',
        packetKey: 'pkt:shared',
        sourceRef: 'a.ts',
        score: 0.81,
        scoreSource: 'qdrant_768',
        embeddingLane: 'dense_768',
        qdrantPointId: 'qp-b',
        fallback_id: 'qp-b',
      }),
      candidate({
        id: 'lexical-a',
        packetKey: 'pkt:shared',
        sourceRef: 'a.ts',
        score: 0.7,
        scoreSource: 'postgres_trigram',
        fallback_id: 'lex-a',
      }),
    ];

    const fused = fuseSearchRuntimeCandidates(candidates);
    expect(fused).toHaveLength(1);
    expect(fused[0]!.fusionScore).toBeCloseTo((1 / (60 + 1)) + (1 / (60 + 1)), 10);
    expect(fused[0]!.laneEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lane: 'dense',
          bestRank: 1,
          bestScore: 0.96,
          contributionCount: 1,
          supportingHitCount: 2,
          supportingBackendIds: expect.arrayContaining(['qp-a', 'qp-b']),
        }),
        expect.objectContaining({
          lane: 'lexical',
          bestRank: 1,
          bestScore: 0.7,
          contributionCount: 1,
          supportingHitCount: 1,
        }),
      ]),
    );
  });

  it('keeps different entities from the same logical lane separate', () => {
    const candidates = [
      candidate({
        id: 'dense-x',
        packetKey: 'pkt:x',
        sourceRef: 'x.ts',
        score: 0.98,
        scoreSource: 'qdrant_768',
        embeddingLane: 'dense_768',
        qdrantPointId: 'qp-x',
        fallback_id: 'qp-x',
      }),
      candidate({
        id: 'dense-y',
        packetKey: 'pkt:y',
        sourceRef: 'y.ts',
        score: 0.91,
        scoreSource: 'qdrant_768',
        embeddingLane: 'dense_768',
        qdrantPointId: 'qp-y',
        fallback_id: 'qp-y',
      }),
    ];

    const fused = fuseSearchRuntimeCandidates(candidates);
    expect(fused).toHaveLength(2);
    expect(fused.map((c) => c.packetKey)).toEqual(['pkt:x', 'pkt:y']);
    for (const item of fused) {
      expect(item.laneEvidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            lane: 'dense',
            contributionCount: 1,
            supportingHitCount: 1,
          }),
        ]),
      );
    }
  });

  it('preserves degraded identities without silently cross-deduping them', () => {
    const candidates = [
      candidate({
        id: 'deg-a',
        packetKey: 'raw-a',
        sourceRef: 'a.ts',
        score: 0.75,
        scoreSource: 'qdrant_768',
        embeddingLane: 'dense_768',
        identityStatus: 'degraded',
        identitySource: 'lane_id_fallback',
        fallback_id: 'backend-a',
        qdrantPointId: 'backend-a',
      }),
      candidate({
        id: 'deg-b',
        packetKey: 'raw-b',
        sourceRef: 'b.ts',
        score: 0.73,
        scoreSource: 'qdrant_768',
        embeddingLane: 'dense_768',
        identityStatus: 'degraded',
        identitySource: 'lane_id_fallback',
        fallback_id: 'backend-b',
        qdrantPointId: 'backend-b',
      }),
    ];

    const fused = fuseSearchRuntimeCandidates(candidates);
    expect(fused).toHaveLength(2);
    expect(fused.every((item) => item.identityStatus === 'degraded')).toBe(true);
    expect(fused.map((item) => item.laneEvidence?.[0]?.supportingBackendIds[0])).toEqual(
      expect.arrayContaining(['backend-a', 'backend-b']),
    );
  });

  it('collapses exact duplicate degraded backend identities only', () => {
    const candidates = [
      candidate({
        id: 'deg-a-1',
        packetKey: 'raw-a',
        sourceRef: 'a.ts',
        score: 0.75,
        scoreSource: 'qdrant_768',
        embeddingLane: 'dense_768',
        identityStatus: 'degraded',
        identitySource: 'lane_id_fallback',
        fallback_id: 'backend-a',
        qdrantPointId: 'backend-a',
      }),
      candidate({
        id: 'deg-a-2',
        packetKey: 'raw-a',
        sourceRef: 'a.ts',
        score: 0.72,
        scoreSource: 'qdrant_768',
        embeddingLane: 'dense_768',
        identityStatus: 'degraded',
        identitySource: 'lane_id_fallback',
        fallback_id: 'backend-a',
        qdrantPointId: 'backend-a',
      }),
    ];

    const fused = fuseSearchRuntimeCandidates(candidates);
    expect(fused).toHaveLength(1);
    expect(fused[0]!.identityStatus).toBe('degraded');
    expect(fused[0]!.laneEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lane: 'dense',
          supportingHitCount: 2,
          supportingBackendIds: expect.arrayContaining(['backend-a']),
        }),
      ]),
    );
  });

  it('is deterministic for the same input', () => {
    const candidates = [
      candidate({
        id: 'det-a',
        packetKey: 'pkt:det',
        sourceRef: 'det.ts',
        score: 0.84,
        scoreSource: 'qdrant_768',
        embeddingLane: 'dense_768',
        qdrantPointId: 'qp-det-a',
        fallback_id: 'qp-det-a',
      }),
      candidate({
        id: 'det-b',
        packetKey: 'pkt:det',
        sourceRef: 'det.ts',
        score: 0.66,
        scoreSource: 'postgres_trigram',
        fallback_id: 'lex-det',
      }),
    ];

    const first = fuseSearchRuntimeCandidates(candidates);
    const second = fuseSearchRuntimeCandidates(candidates);
    expect(first).toEqual(second);
    expect(first[0]!.laneEvidence?.map((entry) => entry.lane)).toEqual(['dense', 'lexical']);
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
