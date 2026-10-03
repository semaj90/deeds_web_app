import type { AtlasPacket } from '$lib/server/db/schema/atlas-packets.js';
import type { AtlasTreeNode } from '$lib/server/db/schema/atlas-tree-nodes.js';
import {
  materializeGraphSnapshot,
  type GraphSnapshotMaterialization,
  type GraphSnapshotMaterializerInput
} from './graph-snapshot-materializer.js';

export interface QueryLike {
  query<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
}

export interface PostgresGraphSnapshotInput extends Omit<GraphSnapshotMaterializerInput, 'treeNodes' | 'packets' | 'workspaceId'> {
  /**
   * The admitted workspace revision (sha256:<64-hex>), matched against
   * atlas_packets.workspace_revision_key. This is NOT atlas_packets.workspace_id
   * (a directory-path label, e.g. "docs" or "src/lib/components/agent" -- 1,196
   * distinct values as of 2026-09-28, not a real scoping dimension) and NOT
   * atlas_packets.repository_id (a UUID column, unrelated to and NOT the same
   * value space as graphify_execution_file_membership_v2.repository_id below --
   * see docs/reports/packet-key-owner-decision-v1.json's live census). Fixed
   * 2026-09-28: this field/column was workspace_id before, which meant a graph
   * snapshot could only ever cover one directory bucket, never the admitted
   * revision's full source cohort.
   */
  workspaceRevision: string;
  /**
   * GRAPH-SNAPSHOT-SCOPE-V2-01 (2026-09-28): the exact Graphify execution that
   * produced the repository-membership rows this snapshot is scoped to.
   * Required, not optional -- verified live that
   * graphify_execution_file_membership_v2 can (and does) carry membership rows
   * from more than one execution_id for the same (workspace_revision,
   * repository_id) pair: at the currently admitted revision, two execution_ids
   * each independently contributed 24,456 rows for repo:root, so a join
   * without this filter fans out 2x (32,302 raw matches collapsing to 16,151
   * distinct packet_keys via DISTINCT). Pinning execution_id avoids depending
   * on DISTINCT to paper over an unscoped join and keeps "one execution, one
   * snapshot" an honest identity guarantee rather than an accident of dedup.
   */
  executionId: string;
  /**
   * GRAPH-SNAPSHOT-SCOPE-V2-01 (2026-09-28): the repository partition within
   * the admitted workspace revision, matched against
   * graphify_execution_file_membership_v2.repository_id -- a small, real
   * repository set (7 distinct values as of 2026-09-28: repo:root,
   * repo:claude-mem, repo:mcp-server-mcp, repo:turbovec,
   * repo:sites/parent-atlas-gateboard, repo:models/embeddinggemma_300m,
   * repo:granite-docling-258M), NOT atlas_packets.repository_id (a UUID
   * column in a different, unrelated value space -- verified live via
   * information_schema.columns before this field was added).
   */
  repositoryId: string;
}

type TreeNodeRow = Pick<
  AtlasTreeNode,
  | 'nodeId'
  | 'parentId'
  | 'rootId'
  | 'pageIndexPath'
  | 'nodeType'
  | 'treeDepth'
  | 'sourceRef'
  | 'filePath'
  | 'packetKey'
  | 'featureId'
  | 'title'
  | 'summary'
  | 'contentPreview'
  | 'domain'
  | 'somCluster'
  | 'communityId'
  | 'metadata'
  | 'ledgerType'
  | 'lineageVersion'
>;

type PacketRow = Pick<
  AtlasPacket,
  | 'packetKey'
  | 'sourceRef'
  | 'canonicalSourceRef'
  | 'directoryPath'
  | 'filePath'
  | 'functionSymbol'
  | 'featureId'
  | 'featureLabel'
  | 'titleId'
  | 'communityId'
  | 'clusterId'
  | 'sha256'
  | 'sourceKind'
  | 'sourcePath'
  | 'topology'
  | 'vectors'
  | 'metadata'
  | 'domainClass'
  | 'tags'
  | 'lineageVersion'
  | 'ledgerType'
  | 'canonical'
  | 'treeNodeId'
  | 'qdrantCollection'
  | 'qdrantVectorDim'
>;

type DbRow = Record<string, unknown>;

