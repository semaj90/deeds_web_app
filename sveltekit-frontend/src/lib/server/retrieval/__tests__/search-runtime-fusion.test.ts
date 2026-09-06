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

describe('RF5-LIVE-REPLAY-01 — invariant: one logical lane, one canonical hydrated entity, at most one RRF vote', () => {
  it('[case 1/2] same entity via multiple Qdrant physical hits AND multiple backend-local IDs collapses to one vote (regression, already covered above by the RF5 within-lane block — reasserted here for the explicit case-name record)', () => {
    const candidates = [
      candidate({ id: 'dense-a', packetKey: 'pkt:shared', sourceRef: 'a.ts', score: 0.96, scoreSource: 'qdrant_768', embeddingLane: 'dense_768', qdrantPointId: 'qp-a', fallback_id: 'qp-a' }),
      candidate({ id: 'dense-b', packetKey: 'pkt:shared', sourceRef: 'a.ts', score: 0.81, scoreSource: 'qdrant_768', embeddingLane: 'dense_768', qdrantPointId: 'qp-b', fallback_id: 'qp-b' }),
    ];
    const fused = fuseSearchRuntimeCandidates(candidates);
    expect(fused).toHaveLength(1);
  });

  it('[case 3] same packet with multiple legitimate canonical chunks stays SEPARATE, not silently merged (real bug found + fixed this task)', () => {
    const candidates = [
      candidate({
        id: 'chunk-1', packetKey: 'pkt:multi-chunk', sourceRef: 'big-file.ts', score: 0.9,
        scoreSource: 'qdrant_768', embeddingLane: 'dense_768', qdrantPointId: 'qp-1', fallback_id: 'qp-1',
        canonicalChunkId: 'qp-1', identityStatus: 'canonical', identitySource: 'packet_key',
      }),
      candidate({
        id: 'chunk-2', packetKey: 'pkt:multi-chunk', sourceRef: 'big-file.ts', score: 0.85,
        scoreSource: 'qdrant_768', embeddingLane: 'dense_768', qdrantPointId: 'qp-2', fallback_id: 'qp-2',
        canonicalChunkId: 'qp-2', identityStatus: 'canonical', identitySource: 'packet_key',
      }),
    ];
    const fused = fuseSearchRuntimeCandidates(candidates);
    // Before the fix: getFusionIdentityKey returned 'pkt:multi-chunk' for both -> length 1, chunk-2 lost.
    expect(fused).toHaveLength(2);
    expect(fused.map((c) => c.packetKey)).toEqual(['pkt:multi-chunk', 'pkt:multi-chunk']);
  });

  it('[case 3, control] the SAME packet+chunk pair still dedupes to one vote (the fix disambiguates, it does not over-split)', () => {
    const candidates = [
      candidate({
        id: 'chunk-1a', packetKey: 'pkt:multi-chunk', sourceRef: 'big-file.ts', score: 0.9,
        scoreSource: 'qdrant_768', embeddingLane: 'dense_768', qdrantPointId: 'qp-1', fallback_id: 'qp-1',
        canonicalChunkId: 'qp-1', identityStatus: 'canonical', identitySource: 'packet_key',
      }),
      candidate({
        id: 'chunk-1b', packetKey: 'pkt:multi-chunk', sourceRef: 'big-file.ts', score: 0.4,
        scoreSource: 'postgres_trigram', qdrantPointId: 'qp-1', fallback_id: 'qp-1',
        canonicalChunkId: 'qp-1', identityStatus: 'canonical', identitySource: 'packet_key',
      }),
    ];
    const fused = fuseSearchRuntimeCandidates(candidates);
    expect(fused).toHaveLength(1);
  });

  it('[case 4] same source_ref with different canonical chunks already stays separate (safe by construction — source_group/degraded status dedupes on backend-local id, never on source_ref)', () => {
    const candidates = [
      candidate({
        id: 'sg-1', packetKey: 'a.ts', sourceRef: 'a.ts', score: 0.7, scoreSource: 'qdrant_768',
        embeddingLane: 'dense_768', qdrantPointId: 'qp-sg-1', fallback_id: 'qp-sg-1',
        canonicalChunkId: 'qp-sg-1', identityStatus: 'source_group', identitySource: 'source_ref',
      }),
      candidate({
        id: 'sg-2', packetKey: 'a.ts', sourceRef: 'a.ts', score: 0.65, scoreSource: 'qdrant_768',
        embeddingLane: 'dense_768', qdrantPointId: 'qp-sg-2', fallback_id: 'qp-sg-2',
        canonicalChunkId: 'qp-sg-2', identityStatus: 'source_group', identitySource: 'source_ref',
      }),
    ];
    const fused = fuseSearchRuntimeCandidates(candidates);
    expect(fused).toHaveLength(2);
  });

  it('[case 5] same content_hash but unproven hash domain does not over-merge with a canonical entity (safe by construction — V1 fusion never promotes projection_exact/content_hash to the canonical dedup tier; hash-domain qualification is a V2-only concept not yet wired into fusion)', () => {
    const candidates = [
      candidate({
        id: 'canon-1', packetKey: 'pkt:real', sourceRef: 'a.ts', score: 0.9, scoreSource: 'qdrant_768',
        embeddingLane: 'dense_768', identityStatus: 'canonical', identitySource: 'packet_key',
      }),
      candidate({
        id: 'hash-1', packetKey: 'hash:abc123', sourceRef: 'a.ts', score: 0.6, scoreSource: 'qdrant_768',
        embeddingLane: 'dense_768', content_hash: 'abc123', fallback_id: 'hash-1', qdrantPointId: 'hash-1',
        identityStatus: 'projection_exact', identitySource: 'content_hash',
      }),
    ];
    const fused = fuseSearchRuntimeCandidates(candidates);
    expect(fused).toHaveLength(2);
    expect(fused.find((c) => c.id === 'hash-1')!.identityStatus).toBe('projection_exact');
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

describe('RF6-SEMANTIC-VOTE-01 — one vote per revision-qualified dense candidate', () => {
  const revision = {
    sourceRevision: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    workspaceRevision: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  };

  it('deduplicates Qdrant and TurboVec executors into one dense vote while retaining provenance', () => {
    const fused = fuseSearchRuntimeCandidates([
      candidate({
        id: 'qdrant-point-1', packetKey: 'pkt:shared', sourceRef: 'src/a.ts', score: 0.91,
        scoreSource: 'qdrant_768', embeddingLane: 'dense_768', retrievalExecutor: 'qdrant', ...revision,
      }),
      candidate({
        id: 'turbovec-point-1', packetKey: 'pkt:shared', sourceRef: 'src/a.ts', score: 0.90,
        scoreSource: 'qdrant_768', embeddingLane: 'dense_768', retrievalExecutor: 'turbovec', ...revision,
      }),
    ]);

    expect(fused).toHaveLength(1);
    expect(fused[0]!.fusionScore).toBeCloseTo(1 / 61, 10);
    expect(fused[0]!.laneEvidence).toEqual([
      expect.objectContaining({
        lane: 'dense',
        contributionCount: 1,
        supportingHitCount: 2,
        executorIds: ['qdrant', 'turbovec'],
      }),
    ]);
  });

  it('keeps distinct canonical chunks separate even when packet and revisions match', () => {
    const fused = fuseSearchRuntimeCandidates([
      candidate({
        id: 'chunk-1', packetKey: 'pkt:file', sourceRef: 'src/a.ts', canonicalChunkId: 'chunk-1',
        score: 0.92, scoreSource: 'qdrant_768', embeddingLane: 'dense_768', retrievalExecutor: 'qdrant', ...revision,
      }),
      candidate({
        id: 'chunk-2', packetKey: 'pkt:file', sourceRef: 'src/a.ts', canonicalChunkId: 'chunk-2',
        score: 0.91, scoreSource: 'qdrant_768', embeddingLane: 'dense_768', retrievalExecutor: 'turbovec', ...revision,
      }),
    ]);

    expect(fused).toHaveLength(2);
    expect(fused.map((item) => item.canonicalChunkId)).toEqual(['chunk-1', 'chunk-2']);
    expect(fused.every((item) => item.laneEvidence?.[0]?.contributionCount === 1)).toBe(true);
  });

  it('does not merge the same packet/chunk across different source revisions', () => {
    const fused = fuseSearchRuntimeCandidates([
      candidate({ id: 'old', packetKey: 'pkt:file', sourceRef: 'src/a.ts', canonicalChunkId: 'chunk-1', score: 0.8, scoreSource: 'qdrant_768', embeddingLane: 'dense_768', ...revision }),
      candidate({ id: 'new', packetKey: 'pkt:file', sourceRef: 'src/a.ts', canonicalChunkId: 'chunk-1', score: 0.8, scoreSource: 'qdrant_768', embeddingLane: 'dense_768', sourceRevision: revision.sourceRevision.replaceAll('a', 'c'), workspaceRevision: revision.workspaceRevision }),
    ]);

    expect(fused).toHaveLength(2);
    expect(new Set(fused.map((item) => item.id))).toEqual(new Set(['old', 'new']));
  });

  it('is deterministic when executor hits tie on score and rank', () => {
    const hits = [
      candidate({ id: 'q', packetKey: 'pkt:tie', sourceRef: 'src/tie.ts', score: 0.5, scoreSource: 'qdrant_768', embeddingLane: 'dense_768', retrievalExecutor: 'qdrant', ...revision }),
      candidate({ id: 't', packetKey: 'pkt:tie', sourceRef: 'src/tie.ts', score: 0.5, scoreSource: 'qdrant_768', embeddingLane: 'dense_768', retrievalExecutor: 'turbovec', ...revision }),
    ];
    expect(fuseSearchRuntimeCandidates(hits)).toEqual(fuseSearchRuntimeCandidates([...hits].reverse()));
  });
});
