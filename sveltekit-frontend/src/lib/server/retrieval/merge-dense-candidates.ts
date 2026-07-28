/**
 * Merge Dense Candidates — Preserve Both Lane Scores
 *
 * When the same packetKey appears in both qdrant_384 and qdrant_768 results,
 * merge without overwriting. Both rawScores.dense384 and rawScores.dense768
 * must survive so XGBoost can use them independently.
 */

import {
  RetrievalCandidate,
  RetrievalCandidateProvenance,
  RetrievalScoreSource,
} from '../atlas/contracts/retrieval-candidate';

/**
 * Merge two candidate occurrences (same packetKey from different lanes)
 * Does NOT dedup by scoreSource — each appearance is preserved in provenances.
 *
 * Example:
 *   existing = { packetKey: 'pkt:x:7ebdc697', rawScores: { dense384: 0.91 }, provenances: [...] }
 *   incoming = { packetKey: 'pkt:x:7ebdc697', rawScores: { dense768: 0.83 }, provenances: [...] }
 *   result   = { packetKey: 'pkt:x:7ebdc697', rawScores: { dense384: 0.91, dense768: 0.83 }, provenances: [...] }
 */
export function mergeDenseCandidate(
  existing: RetrievalCandidate,
  incoming: RetrievalCandidate
): RetrievalCandidate {
  if (existing.packetKey !== incoming.packetKey) {
    throw new Error(
      `Cannot merge candidates with different packetKeys: ${existing.packetKey} vs ${incoming.packetKey}`
    );
  }

  // Merge rawScores: spread both maps so all lanes survive
  const mergedRawScores = {
    ...existing.rawScores,
    ...incoming.rawScores,
  };

  // Merge provenances: accumulate all lane hits without dedup
  const mergedProvenances: RetrievalCandidateProvenance[] = [
    ...existing.provenances,
    ...incoming.provenances,
  ];

  // Merge observedLanes: collect unique lanes
  const laneSet = new Set([...existing.observedLanes, ...incoming.observedLanes]);
  const mergedObservedLanes = Array.from(laneSet);

  return {
    packetKey: existing.packetKey,
    sourceRef: existing.sourceRef,
    contentHash: existing.contentHash ?? incoming.contentHash,
    featureId: existing.featureId ?? incoming.featureId,
    featureLabel: existing.featureLabel ?? incoming.featureLabel,
    summary: existing.summary ?? incoming.summary,

    // Lineage: keep existing (primary), but both scores are in rawScores
    embeddingLineage: existing.embeddingLineage,

    // Both lane scores preserved
    rawScores: mergedRawScores,
    provenances: mergedProvenances,

    // RRF fields (will be recomputed during fusion)
    rrfScore: undefined,
    rrfRanks: undefined,
    observedLanes: mergedObservedLanes,

    // Context (coalesce)
    workspace: existing.workspace ?? incoming.workspace,
    ontologyVersion: existing.ontologyVersion ?? incoming.ontologyVersion,
    confidence: existing.confidence ?? incoming.confidence,
  };
}

/**
 * Deduplicate candidates by packetKey, merging all lane scores
 *
 * Input:  [ { pkt:x:abc, dense384: 0.91, lane: qdrant_384 },
 *           { pkt:x:abc, dense768: 0.83, lane: qdrant_768 },
 *           { pkt:y:def, dense384: 0.76, lane: qdrant_384 } ]
 *
 * Output: [ { pkt:x:abc, dense384: 0.91, dense768: 0.83, lanes: [qdrant_384, qdrant_768] },
 *           { pkt:y:def, dense384: 0.76, lanes: [qdrant_384] } ]
 */
export function deduplicateCandidates(
  candidates: RetrievalCandidate[]
): RetrievalCandidate[] {
  const byPacketKey = new Map<string, RetrievalCandidate>();

  for (const candidate of candidates) {
    const existing = byPacketKey.get(candidate.packetKey);
    if (existing) {
      const merged = mergeDenseCandidate(existing, candidate);
      byPacketKey.set(candidate.packetKey, merged);
    } else {
      byPacketKey.set(candidate.packetKey, candidate);
    }
  }

  return Array.from(byPacketKey.values());
}

/**
 * Compute lane overlap statistics for telemetry
 */
export interface LaneOverlapStats {
  dense384AndDense768: number;  // Same packet in both Qdrant lanes
  dense384Only: number;
  dense768Only: number;
  otherLaneOnly: number;
}

export function computeLaneOverlap(
  dedupedCandidates: RetrievalCandidate[]
): LaneOverlapStats {
  const stats: LaneOverlapStats = {
    dense384AndDense768: 0,
    dense384Only: 0,
    dense768Only: 0,
    otherLaneOnly: 0,
  };

  for (const candidate of dedupedCandidates) {
    const has384 = candidate.observedLanes.includes(RetrievalScoreSource.QDRANT_384);
    const has768 = candidate.observedLanes.includes(RetrievalScoreSource.QDRANT_768);

    if (has384 && has768) {
      stats.dense384AndDense768++;
    } else if (has384) {
      stats.dense384Only++;
    } else if (has768) {
      stats.dense768Only++;
    } else {
      stats.otherLaneOnly++;
    }
  }

  return stats;
}
