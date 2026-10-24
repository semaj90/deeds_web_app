import { z } from 'zod';
import {
  featureRelationshipSchema,
  relationshipParticipantSchema,
  type FeatureRelationshipV1,
  type RelationshipParticipantV1,
} from './feature-intelligence.js';

export const CANDIDATE_FAMILY_VALUES = ['entity', 'relationship', 'evidence'] as const;
export const RELATIONSHIP_PERSISTENCE_VALUES = ['canonical', 'dynamic'] as const;
export const SUFFICIENCY_STATE_VALUES = [
  'NEED_RELATIONSHIP',
  'NEED_DEFINITION',
  'NEED_SCHEMA',
  'NEED_RUNTIME',
  'NEED_TEST',
  'NEED_EVIDENCE',
  'ENOUGH_EVIDENCE',
] as const;
export const SUFFICIENCY_ACTION_VALUES = [
  'retrieve_relationships',
  'retrieve_definitions',
  'retrieve_schema',
  'retrieve_runtime',
  'retrieve_tests',
  'retrieve_evidence',
  'synthesize',
] as const;

const canonicalIdSchema = z.string().min(1);
const revisionSchema = z.string().min(1);
const normalizedScoreSchema = z.number().finite().min(0).max(1);
const entityTypeSchema = z.string().regex(/^[a-z][a-z0-9_.-]*$/);

export const candidateFamilySchema = z.enum(CANDIDATE_FAMILY_VALUES);
export const relationshipPersistenceSchema = z.enum(RELATIONSHIP_PERSISTENCE_VALUES);
export const sufficiencyStateSchema = z.enum(SUFFICIENCY_STATE_VALUES);
export const sufficiencyActionSchema = z.enum(SUFFICIENCY_ACTION_VALUES);

/**
 * Scores used to rank a candidate. They are derived evidence only and never
 * create canonical identity or canonical relationships.
 */
export const candidateScoresSchema = z.object({
  semantic: normalizedScoreSchema.optional(),
  lexical: normalizedScoreSchema.optional(),
  structural: normalizedScoreSchema.optional(),
  exact: normalizedScoreSchema.optional(),
  graph: normalizedScoreSchema.optional(),
  ppr: normalizedScoreSchema.optional(),
  pagerank: z.number().finite().nonnegative().optional(),
  low_rank: normalizedScoreSchema.optional(),
  turbovec: normalizedScoreSchema.optional(),
  manifold: normalizedScoreSchema.optional(),
  incidence_confidence: normalizedScoreSchema.optional(),
  reranker: normalizedScoreSchema.optional(),
}).strict();

export const canonicalCandidateRefSchema = z.object({
  schema: z.literal('atlas.canonical-candidate-ref.v1').default('atlas.canonical-candidate-ref.v1'),
  candidate_id: canonicalIdSchema,
  family: candidateFamilySchema,
  canonical_id: canonicalIdSchema,
  entity_type: entityTypeSchema.nullable().optional(),
  canonical_revision: revisionSchema.nullable().optional(),
  source_ref: z.string().min(1).nullable().optional(),
  source_revision: revisionSchema.nullable().optional(),
  evidence_refs: z.array(canonicalIdSchema).default([]),
  scores: candidateScoresSchema.default({}),
  derived_signals: z.record(z.string(), z.number().finite()).default({}),
}).strict();

export const relationshipCandidateSchema = z.object({
  schema: z.literal('atlas.relationship-candidate.v1').default('atlas.relationship-candidate.v1'),
  candidate_id: canonicalIdSchema,
  relationship: featureRelationshipSchema,
  persistence: relationshipPersistenceSchema,
  query_id: canonicalIdSchema,
  seed_entity_ids: z.array(canonicalIdSchema).default([]),
  hop: z.number().int().min(0).max(2),
  evidence_refs: z.array(canonicalIdSchema).default([]),
  scores: candidateScoresSchema.default({}),
  source_snapshot_revision: revisionSchema,
  semantic_projection_revision: revisionSchema.nullable().optional(),
  semantic_model_revision: revisionSchema.nullable().optional(),
}).strict();

/**
 * The relationship vector is a rebuildable semantic projection. Canonical
 * relationship truth stays in PostgreSQL relationship/member rows.
 */
