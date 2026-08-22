import { buildEnrichedPayload } from './qdrant-payload-enricher.js';
import { ATLAS_CANONICAL_SEMANTIC_REPRESENTATION as SEMANTIC_REPRESENTATION_ID } from '../atlas/retrieval/qdrant-semantic-projection.js';

function requirePositiveRevision(value: unknown, field: string): number {
  const revision = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(revision) || revision <= 0) {
    throw new Error(`Missing positive ${field} for canonical Qdrant payload`);
  }
  return revision;
}

function requireNonEmptyRevision(value: unknown, field: string): string {
  const revision = String(value ?? '').trim();
  if (!revision) {
    throw new Error(`Missing ${field} for canonical Qdrant payload`);
  }
  return revision;
}

function optionalGitRevision(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const revision = String(value).trim().toLowerCase();
  if (!/^[a-f0-9]{40,64}$/.test(revision)) {
    throw new Error(`Invalid ${field}; expected Git commit SHA`);
  }
  return revision;
}

function requireCanonicalRepresentation(value: unknown): string {
  const representation = String(value ?? '').trim();
  if (representation !== SEMANTIC_REPRESENTATION_ID) {
    throw new Error(`Qdrant payload requires canonical ${SEMANTIC_REPRESENTATION_ID} representation`);
  }
  return representation;
}

/**
 * Builds the payload-only Qdrant projection.
 *
 * IMPORTANT revision semantics:
 * - atlas_packets.workspace_revision is a historical integer cache/workspace
 *   epoch. It is preserved for compatibility as workspace_revision and is also
 *   made explicit as workspace_cache_revision.
 * - repository_revision is the Git commit SHA used by CodeRevisionAuthorityV1
 *   / GraphSnapshotRevisionV1. It is projected only when an upstream authority
 *   actually supplies it; this helper never derives or fabricates it.
 */
export function buildQdrantSyncPayload(packet: Record<string, unknown>): Record<string, unknown> {
  const p = packet as any;
  if (!p.packetKey || !p.sourceRef || !p.featureId || !p.workspaceId) {
    throw new Error(`Invalid identity: ${p.packetKey ?? p.packet_key ?? 'unknown'}`);
  }

  const workspaceCacheRevision = requirePositiveRevision(
    p.workspaceRevision ?? p.workspace_revision,
    'workspace_revision',
  );
  const repositoryRevision = optionalGitRevision(
    p.repositoryRevision ?? p.repository_revision,
    'repository_revision',
  );
  const sourceRevision = requireNonEmptyRevision(
    p.sourceRevision ?? p.source_revision,
    'source_revision',
  );
  const representationRevision = requirePositiveRevision(
    p.representationRevision ?? p.representation_revision,
    'representation_revision',
  );
  const representationId = requireCanonicalRepresentation(
    p.representationId ?? p.representation_id ?? p.sourceRepresentationId ?? p.source_representation_id,
  );

  return {
    ...buildEnrichedPayload(p, p, {
      workspaceId: String(p.workspaceId),
      schemaVersion: 'atlas.qdrant.payload.v1'
    }),
    // Identity / projection envelope
    packet_key: String(p.packetKey),
    source_ref: String(p.sourceRef),
    workspace_id: String(p.workspaceId),

    // Historical cache/workspace epoch. Do not compare this integer to the
    // Git-SHA GraphSnapshotRevisionV1.workspaceRevision coordinate.
    workspace_revision: workspaceCacheRevision,
    workspace_cache_revision: workspaceCacheRevision,
    workspace_revision_kind: 'CACHE_EPOCH_INT',

    // Canonical code-world coordinate, supplied only by an upstream revision
    // authority. Undefined is intentional and keeps FANOUT fail-closed.
    repository_revision: repositoryRevision,
    repository_revision_kind: repositoryRevision ? 'GIT_COMMIT_SHA' : undefined,

    representation_id: representationId,
    representation_revision: representationRevision,
    schema_version: 'atlas.qdrant.payload.v1',
    source_revision: sourceRevision,

    // Enrichment fields
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
    som_cluster: p.somCluster
  };
}
