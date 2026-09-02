import { describe, expect, it } from 'vitest';

import { fuseSearchRuntimeCandidates } from '../search-runtime.js';
import type { Candidate } from '../search-runtime.js';
import { reciprocalRankFusion } from '../rrf-fuse.js';

/**
 * RF6-LIVE-REPLAY-01 -- observational only, per explicit instruction: run the 6 named hard cases
 * against `rrf-fuse.ts` (the highest-breadth non-canonical owner per RF6-OWNER-MATRIX-01, 6+
 * callers incl. an MCP tool) and compare against the canonical owner's behavior on the same
 * logical scenario. No production code is changed here -- this documents actual divergence.
 *
 * `service.ts::rrfFusion` is NOT included in this live replay: it is an unexported, module-private
 * function coupled to a live, stateful `getSearchLaneRegistry()` lookup. Testing it in isolation
 * would require either exporting it (a production code change -- explicitly out of scope, "no
 * refactor") or fixture-mocking the registry/DB layer it depends on, which is a materially bigger
 * lift than this observational step warrants. Its divergence risk is therefore still only
 * evidenced by RF6-OWNER-MATRIX-01's static code reading, not a live replay. Recorded as an
 * explicit limitation, not silently treated as covered.
 */
function canonicalCandidate(overrides: Partial<Candidate> & Pick<Candidate, 'id' | 'packetKey' | 'sourceRef' | 'score' | 'scoreSource'>): Candidate {
  return { summary: '', content: '', ...overrides };
}

