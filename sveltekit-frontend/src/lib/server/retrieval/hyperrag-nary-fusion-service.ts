import crypto from 'node:crypto';
import { HyperRagFusionService, type HyperRagQuery, type HyperRagResult } from './hyperrag-fusion-service.js';
import { retrieveCanonicalHypergraphRelations } from './hypergraph-relation-retriever.js';
import {
  buildAceHypergraphPayload,
  type AceHypergraphPayloadV1,
} from '@deeds/parent-atlas/core/ace-hypergraph-payload';
import type { QueryEvidenceExpectationV1 } from '@deeds/parent-atlas/core/hypergraph-retrieval';

export type HyperRagNaryQuery = HyperRagQuery & {
  useNaryRelations?: boolean;
  relationshipTypes?: string[];
  relationshipMaxHops?: 0 | 1 | 2;
  relationshipFanout?: number;
  sourceSnapshotRevision?: string;
  evidenceExpectation?: QueryEvidenceExpectationV1;
};

export type HyperRagNaryResult = HyperRagResult & {
  nary: {
    enabled: boolean;
    relationshipCount: number;
    relationshipIds: string[];
    reasoningChain: AceHypergraphPayloadV1['reasoning_chain'] | null;
    sufficientContext: AceHypergraphPayloadV1['sufficient_context'] | null;
    aceHypergraphPayloads: AceHypergraphPayloadV1[];
    degradedReason?: string;
  };
};

function stableQueryId(query: string): string {
  return `query:${crypto.createHash('sha256').update(query).digest('hex').slice(0, 24)}`;
}

