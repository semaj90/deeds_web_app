import type { EvidenceItem } from '../trace-dynamic-context.types.js';

export interface CanonicalJoinBackRow {
  packetKey: string;
  sourceRef?: string;
  sourceRevision?: string;
  representationId?: string;
  representationRevision?: string;
  contentHash?: string;
  treeNodeId?: string;
  workspaceRevision?: number;
}

export function buildCanonicalJoinBackSql(options: {
  tableName?: string;
  packetKeys: string[];
  limit?: number;
}): string {
  const tableName = options.tableName ?? 'atlas_packets';
  const limit = options.limit ?? 20;
  const keys = options.packetKeys.map((key) => `'${key.replace(/'/g, "''")}'`).join(', ');
  return [
    `SELECT packet_key, source_ref, canonical_source_ref, tree_node_id, feature_id, workspace_revision, representation_revision`,
    `FROM ${tableName}`,
    `WHERE packet_key = ANY(ARRAY[${keys}]::text[])`,
    `ORDER BY packet_key`,
    `LIMIT ${limit}`,
  ].join('\n');
}

export function canonicalJoinEvidence(row: CanonicalJoinBackRow): EvidenceItem {
  return {
    kind: 'postgres_join_back',
    lane: 'semantic',
    status: 'PROVEN',
    source: 'postgres',
    path: row.sourceRef,
    symbol: row.representationId,
    message: row.packetKey,
    revision: row.sourceRevision,
    score: 1,
  };
}

export function buildCanonicalJoinBackQuery(options: {
  tableName?: string;
  packetKeys: string[];
  limit?: number;
}): { sql: string; params: unknown[] } {
  const tableName = options.tableName ?? 'atlas_packets';
  const limit = options.limit ?? 20;
  return {
    sql: [
      `SELECT packet_key, source_ref, canonical_source_ref, tree_node_id, feature_id, workspace_revision, representation_revision`,
      `FROM ${tableName}`,
      `WHERE packet_key = ANY($1::text[])`,
      `ORDER BY packet_key`,
      `LIMIT $2`,
    ].join('\n'),
    params: [options.packetKeys, limit],
  };
}
