import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AtlasPacket } from '$lib/server/db/schema/atlas-packets.js';
import type { AtlasTreeNode } from '$lib/server/db/schema/atlas-tree-nodes.js';
import type {
  NewGraphEdgeV2Row,
  NewGraphNodeV2Row,
  NewGraphSnapshotExclusionV2Row,
  NewGraphSnapshotV2Row
} from '$lib/server/db/schema/graph-authority-v2.js';
import { topologyHash, type GraphEdge, type GraphNode } from './graph-snapshot.js';

export const GraphSnapshotManifestStatusSchema = z.enum([
  'MATERIALIZING',
  'MATERIALIZED',
  'VALIDATED',
  'FAILED',
  'SUPERSEDED'
]);

export type GraphSnapshotManifestStatus = z.infer<typeof GraphSnapshotManifestStatusSchema>;

export interface GraphSnapshotManifest {
  snapshotId: string;
  workspaceId: string;
  sourceInventorySnapshotId: string;
  identityContractVersion: string;
  parserContractVersion: string;
  nodeCount: number;
  edgeCount: number;
  excludedNodeCount: number;
  excludedEdgeCount: number;
  topologyHash: string;
  generatedAt: string;
  relationshipTypes: readonly string[];
  edgeOrientationPolicy: string;
  duplicateEdgePolicy: string;
  selfLoopPolicy: string;
  status: GraphSnapshotManifestStatus;
}

export interface GraphSnapshotProof {
  snapshotId: string;
  sourceInventoryHash: string;
  policyHash: string;
  topologyHash: string;
  replayedTopologyHash: string;
  replayMatches: boolean;
  eligibleNodeCount: number;
  persistedNodeCount: number;
  eligibleEdgeCount: number;
  persistedEdgeCount: number;
  excludedNodeCount: number;
  excludedEdgeCount: number;
  unresolvedEndpointCount: number;
  duplicateRelationCount: number;
  selfLoopCount: number;
}

export interface GraphSnapshotMaterialization {
  graphSnapshot: NewGraphSnapshotV2Row;
  graphSnapshotNodes: NewGraphNodeV2Row[];
  graphSnapshotEdges: NewGraphEdgeV2Row[];
  graphSnapshotExclusions: NewGraphSnapshotExclusionV2Row[];
  graphSnapshotManifest: GraphSnapshotManifest;
  graphSnapshotProof: GraphSnapshotProof;
}

export interface GraphSnapshotMaterializerInput {
  snapshotId: string;
  workspaceId: string;
  sourceInventorySnapshotId: string;
  identityContractVersion: string;
  parserContractVersion: string;
  treeNodes: readonly Pick<
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
  >[];
  packets: readonly Pick<
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
  >[];
  generatedAt?: string;
  edgeOrientationPolicy?: string;
  duplicateEdgePolicy?: string;
  selfLoopPolicy?: string;
}

const TREE_NODE_TYPE_MAP: Record<string, GraphNode['nodeType']> = {
  document: 'repository',
  page: 'package',
  section: 'directory',
  subsection: 'file',
  chunk: 'chunk',
  repository: 'repository',
  package: 'package',
  directory: 'directory',
  file: 'file',
  symbol: 'symbol'
};

export class GraphSnapshotMaterializerError extends Error {
  constructor(readonly evidence: Record<string, unknown>) {
    super(String(evidence.kind ?? 'GRAPH_SNAPSHOT_MATERIALIZATION_FAILED'));
  }
}

