import { describe, expect, it } from 'vitest';

import { fuseSearchRuntimeCandidates, type Candidate } from '../search-runtime.js';
import { combineViaRRF, type ContextHit, type RetrievalLaneName } from '../rrf-combiner.js';

/**
 * parent-atlas-rrf-fusion-consolidation task 1.3b: empirical fixture-based diff between the two
 * confirmed-live RRF primitives (fuseSearchRuntimeCandidates, the declared canonical owner in
 * search-runtime.ts, and combineViaRRF in rrf-combiner.ts). Structural reading in tasks.md found
 * both use k=60 and both implement their own lane-collapsing/identity-dedup logic independently.
 * This file empirically checks whether that structural similarity produces numerically equivalent
 * output under matching conditions, and where it genuinely diverges.
 *
 * Read-only investigation -- does not modify either primitive.
 */

function candidate(overrides: Partial<Candidate>): Candidate {
  return {
    id: 'default-id',
    packetKey: 'pkt:shared',
    sourceRef: 'src/shared.ts',
    summary: '',
    content: '',
    score: 0.9,
    scoreSource: 'qdrant_768',
    ...overrides,
  };
}

describe('RRF cross-primitive parity: single-candidate-per-lane, no weighting', () => {
  it('produces the SAME combined score for a shared identity present in 2 lanes at rank 1', () => {
    // Canonical: two candidates, same packetKey/sourceRef, one dense (qdrant_768) one lexical
    // (postgres_trigram) source, each the sole (rank-1) member of its logical lane.
    const canonicalInput: Candidate[] = [
      candidate({ id: 'dense-hit', scoreSource: 'qdrant_768', score: 0.9 }),
      candidate({ id: 'lexical-hit', scoreSource: 'postgres_trigram', score: 0.7 }),
    ];
    const canonicalResult = fuseSearchRuntimeCandidates(canonicalInput);
    expect(canonicalResult).toHaveLength(1);
    const canonicalScore = canonicalResult[0]!.fusionScore;
    // 2 lane groups, each rank 1 -> 2 * 1/(60+1)
    expect(canonicalScore).toBeCloseTo(2 * (1 / 61), 10);

    // combineViaRRF: same shared identity (packet_key), 2 lanes, each with the identity at
    // rank 0 (0-indexed -> laneRank 1), default weights (all 1.0), default k=60.
    const denseLane: ContextHit[] = [{ id: 'dense-hit', source: 'qdrant_vector', score: 0.9, metadata: { packet_key: 'pkt:shared' } }];
    const lexicalLane: ContextHit[] = [{ id: 'lexical-hit', source: 'postgres_trigram', score: 0.7, metadata: { packet_key: 'pkt:shared' } }];
    const laneNames: RetrievalLaneName[] = ['qdrant_vector', 'postgres_trigram'];
    const combinerResult = combineViaRRF([denseLane, lexicalLane], laneNames, { deduplicateBy: 'id' });

    // combineViaRRF's own identity resolution here groups by raw `id`, not packet_key, unless the
    // hits are pre-normalized via normalizeCanonicalIdentity (see rrf-canonical-identity.test.ts).
    // Without that step, these are 2 SEPARATE hits by id -- confirms the two primitives are NOT
    // interchangeable as drop-in replacements: callers must apply the same identity-normalization
    // discipline to get comparable behavior from combineViaRRF that fuseSearchRuntimeCandidates
    // provides internally via getRevisionQualifiedFusionIdentityKey.
    expect(combinerResult).toHaveLength(2);

    // Applying the SAME canonical-identity normalization pattern combineViaRRF's own test suite
    // uses (rrf-canonical-identity.test.ts) closes the gap:
    const denseLaneWithMetadata = denseLane; // already carries packet_key
    const lexicalLaneWithMetadata = lexicalLane;
    const combinerResultNormalized = combineViaRRF(
      [denseLaneWithMetadata, lexicalLaneWithMetadata],
      laneNames,
      { deduplicateBy: 'id' },
    );
    // Still 2 distinct `id`s (deduplicateBy: 'id' dedupes WITHIN a lane, not across lanes by
    // packet_key) -- combineViaRRF requires the caller to pre-normalize ids to the canonical key
    // (via normalizeCanonicalIdentity) for cross-lane collapsing, whereas fuseSearchRuntimeCandidates
    // does this collapsing internally and unconditionally. This is the concrete, empirical
    // behavioral difference between the two primitives, not just a structural guess.
    expect(combinerResultNormalized).toHaveLength(2);
  });

  it('confirms combineViaRRF DOES match the canonical when callers pre-normalize identity (as rrf-integration.ts does)', () => {
    const denseLane: ContextHit[] = [{ id: 'pkt:shared', source: 'qdrant_vector', score: 0.9, metadata: { packet_key: 'pkt:shared' } }];
    const lexicalLane: ContextHit[] = [{ id: 'pkt:shared', source: 'postgres_trigram', score: 0.7, metadata: { packet_key: 'pkt:shared' } }];
    const laneNames: RetrievalLaneName[] = ['qdrant_vector', 'postgres_trigram'];
    const result = combineViaRRF([denseLane, lexicalLane], laneNames, { deduplicateBy: 'id' });

    expect(result).toHaveLength(1);
    // Same numerical result as the canonical primitive's 2 * 1/(60+1) for this scenario, CONFIRMING
    // numerical equivalence once identity is pre-normalized to the same key.
    expect(result[0]!.combinedScore).toBeCloseTo(2 * (1 / 61), 10);
  });

  it('diverges from the canonical when a non-default laneWeight is supplied (a real, not hypothetical, difference)', () => {
    const denseLane: ContextHit[] = [{ id: 'pkt:shared', source: 'qdrant_vector', score: 0.9, metadata: { packet_key: 'pkt:shared' } }];
    const lexicalLane: ContextHit[] = [{ id: 'pkt:shared', source: 'postgres_trigram', score: 0.7, metadata: { packet_key: 'pkt:shared' } }];
    const laneNames: RetrievalLaneName[] = ['qdrant_vector', 'postgres_trigram'];
    // fuseSearchRuntimeCandidates has NO lane-weight parameter at all -- this option only exists
    // on combineViaRRF. Any caller that passes non-default weights is using a capability the
    // canonical primitive structurally cannot replicate without a code change.
    const weighted = combineViaRRF([denseLane, lexicalLane], laneNames, {
      deduplicateBy: 'id',
      weights: { qdrant_vector: 2.0, postgres_trigram: 1.0 },
    });
    expect(weighted[0]!.combinedScore).toBeCloseTo(2.0 / 61 + 1.0 / 61, 10);
    expect(weighted[0]!.combinedScore).not.toBeCloseTo(2 * (1 / 61), 10);
  });
});
