import {
  adaptHyperRagFirstStageHits,
  attachHypergraphEvidenceToAcePacketV3,
  runHypergraphFusionFacade,
  type AceHypergraphPayloadV1,
  type AcePacketV3,
  type FeatureIntelligenceRepository,
  type HypergraphFusionFacadeResult,
  type HyperRagFirstStageHitV1,
  type QueryEvidenceExpectationV1,
  verifyAcePacketV3,
} from '@deeds/parent-atlas';

export type HyperRagFusionRuntimePacketV1 = {
  packet_key?: string | null;
  source_ref?: string | null;
  feature_id?: string | null;
  relationship_id?: string | null;
  evidence_id?: string | null;
  score?: number | null;
  workspace_revision?: string | null;
  identity_status?: 'canonical' | 'projection_exact' | 'source_group' | 'degraded';
};

export type HyperRagFusionRuntimeInputV1 = {
  queryId: string;
  workspaceRevision: string;
  producerRevision: string;
  packets: readonly HyperRagFusionRuntimePacketV1[];
  repository: FeatureIntelligenceRepository;
  expectation?: QueryEvidenceExpectationV1;
  relationshipTypes?: readonly string[];
  maximumHopCount?: 0 | 1 | 2;
  fanoutLimit?: number;
};

export type HyperRagFusionRuntimeResultV1 = {
  status: 'ENRICHED' | 'NO_CANONICAL_HITS' | 'UNAVAILABLE';
  acceptedCandidateCount: number;
  rejectedCandidateCount: number;
  acePayloads: AceHypergraphPayloadV1[];
  facade: HypergraphFusionFacadeResult | null;
  reason?: string;
};

function toFirstStageHit(
  packet: HyperRagFusionRuntimePacketV1,
  workspaceRevision: string,
): HyperRagFirstStageHitV1 {
  const packetKey = packet.packet_key?.trim() ?? '';
  const sourceRef = packet.source_ref?.trim() ?? '';
  const exactWorkspace = packet.workspace_revision === workspaceRevision;
  const identityStatus = packet.identity_status === 'canonical' && exactWorkspace
    ? 'canonical'
    : 'degraded';

  return {
    packet_key: packetKey,
    source_ref: sourceRef,
    canonical_id: packet.feature_id ?? null,
    feature_id: packet.feature_id ?? null,
    relationship_id: packet.relationship_id ?? null,
    evidence_id: packet.evidence_id ?? null,
    score: packet.score ?? null,
    identity_status: identityStatus,
  };
}

/**
 * Read-only live composition point for the existing HyperRAG API. The facade
 * can enrich only the exact current first-stage candidates; it cannot discover
 * new retrieval hits or add another semantic vote. DB failures are surfaced as
 * unavailable so the route can preserve the primary retrieval result.
 */
export async function runHyperRagFusionRuntimeV1(
  input: HyperRagFusionRuntimeInputV1,
): Promise<HyperRagFusionRuntimeResultV1> {
  const workspaceRevision = input.workspaceRevision.trim();
  if (!workspaceRevision) {
    return {
      status: 'UNAVAILABLE',
      acceptedCandidateCount: 0,
      rejectedCandidateCount: input.packets.length,
      acePayloads: [],
      facade: null,
      reason: 'HYPERRAG_WORKSPACE_REVISION_REQUIRED',
    };
  }

  const adapted = adaptHyperRagFirstStageHits(
    input.packets.map((packet) => toFirstStageHit(packet, workspaceRevision)),
  );
  if (adapted.accepted.length === 0) {
    return {
      status: 'NO_CANONICAL_HITS',
      acceptedCandidateCount: 0,
      rejectedCandidateCount: adapted.rejected.length,
      acePayloads: [],
      facade: null,
    };
  }

  try {
    const facade = await runHypergraphFusionFacade({
      query_id: input.queryId,
      source_snapshot_revision: workspaceRevision,
      producer_revision: input.producerRevision,
      candidates: adapted.accepted,
      repository: input.repository,
      expectation: input.expectation ?? {
        schema: 'atlas.query-evidence-expectation.v1',
        query_id: input.queryId,
        expected_entity_types: [],
        expected_relationship_types: [],
        required_evidence_kinds: [],
        minimum_relationships: 0,
        minimum_evidence_refs: 0,
      },
      relationship_types: [...(input.relationshipTypes ?? [])],
      maximum_hop_count: input.maximumHopCount ?? 2,
      fanout_limit: input.fanoutLimit ?? 20,
      semantic_executors: ['existing-search-runtime'],
    });
    return {
      status: 'ENRICHED',
      acceptedCandidateCount: adapted.accepted.length,
      rejectedCandidateCount: adapted.rejected.length,
      acePayloads: facade.ace_payloads,
      facade,
    };
  } catch (error) {
    return {
      status: 'UNAVAILABLE',
      acceptedCandidateCount: adapted.accepted.length,
      rejectedCandidateCount: adapted.rejected.length,
      acePayloads: [],
      facade: null,
      reason: error instanceof Error ? error.message : 'HYPERRAG_FUSION_UNAVAILABLE',
    };
  }
}