export function materializeGraphSnapshot(input: GraphSnapshotMaterializerInput): GraphSnapshotMaterialization {
  const snapshotId = z.string().uuid().parse(input.snapshotId);
  const workspaceId = z.string().min(1).parse(input.workspaceId);
  const sourceInventorySnapshotId = z.string().min(1).parse(input.sourceInventorySnapshotId);
  const identityContractVersion = z.string().min(1).parse(input.identityContractVersion);
  const parserContractVersion = z.string().min(1).parse(input.parserContractVersion);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const edgeOrientationPolicy = input.edgeOrientationPolicy ?? 'parent_to_child';
  const duplicateEdgePolicy = input.duplicateEdgePolicy ?? 'dedupe_by_edge_key';
  const selfLoopPolicy = input.selfLoopPolicy ?? 'exclude';
  const relationshipTypes = ['CONTAINS', 'MATERIALIZES'] as const;

  const sortedTreeNodes = [...input.treeNodes].sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  const sortedPackets = [...input.packets].sort((left, right) => left.packetKey.localeCompare(right.packetKey));

  const graphSnapshotExclusions: NewGraphSnapshotExclusionV2Row[] = [];
  const treeNodeMap = new Map<string, typeof sortedTreeNodes[number]>();
  const packetMap = new Map<string, typeof sortedPackets[number]>();

  for (const treeNode of sortedTreeNodes) {
    if (treeNodeMap.has(treeNode.nodeId)) {
      graphSnapshotExclusions.push(buildExclusion(snapshotId, 'node_materialization', 'DUPLICATE_TREE_NODE_ID', {
        candidateKey: treeNode.nodeId,
        sourceRef: treeNode.sourceRef,
        packetKey: treeNode.packetKey ?? null,
        evidence: { duplicateNodeId: treeNode.nodeId }
      }));
      continue;
    }
    treeNodeMap.set(treeNode.nodeId, treeNode);
  }

  for (const packet of sortedPackets) {
    if (packetMap.has(packet.packetKey)) {
      graphSnapshotExclusions.push(buildExclusion(snapshotId, 'node_materialization', 'DUPLICATE_PACKET_KEY', {
        candidateKey: packet.packetKey,
        packetKey: packet.packetKey,
        sourceRef: packet.sourceRef,
        evidence: { duplicatePacketKey: packet.packetKey }
      }));
      continue;
    }
    packetMap.set(packet.packetKey, packet);
  }

  const graphSnapshotNodes: NewGraphNodeV2Row[] = [];
  const includedPacketKeys = new Set<string>();

  for (const treeNode of treeNodeMap.values()) {
    const nodeType = TREE_NODE_TYPE_MAP[treeNode.nodeType];
    if (!nodeType) {
      graphSnapshotExclusions.push(buildExclusion(snapshotId, 'node_materialization', 'UNSUPPORTED_TREE_NODE_TYPE', {
        candidateKey: treeNode.nodeId,
        sourceRef: treeNode.sourceRef,
        evidence: { nodeType: treeNode.nodeType }
      }));
      continue;
    }

    const nodeKey = `tree:${treeNode.nodeId}`;
    graphSnapshotNodes.push(
      parseGraphNode({
        snapshotId,
        nodeKey,
        nodeType,
        packetKey: treeNode.packetKey ?? null,
        treeNodeId: treeNode.nodeId,
        sourceRef: treeNode.sourceRef,
        contentHash: hashStableRecord({
          nodeId: treeNode.nodeId,
          rootId: treeNode.rootId,
          pageIndexPath: treeNode.pageIndexPath,
          nodeType: treeNode.nodeType,
          treeDepth: treeNode.treeDepth,
          sourceRef: treeNode.sourceRef,
          filePath: treeNode.filePath,
          packetKey: treeNode.packetKey ?? null,
          featureId: treeNode.featureId ?? null,
          title: treeNode.title ?? null,
          summary: treeNode.summary ?? null,
          contentPreview: treeNode.contentPreview ?? null,
          domain: treeNode.domain ?? null,
          somCluster: treeNode.somCluster ?? null,
          communityId: treeNode.communityId ?? null,
          ledgerType: treeNode.ledgerType ?? null,
          lineageVersion: treeNode.lineageVersion ?? null
        }),
        properties: {
          materializedFrom: 'atlas_tree_nodes',
          nodeId: treeNode.nodeId,
          parentId: treeNode.parentId ?? null,
          rootId: treeNode.rootId,
          pageIndexPath: treeNode.pageIndexPath,
          nodeType: treeNode.nodeType,
          treeDepth: treeNode.treeDepth,
          sourceRef: treeNode.sourceRef,
          filePath: treeNode.filePath,
          packetKey: treeNode.packetKey ?? null,
          featureId: treeNode.featureId ?? null,
          title: treeNode.title ?? null,
          summary: treeNode.summary ?? null,
          contentPreview: treeNode.contentPreview ?? null,
          domain: treeNode.domain ?? null,
          somCluster: treeNode.somCluster ?? null,
          communityId: treeNode.communityId ?? null,
          ledgerType: treeNode.ledgerType ?? null,
          lineageVersion: treeNode.lineageVersion ?? null,
          metadata: treeNode.metadata ?? {}
        }
      })
    );
  }

  for (const packet of packetMap.values()) {
    if (!packet.treeNodeId) {
      graphSnapshotExclusions.push(buildExclusion(snapshotId, 'node_materialization', 'MISSING_TREE_NODE_ID', {
        candidateKey: packet.packetKey,
        packetKey: packet.packetKey,
        sourceRef: packet.sourceRef,
        evidence: { packetKey: packet.packetKey }
      }));
      continue;
    }

    const owner = treeNodeMap.get(packet.treeNodeId);
    if (!owner) {
      graphSnapshotExclusions.push(buildExclusion(snapshotId, 'node_materialization', 'UNRESOLVED_TREE_NODE_ID', {
        candidateKey: packet.packetKey,
        packetKey: packet.packetKey,
        sourceRef: packet.sourceRef,
        evidence: { treeNodeId: packet.treeNodeId }
      }));
      continue;
    }

    const nodeKey = `packet:${packet.packetKey}`;
    includedPacketKeys.add(nodeKey);
    graphSnapshotNodes.push(
      parseGraphNode({
        snapshotId,
        nodeKey,
        nodeType: 'packet',
        packetKey: packet.packetKey,
        treeNodeId: packet.treeNodeId,
        sourceRef: packet.sourceRef,
        contentHash: packet.sha256 ?? hashStableRecord({
          packetKey: packet.packetKey,
          sourceRef: packet.sourceRef,
          canonicalSourceRef: packet.canonicalSourceRef ?? null,
          directoryPath: packet.directoryPath,
          filePath: packet.filePath ?? null,
          functionSymbol: packet.functionSymbol ?? null,
          featureId: packet.featureId,
          featureLabel: packet.featureLabel,
          titleId: packet.titleId ?? null,
          communityId: packet.communityId ?? null,
          clusterId: packet.clusterId ?? null,
          sourceKind: packet.sourceKind ?? null,
          sourcePath: packet.sourcePath ?? null,
          domainClass: packet.domainClass ?? null,
          tags: packet.tags ?? [],
          lineageVersion: packet.lineageVersion ?? null,
          ledgerType: packet.ledgerType ?? null,
          canonical: packet.canonical ?? null,
          treeNodeId: packet.treeNodeId,
          qdrantCollection: packet.qdrantCollection ?? null,
          qdrantVectorDim: packet.qdrantVectorDim ?? null
        }),
        properties: {
          materializedFrom: 'atlas_packets',
          packetKey: packet.packetKey,
          sourceRef: packet.sourceRef,
          canonicalSourceRef: packet.canonicalSourceRef ?? null,
          directoryPath: packet.directoryPath,
          filePath: packet.filePath ?? null,
          functionSymbol: packet.functionSymbol ?? null,
          featureId: packet.featureId,
          featureLabel: packet.featureLabel,
          titleId: packet.titleId ?? null,
          communityId: packet.communityId ?? null,
          clusterId: packet.clusterId ?? null,
          sha256: packet.sha256 ?? null,
          sourceKind: packet.sourceKind ?? null,
          sourcePath: packet.sourcePath ?? null,
          domainClass: packet.domainClass ?? null,
          tags: packet.tags ?? [],
          lineageVersion: packet.lineageVersion ?? null,
          ledgerType: packet.ledgerType ?? null,
          canonical: packet.canonical ?? null,
          treeNodeId: packet.treeNodeId,
          qdrantCollection: packet.qdrantCollection ?? null,
          qdrantVectorDim: packet.qdrantVectorDim ?? null,
          topology: packet.topology ?? {},
          vectors: packet.vectors ?? {},
          metadata: packet.metadata ?? {}
        }
      })
    );
  }

  const graphSnapshotEdges: NewGraphEdgeV2Row[] = [];
  const seenEdgeKeys = new Set<string>();
  let duplicateRelationCount = 0;
  let unresolvedEndpointCount = 0;
  let selfLoopCount = 0;

  for (const treeNode of treeNodeMap.values()) {
    if (!treeNode.parentId) continue;
    if (treeNode.parentId === treeNode.nodeId) {
      selfLoopCount += 1;
      graphSnapshotExclusions.push(buildExclusion(snapshotId, 'edge_materialization', 'TREE_SELF_LOOP', {
        candidateKey: treeNode.nodeId,
        sourceRef: treeNode.sourceRef,
        evidence: { nodeId: treeNode.nodeId, parentId: treeNode.parentId }
      }));
      continue;
    }
    const parent = treeNodeMap.get(treeNode.parentId);
    if (!parent) {
      unresolvedEndpointCount += 1;
      graphSnapshotExclusions.push(buildExclusion(snapshotId, 'edge_materialization', 'MISSING_PARENT_NODE', {
        candidateKey: treeNode.nodeId,
        sourceRef: treeNode.sourceRef,
        evidence: { childNodeId: treeNode.nodeId, parentId: treeNode.parentId }
      }));
      continue;
    }
    addEdge(graphSnapshotEdges, seenEdgeKeys, graphSnapshotExclusions, snapshotId, {
      snapshotId,
      edgeKey: `contains:${parent.nodeId}:${treeNode.nodeId}`,
      sourceNodeKey: `tree:${parent.nodeId}`,
      targetNodeKey: `tree:${treeNode.nodeId}`,
      edgeType: 'CONTAINS',
      weight: 1,
      confidence: 1,
      provenance: 'atlas_tree_nodes',
      properties: {
        parentId: parent.nodeId,
        childId: treeNode.nodeId,
        pageIndexPath: treeNode.pageIndexPath,
        treeDepth: treeNode.treeDepth
      }
    });
  }

  for (const packet of packetMap.values()) {
    if (!packet.treeNodeId) continue;
    const owner = treeNodeMap.get(packet.treeNodeId);
    if (!owner) {
      unresolvedEndpointCount += 1;
      continue;
    }
    addEdge(graphSnapshotEdges, seenEdgeKeys, graphSnapshotExclusions, snapshotId, {
      snapshotId,
      edgeKey: `materializes:${owner.nodeId}:${packet.packetKey}`,
      sourceNodeKey: `tree:${owner.nodeId}`,
      targetNodeKey: `packet:${packet.packetKey}`,
      edgeType: 'MATERIALIZES',
      weight: 1,
      confidence: 1,
      provenance: 'atlas_packets',
      properties: {
        packetKey: packet.packetKey,
        treeNodeId: packet.treeNodeId,
        featureId: packet.featureId,
        sourceRef: packet.sourceRef
      }
    });
  }

  const includedNodes = [...graphSnapshotNodes].sort((left, right) => left.nodeKey.localeCompare(right.nodeKey));
  const includedEdges = [...graphSnapshotEdges].sort((left, right) => left.edgeKey.localeCompare(right.edgeKey));

  const materializedNodes = includedNodes.map((node) => parseGraphNode(node));
  const materializedEdges = includedEdges.map((edge) => parseGraphEdge(edge));

  const includedTopologyHash = topologyHash(materializedNodes, materializedEdges);
  const replayedTopologyHash = topologyHash(
    materializedNodes.map((node) => ({ ...node })),
    materializedEdges.map((edge) => ({ ...edge }))
  );

  const sourceInventoryHash = hashStableRecord({
    snapshotId,
    workspaceId,
    sourceInventorySnapshotId,
    identityContractVersion,
    parserContractVersion,
    treeNodes: sortedTreeNodes.map((treeNode) => normalizeTreeNode(treeNode)),
    packets: sortedPackets.map((packet) => normalizePacket(packet)),
    edgeOrientationPolicy,
    duplicateEdgePolicy,
    selfLoopPolicy
  });

  const policyHash = hashStableRecord({
    relationshipTypes,
    edgeOrientationPolicy,
    duplicateEdgePolicy,
    selfLoopPolicy
  });

  const graphSnapshotManifest: GraphSnapshotManifest = {
    snapshotId,
    workspaceId,
    sourceInventorySnapshotId,
    identityContractVersion,
    parserContractVersion,
    nodeCount: includedNodes.length,
    edgeCount: includedEdges.length,
    excludedNodeCount: graphSnapshotExclusions.filter((item) => item.exclusionStage === 'node_materialization').length,
    excludedEdgeCount: graphSnapshotExclusions.filter((item) => item.exclusionStage === 'edge_materialization').length,
    topologyHash: includedTopologyHash,
    generatedAt,
    relationshipTypes,
    edgeOrientationPolicy,
    duplicateEdgePolicy,
    selfLoopPolicy,
    status: 'MATERIALIZED'
  };

  const graphSnapshot: NewGraphSnapshotV2Row = {
    snapshotId,
    schemaVersion: identityContractVersion,
    status: 'BUILDING',
    sourceManifest: {
      workspaceId,
      sourceInventorySnapshotId,
      identityContractVersion,
      parserContractVersion,
      generatedAt,
      sourceInventoryHash,
      materializer: 'graph-snapshot-materializer-v1'
    },
    projectionPolicy: {
      relationshipTypes,
      edgeOrientationPolicy,
      duplicateEdgePolicy,
      selfLoopPolicy,
      topologyHash: includedTopologyHash
    },
    nodeCount: includedNodes.length,
    edgeCount: includedEdges.length,
    relationEventCount: 0,
    excludedCount: graphSnapshotExclusions.length,
    unresolvedCount: unresolvedEndpointCount,
    sourceHash: sourceInventoryHash,
    topologyHash: includedTopologyHash,
    policyHash,
    eligibilityPredicate: 'canonical tree_node_id + packet_key resolution with explicit exclusion ledger'
  };

  const graphSnapshotProof: GraphSnapshotProof = {
    snapshotId,
    sourceInventoryHash,
    policyHash,
    topologyHash: includedTopologyHash,
    replayedTopologyHash,
    replayMatches: includedTopologyHash === replayedTopologyHash,
    eligibleNodeCount: treeNodeMap.size + includedPacketKeys.size,
    persistedNodeCount: includedNodes.length,
    eligibleEdgeCount: includedEdges.length,
    persistedEdgeCount: includedEdges.length,
    excludedNodeCount: graphSnapshotManifest.excludedNodeCount,
    excludedEdgeCount: graphSnapshotManifest.excludedEdgeCount,
    unresolvedEndpointCount,
    duplicateRelationCount,
    selfLoopCount
  };

  return {
    graphSnapshot,
    graphSnapshotNodes: includedNodes,
    graphSnapshotEdges: includedEdges,
    graphSnapshotExclusions,
    graphSnapshotManifest,
    graphSnapshotProof
  };
}

