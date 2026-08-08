import { describe, expect, it } from 'vitest';

import { normalizeCanonicalIdentity, resolveCanonicalCandidateId } from '../rrf-integration.js';
import { combineViaRRF, type ContextHit, type RetrievalLaneName } from '../rrf-combiner.js';

describe('resolveCanonicalCandidateId', () => {
  it('prefers symbol_version_id over packet_key and source_ref', () => {
    const hit: ContextHit = {
      id: 'qdrant-point-abc',
      source: 'qdrant_vector',
      score: 0.9,
      metadata: {
        symbol_version_id: 'sym:v2',
        packet_key: 'pkt:1',
        source_ref: 'src/foo.ts',
      },
    };
    expect(resolveCanonicalCandidateId(hit)).toEqual({ id: 'sym:v2', source: 'symbol_version_id' });
  });

  it('falls back to packet_key when symbol_version_id is absent', () => {
    const hit: ContextHit = {
      id: 'qdrant-point-abc',
      source: 'qdrant_vector',
      score: 0.9,
      metadata: { packet_key: 'pkt:1', source_ref: 'src/foo.ts' },
    };
    expect(resolveCanonicalCandidateId(hit)).toEqual({ id: 'pkt:1', source: 'packet_key' });
  });

  it('falls back to source_ref when neither symbol_version_id nor packet_key is present', () => {
    const hit: ContextHit = {
      id: 'qdrant-point-abc',
      source: 'qdrant_vector',
      score: 0.9,
      metadata: { source_ref: 'src/foo.ts' },
    };
    expect(resolveCanonicalCandidateId(hit)).toEqual({ id: 'src/foo.ts', source: 'source_ref' });
  });

  it('falls back to the lane-local id, tagged as degraded, when no identity metadata exists', () => {
    const hit: ContextHit = {
      id: 'concept-hit-9',
      source: 'concept_overlap',
      score: 0.4,
    };
    expect(resolveCanonicalCandidateId(hit)).toEqual({ id: 'concept-hit-9', source: 'lane_id_fallback' });
  });

  it('never returns a Qdrant point id as the canonical candidate id when a canonical field exists', () => {
    // Negative assertion: catches a future regression where projection identity
    // (qdrant_point_id) leaks back into the fusion-facing canonical id.
    const hit: ContextHit = {
      id: 'qdrant-point-abc',
      source: 'qdrant_vector',
      score: 0.9,
      metadata: { qdrant_point_id: 'qdrant-point-abc', packet_key: 'pkt:1' },
    };
    const resolved = resolveCanonicalCandidateId(hit);
    expect(resolved.id).not.toBe(hit.metadata!.qdrant_point_id);
    expect(resolved).toEqual({ id: 'pkt:1', source: 'packet_key' });
  });
});

describe('normalizeCanonicalIdentity', () => {
  it('rewrites id to the canonical identity, tags identity_resolution_source, and preserves raw_lane_id', () => {
    const [normalized] = normalizeCanonicalIdentity([
      {
        id: 'qdrant-point-abc',
        source: 'qdrant_vector',
        score: 0.9,
        metadata: { packet_key: 'pkt:1' },
      },
    ]);
    expect(normalized.id).toBe('pkt:1');
    expect(normalized.metadata?.raw_lane_id).toBe('qdrant-point-abc');
    expect(normalized.metadata?.identity_resolution_source).toBe('packet_key');
  });

  it('tags lane_id_fallback even when the id itself is left unchanged', () => {
    const hit: ContextHit = { id: 'concept-hit-9', source: 'concept_overlap', score: 0.4 };
    const [normalized] = normalizeCanonicalIdentity([hit]);
    expect(normalized.id).toBe('concept-hit-9');
    expect(normalized.metadata?.raw_lane_id).toBeUndefined(); // id didn't change, nothing to preserve
    expect(normalized.metadata?.identity_resolution_source).toBe('lane_id_fallback');
  });

  it('does not surface qdrant_point_id as the canonical id after normalization', () => {
    const [normalized] = normalizeCanonicalIdentity([
      {
        id: 'qdrant-point-xyz',
        source: 'qdrant_vector',
        score: 0.9,
        metadata: { qdrant_point_id: 'qdrant-point-xyz', symbol_version_id: 'sym:v9' },
      },
    ]);
    expect(normalized.id).not.toBe(normalized.metadata!.qdrant_point_id);
    expect(normalized.id).toBe('sym:v9');
  });
});