export const relationshipEmbeddingProjectionSchema = z.object({
  schema: z.literal('atlas.relationship-embedding-projection.v1').default('atlas.relationship-embedding-projection.v1'),
  relationship_id: canonicalIdSchema,
  relationship_revision: revisionSchema,
  logical_lane: z.literal('semantic').default('semantic'),
  dimensions: z.literal(768).default(768),
  embedding_model_revision: revisionSchema,
  projection_revision: revisionSchema,
  vector_ref: z.string().min(1),
  source_checksum: z.string().min(1),
  view_refs: z.array(z.string().min(1)).default([]),
  producer_revision: revisionSchema,
}).strict();

export const dynamicHyperedgeJoinKeySchema = z.object({
  entity_type: entityTypeSchema,
  entity_id: canonicalIdSchema,
}).strict();

/**
 * SAG-style query-scoped hyperedge. It is explicitly non-canonical until an
 * evidence review promotes it through the canonical relationship materializer.
 */
export const dynamicHyperedgeCandidateSchema = z.object({
  schema: z.literal('atlas.dynamic-hyperedge-candidate.v1').default('atlas.dynamic-hyperedge-candidate.v1'),
  dynamic_relationship_id: canonicalIdSchema,
  query_id: canonicalIdSchema,
  relationship_type: z.string().min(1),
  participants: z.array(relationshipParticipantSchema).min(2),
  join_keys: z.array(dynamicHyperedgeJoinKeySchema).min(1),
  source_refs: z.array(z.string().min(1)).min(1),
  source_revisions: z.array(revisionSchema).min(1),
  evidence_refs: z.array(canonicalIdSchema).min(1),
  confidence: normalizedScoreSchema,
  persistence: z.literal('dynamic').default('dynamic'),
  promotable: z.literal(false).default(false),
  source_snapshot_revision: revisionSchema,
}).strict();

export const relationChainStepSchema = z.object({
  schema: z.literal('atlas.relation-chain-step.v1').default('atlas.relation-chain-step.v1'),
  step_index: z.number().int().nonnegative(),
  hop: z.number().int().min(1).max(2),
  from_entity: relationshipParticipantSchema,
  relationship_id: canonicalIdSchema,
  relationship_type: z.string().min(1),
  to_entity: relationshipParticipantSchema,
  evidence_refs: z.array(canonicalIdSchema).default([]),
  semantic_score: normalizedScoreSchema.optional(),
  ppr_score: normalizedScoreSchema.optional(),
  incidence_confidence: normalizedScoreSchema,
}).strict();

export const reasoningChainSchema = z.object({
  schema: z.literal('atlas.reasoning-chain.v1').default('atlas.reasoning-chain.v1'),
  query_id: canonicalIdSchema,
  seed_entity_ids: z.array(canonicalIdSchema).min(1),
  steps: z.array(relationChainStepSchema),
  relationship_ids: z.array(canonicalIdSchema),
  entity_ids: z.array(canonicalIdSchema),
  source_snapshot_revision: revisionSchema,
  maximum_hop_count: z.number().int().min(0).max(2),
  fanout_limit: z.number().int().positive().max(100),
  chain_score: normalizedScoreSchema,
}).strict();

export const queryEvidenceExpectationSchema = z.object({
  schema: z.literal('atlas.query-evidence-expectation.v1').default('atlas.query-evidence-expectation.v1'),
  query_id: canonicalIdSchema,
  expected_entity_types: z.array(entityTypeSchema).default([]),
  expected_relationship_types: z.array(z.string().min(1)).default([]),
  required_evidence_kinds: z.array(z.string().min(1)).default([]),
  minimum_relationships: z.number().int().nonnegative().default(1),
  minimum_evidence_refs: z.number().int().nonnegative().default(1),
}).strict();

export const contextEvidenceInventorySchema = z.object({
  schema: z.literal('atlas.context-evidence-inventory.v1').default('atlas.context-evidence-inventory.v1'),
  entity_types: z.array(entityTypeSchema).default([]),
  relationship_types: z.array(z.string().min(1)).default([]),
  evidence_kinds: z.array(z.string().min(1)).default([]),
  relationship_count: z.number().int().nonnegative(),
  evidence_ref_count: z.number().int().nonnegative(),
  contradiction_refs: z.array(canonicalIdSchema).default([]),
  stale_refs: z.array(canonicalIdSchema).default([]),
}).strict();

