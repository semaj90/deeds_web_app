import type { LaneCandidate, Retriever, RetrievalInput } from '../lane-contracts.js';
import { validateCandidate } from '../lane-contracts.js';

export type StructuralLaneHit = {
  observationId: string;
  sourceRef: string;
  sourceRevision: string;
  astGraphRevision?: string | null;
  compilerSemanticGraphRevision?: string | null;
  byteStart: number;
  byteEnd: number;
  candidateOrdinal: number | null;
  canonicalId: string | null;
  packetKey: string | null;
  identityStatus: 'RESOLVED_EXACT' | 'UNRESOLVED_SOURCE' | 'SOURCE_REVISION_MISMATCH' | 'AMBIGUOUS_SOURCE' | 'MIXED_WORKSPACE';
  structuralRank: number;
  confidence: number;
  matchReason: string[];
  patternId?: string | null;
  patternRevision?: string | null;
  scoreClass?: 'EXACT_PATTERN' | 'EXACT_SYMBOL' | 'STRUCTURAL_AFFINITY';
};

/**
 * Projects an already-built structural lane envelope into SearchRuntime's
 * existing lane contract. It never queries storage and drops non-exact
 * identities before the single SearchRuntime RRF owner sees the lane.
 */
export function structuralLaneHitsToCandidates(hits: readonly StructuralLaneHit[], workspaceRevision: string): LaneCandidate[] {
  const seen = new Set<string>();
  return [...hits]
    .filter((hit) => hit.identityStatus === 'RESOLVED_EXACT' && hit.candidateOrdinal != null && hit.packetKey && hit.canonicalId)
    .sort((a, b) => a.structuralRank - b.structuralRank || a.candidateOrdinal! - b.candidateOrdinal! || a.observationId.localeCompare(b.observationId))
    .filter((hit) => {
      const key = hit.packetKey!;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((hit, index) => validateCandidate({
      packetKey: hit.packetKey!,
      sourceRef: hit.sourceRef,
      rank: index + 1,
      // SearchRuntime uses rank for RRF; this score only preserves the
      // structural lane's deterministic ordering within that lane.
      score: 1 / (hit.structuralRank + 1),
      lane: 'ast',
      workspaceRevision,
      sourceRevision: hit.sourceRevision,
      metadata: {
        structural_observation_id: hit.observationId,
        structural_candidate_ordinal: hit.candidateOrdinal,
        structural_rank: hit.structuralRank,
        structural_confidence: hit.confidence,
        structural_match_reason: hit.matchReason,
        byte_start: hit.byteStart,
        byte_end: hit.byteEnd,
        identity_status: hit.identityStatus,
        ast_graph_revision: hit.astGraphRevision ?? null,
        compiler_semantic_graph_revision: hit.compilerSemanticGraphRevision ?? null,
        pattern_id: hit.patternId ?? null,
        pattern_revision: hit.patternRevision ?? null,
        score_class: hit.scoreClass ?? 'STRUCTURAL_AFFINITY',
      },
    }))
    .filter((candidate): candidate is LaneCandidate => candidate !== null);
}

/** DI retriever for callers that already own structural observation execution. */
export function createStructuralLaneRetriever(resolve: (input: RetrievalInput) => Promise<readonly StructuralLaneHit[]>, workspaceRevision: string): Retriever {
  return {
    lane: 'ast',
    async retrieve(input) {
      return structuralLaneHitsToCandidates(await resolve(input), workspaceRevision).slice(0, input.limit);
    },
  };
}