function addEdge(
  graphSnapshotEdges: NewGraphEdgeV2Row[],
  seenEdgeKeys: Set<string>,
  graphSnapshotExclusions: NewGraphSnapshotExclusionV2Row[],
  snapshotId: string,
  edge: NewGraphEdgeV2Row,
): boolean {
  if (seenEdgeKeys.has(edge.edgeKey)) {
    graphSnapshotExclusions.push(buildExclusion(snapshotId, 'edge_materialization', 'DUPLICATE_EDGE_KEY', {
      candidateKey: edge.edgeKey,
      evidence: { edgeKey: edge.edgeKey, sourceNodeKey: edge.sourceNodeKey, targetNodeKey: edge.targetNodeKey }
    }));
    return false;
  }

  seenEdgeKeys.add(edge.edgeKey);
  graphSnapshotEdges.push(parseGraphEdge(edge));
  return true;
}

function parseGraphNode(node: NewGraphNodeV2Row): NewGraphNodeV2Row {
  return {
    snapshotId: z.string().uuid().parse(node.snapshotId),
    nodeKey: z.string().min(1).parse(node.nodeKey),
    nodeType: z.enum(['repository', 'package', 'directory', 'file', 'symbol', 'chunk', 'packet', 'feature', 'concept', 'relation_event']).parse(node.nodeType),
    packetKey: node.packetKey ?? null,
    treeNodeId: node.treeNodeId ?? null,
    sourceRef: node.sourceRef ?? null,
    contentHash: node.contentHash ?? null,
    properties: node.properties ?? {}
  };
}

