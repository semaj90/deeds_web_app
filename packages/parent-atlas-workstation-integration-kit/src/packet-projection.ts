import type { PacketProjectionRow } from './contracts.js';

export const PACKET_PROJECTION_COLUMNS = [
  'packet_id',
  'packet_key',
  'source_ref',
  'feature_id',
  'feature_label',
  'summary',
  'tags',
  'concept_ids',
  'domain_class',
  'artifact_kind',
  'qdrant_point_id',
  'qdrant_collection',
  'neo4j_node_id',
  'pagerank',
  'community_id',
  'workspace_revision',
  'source_revision',
  'sha256',
  'schema_version',
  'projection_revision',
  'updated_at',
] as const;

export type PacketProjectionDbRow = Record<(typeof PACKET_PROJECTION_COLUMNS)[number], unknown>;

export function buildPacketProjectionPageSql(hasCursor: boolean): string {
  const where = hasCursor ? 'WHERE packet_id > $1' : '';
  const limitParam = hasCursor ? '$2' : '$1';

  return `
SELECT
  ${PACKET_PROJECTION_COLUMNS.join(',\n  ')}
FROM public.atlas_packets
${where}
ORDER BY packet_id ASC
LIMIT ${limitParam};`.trim();
}

export function packetProjectionParams(cursor: string | null, pageSize: number): unknown[] {
  validatePageSize(pageSize);
  return cursor === null ? [pageSize] : [cursor, pageSize];
}

export function mapPacketProjectionRow(row: PacketProjectionDbRow): PacketProjectionRow {
  const packetId = requireString(row.packet_id, 'packet_id');
  const contentHash = requireString(row.sha256, 'sha256');

  return {
    packetId,
    packetKey: nullableString(row.packet_key),
    sourceRef: nullableString(row.source_ref),
    featureId: nullableString(row.feature_id),
    featureLabel: nullableString(row.feature_label),
    summary: nullableString(row.summary),
    tags: stringArray(row.tags),
    conceptIds: stringArray(row.concept_ids),
    domainClass: nullableString(row.domain_class),
    artifactKind: nullableString(row.artifact_kind),
    qdrantPointId: nullableString(row.qdrant_point_id),
    qdrantCollection: nullableString(row.qdrant_collection),
    neo4jNodeId: nullableString(row.neo4j_node_id),
    pagerank: nullableNumber(row.pagerank),
    communityId: nullableInteger(row.community_id),
    workspaceRevision: requireString(row.workspace_revision, 'workspace_revision'),
    sourceRevision: requireString(row.source_revision, 'source_revision'),
    contentHash,
    schemaVersion: requireString(row.schema_version, 'schema_version'),
    projectionRevision: requireString(row.projection_revision, 'projection_revision'),
    updatedAt: dateString(row.updated_at, 'updated_at'),
  };
}

function validatePageSize(pageSize: number): void {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 10_000) {
    throw new Error(`pageSize must be an integer between 1 and 10000; received ${pageSize}`);
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nullableInteger(value: unknown): number | null {
  return Number.isInteger(value) ? (value as number) : null;
}

function dateString(value: unknown, field: string): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.valueOf())) throw new Error(`${field} must be a valid date`);
  return date.toISOString();
}
