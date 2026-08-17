import type { FeatureRelationshipV1 } from './feature-intelligence.js';
import type { FeatureIntelligenceRepository } from './feature-intelligence-repository.js';
import {
  buildBoundedReasoningChain,
  evaluateSufficientContext,
  type ContextEvidenceInventoryV1,
  type QueryEvidenceExpectationV1,
  type ReasoningChainV1,
  type SufficientContextDecisionV1,
} from './hypergraph-retrieval.js';
import {
  buildAceHypergraphPayload,
  type AceHypergraphPayloadV1,
} from './ace-hypergraph-payload.js';

export type FirstStageCanonicalCandidateV1 = {
  canonical_id: string;
  family: 'entity' | 'relationship' | 'evidence';
  packet_key: string;
  source_ref: string;
  feature_id?: string | null;
  score?: number;
};

export type HypergraphFusionFacadeInput = {
  query_id: string;
  source_snapshot_revision: string;
  producer_revision: string;
  candidates: FirstStageCanonicalCandidateV1[];
  repository: FeatureIntelligenceRepository;
  expectation: QueryEvidenceExpectationV1;
  relationship_types?: string[];
  maximum_hop_count?: 0 | 1 | 2;
  fanout_limit?: number;
  semantic_scores?: Record<string, number>;
  ppr_scores?: Record<string, number>;
  evidence_inventory?: Partial<ContextEvidenceInventoryV1>;
  semantic_executors?: string[];
};

export type HypergraphFusionFacadeResult = {
  relationships: FeatureRelationshipV1[];
  reasoning_chain: ReasoningChainV1;
  sufficient_context: SufficientContextDecisionV1;
  ace_payloads: AceHypergraphPayloadV1[];
};

function unique(values: Iterable<string | null | undefined>): string[] {
  return [...new Set([...values].map((value) => String(value ?? '').trim()).filter(Boolean))];
}

/**
 * Additive second-stage facade. The caller supplies first-stage candidates from
 * the existing retrieval stack; this function never replaces or double-votes
 * dense/lexical/AST discovery. It promotes those hits to canonical seed IDs,
 * retrieves canonical N-ary relations, builds the bounded chain, then decides
 * whether context is sufficient for synthesis.
 */
export async function runHypergraphFusionFacade(
  input: HypergraphFusionFacadeInput,
): Promise<HypergraphFusionFacadeResult> {
  const seedEntityIds = unique(input.candidates
    .filter((candidate) => candidate.family === 'entity')
    .map((candidate) => candidate.canonical_id));

  const relationships = await input.repository.findRelationshipsForEntities(
    seedEntityIds,
    input.relationship_types ?? [],
    Math.max(20, Math.min((input.fanout_limit ?? 20) * Math.max(seedEntityIds.length, 1), 500)),
  );

  const reasoningChain = buildBoundedReasoningChain({
    query_id: input.query_id,
    source_snapshot_revision: input.source_snapshot_revision,
    seed_entity_ids: seedEntityIds,
    relationships,
    maximum_hop_count: input.maximum_hop_count ?? 2,
    fanout_limit: input.fanout_limit ?? 20,
    allowed_relationship_types: input.relationship_types,
    semantic_scores: input.semantic_scores,
    ppr_scores: input.ppr_scores,
  });

  const relationshipEvidenceRefs = unique(relationships.flatMap((relationship) => relationship.evidence_refs));
  const inventory: ContextEvidenceInventoryV1 = {
    schema: 'atlas.context-evidence-inventory.v1',
    entity_types: unique([
      ...(input.evidence_inventory?.entity_types ?? []),
      ...relationships.flatMap((relationship) => relationship.participants.map((participant) => participant.entity_type)),
    ]),
    relationship_types: unique([
      ...(input.evidence_inventory?.relationship_types ?? []),
      ...relationships.map((relationship) => relationship.relationship_type),
    ]),
    evidence_kinds: unique(input.evidence_inventory?.evidence_kinds ?? []),
    relationship_count: relationships.length,
    evidence_ref_count: unique(relationshipEvidenceRefs).length,
    contradiction_refs: unique(input.evidence_inventory?.contradiction_refs ?? []),
    stale_refs: unique(input.evidence_inventory?.stale_refs ?? []),
  };
  const sufficientContext = evaluateSufficientContext(input.expectation, inventory);

  const relationshipById = new Map(relationships.map((relationship) => [relationship.relationship_id, relationship]));
  const relationshipEvidence = reasoningChain.relationship_ids
    .map((id) => relationshipById.get(id))
    .filter((value): value is FeatureRelationshipV1 => Boolean(value))
    .map((relationship) => ({
      relationship_id: relationship.relationship_id,
      relationship_revision: relationship.relationship_revision,
      relationship_type: relationship.relationship_type,
      relationship_degree: relationship.relationship_degree,
      participants: relationship.participants,
      hop: Math.min(2, reasoningChain.steps.find((step) => step.relationship_id === relationship.relationship_id)?.hop ?? 0),
      evidence_refs: relationship.evidence_refs,
      semantic_score: input.semantic_scores?.[relationship.relationship_id],
      ppr_score: input.ppr_scores?.[relationship.relationship_id],
      confidence: relationship.confidence,
      persistence: 'canonical' as const,
    }));

  const graphHopsExecuted = reasoningChain.steps.length === 0
    ? 0
    : Math.max(...reasoningChain.steps.map((step) => step.hop));

  const acePayloads = input.candidates.slice(0, 20).map((candidate) => buildAceHypergraphPayload({
    query_id: input.query_id,
    packet_key: candidate.packet_key,
    source_ref: candidate.source_ref,
    feature_id: candidate.feature_id ?? null,
    relationship_evidence: relationshipEvidence,
    reasoning_chain: reasoningChain,
    sufficient_context: sufficientContext,
    lineage: {
      source_snapshot_revision: input.source_snapshot_revision,
      relationship_projection_revision: null,
      graph_snapshot_revision: null,
      semantic_projection_revision: null,
      semantic_model_revision: null,
      feature_matrix_revision: null,
      producer_revision: input.producer_revision,
    },
    retrieval: {
      semantic_lane_votes: 1,
      semantic_executors: unique(input.semantic_executors ?? []),
      relationship_candidate_count: relationships.length,
      evidence_candidate_count: relationshipEvidenceRefs.length,
      graph_hops_executed: graphHopsExecuted,
      fanout_limit: input.fanout_limit ?? 20,
    },
    derived_ranking_signals: {
      reranker: candidate.score == null ? undefined : Math.max(0, Math.min(1, candidate.score)),
    },
  }));

  return {
    relationships,
    reasoning_chain: reasoningChain,
    sufficient_context: sufficientContext,
    ace_payloads: acePayloads,
  };
}