describe('canonical identity closes the multi-projection double-vote bug', () => {
  it('collapses two Qdrant projections of the same symbol into one RRF candidate', () => {
    // Same symbol, two different Qdrant point IDs (two projections/chunks), same packet_key.
    const qdrantLane: ContextHit[] = [
      { id: 'qdrant-point-1', source: 'qdrant_vector', score: 0.95, metadata: { packet_key: 'pkt:shared' } },
      { id: 'qdrant-point-2', source: 'qdrant_vector', score: 0.80, metadata: { packet_key: 'pkt:shared' } },
    ];
    const turbovecLane: ContextHit[] = [
      { id: 'turbovec-candidate-9', source: 'turbovec_ann', score: 0.70, metadata: { packet_key: 'pkt:shared' } },
    ];

    const laneNames: RetrievalLaneName[] = ['qdrant_vector', 'turbovec_ann'];

    const withoutNormalization = combineViaRRF([qdrantLane, turbovecLane], laneNames, {
      deduplicateBy: 'id',
    });
    // Before the fix: 3 distinct point/stable-key ids -> 3 separate RRF candidates.
    expect(withoutNormalization).toHaveLength(3);

    const normalizedLanes = [qdrantLane, turbovecLane].map(normalizeCanonicalIdentity);
    const withNormalization = combineViaRRF(normalizedLanes, laneNames, {
      deduplicateBy: 'id',
    });
    // After the fix: all three hits share packet_key -> one fused candidate with 3 lane votes.
    expect(withNormalization).toHaveLength(1);
    expect(withNormalization[0]!.id).toBe('pkt:shared');
    expect(withNormalization[0]!.breakdown).toHaveLength(3);
    // Negative assertion: the fused candidate's id must never equal either raw Qdrant point id.
    expect(withNormalization[0]!.id).not.toBe('qdrant-point-1');
    expect(withNormalization[0]!.id).not.toBe('qdrant-point-2');
  });

  it('documents current behavior when ONE lane produces two votes for the same identity', () => {
    // Distinct from the multi-lane case above: this is a single lane (qdrant_vector) returning
    // two hits that normalize to the same canonical id (e.g. two chunk projections of one
    // symbol surfaced by the same ANN query). normalizeCanonicalIdentity collapses their id,
    // but combineViaRRF still records two separate breakdown entries and sums both
    // rrfComponents into one lane's contribution — i.e. today, a single lane CAN inflate a
    // candidate's combined score by contributing more than once. `sources` (a Set) hides this
    // by reporting only one distinct lane name, so a naive "how many lanes voted" check would
    // miss it; `breakdown.length` is the only place this is currently visible.
    const qdrantLane: ContextHit[] = [
      { id: 'qdrant-point-1', source: 'qdrant_vector', score: 0.95, metadata: { packet_key: 'pkt:shared' } },
      { id: 'qdrant-point-2', source: 'qdrant_vector', score: 0.80, metadata: { packet_key: 'pkt:shared' } },
    ];
    const laneNames: RetrievalLaneName[] = ['qdrant_vector'];

    const normalized = normalizeCanonicalIdentity(qdrantLane);
    const result = combineViaRRF([normalized], laneNames, { deduplicateBy: 'id' });

    expect(result).toHaveLength(1);
    expect(result[0]!.sources).toEqual(['qdrant_vector']); // looks like exactly one lane voted
    expect(result[0]!.breakdown).toHaveLength(2); // but it actually cast two votes
    const expectedScore = 1 / (60 + 1) + 1 / (60 + 2); // both ranks summed, uncapped per lane
    expect(result[0]!.combinedScore).toBeCloseTo(expectedScore, 10);
  });
});
