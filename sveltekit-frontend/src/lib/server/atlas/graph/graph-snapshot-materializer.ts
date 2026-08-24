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
  /** Every node_materialization exclusionReason mapped to its count for this run.
   *  Makes contamination visible instead of invisible: after the heuristic-AST
   *  fix, 146,655 rows show up here as rejectionCounts.HEURISTIC_AST_PROJECTION
   *  rather than silently disappearing from nodeCount with no trace. */
  rejectionCounts: Record<string, number>;
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

// TREE_NODE_TYPE_MAP answers ONE question: "what graph node kind would this tree
// node become if admitted?" It carries no trust semantics — membership here is
// necessary but never sufficient for inclusion. Trust is decided separately by
// classifyCanonicalGraphEligibility() below. Conflating the two (recognized
// nodeType == trustworthy) is exactly what let 146,655 heuristic regex-derived
// rows into the canonical graph snapshot at full trust (GS1.5's "extend the map
// so more rows survive" fix widened recognition without adding a trust check).
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
  symbol: 'symbol',
  // AST-level tree-sitter node kinds materialized by the parser pipeline —
  // all map to the existing 'symbol' node type (function/class/interface/
  // type-alias/struct declarations, arrow functions are all symbol-level).
  // Representation only — see classifyCanonicalGraphEligibility for the actual
  // admission decision on 'symbol'-mapped nodes.
  function_declaration: 'symbol',
  arrow_function: 'symbol',
  class_declaration: 'symbol',
  interface_declaration: 'symbol',
  type_alias: 'symbol',
  struct_declaration: 'symbol'
};

/** Node kinds that represent the packet/document/chunk hierarchy (everything
 *  TREE_NODE_TYPE_MAP maps to besides 'symbol'). Distinct family from AST symbols
 *  because the two have entirely different provenance requirements. */
const PACKET_HIERARCHY_NODE_KINDS = new Set<GraphNode['nodeType']>(['repository', 'package', 'directory', 'file', 'chunk']);

type TreeNodeEligibilityInput = {
  ledgerType: string | null;
  metadata: Record<string, unknown> | null;
};

type TreeNodeEligibilityResult =
  | { eligible: true; family: 'packet_hierarchy' | 'ast_symbol' }
  | { eligible: false; reason: string };

/**
 * Positive admission contract for canonical graph snapshot inclusion. A tree
 * node must PROVE it belongs to a trusted family; recognizing its nodeType is
 * not proof. Each family has its own provenance requirement:
 *
 *   packet_hierarchy (document/page/section/subsection/chunk): must be
 *     ledger_type='canonical' AND metadata.source === 'atlas_packets' — the
 *     only writer with a proven, packet-linked identity chain.
 *
 *   ast_symbol (function/class/interface/type-alias/struct/arrow_function):
 *     must be ledger_type='canonical' AND metadata.extractionMethod ===
 *     'tree_sitter' AND metadata.structuralTruth === true, and must NOT be
 *     produced by the known heuristic writer (metadata.producerId ===
 *     'batch-a-structural-materializer'). Any symbol node missing this
 *     provenance — including ones with no metadata at all — is rejected.
 *     Unknown provenance is never interpreted as trustworthy provenance.
 */