// GRAPH-SNAPSHOT-SCOPE-V2-01 (2026-09-28): scoped by (workspace_revision_key,
// execution_id, repository_id) via graphify_execution_file_membership_v2, not
// by workspace_revision_key alone. atlas_packets.workspace_revision_key alone
// still spans every repository in the admitted revision undifferentiated
// (16,151 packets at the current admitted revision) -- repository_id narrows
// to a real partition (e.g. 32,302 raw / 16,151 distinct packet_key matches
// for repo:root alone, verified live), and execution_id is required to avoid
// a 2x join fan-out when more than one Graphify execution recorded membership
// for the same (workspace_revision, repository_id) pair (verified live: two
// execution_ids each independently contributed 24,456 membership rows for
// repo:root at the current admitted revision). SELECT DISTINCT is a
// belt-and-suspenders guard, not a substitute for the execution_id filter --
// an unscoped-by-execution query would still return the right packet SET via
// DISTINCT, but would silently depend on dedup rather than on an honest
// "one execution, one snapshot" identity.
const PACKET_SELECT_SQL = `
  SELECT DISTINCT
    p.packet_key,
    p.source_ref,
    p.canonical_source_ref,
    p.directory_path,
    p.file_path,
    p.function_symbol,
    p.feature_id,
    p.feature_label,
    p.title_id,
    p.community_id,
    p.cluster_id,
    p.sha256,
    p.source_kind,
    p.source_path,
    p.topology,
    p.vectors,
    p.metadata,
    p.domain_class,
    p.tags,
    p.lineage_version,
    p.ledger_type,
    p.canonical,
    p.tree_node_id,
    p.qdrant_collection,
    p.qdrant_vector_dim
  FROM atlas_packets p
  JOIN graphify_execution_file_membership_v2 m
    ON m.source_ref = p.source_ref
   AND m.code_source_revision = p.source_revision
  WHERE p.workspace_revision_key = $1
    AND m.workspace_revision = $1
    AND m.execution_id = $2
    AND m.repository_id = $3
    AND p.packet_key IS NOT NULL
  ORDER BY p.packet_key, p.source_ref, p.feature_id, p.directory_path
`;

const TREE_NODE_SELECT_SQL = `
  SELECT
    node_id,
    parent_id,
    root_id,
    page_index_path,
    node_type,
    tree_depth,
    source_ref,
    file_path,
    packet_key,
    feature_id,
    title,
    summary,
    content_preview,
    som_cluster,
    community_id,
    metadata,
    ledger_type,
    lineage_version
  FROM atlas_tree_nodes
  WHERE source_ref = ANY($1::text[])
     OR packet_key = ANY($2::text[])
  ORDER BY node_id
`;

export async function loadCanonicalGraphSnapshotInputFromPostgres(
  source: QueryLike,
  input: PostgresGraphSnapshotInput
): Promise<GraphSnapshotMaterializerInput> {
  const packetResult = await source.query<DbRow>(PACKET_SELECT_SQL, [
    input.workspaceRevision,
    input.executionId,
    input.repositoryId
  ]);
  const packets = packetResult.rows.map(normalizePacketRow);
  const sourceRefs = [...new Set(packets.map((packet) => packet.sourceRef))];
  const packetKeys = [...new Set(packets.map((packet) => packet.packetKey).filter((packetKey): packetKey is string => Boolean(packetKey)))];

  const treeNodeResult = sourceRefs.length === 0 && packetKeys.length === 0
    ? { rows: [] as DbRow[] }
    : await source.query<DbRow>(TREE_NODE_SELECT_SQL, [sourceRefs, packetKeys]);

  // GraphSnapshotMaterializerInput.workspaceId is the snapshot's own manifest/proof identity
  // field (graph-snapshot-materializer.ts, 6 use sites) -- left unrenamed since it's a wider,
  // downstream-consumed contract. Here at the Postgres-loader boundary we populate it FROM the
  // admitted workspaceRevision used to scope the query, so the resulting snapshot's own identity
  // correctly reflects the admitted revision rather than a directory-bucket workspace_id.
  const { workspaceRevision, executionId, repositoryId, ...rest } = input;
  return {
    ...rest,
    workspaceId: workspaceRevision,
    treeNodes: treeNodeResult.rows.map(normalizeTreeNodeRow),
    packets
  };
}

export async function materializeCanonicalGraphSnapshotFromPostgres(
  source: QueryLike,
  input: PostgresGraphSnapshotInput
): Promise<GraphSnapshotMaterialization> {
  const materializerInput = await loadCanonicalGraphSnapshotInputFromPostgres(source, input);
  return materializeGraphSnapshot(materializerInput);
}