function parseGraphEdge(edge: NewGraphEdgeV2Row): NewGraphEdgeV2Row {
  return {
    snapshotId: z.string().uuid().parse(edge.snapshotId),
    edgeKey: z.string().min(1).parse(edge.edgeKey),
    sourceNodeKey: z.string().min(1).parse(edge.sourceNodeKey),
    targetNodeKey: z.string().min(1).parse(edge.targetNodeKey),
    edgeType: z.enum(['CONTAINS', 'MATERIALIZES', 'IMPORTS', 'CALLS', 'REFERENCES', 'DEPENDS_ON', 'IMPLEMENTS', 'USES_CONCEPT', 'DERIVED_FROM', 'SUMMARIZES', 'PARTICIPATES_IN']).parse(edge.edgeType),
    weight: z.number().finite().nonnegative().parse(edge.weight),
    confidence: z.number().finite().min(0).max(1).parse(edge.confidence),
    provenance: z.string().min(1).parse(edge.provenance),
    properties: edge.properties ?? {}
  };
}

function buildExclusion(
  snapshotId: string,
  exclusionStage: string,
  exclusionReason: string,
  fields: Pick<NewGraphSnapshotExclusionV2Row, 'candidateKey' | 'packetKey' | 'sourceRef' | 'evidence'>,
): NewGraphSnapshotExclusionV2Row {
  return {
    snapshotId,
    candidateKey: fields.candidateKey ?? null,
    packetKey: fields.packetKey ?? null,
    sourceRef: fields.sourceRef ?? null,
    exclusionStage,
    exclusionReason,
    evidence: fields.evidence ?? {}
  };
}

