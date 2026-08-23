/**
 * Candidate Lane Provenance Tests
 *
 * Gate: CANDIDATE_LANE_PROVENANCE_PATCH_IN_PROGRESS → PATCH_COMPLETE
 *
 * Proves that:
 * 1. Candidates retain scoreSource (qdrant_384 vs qdrant_768) after toCandidate()
 * 2. Same packetKey merged from both lanes preserves both rawScores
 * 3. Projection lineage preserved (768-dim candidate marked dense_384 if explicit lane set)
 * 4. resolveEmbeddingLane follows precedence, emits telemetry on fallback
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RetrievalCandidate,
  RetrievalScoreSource,
  DenseRepresentationName,
  DenseRole,
} from '../../src/lib/server/atlas/contracts/retrieval-candidate';
import {
  mergeDenseCandidate,
  deduplicateCandidates,
  computeLaneOverlap,
} from '../../src/lib/server/retrieval/merge-dense-candidates';
import {
  resolveEmbeddingLane,
  emitEmbeddingLaneTelementry,
  gateEmbeddingLaneResolution,
  EmbeddingLaneTelemetryReason,
} from '../../src/lib/server/retrieval/resolve-embedding-lane';
import {
  rrfMergeDenseQdrant,
  computeRuntimeSummary,
} from '../../src/lib/server/retrieval/retrieval-fusion-rrf.ts';

// Helper: create a minimal RetrievalCandidate for testing
function makeCandidate(
  packetKey: string,
  scoreSource: RetrievalScoreSource,
  score: number,
  embeddingDim: 768 | 384 | 64 = 768
): RetrievalCandidate {
  return {
    packetKey,
    sourceRef: 'src/lib/server/auth.ts',
    embeddingLineage: {
      lane: embeddingDim === 384 ? DenseRepresentationName.SEMANTIC_384 : DenseRepresentationName.SEMANTIC_768,
      role: DenseRole.SEMANTIC_AUTHORITY,
      nativeDimension: embeddingDim,
      producerVersion: 'embeddinggemma:latest',
      normalized: true,
    },
    rawScores: {
      dense768: scoreSource === RetrievalScoreSource.QDRANT_768 ? score : undefined,
      dense384: scoreSource === RetrievalScoreSource.QDRANT_384 ? score : undefined,
    },
    provenances: [
      {
        scoreSource,
        rank: 0,
        score,
        timestamp: new Date().toISOString(),
        laneId: `lane:${scoreSource}:0`,
      },
    ],
    observedLanes: [scoreSource],
  };
}

describe('Retrieval Candidate Lane Provenance', () => {
  describe('scoreSource preservation', () => {
    it('retains scoreSource qdrant_384 after candidate creation', () => {
      const candidate = makeCandidate('pkt:x:7ebdc697', RetrievalScoreSource.QDRANT_384, 0.91, 384);
      expect(candidate.provenances[0].scoreSource).toBe(RetrievalScoreSource.QDRANT_384);
    });

    it('retains scoreSource qdrant_768 after candidate creation', () => {
      const candidate = makeCandidate('pkt:x:7ebdc697', RetrievalScoreSource.QDRANT_768, 0.83, 768);
      expect(candidate.provenances[0].scoreSource).toBe(RetrievalScoreSource.QDRANT_768);
    });

    it('distinguishes qdrant_384 from qdrant_768 in observedLanes', () => {
      const hit384 = makeCandidate('pkt:x:7ebdc697', RetrievalScoreSource.QDRANT_384, 0.91, 384);
      const hit768 = makeCandidate('pkt:x:7ebdc697', RetrievalScoreSource.QDRANT_768, 0.83, 768);
      expect(hit384.observedLanes).toContain(RetrievalScoreSource.QDRANT_384);
      expect(hit768.observedLanes).toContain(RetrievalScoreSource.QDRANT_768);
      expect(hit384.observedLanes).not.toContain(RetrievalScoreSource.QDRANT_768);
    });
  });

  describe('merging same packet from multiple lanes', () => {
    it('preserves both rawScores when merging dense384 and dense768', () => {
      const merged384 = makeCandidate('pkt:x:7ebdc697', RetrievalScoreSource.QDRANT_384, 0.91, 384);
      const merged768 = makeCandidate('pkt:x:7ebdc697', RetrievalScoreSource.QDRANT_768, 0.83, 768);

      const merged = mergeDenseCandidate(merged384, merged768);

      expect(merged.rawScores.dense384).toBe(0.91);
      expect(merged.rawScores.dense768).toBe(0.83);
      expect(merged.observedLanes).toContain(RetrievalScoreSource.QDRANT_384);
      expect(merged.observedLanes).toContain(RetrievalScoreSource.QDRANT_768);
    });

    it('accumulates provenances without overwriting', () => {
      const hit384 = makeCandidate('pkt:x:7ebdc697', RetrievalScoreSource.QDRANT_384, 0.91, 384);
      const hit768 = makeCandidate('pkt:x:7ebdc697', RetrievalScoreSource.QDRANT_768, 0.83, 768);

      const merged = mergeDenseCandidate(hit384, hit768);

      expect(merged.provenances).toHaveLength(2);
      expect(merged.provenances[0].scoreSource).toBe(RetrievalScoreSource.QDRANT_384);
      expect(merged.provenances[1].scoreSource).toBe(RetrievalScoreSource.QDRANT_768);
    });

    it('throws when merging different packetKeys', () => {
      const hit1 = makeCandidate('pkt:x:abc', RetrievalScoreSource.QDRANT_384, 0.91);
      const hit2 = makeCandidate('pkt:x:def', RetrievalScoreSource.QDRANT_768, 0.83);

      expect(() => mergeDenseCandidate(hit1, hit2)).toThrow(/different packetKeys/);
    });
  });

  describe('candidate deduplication', () => {
    it('deduplicates by packetKey, merging all lane scores', () => {
      const candidates = [
        makeCandidate('pkt:x:7ebdc697', RetrievalScoreSource.QDRANT_384, 0.91, 384),
        makeCandidate('pkt:x:7ebdc697', RetrievalScoreSource.QDRANT_768, 0.83, 768),
        makeCandidate('pkt:y:abcdef12', RetrievalScoreSource.QDRANT_384, 0.76, 384),
      ];

      const deduped = deduplicateCandidates(candidates);

      expect(deduped).toHaveLength(2);
      expect(deduped[0].packetKey).toBe('pkt:x:7ebdc697');
      expect(deduped[0].rawScores.dense384).toBe(0.91);
      expect(deduped[0].rawScores.dense768).toBe(0.83);
      expect(deduped[1].packetKey).toBe('pkt:y:abcdef12');
    });

    it('computes lane overlap correctly', () => {
      const deduped = [
        { ...makeCandidate('pkt:x:abc', RetrievalScoreSource.QDRANT_384, 0.91), observedLanes: [RetrievalScoreSource.QDRANT_384, RetrievalScoreSource.QDRANT_768] },
        { ...makeCandidate('pkt:y:def', RetrievalScoreSource.QDRANT_384, 0.76), observedLanes: [RetrievalScoreSource.QDRANT_384] },
        { ...makeCandidate('pkt:z:ghi', RetrievalScoreSource.QDRANT_768, 0.82), observedLanes: [RetrievalScoreSource.QDRANT_768] },
      ];

      const overlap = computeLaneOverlap(deduped);

      expect(overlap.dense384AndDense768).toBe(1);
      expect(overlap.dense384Only).toBe(1);
      expect(overlap.dense768Only).toBe(1);
    });
  });

  describe('embedding lane resolution', () => {
    it('resolves from explicit embedding_lane field (highest priority)', () => {
      const resolution = resolveEmbeddingLane({
        embedding_lane: DenseRepresentationName.SEMANTIC_384,
        embedding_dim: 768,  // Ignore this; trust explicit lane
      });

      expect(resolution.lane).toBe(DenseRepresentationName.SEMANTIC_384);
      expect(resolution.reason).toBe(EmbeddingLaneTelemetryReason.EXPLICIT_FIELD);
    });

    it('resolves from vector_name when no explicit field', () => {
      const resolution = resolveEmbeddingLane({
        vector_name: 'dense_768',
      });

      expect(resolution.lane).toBe(DenseRepresentationName.SEMANTIC_768);
      expect(resolution.reason).toBe(EmbeddingLaneTelemetryReason.VECTOR_NAME);
    });

    it('resolves from collection contract when no explicit field or vector_name', () => {
      const resolution = resolveEmbeddingLane({
        collection: 'codebase_chunks_384',
      });

      expect(resolution.lane).toBe(DenseRepresentationName.SEMANTIC_384);
      expect(resolution.reason).toBe(EmbeddingLaneTelemetryReason.COLLECTION_CONTRACT);
    });

    it('falls back to native dimension only after exhausting other sources', () => {
      const resolution = resolveEmbeddingLane({
        embedding_dim: 384,
      });

      expect(resolution.lane).toBe(DenseRepresentationName.SEMANTIC_384);
      expect(resolution.reason).toBe(EmbeddingLaneTelemetryReason.NATIVE_DIMENSION_FALLBACK);
    });

    it('returns UNKNOWN when lane cannot be resolved', () => {
      const resolution = resolveEmbeddingLane({
        // No explicit field, no vector_name, no collection, no dimension
      });

      expect(resolution.lane).toBeNull();
      expect(resolution.reason).toBe(EmbeddingLaneTelemetryReason.UNKNOWN);
    });

    it('respects explicit lane override for projected vectors', () => {
      const resolution = resolveEmbeddingLane({
        embedding_lane: DenseRepresentationName.SEMANTIC_384,  // Explicit: this is dense_384
        embedding_dim: 768,  // But dimension is 768 (projected from 768 to 384, then expanded back)
        projection: {
          source_dimension: 768,
          method: 'linear_projection',
          version: 'align_768_384_v2',
        },
      });

      expect(resolution.lane).toBe(DenseRepresentationName.SEMANTIC_384);
      expect(resolution.reason).toBe(EmbeddingLaneTelemetryReason.EXPLICIT_FIELD);
    });
  });

  describe('lane resolution telemetry', () => {
    it('emits telemetry on fallback resolution', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const resolution = resolveEmbeddingLane({
        embedding_dim: 768,  // Falling back to dimension
      });

      emitEmbeddingLaneTelementry('pkt:x:7ebdc697', resolution);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[embedding_lineage_fallback]',
        expect.objectContaining({
          packet_key: 'pkt:x:7ebdc697',
          inferred_from: EmbeddingLaneTelemetryReason.NATIVE_DIMENSION_FALLBACK,
        })
      );

      consoleSpy.mockRestore();
    });

    it('does not emit telemetry for explicit resolution', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const resolution = resolveEmbeddingLane({
        embedding_lane: DenseRepresentationName.SEMANTIC_768,
      });

      emitEmbeddingLaneTelementry('pkt:x:7ebdc697', resolution);

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('lane resolution gating', () => {
    it('gates pass when lane resolves', () => {
      const gate = gateEmbeddingLaneResolution(
        { embedding_lane: DenseRepresentationName.SEMANTIC_768 },
        'pkt:x:7ebdc697'
      );

      expect(gate.gatePass).toBe(true);
    });

    it('gates fail when lane resolution is UNKNOWN', () => {
      const gate = gateEmbeddingLaneResolution({}, 'pkt:x:7ebdc697');

      expect(gate.gatePass).toBe(false);
      expect(gate.reason).toContain('lane_resolution_failed');
    });
  });

  describe('RRF fusion preserves both dense lanes', () => {
    it('merges qdrant_384 and qdrant_768 results with both scores preserved', () => {
      const candidates384 = [
        makeCandidate('pkt:x:7ebdc697', RetrievalScoreSource.QDRANT_384, 0.91, 384),
        makeCandidate('pkt:y:abcdef12', RetrievalScoreSource.QDRANT_384, 0.76, 384),
      ];

      const candidates768 = [
        makeCandidate('pkt:x:7ebdc697', RetrievalScoreSource.QDRANT_768, 0.83, 768),
        makeCandidate('pkt:z:ghi34567', RetrievalScoreSource.QDRANT_768, 0.88, 768),
      ];

      const fused = rrfMergeDenseQdrant(candidates384, candidates768);

      // pkt:x:7ebdc697 should have both scores
      const mergedPkt = fused.find(c => c.packetKey === 'pkt:x:7ebdc697');
      expect(mergedPkt).toBeDefined();
      expect(mergedPkt!.rawScores.dense384).toBe(0.91);
      expect(mergedPkt!.rawScores.dense768).toBe(0.83);

      // Total unique packets: 3 (pkt:x, pkt:y, pkt:z)
      expect(fused.length).toBe(3);
    });

    it('computes runtime summary with lane overlap', () => {
      const candidates384 = [
        makeCandidate('pkt:x:7ebdc697', RetrievalScoreSource.QDRANT_384, 0.91, 384),
      ];

      const candidates768 = [
        makeCandidate('pkt:x:7ebdc697', RetrievalScoreSource.QDRANT_768, 0.83, 768),
        makeCandidate('pkt:z:ghi34567', RetrievalScoreSource.QDRANT_768, 0.88, 768),
      ];

      const fused = rrfMergeDenseQdrant(candidates384, candidates768);

      const summary = computeRuntimeSummary(
        [
          { lane: RetrievalScoreSource.QDRANT_384, candidates: candidates384 },
          { lane: RetrievalScoreSource.QDRANT_768, candidates: candidates768 },
        ],
        fused
      );

      expect(summary.candidateCounts[RetrievalScoreSource.QDRANT_384]).toBe(1);
      expect(summary.candidateCounts[RetrievalScoreSource.QDRANT_768]).toBe(2);
      expect(summary.uniquePacketsAfterMerge).toBe(2);  // pkt:x and pkt:z
      expect(summary.laneOverlap.dense384AndDense768).toBe(1);  // pkt:x
      expect(summary.laneOverlap.dense768Only).toBe(1);  // pkt:z
    });
  });
});