export const sufficientContextDecisionSchema = z.object({
  schema: z.literal('atlas.sufficient-context-decision.v1').default('atlas.sufficient-context-decision.v1'),
  query_id: canonicalIdSchema,
  sufficient: z.boolean(),
  state: sufficiencyStateSchema,
  next_action: sufficiencyActionSchema,
  missing_entity_types: z.array(entityTypeSchema).default([]),
  missing_relationship_types: z.array(z.string().min(1)).default([]),
  missing_evidence_kinds: z.array(z.string().min(1)).default([]),
  blockers: z.array(z.string().min(1)).default([]),
}).strict();

export const candidateFabricSchema = z.object({
  schema: z.literal('atlas.candidate-fabric.v1').default('atlas.candidate-fabric.v1'),
  query_id: canonicalIdSchema,
  source_snapshot_revision: revisionSchema,
  entity_candidates: z.array(canonicalCandidateRefSchema).default([]),
  relationship_candidates: z.array(relationshipCandidateSchema).default([]),
  evidence_candidates: z.array(canonicalCandidateRefSchema).default([]),
  semantic_executor_refs: z.array(z.string().min(1)).default([]),
  semantic_lane_votes: z.literal(1).default(1),
}).strict();

export const incidenceProjectionNodeSchema = z.object({
  node_id: canonicalIdSchema,
  node_kind: z.enum(['entity', 'relationship']),
  canonical_id: canonicalIdSchema,
  entity_type: entityTypeSchema.nullable().optional(),
  relationship_type: z.string().min(1).nullable().optional(),
}).strict();

export const incidenceProjectionEdgeSchema = z.object({
  relationship_id: canonicalIdSchema,
  relationship_revision: revisionSchema,
  relationship_node_id: canonicalIdSchema,
  entity_node_id: canonicalIdSchema,
  role: z.string().min(1),
  entity_type: entityTypeSchema,
  entity_id: canonicalIdSchema,
}).strict();

export const pairwiseRelationshipProjectionEdgeSchema = z.object({
  relationship_id: canonicalIdSchema,
  relationship_revision: revisionSchema,
  relationship_type: z.string().min(1),
  source_entity_type: entityTypeSchema,
  source_entity_id: canonicalIdSchema,
  source_role: z.string().min(1),
  target_entity_type: entityTypeSchema,
  target_entity_id: canonicalIdSchema,
  target_role: z.string().min(1),
  projection_weight: z.number().finite().positive(),
}).strict();

export type CandidateScoresV1 = z.infer<typeof candidateScoresSchema>;
export type CanonicalCandidateRefV1 = z.infer<typeof canonicalCandidateRefSchema>;
export type RelationshipCandidateV1 = z.infer<typeof relationshipCandidateSchema>;
export type RelationshipEmbeddingProjectionV1 = z.infer<typeof relationshipEmbeddingProjectionSchema>;
export type DynamicHyperedgeCandidateV1 = z.infer<typeof dynamicHyperedgeCandidateSchema>;
export type RelationChainStepV1 = z.infer<typeof relationChainStepSchema>;
export type ReasoningChainV1 = z.infer<typeof reasoningChainSchema>;
export type QueryEvidenceExpectationV1 = z.infer<typeof queryEvidenceExpectationSchema>;
export type ContextEvidenceInventoryV1 = z.infer<typeof contextEvidenceInventorySchema>;
export type SufficientContextDecisionV1 = z.infer<typeof sufficientContextDecisionSchema>;
export type CandidateFabricV1 = z.infer<typeof candidateFabricSchema>;
export type IncidenceProjectionNodeV1 = z.infer<typeof incidenceProjectionNodeSchema>;
export type IncidenceProjectionEdgeV1 = z.infer<typeof incidenceProjectionEdgeSchema>;
export type PairwiseRelationshipProjectionEdgeV1 = z.infer<typeof pairwiseRelationshipProjectionEdgeSchema>;

