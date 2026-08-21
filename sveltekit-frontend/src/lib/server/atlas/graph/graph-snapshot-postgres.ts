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

export interface PostgresGraphSnapshotInput extends Omit<GraphSnapshotMaterializerInput, 'treeNodes' | 'packets'> {
  workspaceId: string;
  packetWorkspaceColumn?: string;
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

const PACKET_SELECT_SQL = `
  SELECT
    packet_key,
    source_ref,
    canonical_source_ref,
    directory_path,
    file_path,
    function_symbol,
    feature_id,
    feature_label,
    title_id,
    community_id,
    cluster_id,
    sha256,
    source_kind,
    source_path,
    topology,
    vectors,
    metadata,
    domain_class,
    tags,
    lineage_version,
    ledger_type,
    canonical,
    tree_node_id,
    qdrant_collection,
    qdrant_vector_dim
  FROM atlas_packets
  WHERE workspace_id = $1
    AND packet_key IS NOT NULL
  ORDER BY packet_key, source_ref, feature_id, directory_path
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
  const packetResult = await source.query<DbRow>(PACKET_SELECT_SQL, [input.workspaceId]);
  const packets = packetResult.rows.map(normalizePacketRow);
  const sourceRefs = [...new Set(packets.map((packet) => packet.sourceRef))];
  const packetKeys = [...new Set(packets.map((packet) => packet.packetKey).filter((packetKey): packetKey is string => Boolean(packetKey)))];

  const treeNodeResult = sourceRefs.length === 0 && packetKeys.length === 0
    ? { rows: [] as DbRow[] }
    : await source.query<DbRow>(TREE_NODE_SELECT_SQL, [sourceRefs, packetKeys]);

  return {
    ...input,
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
