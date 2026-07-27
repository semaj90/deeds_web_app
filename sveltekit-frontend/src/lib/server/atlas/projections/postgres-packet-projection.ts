/**
 * PostgreSQL Packet Projection Adapter
 *
 * Maps between:
 * - Postgres storage (snake_case columns)
 * - Application domain objects (camelCase, immutable)
 *
 * CRITICAL: Do NOT modify producers. This is read-only adapter.
 * Producers continue to write camelCase objects to Postgres via Drizzle.
 * This adapter bridges the representation gap only when needed.
 */

export interface PostgresPacketRow {
  packet_key: string;
  source_ref: string;
  file_path: string;
  feature_id: string;
  feature_label: string;
  domain_class: string;
  title_id: string;
  tree_node_id: string | null;
  content_hash: string | null;
  workspace_id: string;
  workspace_revision: string | null;
  ontology_id: string | null;
  ontology_version: string | null;
  identity_lane: string;
  identity_confidence: number;
  created_at: Date;
  updated_at: Date;
}

export interface SemanticPacketDomainObject {
  packetKey: string;
  sourceRef: string;
  filePath: string;
  featureId: string;
  featureLabel: string;
  domainClass: string;
  titleId: string;
  treeNodeId: string | null;
  contentHash: string | null;
  workspaceId: string;
  workspaceRevision: string | null;
  ontologyId: string | null;
  ontologyVersion: string | null;
  identityLane: string;
  identityConfidence: number;
  createdAt: Date;
  updatedAt: Date;
}

function isValidPacketKey(packetKey: string): boolean {
  return (
    packetKey.startsWith('packet:') ||
    packetKey.startsWith('pkt_') ||
    packetKey.startsWith('ace:packet:')
  );
}

/**
 * Convert Postgres row (snake_case) to domain object (camelCase).
 *
 * No validation—assumes row is already valid from Postgres.
 * All fields are required; nullability is explicit in types above.
 */
export function fromPostgresRow(row: PostgresPacketRow): SemanticPacketDomainObject {
  return {
    packetKey: row.packet_key,
    sourceRef: row.source_ref,
    filePath: row.file_path,
    featureId: row.feature_id,
    featureLabel: row.feature_label,
    domainClass: row.domain_class,
    titleId: row.title_id,
    treeNodeId: row.tree_node_id,
    contentHash: row.content_hash,
    workspaceId: row.workspace_id,
    workspaceRevision: row.workspace_revision,
    ontologyId: row.ontology_id,
    ontologyVersion: row.ontology_version,
    identityLane: row.identity_lane,
    identityConfidence: row.identity_confidence,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Convert domain object (camelCase) to Postgres row (snake_case).
 *
 * Used only if we need to write back to Postgres after domain transformation.
 * CRITICAL: Do not call this in normal producers (they already write snake_case via Drizzle).
 */
export function toPostgresRow(packet: SemanticPacketDomainObject): PostgresPacketRow {
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
    identity_lane: packet.identityLane,
    identity_confidence: packet.identityConfidence,
    created_at: packet.createdAt,
    updated_at: packet.updatedAt,
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
    | 'ONTOLOGY_VERSION_MISSING';
  path: string;
  expected?: string;
  actual?: string;
};

export function validatePostgresProjection(
  row: PostgresPacketRow
): { isValid: boolean; violations: ProjectionViolation[] } {
  const violations: ProjectionViolation[] = [];

  // Check packet_key presence and prefix
  if (!row.packet_key) {
    violations.push({
      code: 'PACKET_KEY_MISSING',
      path: 'packet_key',
    });
  } else if (!isValidPacketKey(row.packet_key)) {
    violations.push({
      code: 'PACKET_KEY_INVALID_PREFIX',
      path: 'packet_key',
      expected: 'packet:<id>, pkt_<32-char hex>, or ace:packet:<id>',
      actual: row.packet_key,
    });
  }

  // Check immutable identity fields
  if (!row.source_ref) {
    violations.push({
      code: 'SOURCE_REF_MISSING',
      path: 'source_ref',
    });
  }

  if (!row.feature_id) {
    violations.push({
      code: 'FEATURE_ID_MISSING',
      path: 'feature_id',
    });
  }

  if (!row.workspace_id) {
    violations.push({
      code: 'WORKSPACE_ID_MISSING',
      path: 'workspace_id',
    });
  }

  // Check ontology version (required for phase 108D proof matrix)
  if (!row.ontology_version) {
    violations.push({
      code: 'ONTOLOGY_VERSION_MISSING',
      path: 'ontology_version',
      expected: 'version string (e.g., "v1.0")',
      actual: row.ontology_version ?? 'null',
    });
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}

/**
 * Immutability gate: verify packet_key stability across reads.
 *
 * If the same packetKey is read twice from Postgres, both rows must have
 * identical packet_key, source_ref, feature_id, workspace_id.
 */
export function verifyPacketKeyImmutability(
  row1: PostgresPacketRow,
  row2: PostgresPacketRow
): { isImmutable: boolean; reason?: string } {
  if (row1.packet_key !== row2.packet_key) {
    return {
      isImmutable: false,
      reason: `packet_key changed: ${row1.packet_key} → ${row2.packet_key}`,
    };
  }

  if (row1.source_ref !== row2.source_ref) {
    return {
      isImmutable: false,
      reason: `source_ref changed: ${row1.source_ref} → ${row2.source_ref}`,
    };
  }

  if (row1.feature_id !== row2.feature_id) {
    return {
      isImmutable: false,
      reason: `feature_id changed: ${row1.feature_id} → ${row2.feature_id}`,
    };
  }

  if (row1.workspace_id !== row2.workspace_id) {
    return {
      isImmutable: false,
      reason: `workspace_id changed: ${row1.workspace_id} → ${row2.workspace_id}`,
    };
  }

  // tree_node_id MAY change (mutable lineage metadata), so do NOT check it
  // contentHash MAY change (content version), so do NOT check it

  return { isImmutable: true };
}
