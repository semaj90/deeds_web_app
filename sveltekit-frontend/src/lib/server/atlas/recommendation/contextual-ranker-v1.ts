import { z } from 'zod';
import type { CandidateFeatureRowV1 } from '../features/candidate-feature-row-v1.js';
import {
  createRecommendationProposalV1,
  createRecommendationBatchV1,
  type RecommendationProposalV1,
  type RecommendationBatchV1,
  type RecommendationProposalKind,
} from './recommendation-contract-v1.js';

export const ContextualRankerWeightsSchema = z
  .object({
    semantic: z.number().min(0).max(1).default(0.35),
    graph: z.number().min(0).max(1).default(0.25),
    lowRank: z.number().min(0).max(1).default(0.20),
    learnedUtility: z.number().min(0).max(1).default(0.10),
    feedback: z.number().min(0).max(1).default(0.10),
  })
  .strict();
export type ContextualRankerWeights = z.infer<typeof ContextualRankerWeightsSchema>;

export interface ContextualScoredCandidateV1 {
  candidate: CandidateFeatureRowV1;
  kind: RecommendationProposalKind;
  action: string;
  rationale: string;
  factorArtifactId?: string;
  lowRankScore?: number;
  learnedUtilityScore?: number;
  feedbackScore?: number;
  requiresApproval?: boolean;
}

export interface RankContextualCandidatesInputV1 {
  requestId: string;
  queryIntent: string;
  candidates: readonly ContextualScoredCandidateV1[];
  weights?: Partial<ContextualRankerWeights>;
  maxProposals?: number;
  contextManifestChecksum: string;
  rankerRevision?: string;
  minFinalScore?: number;
}

/**
 * Computes hybrid contextual scores and emits top 1–4 qualified proposals.
 * s(q,c) = α * s_semantic + β * s_graph + γ * s_lowrank + δ * s_learned + ε * s_feedback
 */
export function rankContextualCandidatesV1(
  input: RankContextualCandidatesInputV1
): RecommendationBatchV1 {
  const weights = ContextualRankerWeightsSchema.parse(input.weights ?? {});
  const rankerRevision = input.rankerRevision ?? 'hybrid-ranker-v1';
  const minScore = input.minFinalScore ?? 0.25;
  const maxProposals = Math.min(4, Math.max(1, input.maxProposals ?? 4));

  const proposals: RecommendationProposalV1[] = [];

  for (const item of input.candidates) {
    const row = item.candidate;

    // Hard eligibility checks
    const hasValidSourceRev = /^sha256:[0-9a-f]{64}$/.test(row.sourceRevision);
    const notDegraded = !row.degradedIdentity;

    if (
      !hasValidSourceRev ||
      !notDegraded ||
      !row.packetKey ||
      !row.semanticRevision ||
      row.evidenceRefs.length === 0
    ) {
      // Stale or degraded lineage fails closed
      continue;
    }

    const sSemantic = Math.max(0, Math.min(1, row.semanticRelevance ?? 0));
    const sGraph = Math.max(0, Math.min(1, row.personalizedPageRank ?? row.graphAuthority ?? 0));
    const sLowRank = Math.max(0, Math.min(1, item.lowRankScore ?? 0));
    const sLearned = Math.max(0, Math.min(1, item.learnedUtilityScore ?? (row.executionUtility ?? 0)));
    const sFeedback = Math.max(0, Math.min(1, item.feedbackScore ?? 0.5));

    const finalScore =
      weights.semantic * sSemantic +
      weights.graph * sGraph +
      weights.lowRank * sLowRank +
      weights.learnedUtility * sLearned +
      weights.feedback * sFeedback;

    if (finalScore < minScore) {
      continue;
    }

    const qualification = 'ADVISORY';

    const proposal = createRecommendationProposalV1({
      requestId: input.requestId,
      queryIntent: input.queryIntent,
      candidate: {
        canonicalId: row.canonicalId,
        packetKey: row.packetKey,
        symbolVersionId: row.symbolVersionId ?? undefined,
        sourceRevision: row.sourceRevision,
        graphRevision: row.graphRevision,
        representationRevision: row.semanticRevision,
      },
      proposal: {
        kind: item.kind,
        action: item.action,
        rationale: item.rationale,
      },
      scores: {
        retrieval: sSemantic,
        semantic: sSemantic,
        structural: sGraph,
        lowRank: sLowRank,
        learnedUtility: sLearned,
        final: Math.round(finalScore * 10000) / 10000,
      },
      evidenceRefs: row.evidenceRefs,
      factorArtifactId: item.factorArtifactId,
      rankerRevision,
      contextManifestChecksum: input.contextManifestChecksum,
      qualification,
      requiresApproval: Boolean(item.requiresApproval),
    });

    proposals.push(proposal);
  }

  // Stable sort: descending by final score, tie-break ascending by canonicalId
  proposals.sort((a, b) => b.scores.final - a.scores.final || a.candidate.canonicalId.localeCompare(b.candidate.canonicalId));

  const selected = proposals.slice(0, maxProposals);

  return createRecommendationBatchV1({
    requestId: input.requestId,
    queryIntent: input.queryIntent,
    proposals: selected,
    abstentionReason: selected.length === 0 ? 'NO_QUALIFIED_CANDIDATES' : null,
    rankerRevision,
    contextManifestChecksum: input.contextManifestChecksum,
  });
}
