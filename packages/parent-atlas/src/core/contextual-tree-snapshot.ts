import { createHash } from 'node:crypto';
import { z } from 'zod';

const SNAPSHOT_CONTRACT_VERSION = 'atlas.contextual-tree-snapshot.v1';

export const contextualTreePacketSchema = z.object({
  packet_key: z.string().min(1),
  source_ref: z.string().min(1),
  content_hash: z.string().min(1),
  tree_node_id: z.string().uuid().nullable().optional(),
  feature_id: z.string().min(1).nullable().optional(),
}).strict();

export const contextualTreeNodeSchema = z.object({
  snapshot_id: z.string().uuid(),
  node_key: z.string().min(1),
  node_type: z.enum(['repository', 'directory', 'file', 'chunk', 'packet']),
  packet_key: z.string().min(1).nullable(),
  tree_node_id: z.string().uuid().nullable(),
  source_ref: z.string().min(1).nullable(),
  content_hash: z.string().min(1).nullable(),
  properties: z.record(z.string(), z.unknown()),
}).strict();

export const contextualTreeEdgeSchema = z.object({
  snapshot_id: z.string().uuid(),
  edge_key: z.string().min(1),
  source_node_key: z.string().min(1),
  target_node_key: z.string().min(1),
  edge_type: z.enum(['CONTAINS', 'MATERIALIZES']),
  ordinal: z.number().int().nonnegative(),
  confidence: z.literal(1),
  provenance: z.literal('canonical-packet-ledger'),
}).strict();

export type ContextualTreePacket = z.infer<typeof contextualTreePacketSchema>;
export type ContextualTreeNode = z.infer<typeof contextualTreeNodeSchema>;
export type ContextualTreeEdge = z.infer<typeof contextualTreeEdgeSchema>;

export interface ContextualTreeExclusion {
  readonly index: number;
  readonly reason: 'INVALID_PACKET';
  readonly detail: string;
}

export interface ContextualTreeSnapshot {
  readonly contract_version: typeof SNAPSHOT_CONTRACT_VERSION;
  readonly snapshot_id: string;
  readonly workspace_id: string;
  readonly source_manifest_hash: string;
  readonly topology_hash: string;
  readonly nodes: readonly ContextualTreeNode[];
  readonly edges: readonly ContextualTreeEdge[];
  readonly exclusions: readonly ContextualTreeExclusion[];
}

