import { describe, expect, it } from 'vitest';

import { fuseSearchRuntimeCandidates } from '../search-runtime.js';
import type { Candidate } from '../search-runtime.js';
import { reciprocalRankFusion } from '../rrf-fuse.js';

/**
 * RF6-LIVE-REPLAY-01 began as an observational divergence test. After
 * RF6-RRF-FUSE-HARDEN-01 it becomes a regression bridge: the highest-breadth
 * legacy owner must now preserve the canonical invariants proven here, while
 * remaining a compatibility owner until RF7 extracts/migrates the complete
 * SearchRuntime fusion boundary.
 */
function canonicalCandidate(overrides: Partial<Candidate> & Pick<Candidate, 'id' | 'packetKey' | 'sourceRef' | 'score' | 'scoreSource'>): Candidate {
  return { summary: '', content: '', ...overrides };
}

describe('RF6-RRF-FUSE-HARDEN-01 — legacy rrf-fuse moves toward canonical invariants', () => {
  it('[case 1] same canonical entity, multiple physical IDs — both owners collapse to one output and one lane vote', () => {
    const canonical = fuseSearchRuntimeCandidates([
      canonicalCandidate({ id: 'q1', packetKey: 'pkt:shared', sourceRef: 'a.ts', score: 0.9, scoreSource: 'qdrant' }),
      canonicalCandidate({ id: 'q2', packetKey: 'pkt:shared', sourceRef: 'a.ts', score: 0.5, scoreSource: 'qdrant' }),
    ]);
    expect(canonical).toHaveLength(1);

    const rrfFuse = reciprocalRankFusion([
      { lane: 'dense_768', status: 'ok', hits: [
        { id: 'q1', packetKey: 'pkt:shared', rank: 1 },
        { id: 'q2', packetKey: 'pkt:shared', rank: 2 },
      ] },
    ]);
    expect(rrfFuse).toHaveLength(1);
    expect(rrfFuse[0]!.fusionScore).toBeCloseTo(1 / 61, 10);
    expect(rrfFuse[0]!.sources).toHaveLength(2); // both projections remain provenance/support
  });

  it('[case 2] duplicate hit from one logical lane contributes once (best rank wins)', () => {
    const canonical = fuseSearchRuntimeCandidates([
      canonicalCandidate({ id: 'dup-a', packetKey: 'pkt:dup', sourceRef: 'a.ts', score: 0.9, scoreSource: 'qdrant_768', embeddingLane: 'dense_768' }),
      canonicalCandidate({ id: 'dup-b', packetKey: 'pkt:dup', sourceRef: 'a.ts', score: 0.5, scoreSource: 'qdrant_768', embeddingLane: 'dense_768' }),
    ]);
    const expectedCanonicalScore = 1 / 61;
    expect(canonical).toHaveLength(1);
    expect(canonical[0]!.fusionScore).toBeCloseTo(expectedCanonicalScore, 10);

    const rrfFuse = reciprocalRankFusion([
      { lane: 'dense_768', status: 'ok', hits: [
        { id: 'dup-a', packetKey: 'pkt:dup', rank: 1 },
        { id: 'dup-b', packetKey: 'pkt:dup', rank: 2 },
      ] },
    ], {}, 60);
    expect(rrfFuse).toHaveLength(1);
    expect(rrfFuse[0]!.fusionScore).toBeCloseTo(expectedCanonicalScore, 10);
    expect(rrfFuse[0]!.sources).toHaveLength(2);
    expect(rrfFuse[0]!.provenance?.dense?.rank).toBe(1);
  });

  it('[case 2b] Qdrant/dense and TurboVec are executor aliases of one semantic logical lane, not two RRF votes', () => {
    const rrfFuse = reciprocalRankFusion([
      { lane: 'dense_768', status: 'ok', hits: [
        { id: 'qdrant-1', packetKey: 'pkt:semantic', rank: 2, rawScore: 0.88 },
      ] },
      { lane: 'turbovec', status: 'ok', hits: [
        { id: 'turbo-1', packetKey: 'pkt:semantic', rank: 1, rawScore: 0.80 },
      ] },
    ], { dense_768: 1, turbovec: 0.9 }, 60);

    expect(rrfFuse).toHaveLength(1);
    // max(one dense executor contribution), never sum(dense + turbovec)
    const denseContribution = 1 / 62;
    const turboContribution = 0.9 / 61;
    expect(rrfFuse[0]!.fusionScore).toBeCloseTo(Math.max(denseContribution, turboContribution), 10);
    expect(rrfFuse[0]!.fusionScore).not.toBeCloseTo(denseContribution + turboContribution, 10);
    expect(rrfFuse[0]!.sources).toHaveLength(2);
    expect(rrfFuse[0]!.provenance?.dense).toBeDefined();
  });

  it('[case 3] same packet with different explicit canonical chunks remains two outputs', () => {
    const canonical = fuseSearchRuntimeCandidates([
      canonicalCandidate({ id: 'c1', packetKey: 'pkt:multi', sourceRef: 'big.ts', score: 0.9, scoreSource: 'qdrant_768', embeddingLane: 'dense_768', canonicalChunkId: 'qp-1', identityStatus: 'canonical', identitySource: 'packet_key' }),
      canonicalCandidate({ id: 'c2', packetKey: 'pkt:multi', sourceRef: 'big.ts', score: 0.85, scoreSource: 'qdrant_768', embeddingLane: 'dense_768', canonicalChunkId: 'qp-2', identityStatus: 'canonical', identitySource: 'packet_key' }),
    ]);
    expect(canonical).toHaveLength(2);

    const rrfFuse = reciprocalRankFusion([
      { lane: 'dense_768', status: 'ok', hits: [
        { id: 'c1', packetKey: 'pkt:multi', canonicalChunkId: 'qp-1', identityStatus: 'canonical', rank: 1 },
        { id: 'c2', packetKey: 'pkt:multi', canonicalChunkId: 'qp-2', identityStatus: 'canonical', rank: 2 },
      ] },
    ]);
    expect(rrfFuse).toHaveLength(2);
    expect(rrfFuse.map((hit) => hit.canonicalChunkId).sort()).toEqual(['qp-1', 'qp-2']);
  });

  it('[case 4] source-group/degraded identities are local-id scoped and do not over-merge by packet/source group', () => {
    const canonical = fuseSearchRuntimeCandidates([
      canonicalCandidate({ id: 'sg-1', packetKey: 'a.ts', sourceRef: 'a.ts', score: 0.7, scoreSource: 'qdrant_768', embeddingLane: 'dense_768', qdrantPointId: 'qp-sg-1', fallback_id: 'qp-sg-1', canonicalChunkId: 'qp-sg-1', identityStatus: 'source_group', identitySource: 'source_ref' }),
      canonicalCandidate({ id: 'sg-2', packetKey: 'a.ts', sourceRef: 'a.ts', score: 0.65, scoreSource: 'qdrant_768', embeddingLane: 'dense_768', qdrantPointId: 'qp-sg-2', fallback_id: 'qp-sg-2', canonicalChunkId: 'qp-sg-2', identityStatus: 'source_group', identitySource: 'source_ref' }),
    ]);
    expect(canonical).toHaveLength(2);

    const rrfFuse = reciprocalRankFusion([
      { lane: 'dense_768', status: 'ok', hits: [
        { id: 'qp-sg-1', packetKey: 'a.ts', sourceRef: 'a.ts', identityStatus: 'source_group', rank: 1 },
        { id: 'qp-sg-2', packetKey: 'a.ts', sourceRef: 'a.ts', identityStatus: 'source_group', rank: 2 },
      ] },
    ]);
    expect(rrfFuse).toHaveLength(2);
    expect(rrfFuse.every((hit) => hit.identityStatus === 'source_group')).toBe(true);
  });

  it('[case 5] lower-trust identity status stays observable rather than becoming indistinguishable from canonical', () => {
    const rrfFuse = reciprocalRankFusion([
      { lane: 'dense_768', status: 'ok', hits: [
        { id: 'hash-1', packetKey: 'hash:abc123', identityStatus: 'projection_exact', rank: 1 },
      ] },
    ]);
    expect(rrfFuse).toHaveLength(1);
    expect(rrfFuse[0]!.identityStatus).toBe('projection_exact');
  });

  it('[case 6] hydration miss / degraded local identity remains explicitly degraded', () => {
    const canonical = fuseSearchRuntimeCandidates([
      canonicalCandidate({ id: 'deg-a', packetKey: 'raw-a', sourceRef: 'a.ts', score: 0.75, scoreSource: 'qdrant_768', embeddingLane: 'dense_768', identityStatus: 'degraded', identitySource: 'lane_id_fallback', fallback_id: 'backend-a', qdrantPointId: 'backend-a' }),
    ]);
    expect(canonical[0]!.identityStatus).toBe('degraded');

    const rrfFuse = reciprocalRankFusion([
      { lane: 'dense_768', status: 'ok', hits: [{ id: 'backend-a', identityStatus: 'degraded', rank: 1 }] },
    ]);
    expect(rrfFuse).toHaveLength(1);
    expect(rrfFuse[0]!.identityStatus).toBe('degraded');
  });
});