function participantKey(participant: RelationshipParticipantV1): string {
  return `${participant.entity_type}:${participant.entity_id}:${participant.role}`;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Lossless incidence projection: the relationship is reified as its own node.
 * This is the preferred graph projection for true N-ary facts.
 */
export function projectRelationshipToIncidence(relationship: FeatureRelationshipV1): {
  nodes: IncidenceProjectionNodeV1[];
  edges: IncidenceProjectionEdgeV1[];
} {
  const parsed = featureRelationshipSchema.parse(relationship);
  const relationshipNodeId = `relationship:${parsed.relationship_id}`;
  const nodes: IncidenceProjectionNodeV1[] = [
    incidenceProjectionNodeSchema.parse({
      node_id: relationshipNodeId,
      node_kind: 'relationship',
      canonical_id: parsed.relationship_id,
      relationship_type: parsed.relationship_type,
    }),
  ];
  const seenEntityNodes = new Set<string>();
  const edges: IncidenceProjectionEdgeV1[] = [];

  for (const participant of parsed.participants) {
    const entityNodeId = `entity:${participant.entity_type}:${participant.entity_id}`;
    if (!seenEntityNodes.has(entityNodeId)) {
      nodes.push(incidenceProjectionNodeSchema.parse({
        node_id: entityNodeId,
        node_kind: 'entity',
        canonical_id: participant.entity_id,
        entity_type: participant.entity_type,
      }));
      seenEntityNodes.add(entityNodeId);
    }
    edges.push(incidenceProjectionEdgeSchema.parse({
      relationship_id: parsed.relationship_id,
      relationship_revision: parsed.relationship_revision,
      relationship_node_id: relationshipNodeId,
      entity_node_id: entityNodeId,
      role: participant.role,
      entity_type: participant.entity_type,
      entity_id: participant.entity_id,
    }));
  }

  return { nodes, edges };
}

/**
 * Secondary pairwise projection for algorithms that require ordinary edges.
 * Each pair retains relationship_id/revision/roles. The total relationship
 * mass is normalized so high-arity facts do not receive accidental clique
 * amplification merely because they contain more participants.
 */
export function projectRelationshipToPairwise(
  relationship: FeatureRelationshipV1,
): PairwiseRelationshipProjectionEdgeV1[] {
  const parsed = featureRelationshipSchema.parse(relationship);
  if (parsed.participants.length < 2) return [];
  const sorted = [...parsed.participants].sort((a, b) => participantKey(a).localeCompare(participantKey(b)));
  const pairCount = (sorted.length * (sorted.length - 1)) / 2;
  const projectionWeight = 1 / pairCount;
  const edges: PairwiseRelationshipProjectionEdgeV1[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const source = sorted[i]!;
      const target = sorted[j]!;
      edges.push(pairwiseRelationshipProjectionEdgeSchema.parse({
        relationship_id: parsed.relationship_id,
        relationship_revision: parsed.relationship_revision,
        relationship_type: parsed.relationship_type,
        source_entity_type: source.entity_type,
        source_entity_id: source.entity_id,
        source_role: source.role,
        target_entity_type: target.entity_type,
        target_entity_id: target.entity_id,
        target_role: target.role,
        projection_weight: projectionWeight,
      }));
    }
  }

  return edges;
}

/**
 * Reconstructs the unique participants represented by a pairwise projection.
 * The canonical relationship header is still authoritative; this function is
 * a parity/audit helper, not a relationship source of truth.
 */
export function reconstructParticipantsFromPairwise(
  edges: readonly PairwiseRelationshipProjectionEdgeV1[],
): Array<Pick<RelationshipParticipantV1, 'role' | 'entity_type' | 'entity_id'>> {
  const byKey = new Map<string, Pick<RelationshipParticipantV1, 'role' | 'entity_type' | 'entity_id'>>();
  for (const edge of edges) {
    const parsed = pairwiseRelationshipProjectionEdgeSchema.parse(edge);
    const source = {
      role: parsed.source_role,
      entity_type: parsed.source_entity_type,
      entity_id: parsed.source_entity_id,
    };
    const target = {
      role: parsed.target_role,
      entity_type: parsed.target_entity_type,
      entity_id: parsed.target_entity_id,
    };
    byKey.set(`${source.entity_type}:${source.entity_id}:${source.role}`, source);
    byKey.set(`${target.entity_type}:${target.entity_id}:${target.role}`, target);
  }
  return [...byKey.values()].sort((a, b) => participantKey(a).localeCompare(participantKey(b)));
}

export type BuildReasoningChainInput = {
  query_id: string;
  source_snapshot_revision: string;
  seed_entity_ids: string[];
  relationships: FeatureRelationshipV1[];
  maximum_hop_count?: 0 | 1 | 2;
  fanout_limit?: number;
  allowed_relationship_types?: string[];
  semantic_scores?: Record<string, number>;
  ppr_scores?: Record<string, number>;
};

/**
 * Deterministic bounded traversal over canonical N-ary relationships.
 * It walks entity -> hyperedge -> entity while preserving participant roles.
 */
