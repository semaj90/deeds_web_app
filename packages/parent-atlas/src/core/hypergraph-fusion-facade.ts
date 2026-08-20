import type { FeatureRelationshipV1 } from './feature-intelligence.js';
import type { FeatureIntelligenceRepository } from './feature-intelligence-repository.js';
import {
  evaluateSufficientContext,
  type ContextEvidenceInventoryV1,
  type QueryEvidenceExpectationV1,
  type ReasoningChainV1,
  type SufficientContextDecisionV1,
} from './hypergraph-retrieval.js';
import {
  buildQueryConditionedReasoningChain,
  rankRelationshipsForQuery,
  type HypergraphRelationshipSelectionV1,
} from './hypergraph-query-policy.js';
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
  extraction_confidence?: Record<string, number>;
  evidence_inventory?: Partial<ContextEvidenceInventoryV1>;
  semantic_executors?: string[];
  /**
   * Optional exact canonical relationship resolver for first-stage relationship
   * candidates. Runtime callers should bind this to PostgreSQL canonical rows.
   */
  relationship_resolver?: (relationshipIds: readonly string[]) => Promise<FeatureRelationshipV1[]>;
};

export type HypergraphFusionFacadeResult = {
  relationships: FeatureRelationshipV1[];
  relationship_selection: HypergraphRelationshipSelectionV1[];
  reasoning_chain: ReasoningChainV1;
  sufficient_context: SufficientContextDecisionV1;
  ace_payloads: AceHypergraphPayloadV1[];
};

function unique(values: Iterable<string | null | undefined>): string[] {
  return [...new Set([...values].map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function mergeRelationships(
  fromEntities: readonly FeatureRelationshipV1[],
  directRelationships: readonly FeatureRelationshipV1[],
): FeatureRelationshipV1[] {
  const byId = new Map<string, FeatureRelationshipV1>();
  for (const relationship of [...fromEntities, ...directRelationships]) {
    byId.set(relationship.relationship_id, relationship);
  }
  return [...byId.values()];
}

/**
 * Additive second-stage facade. The caller supplies first-stage candidates from
 * the existing retrieval stack; this function never replaces or double-votes
 * dense/lexical/AST discovery. It promotes hits to canonical IDs, retrieves
 * canonical N-ary relations, applies query-conditioned relation selection,
 * builds the bounded chain, and decides whether context is sufficient.
 */
export async function runHypergraphFusionFacade(
  input: HypergraphFusionFacadeInput,
): Promise<HypergraphFusionFacadeResult> {
  const seedEntityIds = unique(input.candidates
    .filter((candidate) => candidate.family === 'entity')
    .map((candidate) => candidate.canonical_id));
  const directRelationshipIds = unique(input.candidates
    .filter((candidate) => candidate.family === 'relationship')
    .map((candidate) => candidate.canonical_id));

  const relationshipsFromEntities = await input.repository.findRelationshipsForEntities(
    seedEntityIds,
    input.relationship_types ?? [],
    Math.max(20, Math.min((input.fanout_limit ?? 20) * Math.max(seedEntityIds.length, 1), 500)),
  );
  const directRelationships = directRelationshipIds.length > 0 && input.relationship_resolver
    ? await input.relationship_resolver(directRelationshipIds)
    : [];
  const relationships = mergeRelationships(relationshipsFromEntities, directRelationships);

  const relationshipSelection = rankRelationshipsForQuery(relationships, {
    semantic_scores: input.semantic_scores,
    ppr_scores: input.ppr_scores,
    extraction_confidence: input.extraction_confidence,
    expected_relationship_types: input.expectation.expected_relationship_types,
  });

  const reasoningChain = buildQueryConditionedReasoningChain({
    query_id: input.query_id,
    source_snapshot_revision: input.source_snapshot_revision,
    seed_entity_ids: seedEntityIds,
    relationships,
    maximum_hop_count: input.maximum_hop_count ?? 2,
    fanout_limit: input.fanout_limit ?? 20,
    signals: {
      semantic_scores: input.semantic_scores,
      ppr_scores: input.ppr_scores,
      extraction_confidence: input.extraction_confidence,
      expected_relationship_types: input.expectation.expected_relationship_types,
    },
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
  const selectionById = new Map(relationshipSelection.map((selection) => [selection.relationship_id, selection]));
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
      semantic_score: selectionById.get(relationship.relationship_id)?.semantic_score,
      ppr_score: selectionById.get(relationship.relationship_id)?.ppr_score,
      confidence: selectionById.get(relationship.relationship_id)?.score ?? relationship.confidence,
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
    relationship_selection: relationshipSelection,
    reasoning_chain: reasoningChain,
    sufficient_context: sufficientContext,
    ace_payloads: acePayloads,
  };
}