/**
 * Compose bounded HyperRAG evidence into one verified ACE v3 packet using the
 * existing retrieval facade. This is a pure composition boundary: the caller
 * supplies an already-canonical packet and repository adapter; this function
 * neither discovers candidates nor persists the result.
 */
export async function enrichAcePacketV3WithHyperRagV1(input: {
  packet: AcePacketV3;
  queryId: string;
  producerRevision: string;
  repository: FeatureIntelligenceRepository;
  expectation?: QueryEvidenceExpectationV1;
  relationshipTypes?: readonly string[];
  maximumHopCount?: 0 | 1 | 2;
  fanoutLimit?: number;
  score?: number;
}): Promise<HyperRagFusionRuntimeResultV1 & { packet: AcePacketV3 }> {
  const packet = verifyAcePacketV3(input.packet);
  if (packet.base.hypergraph !== null) {
    return {
      status: 'UNAVAILABLE', acceptedCandidateCount: 0, rejectedCandidateCount: 1,
      acePayloads: [], facade: null, packet, reason: 'ACE3_HYPERGRAPH_ALREADY_PRESENT',
    };
  }

  const result = await runHyperRagFusionRuntimeV1({
    queryId: input.queryId,
    workspaceRevision: packet.identity.workspace_revision,
    producerRevision: input.producerRevision,
    repository: input.repository,
    expectation: input.expectation,
    relationshipTypes: input.relationshipTypes,
    maximumHopCount: input.maximumHopCount,
    fanoutLimit: input.fanoutLimit,
    packets: [{
      packet_key: packet.identity.packet_key,
      source_ref: packet.identity.source_ref,
      feature_id: packet.base.envelope.feature_id,
      workspace_revision: packet.identity.workspace_revision,
      identity_status: 'canonical',
      score: input.score,
    }],
  });

  if (result.status !== 'ENRICHED') return { ...result, packet };
  const matching = result.acePayloads.filter((payload) =>
    payload.packet_key === packet.identity.packet_key
    && payload.source_ref === packet.identity.source_ref
    && (payload.feature_id ?? null) === (packet.base.envelope.feature_id ?? null)
    && payload.lineage.source_snapshot_revision === packet.identity.workspace_revision);
  if (matching.length !== 1) {
    return {
      ...result, status: 'UNAVAILABLE', acePayloads: [], packet,
      reason: 'ACE3_HYPERGRAPH_EXACT_PACKET_PAYLOAD_REQUIRED',
    };
  }
  try {
    return { ...result, packet: attachHypergraphEvidenceToAcePacketV3(packet, matching[0]) };
  } catch (error) {
    return {
      ...result, status: 'UNAVAILABLE', acePayloads: [], packet,
      reason: error instanceof Error ? error.message : 'ACE3_HYPERGRAPH_COMPOSITION_FAILED',
    };
  }
}