export function buildBoundedReasoningChain(input: BuildReasoningChainInput): ReasoningChainV1 {
  const maximumHopCount = input.maximum_hop_count ?? 2;
  const fanoutLimit = Math.max(1, Math.min(input.fanout_limit ?? 20, 100));
  const allowed = new Set(input.allowed_relationship_types ?? []);
  const relationships = input.relationships
    .map((relationship) => featureRelationshipSchema.parse(relationship))
    .filter((relationship) => allowed.size === 0 || allowed.has(relationship.relationship_type))
    .sort((a, b) => a.relationship_id.localeCompare(b.relationship_id));

  const byEntity = new Map<string, FeatureRelationshipV1[]>();
  for (const relationship of relationships) {
    for (const participant of relationship.participants) {
      const list = byEntity.get(participant.entity_id) ?? [];
      list.push(relationship);
      byEntity.set(participant.entity_id, list);
    }
  }

  const seedIds = uniqueSorted(input.seed_entity_ids.filter(Boolean));
  const visitedEntityIds = new Set(seedIds);
  const visitedRelationshipIds = new Set<string>();
  const frontier = seedIds.map((entityId) => ({ entityId, hop: 0 }));
  const steps: RelationChainStepV1[] = [];

  while (frontier.length > 0) {
    const current = frontier.shift()!;
    if (current.hop >= maximumHopCount) continue;

    const candidateRelationships = (byEntity.get(current.entityId) ?? [])
      .filter((relationship) => !visitedRelationshipIds.has(relationship.relationship_id))
      .slice(0, fanoutLimit);

    for (const relationship of candidateRelationships) {
      visitedRelationshipIds.add(relationship.relationship_id);
      const fromParticipants = relationship.participants
        .filter((participant) => participant.entity_id === current.entityId)
        .sort((a, b) => participantKey(a).localeCompare(participantKey(b)));
      const fromEntity = fromParticipants[0];
      if (!fromEntity) continue;

      const outgoing = relationship.participants
        .filter((participant) => participant.entity_id !== current.entityId)
        .sort((a, b) => participantKey(a).localeCompare(participantKey(b)))
        .slice(0, fanoutLimit);

      for (const toEntity of outgoing) {
        const semanticScore = input.semantic_scores?.[relationship.relationship_id];
        const pprScore = input.ppr_scores?.[relationship.relationship_id];
        const baseConfidence = relationship.confidence;
        const hopDecay = 1 / (current.hop + 1);
        const incidenceConfidence = clamp01(
          baseConfidence * 0.7 +
          (semanticScore ?? 0) * 0.15 +
          (pprScore ?? 0) * 0.15
        ) * hopDecay;

        steps.push(relationChainStepSchema.parse({
          step_index: steps.length,
          hop: current.hop + 1,
          from_entity: fromEntity,
          relationship_id: relationship.relationship_id,
          relationship_type: relationship.relationship_type,
          to_entity: toEntity,
          evidence_refs: relationship.evidence_refs,
          semantic_score: semanticScore,
          ppr_score: pprScore,
          incidence_confidence: clamp01(incidenceConfidence),
        }));

        if (!visitedEntityIds.has(toEntity.entity_id)) {
          visitedEntityIds.add(toEntity.entity_id);
          frontier.push({ entityId: toEntity.entity_id, hop: current.hop + 1 });
        }
      }
    }
  }

  const chainScore = steps.length === 0
    ? 0
    : clamp01(steps.reduce((sum, step) => sum + step.incidence_confidence, 0) / steps.length);

  return reasoningChainSchema.parse({
    query_id: input.query_id,
    seed_entity_ids: seedIds,
    steps,
    relationship_ids: uniqueSorted(visitedRelationshipIds),
    entity_ids: uniqueSorted(visitedEntityIds),
    source_snapshot_revision: input.source_snapshot_revision,
    maximum_hop_count: maximumHopCount,
    fanout_limit: fanoutLimit,
    chain_score: chainScore,
  });
}

