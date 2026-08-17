import pg from 'pg';
import { ENV } from '$lib/server/env.server.js';
import {
  createFeatureIntelligenceRepository,
} from '@deeds/parent-atlas/core/feature-intelligence-repository';
import {
  buildBoundedReasoningChain,
  evaluateSufficientContext,
  type ContextEvidenceInventoryV1,
  type QueryEvidenceExpectationV1,
  type ReasoningChainV1,
  type SufficientContextDecisionV1,
} from '@deeds/parent-atlas/core/hypergraph-retrieval';
import type { FeatureRelationshipV1 } from '@deeds/parent-atlas';

export type HypergraphRelationRetrieveInput = {
  queryId: string;
  seedEntityIds: string[];
  sourceSnapshotRevision: string;
  relationshipTypes?: string[];
  maximumHopCount?: 0 | 1 | 2;
  fanoutLimit?: number;
  semanticScores?: Record<string, number>;
  pprScores?: Record<string, number>;
  expectation: QueryEvidenceExpectationV1;
  evidenceInventory?: Partial<ContextEvidenceInventoryV1>;
};

export type HypergraphRelationRetrieveResult = {
  relationships: FeatureRelationshipV1[];
  reasoningChain: ReasoningChainV1;
  sufficientContext: SufficientContextDecisionV1;
  relationshipEvidenceRefs: string[];
  entityTypes: string[];
  relationshipTypes: string[];
};

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: ENV.DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10_000,
      statement_timeout: 3000,
    });
  }
  return pool;
}

function unique(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))];
}

export async function retrieveCanonicalHypergraphRelations(
  input: HypergraphRelationRetrieveInput,
): Promise<HypergraphRelationRetrieveResult> {
  const repository = createFeatureIntelligenceRepository(getPool());
  const relationships = await repository.findRelationshipsForEntities(
    unique(input.seedEntityIds),
    input.relationshipTypes ?? [],
    Math.max(20, Math.min((input.fanoutLimit ?? 20) * Math.max(input.seedEntityIds.length, 1), 500)),
  );

  const reasoningChain = buildBoundedReasoningChain({
    query_id: input.queryId,
    source_snapshot_revision: input.sourceSnapshotRevision,
    seed_entity_ids: unique(input.seedEntityIds),
    relationships,
    maximum_hop_count: input.maximumHopCount ?? 2,
    fanout_limit: input.fanoutLimit ?? 20,
    allowed_relationship_types: input.relationshipTypes,
    semantic_scores: input.semanticScores,
    ppr_scores: input.pprScores,
  });

  const entityTypes = unique(
    relationships.flatMap((relationship) => relationship.participants.map((participant) => participant.entity_type)),
  );
  const relationshipTypes = unique(relationships.map((relationship) => relationship.relationship_type));
  const relationshipEvidenceRefs = unique(relationships.flatMap((relationship) => relationship.evidence_refs));
  const evidenceKinds = unique(input.evidenceInventory?.evidence_kinds ?? []);

  const inventory: ContextEvidenceInventoryV1 = {
    schema: 'atlas.context-evidence-inventory.v1',
    entity_types: unique([...(input.evidenceInventory?.entity_types ?? []), ...entityTypes]),
    relationship_types: unique([...(input.evidenceInventory?.relationship_types ?? []), ...relationshipTypes]),
    evidence_kinds: evidenceKinds,
    relationship_count: relationships.length,
    evidence_ref_count: unique([
      ...(input.evidenceInventory?.contradiction_refs ?? []),
      ...(input.evidenceInventory?.stale_refs ?? []),
      ...relationshipEvidenceRefs,
    ]).length,
    contradiction_refs: unique(input.evidenceInventory?.contradiction_refs ?? []),
    stale_refs: unique(input.evidenceInventory?.stale_refs ?? []),
  };

  const sufficientContext = evaluateSufficientContext(input.expectation, inventory);

  return {
    relationships,
    reasoningChain,
    sufficientContext,
    relationshipEvidenceRefs,
    entityTypes,
    relationshipTypes,
  };
}
