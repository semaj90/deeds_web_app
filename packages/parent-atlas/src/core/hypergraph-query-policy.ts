import {
  featureRelationshipSchema,
  type FeatureRelationshipV1,
  type RelationshipParticipantV1,
} from './feature-intelligence.js';
import {
  reasoningChainSchema,
  relationChainStepSchema,
  type ReasoningChainV1,
} from './hypergraph-retrieval.js';

export type HypergraphQuerySignalsV1 = {
  semantic_scores?: Record<string, number>;
  ppr_scores?: Record<string, number>;
  extraction_confidence?: Record<string, number>;
  expected_relationship_types?: string[];
};

export type HypergraphRelationshipSelectionV1 = {
  relationship_id: string;
  score: number;
  semantic_score: number;
  ppr_score: number;
  relation_confidence: number;
  extraction_confidence: number;
  evidence_coverage: number;
  expected_type_match: number;
};

export type QueryConditionedReasoningChainInputV1 = {
  query_id: string;
  source_snapshot_revision: string;
  seed_entity_ids: string[];
  relationships: FeatureRelationshipV1[];
  maximum_hop_count?: 0 | 1 | 2;
  fanout_limit?: number;
  signals?: HypergraphQuerySignalsV1;
};

function clamp01(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function participantKey(participant: Pick<RelationshipParticipantV1, 'entity_type' | 'entity_id' | 'role'>): string {
  return `${participant.entity_type}:${participant.entity_id}:${participant.role}`;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

/**
 * Query-conditioned relationship ranking inspired by hypergraph retrieval work:
 * semantic relevance + query-seeded PPR + relation/extraction confidence +
 * evidence coverage + expected relation type. These are selection signals only;
 * they never create or promote canonical facts.
 */
export function rankRelationshipsForQuery(
  relationships: readonly FeatureRelationshipV1[],
  signals: HypergraphQuerySignalsV1 = {},
): HypergraphRelationshipSelectionV1[] {
  const expectedTypes = new Set(signals.expected_relationship_types ?? []);
  const maxEvidence = Math.max(1, ...relationships.map((relationship) => relationship.evidence_refs.length));

  return relationships
    .map((relationshipInput) => {
      const relationship = featureRelationshipSchema.parse(relationshipInput);
      const semanticScore = clamp01(signals.semantic_scores?.[relationship.relationship_id]);
      const pprScore = clamp01(signals.ppr_scores?.[relationship.relationship_id]);
      const relationConfidence = clamp01(relationship.confidence);
      const extractionConfidence = clamp01(
        signals.extraction_confidence?.[relationship.relationship_id] ?? relationship.confidence,
      );
      const evidenceCoverage = clamp01(relationship.evidence_refs.length / maxEvidence);
      const expectedTypeMatch = expectedTypes.size === 0
        ? 0.5
        : expectedTypes.has(relationship.relationship_type) ? 1 : 0;

      const score = clamp01(
        semanticScore * 0.30 +
        pprScore * 0.20 +
        relationConfidence * 0.20 +
        extractionConfidence * 0.10 +
        evidenceCoverage * 0.10 +
        expectedTypeMatch * 0.10,
      );

      return {
        relationship_id: relationship.relationship_id,
        score,
        semantic_score: semanticScore,
        ppr_score: pprScore,
        relation_confidence: relationConfidence,
        extraction_confidence: extractionConfidence,
        evidence_coverage: evidenceCoverage,
        expected_type_match: expectedTypeMatch,
      };
    })
    .sort((a, b) => b.score - a.score || a.relationship_id.localeCompare(b.relationship_id));
}

/**
 * Bounded entity -> hyperedge -> entity traversal where fanout selection is
 * query-conditioned instead of relationship-id ordered. The returned chain is
 * deterministic for a pinned relationship snapshot and signal maps.
 */
export function buildQueryConditionedReasoningChain(
  input: QueryConditionedReasoningChainInputV1,
): ReasoningChainV1 {
  const maximumHopCount = input.maximum_hop_count ?? 2;
  const fanoutLimit = Math.max(1, Math.min(input.fanout_limit ?? 20, 100));
  const relationships = input.relationships.map((relationship) => featureRelationshipSchema.parse(relationship));
  const selection = rankRelationshipsForQuery(relationships, input.signals);
  const selectionById = new Map(selection.map((item) => [item.relationship_id, item]));

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
  const steps: Array<ReturnType<typeof relationChainStepSchema.parse>> = [];

  while (frontier.length > 0) {
    const current = frontier.shift()!;
    if (current.hop >= maximumHopCount) continue;

    const candidateRelationships = (byEntity.get(current.entityId) ?? [])
      .filter((relationship) => !visitedRelationshipIds.has(relationship.relationship_id))
      .sort((a, b) => {
        const scoreA = selectionById.get(a.relationship_id)?.score ?? 0;
        const scoreB = selectionById.get(b.relationship_id)?.score ?? 0;
        return scoreB - scoreA || a.relationship_id.localeCompare(b.relationship_id);
      })
      .slice(0, fanoutLimit);

    for (const relationship of candidateRelationships) {
      visitedRelationshipIds.add(relationship.relationship_id);
      const selectionScore = selectionById.get(relationship.relationship_id);
      const fromEntity = relationship.participants
        .filter((participant) => participant.entity_id === current.entityId)
        .sort((a, b) => participantKey(a).localeCompare(participantKey(b)))[0];
      if (!fromEntity) continue;

      const outgoing = relationship.participants
        .filter((participant) => participant.entity_id !== current.entityId)
        .sort((a, b) => participantKey(a).localeCompare(participantKey(b)))
        .slice(0, fanoutLimit);

      for (const toEntity of outgoing) {
        const hop = current.hop + 1;
        const hopDecay = 1 / hop;
        const incidenceConfidence = clamp01((selectionScore?.score ?? relationship.confidence) * hopDecay);

        steps.push(relationChainStepSchema.parse({
          schema: 'atlas.relation-chain-step.v1',
          step_index: steps.length,
          hop,
          from_entity: fromEntity,
          relationship_id: relationship.relationship_id,
          relationship_type: relationship.relationship_type,
          to_entity: toEntity,
          evidence_refs: relationship.evidence_refs,
          semantic_score: selectionScore?.semantic_score,
          ppr_score: selectionScore?.ppr_score,
          incidence_confidence: incidenceConfidence,
        }));

        if (!visitedEntityIds.has(toEntity.entity_id)) {
          visitedEntityIds.add(toEntity.entity_id);
          frontier.push({ entityId: toEntity.entity_id, hop });
        }
      }
    }
  }

  const chainScore = steps.length === 0
    ? 0
    : clamp01(steps.reduce((sum, step) => sum + step.incidence_confidence, 0) / steps.length);

  return reasoningChainSchema.parse({
    schema: 'atlas.reasoning-chain.v1',
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