function chooseMissingState(
  missingEntityTypes: string[],
  missingRelationshipTypes: string[],
  missingEvidenceKinds: string[],
  contradictions: string[],
  staleRefs: string[],
): { state: z.infer<typeof sufficiencyStateSchema>; nextAction: z.infer<typeof sufficiencyActionSchema> } {
  if (contradictions.length > 0 || staleRefs.length > 0) {
    return { state: 'NEED_DEFINITION', nextAction: 'retrieve_definitions' };
  }
  if (missingRelationshipTypes.length > 0) {
    return { state: 'NEED_RELATIONSHIP', nextAction: 'retrieve_relationships' };
  }
  if (missingEntityTypes.some((type) => ['table', 'column', 'database_policy', 'schema'].includes(type))) {
    return { state: 'NEED_SCHEMA', nextAction: 'retrieve_schema' };
  }
  if (missingEvidenceKinds.some((kind) => /runtime|receipt|telemetry|execution/i.test(kind))) {
    return { state: 'NEED_RUNTIME', nextAction: 'retrieve_runtime' };
  }
  if (missingEvidenceKinds.some((kind) => /test|validation|assert/i.test(kind))) {
    return { state: 'NEED_TEST', nextAction: 'retrieve_tests' };
  }
  if (missingEntityTypes.length > 0 || missingEvidenceKinds.length > 0) {
    return { state: 'NEED_EVIDENCE', nextAction: 'retrieve_evidence' };
  }
  return { state: 'ENOUGH_EVIDENCE', nextAction: 'synthesize' };
}

/**
 * Sufficient-context gate. This is the deterministic observation-to-state
 * boundary that an HMM/Viterbi policy may consume later; ANN scores do not
 * decide sufficiency by themselves.
 */
export function evaluateSufficientContext(
  expectationInput: QueryEvidenceExpectationV1,
  inventoryInput: ContextEvidenceInventoryV1,
): SufficientContextDecisionV1 {
  const expectation = queryEvidenceExpectationSchema.parse(expectationInput);
  const inventory = contextEvidenceInventorySchema.parse(inventoryInput);

  const entityTypes = new Set(inventory.entity_types);
  const relationshipTypes = new Set(inventory.relationship_types);
  const evidenceKinds = new Set(inventory.evidence_kinds);

  const missingEntityTypes = expectation.expected_entity_types.filter((value) => !entityTypes.has(value));
  const missingRelationshipTypes = expectation.expected_relationship_types.filter((value) => !relationshipTypes.has(value));
  const missingEvidenceKinds = expectation.required_evidence_kinds.filter((value) => !evidenceKinds.has(value));
  const blockers: string[] = [];

  if (inventory.relationship_count < expectation.minimum_relationships) {
    blockers.push(`relationship_count ${inventory.relationship_count} < ${expectation.minimum_relationships}`);
  }
  if (inventory.evidence_ref_count < expectation.minimum_evidence_refs) {
    blockers.push(`evidence_ref_count ${inventory.evidence_ref_count} < ${expectation.minimum_evidence_refs}`);
  }
  if (inventory.contradiction_refs.length > 0) blockers.push('contradicting evidence requires resolution');
  if (inventory.stale_refs.length > 0) blockers.push('stale evidence requires refresh');

  const missingState = chooseMissingState(
    missingEntityTypes,
    missingRelationshipTypes,
    missingEvidenceKinds,
    inventory.contradiction_refs,
    inventory.stale_refs,
  );

  const sufficient =
    missingEntityTypes.length === 0 &&
    missingRelationshipTypes.length === 0 &&
    missingEvidenceKinds.length === 0 &&
    blockers.length === 0;

  return sufficientContextDecisionSchema.parse({
    query_id: expectation.query_id,
    sufficient,
    state: sufficient ? 'ENOUGH_EVIDENCE' : missingState.state,
    next_action: sufficient ? 'synthesize' : missingState.nextAction,
    missing_entity_types: missingEntityTypes,
    missing_relationship_types: missingRelationshipTypes,
    missing_evidence_kinds: missingEvidenceKinds,
    blockers,
  });
}

export function buildDynamicHyperedgeCandidate(
  input: z.input<typeof dynamicHyperedgeCandidateSchema>,
): DynamicHyperedgeCandidateV1 {
  return dynamicHyperedgeCandidateSchema.parse(input);
}

export function describeHypergraphRetrievalContract(): string {
  return [
    'Dense search nominates candidates; it does not create canonical relationships.',
    'Canonical N-ary facts are stored as relationship headers plus typed participant rows.',
    'Incidence projection is lossless; pairwise projection is secondary and retains relationship identity and roles.',
    'Dynamic SQL hyperedges remain query-scoped candidates until evidence review promotes them.',
    'PPR, PageRank, TurboVec, low-rank sampling, SOM/manifold coordinates and neural rerankers are derived ranking signals.',
    'Sufficient-context evaluation determines whether the DAG synthesizes or retrieves another evidence class.',
  ].join(' ');
}