function unique(values: Iterable<string | null | undefined>): string[] {
  return [...new Set([...values].map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function seedIdsFromHit(hit: HyperRagResult['hits'][number]): string[] {
  const payload = hit.payload ?? {};
  return unique([
    hit.id,
    hit.sourcePath,
    typeof payload.feature_id === 'string' ? payload.feature_id : null,
    typeof payload.featureId === 'string' ? payload.featureId : null,
    typeof payload.packet_key === 'string' ? payload.packet_key : null,
    typeof payload.packetKey === 'string' ? payload.packetKey : null,
    typeof payload.stable_symbol_id === 'string' ? payload.stable_symbol_id : null,
    typeof payload.symbol_version_id === 'string' ? payload.symbol_version_id : null,
  ]);
}

function inferExpectation(queryId: string, query: string): QueryEvidenceExpectationV1 {
  const q = query.toLowerCase();
  const expectedEntityTypes = new Set<string>();
  const expectedRelationshipTypes = new Set<string>();
  const requiredEvidenceKinds = new Set<string>(['source_ast']);

  if (/auth|authorize|permission|owner|guard|access/.test(q)) {
    ['route', 'database_policy', 'table', 'column'].forEach((value) => expectedEntityTypes.add(value));
    expectedRelationshipTypes.add('authorized_resource_mutation');
  }
  if (/test|verify|validation|regression|prove/.test(q)) {
    expectedEntityTypes.add('test');
    expectedRelationshipTypes.add('validates');
    requiredEvidenceKinds.add('test_pass');
  }
  if (/runtime|receipt|telemetry|execut|observ/.test(q)) {
    expectedEntityTypes.add('runtime_observation');
    requiredEvidenceKinds.add('runtime_receipt');
  }
  if (/schema|table|column|foreign key|index|policy|database/.test(q)) {
    expectedEntityTypes.add('table');
    expectedEntityTypes.add('column');
  }

  return {
    schema: 'atlas.query-evidence-expectation.v1',
    query_id: queryId,
    expected_entity_types: [...expectedEntityTypes],
    expected_relationship_types: [...expectedRelationshipTypes],
    required_evidence_kinds: [...requiredEvidenceKinds],
    minimum_relationships: expectedRelationshipTypes.size > 0 ? 1 : 0,
    minimum_evidence_refs: 1,
  };
}

/**
 * Additive facade: existing HyperRagFusionService remains the first-stage candidate
 * engine. This layer promotes top hits to canonical seeds, traverses canonical N-ary
 * facts, evaluates sufficient context, and produces ACE-ready payloads.
 */
export class HyperRagNaryFusionService {
  private static instance: HyperRagNaryFusionService;
  private readonly firstStage = HyperRagFusionService.getInstance();

  public static getInstance(): HyperRagNaryFusionService {
    if (!HyperRagNaryFusionService.instance) {
      HyperRagNaryFusionService.instance = new HyperRagNaryFusionService();
    }
    return HyperRagNaryFusionService.instance;
  }

  public async search(params: HyperRagNaryQuery): Promise<HyperRagNaryResult> {
    const firstStage = await this.firstStage.search(params);
    if (params.useNaryRelations === false || firstStage.hits.length === 0) {
      return {
        ...firstStage,
        nary: {
          enabled: params.useNaryRelations !== false,
          relationshipCount: 0,
          relationshipIds: [],
          reasoningChain: null,
          sufficientContext: null,
          aceHypergraphPayloads: [],
          degradedReason: firstStage.hits.length === 0 ? 'no_seed_candidates' : undefined,
        },
      };
    }

    const queryId = params.evidenceExpectation?.query_id ?? stableQueryId(params.query);
    const sourceSnapshotRevision = params.sourceSnapshotRevision ?? 'runtime-unpinned';
    const seedEntityIds = unique(firstStage.hits.slice(0, Math.min(firstStage.hits.length, 12)).flatMap(seedIdsFromHit));
    const expectation = params.evidenceExpectation ?? inferExpectation(queryId, params.query);

    try {
      const relationResult = await retrieveCanonicalHypergraphRelations({
        queryId,
        seedEntityIds,
        sourceSnapshotRevision,
        relationshipTypes: params.relationshipTypes,
        maximumHopCount: params.relationshipMaxHops ?? 2,
        fanoutLimit: params.relationshipFanout ?? 20,
        expectation,
      });

      const relationshipById = new Map(relationResult.relationships.map((relationship) => [relationship.relationship_id, relationship]));
      const relationshipEvidence = relationResult.reasoningChain.relationship_ids
        .map((relationshipId) => relationshipById.get(relationshipId))
        .filter((relationship): relationship is NonNullable<typeof relationship> => Boolean(relationship))
        .map((relationship) => ({
          relationship_id: relationship.relationship_id,
          relationship_revision: relationship.relationship_revision,
          relationship_type: relationship.relationship_type,
          relationship_degree: relationship.relationship_degree,
          participants: relationship.participants,
          hop: Math.min(
            2,
            relationResult.reasoningChain.steps.find((step) => step.relationship_id === relationship.relationship_id)?.hop ?? 0,
          ),
          evidence_refs: relationship.evidence_refs,
          confidence: relationship.confidence,
          persistence: 'canonical' as const,
        }));

      const aceHypergraphPayloads = firstStage.hits.slice(0, Math.min(firstStage.hits.length, 10)).map((hit, index) => {
        const payload = hit.payload ?? {};
        const packetKey = String(payload.packet_key ?? payload.packetKey ?? hit.id);
        const sourceRef = String(payload.source_ref ?? payload.sourceRef ?? hit.sourcePath ?? hit.id);
        const featureId = String(payload.feature_id ?? payload.featureId ?? '').trim() || null;
        return buildAceHypergraphPayload({
          query_id: queryId,
          packet_key: packetKey,
          source_ref: sourceRef,
          feature_id: featureId,
          relationship_evidence: relationshipEvidence,
          reasoning_chain: relationResult.reasoningChain,
          sufficient_context: relationResult.sufficientContext,
          lineage: {
            source_snapshot_revision: sourceSnapshotRevision,
            relationship_projection_revision: null,
            graph_snapshot_revision: null,
            semantic_projection_revision: null,
            semantic_model_revision: null,
            feature_matrix_revision: null,
            producer_revision: 'hyperrag-nary-fusion-v1',
          },
          retrieval: {
            semantic_lane_votes: 1,
            semantic_executors: unique([
              firstStage.provenance.qdrant ? 'qdrant' : null,
              firstStage.provenance.turbovec ? 'turbovec_prefilter' : null,
            ]),
            relationship_candidate_count: relationResult.relationships.length,
            evidence_candidate_count: relationResult.relationshipEvidenceRefs.length,
            graph_hops_executed: Math.max(0, ...relationResult.reasoningChain.steps.map((step) => step.hop)),
            fanout_limit: params.relationshipFanout ?? 20,
          },
          derived_ranking_signals: {
            reranker: Number.isFinite(hit.score) ? Math.max(0, Math.min(1, hit.score)) : undefined,
          },
        });
      });

      return {
        ...firstStage,
        nary: {
          enabled: true,
          relationshipCount: relationResult.relationships.length,
          relationshipIds: relationResult.reasoningChain.relationship_ids,
          reasoningChain: relationResult.reasoningChain,
          sufficientContext: relationResult.sufficientContext,
          aceHypergraphPayloads,
        },
      };
    } catch (error) {
      return {
        ...firstStage,
        nary: {
          enabled: true,
          relationshipCount: 0,
          relationshipIds: [],
          reasoningChain: null,
          sufficientContext: null,
          aceHypergraphPayloads: [],
          degradedReason: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}