function normalizeTreeNode(node: Pick<GraphSnapshotMaterializerInput['treeNodes'][number], 'nodeId' | 'parentId' | 'rootId' | 'pageIndexPath' | 'nodeType' | 'treeDepth' | 'sourceRef' | 'filePath' | 'packetKey' | 'featureId' | 'title' | 'summary' | 'contentPreview' | 'domain' | 'somCluster' | 'communityId' | 'metadata' | 'ledgerType' | 'lineageVersion'>) {
  return {
    nodeId: node.nodeId,
    parentId: node.parentId ?? null,
    rootId: node.rootId,
    pageIndexPath: node.pageIndexPath,
    nodeType: node.nodeType,
    treeDepth: node.treeDepth,
    sourceRef: node.sourceRef,
    filePath: node.filePath,
    packetKey: node.packetKey ?? null,
    featureId: node.featureId ?? null,
    title: node.title ?? null,
    summary: node.summary ?? null,
    contentPreview: node.contentPreview ?? null,
    domain: node.domain ?? null,
    somCluster: node.somCluster ?? null,
    communityId: node.communityId ?? null,
    metadata: node.metadata ?? {},
    ledgerType: node.ledgerType ?? null,
    lineageVersion: node.lineageVersion ?? null
  };
}

function normalizePacket(node: Pick<GraphSnapshotMaterializerInput['packets'][number], 'packetKey' | 'sourceRef' | 'canonicalSourceRef' | 'directoryPath' | 'filePath' | 'functionSymbol' | 'featureId' | 'featureLabel' | 'titleId' | 'communityId' | 'clusterId' | 'sha256' | 'sourceKind' | 'sourcePath' | 'topology' | 'vectors' | 'metadata' | 'domainClass' | 'tags' | 'lineageVersion' | 'ledgerType' | 'canonical' | 'treeNodeId' | 'qdrantCollection' | 'qdrantVectorDim'>) {
  return {
    packetKey: node.packetKey,
    sourceRef: node.sourceRef,
    canonicalSourceRef: node.canonicalSourceRef ?? null,
    directoryPath: node.directoryPath,
    filePath: node.filePath ?? null,
    functionSymbol: node.functionSymbol ?? null,
    featureId: node.featureId,
    featureLabel: node.featureLabel,
    titleId: node.titleId ?? null,
    communityId: node.communityId ?? null,
    clusterId: node.clusterId ?? null,
    sha256: node.sha256 ?? null,
    sourceKind: node.sourceKind ?? null,
    sourcePath: node.sourcePath ?? null,
    topology: node.topology ?? {},
    vectors: node.vectors ?? {},
    metadata: node.metadata ?? {},
    domainClass: node.domainClass ?? null,
    tags: node.tags ?? [],
    lineageVersion: node.lineageVersion ?? null,
    ledgerType: node.ledgerType ?? null,
    canonical: node.canonical ?? null,
    treeNodeId: node.treeNodeId ?? null,
    qdrantCollection: node.qdrantCollection ?? null,
    qdrantVectorDim: node.qdrantVectorDim ?? null
  };
}

function hashStableRecord(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}
