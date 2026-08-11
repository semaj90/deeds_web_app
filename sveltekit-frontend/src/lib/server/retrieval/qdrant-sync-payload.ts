import { buildEnrichedPayload } from './qdrant-payload-enricher.js';
import { SEMANTIC_REPRESENTATION_ID } from '../embedding/embedding-contract-768.js';

export function buildQdrantSyncPayload(packet: Record<string, unknown>): Record<string, unknown> {
  const p = packet as any;
  if (!p.packetKey || !p.sourceRef || !p.featureId || !p.workspaceId) {
    throw new Error(`Invalid identity: ${p.packetKey ?? p.packet_key ?? 'unknown'}`);
  }

  return {
    ...buildEnrichedPayload(p, p, {
      workspaceId: String(p.workspaceId),
      schemaVersion: 'atlas.qdrant.payload.v1'
    }),
    // Canonical 8-field envelope
    packet_key: String(p.packetKey),
    source_ref: String(p.sourceRef),
    workspace_id: String(p.workspaceId),
    workspace_revision: Number(p.workspaceRevision || 0),
    representation_id: String(p.representationId || SEMANTIC_REPRESENTATION_ID),
    representation_revision: Number(p.representationRevision || 0),
    schema_version: 'atlas.qdrant.payload.v1',
    source_revision: p.sourceRevision ? String(p.sourceRevision) : null,
    // Enrichment fields
    identity_lane: p.identityLane,
    identity_confidence: p.identityConfidence,
    recovery_lane: p.recoveryLane,
    domain_class: p.domainClass,
    tree_node_id: p.treeNodeId,
    title_id: p.titleId,
    community_id: p.communityId,
    som_cluster: p.somCluster
  };
}