function classifyCanonicalGraphEligibility(
  treeNode: TreeNodeEligibilityInput,
  mappedNodeType: GraphNode['nodeType']
): TreeNodeEligibilityResult {
  if (treeNode.ledgerType !== 'canonical') {
    return { eligible: false, reason: 'NON_CANONICAL_LEDGER_TYPE' };
  }

  const metadata = treeNode.metadata ?? {};

  if (PACKET_HIERARCHY_NODE_KINDS.has(mappedNodeType)) {
    if (metadata.source !== 'atlas_packets') {
      return { eligible: false, reason: 'UNTRUSTED_PACKET_HIERARCHY_SOURCE' };
    }
    return { eligible: true, family: 'packet_hierarchy' };
  }

  if (mappedNodeType === 'symbol') {
    if (metadata.producerId === 'batch-a-structural-materializer') {
      return { eligible: false, reason: 'HEURISTIC_AST_PROJECTION' };
    }
    if (metadata.structuralTruth !== true) {
      return { eligible: false, reason: 'STRUCTURAL_TRUTH_NOT_PROVEN' };
    }
    if (metadata.extractionMethod !== 'tree_sitter') {
      // Fail closed: covers missing extractionMethod, unrecognized values, and
      // any future producer that doesn't explicitly declare tree_sitter.
      return { eligible: false, reason: 'NON_TREE_SITTER_SYMBOL' };
    }
    return { eligible: true, family: 'ast_symbol' };
  }

  return { eligible: false, reason: 'UNRECOGNIZED_NODE_FAMILY' };
}

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
  const relationshipTypes = ['CONTAINS', 'DERIVED_FROM'] as const;

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

    // Recognizing the nodeType is not the same claim as trusting the row (see
    // classifyCanonicalGraphEligibility docstring above). Prior to this check,
    // any ledgerType survived as long as its nodeType key was in
    // TREE_NODE_TYPE_MAP, which let 146,655 heuristic regex-derived 'symbol'
    // nodes (batch-a-structural-materializer.mts, approximate byte spans, zero
    // real parent/child edges) into the graph snapshot at full trust.
    const eligibility = classifyCanonicalGraphEligibility(
      { ledgerType: treeNode.ledgerType, metadata: (treeNode.metadata ?? null) as Record<string, unknown> | null },
      nodeType
    );
    if (eligibility.eligible === false) {
      graphSnapshotExclusions.push(buildExclusion(snapshotId, 'node_materialization', eligibility.reason, {
        candidateKey: treeNode.nodeId,
        sourceRef: treeNode.sourceRef,
        evidence: {
          nodeType: treeNode.nodeType,
          ledgerType: treeNode.ledgerType,
          producerId: (treeNode.metadata as Record<string, unknown> | null | undefined)?.producerId ?? null,
          extractionMethod: (treeNode.metadata as Record<string, unknown> | null | undefined)?.extractionMethod ?? null
        }
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
          // Which admission family this node proved membership in — makes the
          // eligibility decision inspectable on the persisted node itself, not
          // just derivable by re-reading classifyCanonicalGraphEligibility.
          eligibilityFamily: eligibility.family,
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

    // packet.packetKey already carries the `packet:` prefix for the
    // overwhelming majority of live atlas_packets rows (verified live
    // 2026-08-24: 58,304/61,660). Blindly re-prefixing produced a
    // `packet:packet:<hash>` nodeKey for every packet-type node -- 54,078
    // rows in atlas_graph_authority_scores_v2 carry this bug today. A small
    // legacy minority (61 rows) still store a bare hex key with no prefix,
    // so this stays conditional rather than an unconditional strip.
    const nodeKey = packet.packetKey.startsWith('packet:') ? packet.packetKey : `packet:${packet.packetKey}`;
    includedPacketKeys.add(nodeKey);
    graphSnapshotNodes.push(
      parseGraphNode({
        snapshotId,
        nodeKey,
        nodeType: 'packet',
        packetKey: packet.packetKey,
        treeNodeId: null,
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
          treeNodeId: null,
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
      edgeKey: `derived_from:${packet.packetKey}:${owner.nodeId}`,
      // Must match the packet node's own nodeKey construction above -- this
      // was a second, independent instance of the same double-`packet:`-
      // prefix bug (see the node-construction comment above), which had
      // silently left DERIVED_FROM edges pointing at a sourceNodeKey that
      // never matched any real node.nodeKey.
      sourceNodeKey: packet.packetKey.startsWith('packet:') ? packet.packetKey : `packet:${packet.packetKey}`,
      targetNodeKey: `tree:${owner.nodeId}`,
      edgeType: 'DERIVED_FROM',
      weight: 1,
      confidence: 1,
      provenance: 'atlas_packets',
      properties: {
        packetKey: packet.packetKey,
        derivedFromTreeNodeId: owner.nodeId,
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
    // Structured, checkable contract — matches classifyCanonicalGraphEligibility
    // exactly, so a future audit can compare this string against the executable
    // predicate without re-reading the implementation. The prior string ("canonical
    // tree_node_id + packet_key resolution with explicit exclusion ledger") made
    // an enforcement claim that was not actually true when it was written.
    eligibilityPredicate: JSON.stringify({
      packet_hierarchy: { ledger_type: 'canonical', 'metadata.source': 'atlas_packets' },
      ast_symbol: {
        ledger_type: 'canonical',
        'metadata.extractionMethod': 'tree_sitter',
        'metadata.structuralTruth': true,
        'metadata.producerId_excludes': ['batch-a-structural-materializer']
      },
      default: 'reject'
    })
  };

  const rejectionCounts: Record<string, number> = {};
  for (const exclusion of graphSnapshotExclusions) {
    if (exclusion.exclusionStage !== 'node_materialization') continue;
    rejectionCounts[exclusion.exclusionReason] = (rejectionCounts[exclusion.exclusionReason] ?? 0) + 1;
  }

  const graphSnapshotProof: GraphSnapshotProof = {
    snapshotId,
    rejectionCounts,
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

function parseGraphNode(node: NewGraphNodeV2Row): GraphNode {
  return {
    snapshotId: z.string().uuid().parse(node.snapshotId),
    nodeKey: z.string().min(1).parse(node.nodeKey),
    nodeType: z.enum(['repository', 'package', 'directory', 'file', 'symbol', 'chunk', 'packet', 'feature', 'concept', 'relation_event']).parse(node.nodeType),
    packetKey: node.packetKey ?? null,
    treeNodeId: node.treeNodeId ?? null,
    sourceRef: node.sourceRef ?? null,
    properties: (node.properties ?? {}) as Record<string, unknown>
  };
}

function parseGraphEdge(edge: NewGraphEdgeV2Row): GraphEdge {
  return {
    snapshotId: z.string().uuid().parse(edge.snapshotId),
    edgeKey: z.string().min(1).parse(edge.edgeKey),
    sourceNodeKey: z.string().min(1).parse(edge.sourceNodeKey),
    targetNodeKey: z.string().min(1).parse(edge.targetNodeKey),
    edgeType: z.enum(['CONTAINS', 'MATERIALIZES', 'IMPORTS', 'CALLS', 'REFERENCES', 'DEPENDS_ON', 'IMPLEMENTS', 'USES_CONCEPT', 'DERIVED_FROM', 'SUMMARIZES', 'PARTICIPATES_IN']).parse(edge.edgeType),
    weight: z.number().finite().nonnegative().parse(edge.weight),
    confidence: z.number().finite().min(0).max(1).parse(edge.confidence),
    provenance: z.string().min(1).parse(edge.provenance),
    properties: (edge.properties ?? {}) as Record<string, unknown>
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