function normalizeTreeNodeRow(row: DbRow): TreeNodeRow {
  return {
    nodeId: String(readDbValue(row, 'nodeId', 'node_id')),
    parentId: readDbValue(row, 'parentId', 'parent_id') ?? null,
    rootId: String(readDbValue(row, 'rootId', 'root_id')),
    pageIndexPath: String(readDbValue(row, 'pageIndexPath', 'page_index_path')),
    nodeType: String(readDbValue(row, 'nodeType', 'node_type')),
    treeDepth: Number(readDbValue(row, 'treeDepth', 'tree_depth')),
    sourceRef: String(readDbValue(row, 'sourceRef', 'source_ref')),
    filePath: String(readDbValue(row, 'filePath', 'file_path')),
    packetKey: readDbValue(row, 'packetKey', 'packet_key') ?? null,
    featureId: readDbValue(row, 'featureId', 'feature_id') ?? null,
    title: readDbValue(row, 'title', 'title') ?? null,
    summary: readDbValue(row, 'summary', 'summary') ?? null,
    contentPreview: readDbValue(row, 'contentPreview', 'content_preview') ?? null,
    domain: readDbValue(row, 'domain', 'domain') ?? null,
    somCluster: readDbValue(row, 'somCluster', 'som_cluster') ?? null,
    communityId: readDbValue(row, 'communityId', 'community_id') ?? null,
    metadata: (readDbValue(row, 'metadata', 'metadata') ?? {}) as Record<string, unknown>,
    ledgerType: readDbValue(row, 'ledgerType', 'ledger_type') ?? null,
    lineageVersion: readDbValue(row, 'lineageVersion', 'lineage_version') ?? null
  };
}

function normalizePacketRow(row: DbRow): PacketRow {
  const packetKey = readDbValue(row, 'packetKey', 'packet_key');
  if (!packetKey) {
    throw new Error(`atlas_packets row without packet_key cannot be part of a canonical graph snapshot: ${String(readDbValue(row, 'sourceRef', 'source_ref') ?? 'unknown')}`);
  }

  return {
    packetKey: String(packetKey),
    sourceRef: String(readDbValue(row, 'sourceRef', 'source_ref')),
    canonicalSourceRef: readDbValue(row, 'canonicalSourceRef', 'canonical_source_ref') ?? null,
    directoryPath: String(readDbValue(row, 'directoryPath', 'directory_path')),
    filePath: readDbValue(row, 'filePath', 'file_path') ?? null,
    functionSymbol: readDbValue(row, 'functionSymbol', 'function_symbol') ?? null,
    featureId: String(readDbValue(row, 'featureId', 'feature_id')),
    featureLabel: String(readDbValue(row, 'featureLabel', 'feature_label')),
    titleId: readDbValue(row, 'titleId', 'title_id') ?? null,
    communityId: readDbValue(row, 'communityId', 'community_id') ?? null,
    clusterId: readDbValue(row, 'clusterId', 'cluster_id') ?? null,
    sha256: readDbValue(row, 'sha256', 'sha256') ?? null,
    sourceKind: readDbValue(row, 'sourceKind', 'source_kind') ?? null,
    sourcePath: readDbValue(row, 'sourcePath', 'source_path') ?? null,
    topology: (readDbValue(row, 'topology', 'topology') ?? {}) as Record<string, unknown>,
    vectors: (readDbValue(row, 'vectors', 'vectors') ?? {}) as Record<string, unknown>,
    metadata: (readDbValue(row, 'metadata', 'metadata') ?? {}) as Record<string, unknown>,
    domainClass: readDbValue(row, 'domainClass', 'domain_class') ?? null,
    tags: (readDbValue(row, 'tags', 'tags') ?? []) as string[],
    lineageVersion: readDbValue(row, 'lineageVersion', 'lineage_version') ?? null,
    ledgerType: readDbValue(row, 'ledgerType', 'ledger_type') ?? null,
    canonical: readDbValue(row, 'canonical', 'canonical') ?? null,
    treeNodeId: readDbValue(row, 'treeNodeId', 'tree_node_id') ?? null,
    qdrantCollection: readDbValue(row, 'qdrantCollection', 'qdrant_collection') ?? null,
    qdrantVectorDim: readDbValue(row, 'qdrantVectorDim', 'qdrant_vector_dim') ?? null
  } as PacketRow;
}

function readDbValue(row: DbRow, camelKey: string, snakeKey: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, camelKey) && row[camelKey] !== undefined) {
    return row[camelKey];
  }
  if (Object.prototype.hasOwnProperty.call(row, snakeKey)) {
    return row[snakeKey];
  }
  return undefined;
}
