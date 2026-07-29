/**
 * Qdrant Packet Projection Adapter
 *
 * Maps between:
 * - Qdrant payload (snake_case JSON)
 * - Application domain objects (camelCase)
 *
 * Qdrant stores packets in multiple collections with different vector representations:
 * - codebase_chunks_768 (dense_768, primary codebase chunk / semantic reference lane)
 * - codebase_chunks_384 (dense_384, derived online retrieval projection lane)
 * - codebase_chunks_latent_64 (latent_64, routing/clustering lane)
 *
 * CRITICAL: packet_key must be identical across all collections for the same logical packet.
 */

import { toQdrantPayloadFromEnrichedTreeNode, type EnrichedTreeNodeProjectionSeed } from '../enriched-tree-node-projections.js';

export interface QdrantPayload {
  packet_key: string;
  source_ref: string;
  file_path: string;
  feature_id: string;
  feature_label: string;
  domain_class: string;
  title_id: string;
  tree_node_id?: string | null;
  content_hash?: string | null;
  workspace_id: string;
  workspace_revision?: string | null;
  ontology_id?: string | null;
  ontology_version?: string | null;
  collection_name: string; // which collection this point lives in
  som_cluster_id?: number | null; // K-means cluster for routing
  som_cell_x?: number | null; // SOM grid X
  som_cell_y?: number | null; // SOM grid Y
  [key: string]: unknown; // allow other payload fields
}

export interface SemanticPacketDomainObject {
  packetKey: string;
  sourceRef: string;
  filePath: string;
  featureId: string;
  featureLabel: string;
  domainClass: string;
  titleId: string;
  treeNodeId?: string | null;
  contentHash?: string | null;
  workspaceId: string;
  workspaceRevision?: string | null;
  ontologyId?: string | null;
  ontologyVersion?: string | null;
  collectionName: string;
  somClusterId?: number | null;
  somCellX?: number | null;
  somCellY?: number | null;
}

function isValidPacketKey(packetKey: string): boolean {
  return (
    packetKey.startsWith('packet:') ||
    packetKey.startsWith('pkt_') ||
    packetKey.startsWith('ace:packet:')
  );
}

/**
 * Convert Qdrant payload (snake_case) to domain object (camelCase).
 *
 * No validation—assumes payload is already valid from Qdrant.
 */
export function fromQdrantPayload(payload: QdrantPayload): SemanticPacketDomainObject {
  return {
    packetKey: payload.packet_key,
    sourceRef: payload.source_ref,
    filePath: payload.file_path,
    featureId: payload.feature_id,
    featureLabel: payload.feature_label,
    domainClass: payload.domain_class,
    titleId: payload.title_id,
    treeNodeId: payload.tree_node_id,
    contentHash: payload.content_hash,
    workspaceId: payload.workspace_id,
    workspaceRevision: payload.workspace_revision,
    ontologyId: payload.ontology_id,
    ontologyVersion: payload.ontology_version,
    collectionName: payload.collection_name,
    somClusterId: payload.som_cluster_id,
    somCellX: payload.som_cell_x,
    somCellY: payload.som_cell_y,
  };
}

/**
 * Convert domain object (camelCase) to Qdrant payload (snake_case).
 *
 * Used when upserting packets to Qdrant.
 */
export function toQdrantPayload(packet: SemanticPacketDomainObject): QdrantPayload {
  return {
    packet_key: packet.packetKey,
    source_ref: packet.sourceRef,
    file_path: packet.filePath,
    feature_id: packet.featureId,
    feature_label: packet.featureLabel,
    domain_class: packet.domainClass,
    title_id: packet.titleId,
    tree_node_id: packet.treeNodeId,
    content_hash: packet.contentHash,
    workspace_id: packet.workspaceId,
    workspace_revision: packet.workspaceRevision,
    ontology_id: packet.ontologyId,
    ontology_version: packet.ontologyVersion,
    collection_name: packet.collectionName,
    som_cluster_id: packet.somClusterId,
    som_cell_x: packet.somCellX,
    som_cell_y: packet.somCellY,
  };
}