export class ContextualTreeSnapshotError extends Error {
  constructor(readonly evidence: Record<string, unknown>) {
    super(String(evidence.kind ?? 'CONTEXTUAL_TREE_SNAPSHOT_INVALID'));
  }
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

function deterministicUuid(value: unknown): string {
  const bytes = Buffer.from(sha256(value).slice(0, 32), 'hex');
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeSourceRef(value: string): string {
  const normalized = value.normalize('NFKC').trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
  if (!normalized || normalized.split('/').some((segment) => segment === '..' || segment.length === 0)) {
    throw new Error(`invalid source_ref '${value}'`);
  }
  return normalized;
}

function addNode(nodes: Map<string, ContextualTreeNode>, node: ContextualTreeNode): void {
  const existing = nodes.get(node.node_key);
  if (existing && stableJson(existing) !== stableJson(node)) {
    throw new ContextualTreeSnapshotError({ kind: 'NODE_KEY_COLLISION', nodeKey: node.node_key });
  }
  nodes.set(node.node_key, node);
}

function addEdge(edges: Map<string, ContextualTreeEdge>, edge: ContextualTreeEdge): void {
  const existing = edges.get(edge.edge_key);
  if (existing && stableJson(existing) !== stableJson(edge)) {
    throw new ContextualTreeSnapshotError({ kind: 'EDGE_KEY_COLLISION', edgeKey: edge.edge_key });
  }
  edges.set(edge.edge_key, edge);
}

/** Compiles canonical packet rows into a replayable containment-only graph. */
export function compileContextualTreeSnapshot(input: {
  workspace_id: string;
  packets: readonly unknown[];
}): ContextualTreeSnapshot {
  const workspaceId = z.string().min(1).parse(input.workspace_id);
  const accepted: ContextualTreePacket[] = [];
  const exclusions: ContextualTreeExclusion[] = [];

  input.packets.forEach((value, index) => {
    const result = contextualTreePacketSchema.safeParse(value);
    if (result.success) {
      accepted.push({ ...result.data, source_ref: normalizeSourceRef(result.data.source_ref) });
    } else {
      exclusions.push({ index, reason: 'INVALID_PACKET', detail: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') });
    }
  });

  const canonicalPackets = [...accepted].sort((left, right) => left.packet_key.localeCompare(right.packet_key));
  const duplicatePacket = canonicalPackets.find((packet, index) => index > 0 && canonicalPackets[index - 1]?.packet_key === packet.packet_key);
  if (duplicatePacket) throw new ContextualTreeSnapshotError({ kind: 'DUPLICATE_PACKET_KEY', packetKey: duplicatePacket.packet_key });

  const sourceManifestHash = sha256(canonicalPackets);
  const snapshotId = deterministicUuid({ contract: SNAPSHOT_CONTRACT_VERSION, workspaceId, sourceManifestHash });
  const nodes = new Map<string, ContextualTreeNode>();
  const edges = new Map<string, ContextualTreeEdge>();
  const repositoryKey = `repository:${workspaceId}`;

  addNode(nodes, { snapshot_id: snapshotId, node_key: repositoryKey, node_type: 'repository', packet_key: null, tree_node_id: null, source_ref: null, content_hash: null, properties: { workspace_id: workspaceId } });

  for (const packet of canonicalPackets) {
    const parts = packet.source_ref.split('/');
    const fileName = parts.at(-1)!;
    let parentKey = repositoryKey;
    let path = '';
    for (const segment of parts.slice(0, -1)) {
      path = path ? `${path}/${segment}` : segment;
      const directoryKey = `directory:${path}`;
      addNode(nodes, { snapshot_id: snapshotId, node_key: directoryKey, node_type: 'directory', packet_key: null, tree_node_id: null, source_ref: path, content_hash: null, properties: {} });
      addEdge(edges, { snapshot_id: snapshotId, edge_key: `contains:${parentKey}->${directoryKey}`, source_node_key: parentKey, target_node_key: directoryKey, edge_type: 'CONTAINS', ordinal: 0, confidence: 1, provenance: 'canonical-packet-ledger' });
      parentKey = directoryKey;
    }

    const fileKey = `file:${packet.source_ref}`;
    addNode(nodes, { snapshot_id: snapshotId, node_key: fileKey, node_type: 'file', packet_key: null, tree_node_id: null, source_ref: packet.source_ref, content_hash: null, properties: { file_name: fileName } });
    addEdge(edges, { snapshot_id: snapshotId, edge_key: `contains:${parentKey}->${fileKey}`, source_node_key: parentKey, target_node_key: fileKey, edge_type: 'CONTAINS', ordinal: 0, confidence: 1, provenance: 'canonical-packet-ledger' });

    const chunkKey = `chunk:${packet.packet_key}`;
    const packetKey = `packet:${packet.packet_key}`;
    addNode(nodes, { snapshot_id: snapshotId, node_key: chunkKey, node_type: 'chunk', packet_key: packet.packet_key, tree_node_id: packet.tree_node_id ?? null, source_ref: packet.source_ref, content_hash: packet.content_hash, properties: { feature_id: packet.feature_id ?? null } });
    addNode(nodes, { snapshot_id: snapshotId, node_key: packetKey, node_type: 'packet', packet_key: packet.packet_key, tree_node_id: null, source_ref: packet.source_ref, content_hash: packet.content_hash, properties: {} });
    addEdge(edges, { snapshot_id: snapshotId, edge_key: `contains:${fileKey}->${chunkKey}`, source_node_key: fileKey, target_node_key: chunkKey, edge_type: 'CONTAINS', ordinal: 0, confidence: 1, provenance: 'canonical-packet-ledger' });
    addEdge(edges, { snapshot_id: snapshotId, edge_key: `materializes:${chunkKey}->${packetKey}`, source_node_key: chunkKey, target_node_key: packetKey, edge_type: 'MATERIALIZES', ordinal: 0, confidence: 1, provenance: 'canonical-packet-ledger' });
  }

  const orderedNodes = [...nodes.values()].sort((left, right) => left.node_key.localeCompare(right.node_key));
  const orderedEdges = [...edges.values()].sort((left, right) => left.edge_key.localeCompare(right.edge_key));
  const knownNodeKeys = new Set(orderedNodes.map((node) => node.node_key));
  for (const edge of orderedEdges) {
    if (!knownNodeKeys.has(edge.source_node_key) || !knownNodeKeys.has(edge.target_node_key)) {
      throw new ContextualTreeSnapshotError({ kind: 'EDGE_ENDPOINT_MISSING', edgeKey: edge.edge_key });
    }
  }

  return {
    contract_version: SNAPSHOT_CONTRACT_VERSION,
    snapshot_id: snapshotId,
    workspace_id: workspaceId,
    source_manifest_hash: sourceManifestHash,
    topology_hash: sha256({ nodes: orderedNodes, edges: orderedEdges }),
    nodes: orderedNodes,
    edges: orderedEdges,
    exclusions,
  };
}
