import { buildEnrichedPayload } from './qdrant-payload-enricher.js';
import { ATLAS_CANONICAL_SEMANTIC_REPRESENTATION as SEMANTIC_REPRESENTATION_ID } from '../atlas/retrieval/qdrant-semantic-projection.js';

function requirePositiveRevision(value: unknown, field: string): number {
  const revision = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(revision) || revision <= 0) throw new Error(`Missing positive ${field} for canonical Qdrant payload`);
  return revision;
}
function requireContentRevision(value: unknown, field: string): string {
  const revision = String(value ?? '').trim().toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(revision)) throw new Error(`Missing canonical ${field} for canonical Qdrant payload`);
  return revision;
}
function optionalNonEmpty(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  return text || undefined;
}
function requireCanonicalRepresentation(value: unknown): string {
  const representation = String(value ?? '').trim();
  if (representation !== SEMANTIC_REPRESENTATION_ID) {
    throw new Error(`Qdrant payload requires canonical ${SEMANTIC_REPRESENTATION_ID} representation`);
  }
  return representation;
}

/**
 * Builds the canonical Qdrant retrieval-projection payload.
 *
 * `workspace_revision` is the content-addressed WorkspaceRevisionRecordV1
 * identity. Numeric packet/cache epochs are preserved only in
 * `workspace_cache_revision` and cannot satisfy canonical lineage.
 * `repository_revision` is optional Git provenance only.
 */
export function buildQdrantSyncPayload(packet: Record<string, unknown>): Record<string, unknown> {
  const p = packet as any;
  if (!p.packetKey || !p.sourceRef || !p.featureId || !p.workspaceId) {
    throw new Error(`Invalid identity: ${p.packetKey ?? p.packet_key ?? 'unknown'}`);
  }

  const workspaceRevision = requireContentRevision(
    p.canonicalWorkspaceRevision ?? p.canonical_workspace_revision ?? p.workspaceRevision ?? p.workspace_revision,
    'workspace_revision',
  );
  const sourceRevision = requireContentRevision(p.sourceRevision ?? p.source_revision, 'source_revision');
  const representationRevision = requirePositiveRevision(
    p.representationRevision ?? p.representation_revision,
    'representation_revision',
  );
  const representationId = requireCanonicalRepresentation(
    p.representationId ?? p.representation_id ?? p.sourceRepresentationId ?? p.source_representation_id,
  );
  const legacyWorkspaceCacheRevisionRaw = p.workspaceCacheRevision ?? p.workspace_cache_revision
    ?? p.legacyWorkspaceRevision ?? p.legacy_workspace_revision;
  const workspaceCacheRevision = legacyWorkspaceCacheRevisionRaw === undefined || legacyWorkspaceCacheRevisionRaw === null
    ? undefined
    : requirePositiveRevision(legacyWorkspaceCacheRevisionRaw, 'workspace_cache_revision');
  const repositoryRevision = optionalNonEmpty(p.repositoryRevision ?? p.repository_revision);

  return {
    ...buildEnrichedPayload(p, p, {
      workspaceId: String(p.workspaceId),
      schemaVersion: 'atlas.qdrant.payload.v2',
    }),
    packet_key: String(p.packetKey),
    source_ref: String(p.sourceRef),
    workspace_id: String(p.workspaceId),
    workspace_revision: workspaceRevision,
    ...(workspaceCacheRevision === undefined ? {} : { workspace_cache_revision: workspaceCacheRevision }),
    ...(repositoryRevision === undefined ? {} : { repository_revision: repositoryRevision }),
    representation_id: representationId,
    representation_revision: representationRevision,
    schema_version: 'atlas.qdrant.payload.v2',
    source_revision: sourceRevision,
    identity_lane: p.identityLane,
    identity_confidence: p.identityConfidence,
    recovery_lane: p.recoveryLane,
    domain_class: p.domainClass,
    tree_node_id: p.treeNodeId ?? p.tree_node_id,
    canonical_id: p.canonicalId ?? p.canonical_id,
    symbol_version_id: p.symbolVersionId ?? p.symbol_version_id,
    graph_revision: p.graphRevision ?? p.graph_revision,
    ontology_revision: p.ontologyRevision ?? p.ontology_revision,
    source_root_authority: p.sourceRootAuthority ?? p.source_root_authority,
    title_id: p.titleId,
    community_id: p.communityId,
    som_cluster: p.somCluster,
  };
}