export function toQdrantPayloadFromStrictTreeNode(seed: EnrichedTreeNodeProjectionSeed): QdrantPayload {
  const payload = toQdrantPayloadFromEnrichedTreeNode(seed);
  return {
    packet_key: payload.packet_key,
    source_ref: payload.source_ref,
    file_path: payload.file_path,
    feature_id: seed.node.identity.feature_id,
    feature_label: seed.node.identity.feature_label,
    domain_class: seed.node.identity.domain_class ?? '',
    title_id: seed.titleId ?? '',
    tree_node_id: payload.tree_node_id,
    content_hash: payload.content_hash,
    workspace_id: seed.workspaceId,
    workspace_revision: seed.workspaceRevision,
    ontology_id: seed.ontologyId ?? null,
    ontology_version: seed.ontologyVersion ?? null,
    collection_name: seed.collectionName,
    som_cluster_id: seed.somClusterId ?? null,
    som_cell_x: seed.somCellX ?? null,
    som_cell_y: seed.somCellY ?? null,
  };
}

/**
 * Projection validation: check for required fields + immutability constraints.
 *
 * Returns violations (missing fields, mismatches) rather than throwing.
 */
export type ProjectionViolation = {
  code:
    | 'PACKET_KEY_MISSING'
    | 'PACKET_KEY_INVALID_PREFIX'
    | 'SOURCE_REF_MISSING'
    | 'FEATURE_ID_MISSING'
    | 'WORKSPACE_ID_MISSING'
    | 'COLLECTION_NAME_MISSING'
    | 'ONTOLOGY_VERSION_MISSING';
  path: string;
  expected?: string;
  actual?: string;
};

export function validateQdrantProjection(
  payload: QdrantPayload
): { isValid: boolean; violations: ProjectionViolation[] } {
  const violations: ProjectionViolation[] = [];

  // Check packet_key presence and prefix
  if (!payload.packet_key) {
    violations.push({
      code: 'PACKET_KEY_MISSING',
      path: 'packet_key',
    });
  } else if (!isValidPacketKey(payload.packet_key)) {
    violations.push({
      code: 'PACKET_KEY_INVALID_PREFIX',
      path: 'packet_key',
      expected: 'packet:<id>, pkt_<32-char hex>, or ace:packet:<id>',
      actual: payload.packet_key,
    });
  }

  // Check immutable identity fields
  if (!payload.source_ref) {
    violations.push({
      code: 'SOURCE_REF_MISSING',
      path: 'source_ref',
    });
  }

  if (!payload.feature_id) {
    violations.push({
      code: 'FEATURE_ID_MISSING',
      path: 'feature_id',
    });
  }

  if (!payload.workspace_id) {
    violations.push({
      code: 'WORKSPACE_ID_MISSING',
      path: 'workspace_id',
    });
  }

  // Check collection name (required for cross-collection tracking)
  if (!payload.collection_name) {
    violations.push({
      code: 'COLLECTION_NAME_MISSING',
      path: 'collection_name',
      expected: 'collection name (e.g., "codebase_chunks_384")',
      actual: payload.collection_name ?? 'null',
    });
  }

  // Check ontology version (required for phase 108d proof matrix)
  if (!payload.ontology_version) {
    violations.push({
      code: 'ONTOLOGY_VERSION_MISSING',
      path: 'ontology_version',
      expected: 'version string (e.g., "v1.0")',
      actual: payload.ontology_version ?? 'null',
    });
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}

/**
 * Cross-collection immutability gate: verify packet_key stability across collections.
 *
 * When the same packet is indexed in multiple Qdrant collections (dense_384, dense_768, latent_64),
 * all payloads must have identical packet_key, source_ref, feature_id, workspace_id.
 */
export function verifyPacketKeyImmutabilityAcrossCollections(
  payload1: QdrantPayload,
  payload2: QdrantPayload
): { isImmutable: boolean; reason?: string } {
  if (payload1.packet_key !== payload2.packet_key) {
    return {
      isImmutable: false,
      reason: `packet_key mismatch across collections: ${payload1.collection_name}/${payload1.packet_key} vs ${payload2.collection_name}/${payload2.packet_key}`,
    };
  }

  if (payload1.source_ref !== payload2.source_ref) {
    return {
      isImmutable: false,
      reason: `source_ref mismatch: ${payload1.source_ref} vs ${payload2.source_ref}`,
    };
  }

  if (payload1.feature_id !== payload2.feature_id) {
    return {
      isImmutable: false,
      reason: `feature_id mismatch: ${payload1.feature_id} vs ${payload2.feature_id}`,
    };
  }

  if (payload1.workspace_id !== payload2.workspace_id) {
    return {
      isImmutable: false,
      reason: `workspace_id mismatch: ${payload1.workspace_id} vs ${payload2.workspace_id}`,
    };
  }

  // Mutable fields MAY differ:
  // - tree_node_id (structural metadata, may be updated)
  // - content_hash (content version, may be updated)
  // - som_cluster_id, som_cell_x, som_cell_y (routing metadata, may be recomputed)

  return { isImmutable: true };
}