describe('RF6-LIVE-REPLAY-01 — rrf-fuse.ts vs canonical owner (fuseSearchRuntimeCandidates)', () => {
  it('[case 1] same canonical entity, multiple physical IDs — BOTH owners correctly collapse to one vote', () => {
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
    // No divergence on this case -- both dedupe correctly when packetKey is the shared field.
  });

  it('[case 2] duplicate hit from same logical lane — CANONICAL caps to one vote per lane; RRF-FUSE DOES NOT (real, confirmed divergence)', () => {
    const canonical = fuseSearchRuntimeCandidates([
      canonicalCandidate({ id: 'dup-a', packetKey: 'pkt:dup', sourceRef: 'a.ts', score: 0.9, scoreSource: 'qdrant_768', embeddingLane: 'dense_768' }),
      canonicalCandidate({ id: 'dup-b', packetKey: 'pkt:dup', sourceRef: 'a.ts', score: 0.5, scoreSource: 'qdrant_768', embeddingLane: 'dense_768' }),
    ]);
    // Canonical: one lane contribution regardless of how many duplicate hits that lane emits.
    const expectedCanonicalScore = 1 / (60 + 1);
    expect(canonical).toHaveLength(1);
    expect(canonical[0]!.fusionScore).toBeCloseTo(expectedCanonicalScore, 10);

    const rrfFuse = reciprocalRankFusion([
      { lane: 'dense_768', status: 'ok', hits: [
        { id: 'dup-a', packetKey: 'pkt:dup', rank: 1 },
        { id: 'dup-b', packetKey: 'pkt:dup', rank: 2 },
      ] },
    ], {}, 60);
    // DIVERGENCE: rrf-fuse.ts sums both hits' contributions unconditionally -- one lane casts
    // TWO votes for the same packetKey, inflating the score above what one lane should contribute.
    const oneVoteScore = 1 / (60 + 1);
    const summedTwoVotesScore = 1 / (60 + 1) + 1 / (60 + 2);
    expect(rrfFuse).toHaveLength(1); // still collapses to one OUTPUT row...
    expect(rrfFuse[0]!.fusionScore).toBeCloseTo(summedTwoVotesScore, 10); // ...but the SCORE is inflated
    expect(rrfFuse[0]!.fusionScore).not.toBeCloseTo(oneVoteScore, 10);
  });

  it('[case 3] same packet, different legitimate canonical chunks — CANONICAL keeps them distinct (post RF5 fix); RRF-FUSE structurally cannot (no canonicalChunkId field exists in its hit shape)', () => {
    const canonical = fuseSearchRuntimeCandidates([
      canonicalCandidate({ id: 'c1', packetKey: 'pkt:multi', sourceRef: 'big.ts', score: 0.9, scoreSource: 'qdrant_768', embeddingLane: 'dense_768', canonicalChunkId: 'qp-1', identityStatus: 'canonical', identitySource: 'packet_key' }),
      canonicalCandidate({ id: 'c2', packetKey: 'pkt:multi', sourceRef: 'big.ts', score: 0.85, scoreSource: 'qdrant_768', embeddingLane: 'dense_768', canonicalChunkId: 'qp-2', identityStatus: 'canonical', identitySource: 'packet_key' }),
    ]);
    expect(canonical).toHaveLength(2); // fixed this session (RF5-LIVE-REPLAY-01)

    const rrfFuse = reciprocalRankFusion([
      { lane: 'dense_768', status: 'ok', hits: [
        // rrf-fuse.ts's hit shape has no canonicalChunkId field at all -- there is no way for a
        // caller to even express "these are different chunks" through this owner's own envelope.
        { id: 'c1', packetKey: 'pkt:multi', rank: 1 },
        { id: 'c2', packetKey: 'pkt:multi', rank: 2 },
      ] },
    ]);
    // DIVERGENCE (structural, not just a runtime miscalculation): rrf-fuse.ts merges them into
    // one output row, silently dropping the second chunk's identity from the result set.
    expect(rrfFuse).toHaveLength(1);
  });

  it('[case 4] same source_ref, different canonical chunks — CANONICAL already safe (backend-key dedup for non-canonical status); RRF-FUSE never had source_ref as an input field, so this case cannot even be constructed against it (structural gap, not a runtime bug)', () => {
    const canonical = fuseSearchRuntimeCandidates([
      canonicalCandidate({ id: 'sg-1', packetKey: 'a.ts', sourceRef: 'a.ts', score: 0.7, scoreSource: 'qdrant_768', embeddingLane: 'dense_768', qdrantPointId: 'qp-sg-1', fallback_id: 'qp-sg-1', canonicalChunkId: 'qp-sg-1', identityStatus: 'source_group', identitySource: 'source_ref' }),
      canonicalCandidate({ id: 'sg-2', packetKey: 'a.ts', sourceRef: 'a.ts', score: 0.65, scoreSource: 'qdrant_768', embeddingLane: 'dense_768', qdrantPointId: 'qp-sg-2', fallback_id: 'qp-sg-2', canonicalChunkId: 'qp-sg-2', identityStatus: 'source_group', identitySource: 'source_ref' }),
    ]);
    expect(canonical).toHaveLength(2);
    // rrf-fuse.ts's hit shape includes an optional `sourceRef` field, but the accumulator never
    // reads it for dedup -- only `packetKey ?? id` is used (confirmed by direct code reading,
    // RF6-OWNER-MATRIX-01). Not separately replayed here since it is not reachable through any
    // input combination distinct from case 1/2 -- sourceRef is inert data on this owner's hits.
  });

  it('[case 5] same qualified content hash, different/unproven hash domain — CANONICAL never promotes content_hash to canonical dedup (V1 path); RRF-FUSE has no content_hash field at all in its hit shape, so this identity tier is unrepresentable through this owner (structural gap, not a runtime bug reachable through its actual type contract)', () => {
    const canonical = fuseSearchRuntimeCandidates([
      canonicalCandidate({ id: 'canon-1', packetKey: 'pkt:real', sourceRef: 'a.ts', score: 0.9, scoreSource: 'qdrant_768', embeddingLane: 'dense_768', identityStatus: 'canonical', identitySource: 'packet_key' }),
      canonicalCandidate({ id: 'hash-1', packetKey: 'hash:abc123', sourceRef: 'a.ts', score: 0.6, scoreSource: 'qdrant_768', embeddingLane: 'dense_768', content_hash: 'abc123', fallback_id: 'hash-1', qdrantPointId: 'hash-1', identityStatus: 'projection_exact', identitySource: 'content_hash' }),
    ]);
    expect(canonical).toHaveLength(2); // never over-merges

    // rrf-fuse.ts's hit type has no content_hash field whatsoever -- a caller cannot even pass a
    // content-hash-derived identity through this owner's envelope; whatever value it puts in
    // `packetKey` is treated as fully canonical-equivalent dedup authority, with no tier below it.
    const rrfFuse = reciprocalRankFusion([
      { lane: 'dense_768', status: 'ok', hits: [
        { id: 'canon-1', packetKey: 'pkt:real', rank: 1 },
        { id: 'hash-1', packetKey: 'hash:abc123', rank: 2 },
      ] },
    ]);
    expect(rrfFuse).toHaveLength(2); // happens to stay separate here only because the two
    // packetKey VALUES differ -- there is no structural guarantee against a caller passing a
    // content-hash string into packetKey and having it collide with an unrelated real packet_key.
  });

  it('[case 6] hydration miss / degraded local identity — CANONICAL tracks identityStatus explicitly; RRF-FUSE has no identityStatus concept at all, every hit is treated identically regardless of whether packetKey resolved from real identity or fell back to a raw id', () => {
    const canonical = fuseSearchRuntimeCandidates([
      canonicalCandidate({ id: 'deg-a', packetKey: 'raw-a', sourceRef: 'a.ts', score: 0.75, scoreSource: 'qdrant_768', embeddingLane: 'dense_768', identityStatus: 'degraded', identitySource: 'lane_id_fallback', fallback_id: 'backend-a', qdrantPointId: 'backend-a' }),
    ]);
    expect(canonical[0]!.identityStatus).toBe('degraded'); // observable, never silently promoted

    const rrfFuse = reciprocalRankFusion([
      { lane: 'dense_768', status: 'ok', hits: [{ id: 'backend-a', rank: 1 }] }, // no packetKey supplied
    ]);
    // DIVERGENCE (structural): rrf-fuse.ts's FusedHit has no identityStatus field whatsoever --
    // there is no way to observe, downstream, whether a given fused hit's packetKey came from
    // real identity or a raw fallback id. It is not "silently promoted to canonical" in the sense
    // of being merged with unrelated canonical evidence (there is nothing else to merge with
    // here), but the degraded/canonical distinction itself is simply unrepresentable in this
    // owner's output type -- a caller cannot tell the two apart even if it wanted to.
    expect(rrfFuse[0]).not.toHaveProperty('identityStatus');
  });
});
