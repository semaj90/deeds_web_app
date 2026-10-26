import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AtlasPacket } from '$lib/server/db/schema/atlas-packets.js';
import type { AtlasTreeNode } from '$lib/server/db/schema/atlas-tree-nodes.js';
import { verifyNaryFactProposalChecksumV1, type NaryFactProposalV1 } from '$lib/server/atlas/graph/nary-fact-proposal-v1.js';
import { OntologyLinkedTupleV1Schema, type OntologyLinkedTupleV1 } from '$lib/server/atlas/contracts/ontology-linked-tuple-v1.js';
import type {
  NewGraphEdgeV2Row,
  NewGraphNodeV2Row,
  NewGraphRelationEventV2Row,
  NewGraphRelationParticipantV2Row,
  NewGraphSnapshotExclusionV2Row,
  NewGraphSnapshotV2Row
} from '$lib/server/db/schema/graph-authority-v2.js';
import {
  graphifyEdgeProjectionCandidateV1Schema,
  graphifySymbolProjectionCandidateV1Schema,
  type GraphifyEdgeProjectionCandidateV1,
  type GraphifySymbolProjectionCandidateV1
} from '$lib/server/atlas/indexing/graphify-symbol-projection-v1.js';
import { topologyHash, validateGraphSnapshotIdentity, type GraphEdge, type GraphNode, type GraphRelationEvent, type GraphRelationParticipant } from './graph-snapshot.js';

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
  workspaceRevision?: string | null;
  sourceInventorySnapshotId: string;
  identityContractVersion: string;
  parserContractVersion: string;
  nodeCount: number;
  edgeCount: number;
  relationEventCount: number;
  excludedNodeCount: number;
  excludedEdgeCount: number;
  excludedRelationCount: number;
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
  relationRejectionCounts: Record<string, number>;
  sourceInventoryHash: string;
  policyHash: string;
  topologyHash: string;
  replayedTopologyHash: string;
  replayMatches: boolean;
  eligibleNodeCount: number;
  persistedNodeCount: number;
  eligibleEdgeCount: number;
  persistedEdgeCount: number;
  eligibleRelationCount: number;
  persistedRelationCount: number;
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
  graphSnapshotRelationEvents: NewGraphRelationEventV2Row[];
  graphSnapshotRelationParticipants: NewGraphRelationParticipantV2Row[];
  graphSnapshotExclusions: NewGraphSnapshotExclusionV2Row[];
  graphSnapshotManifest: GraphSnapshotManifest;
  graphSnapshotProof: GraphSnapshotProof;
  graphifyReplayProof?: {
    structuralBatchChecksum?: string | null;
    batchAssemblyChecksum: string | null;
    replayPlanChecksum: string;
    replayCounts: Record<string, number>;
    candidateCount: number;
    rejectedReferences: { referenceId: string; reason: string }[];
    canonicalAuthority: false;
    writesPerformed: false;
  };
}

export interface GraphSnapshotRelationCandidateV1 {
  relationId: string;
  relationType: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  confidence: number;
  sourceSpan: {
    coordinateSystem: 'utf8-byte';
    startByte: number;
    endByte: number;
    nodeContentSha256: string;
    producerId: string;
    producerRevision: string;
    parserId?: string;
    parserVersion?: string;
    evidenceRefs: readonly string[];
  };
  participants: readonly { nodeKey: string; role: string; ordinal: number }[];
}

export interface GraphSnapshotGraphifyPacketEdgeCandidateV1 {
  edge: GraphifyEdgeProjectionCandidateV1;
  subjectSymbol: GraphifySymbolProjectionCandidateV1;
  targetSymbol: GraphifySymbolProjectionCandidateV1;
  sourcePacketKey: string;
  targetPacketKey: string;
  sourceSymbolKey: string;
  targetSymbolKey: string;
  graphRevision: string;
  sourceBytes: Uint8Array;
  targetSourceBytes: Uint8Array;
}

export interface GraphSnapshotSourceSpanProofV1 {
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  coordinateSystem: 'utf8-byte';
  sourceBytes: Uint8Array;
  producerId: string;
  producerRevision: string;
  parserId?: string;
  parserVersion?: string;
  evidenceRefs: readonly string[];
}

export type OntologyTupleRelationCandidateResultV1 =
  | { candidate: GraphSnapshotRelationCandidateV1; reason: null }
  | { candidate: null; reason: string };

export function buildGraphSnapshotRelationCandidateFromTupleV1(input: {
  tuple: OntologyLinkedTupleV1;
  proposal: NaryFactProposalV1;
  sourceSpanProof: GraphSnapshotSourceSpanProofV1;
  nodes: readonly GraphNode[];
}): OntologyTupleRelationCandidateResultV1 {
  const tuple = OntologyLinkedTupleV1Schema.parse(input.tuple);
  const proposal = input.proposal;
  const proof = input.sourceSpanProof;
  const reject = (reason: string): OntologyTupleRelationCandidateResultV1 => ({ candidate: null, reason });
  const tupleEvidenceRefs = [...tuple.evidenceRefs].sort();
  const proposalEvidenceRefs = [...proposal.evidenceRefs].sort();
  const proofEvidenceRefs = [...proof.evidenceRefs].sort();
  if (!verifyNaryFactProposalChecksumV1(proposal) || proposal.canonicalAuthority !== false) {
    return reject('NARY_PROPOSAL_CHECKSUM_INVALID');
  }
  if (proposal.admission !== 'ADMITTED') {
    return reject('NARY_PROPOSAL_NOT_ADMITTED');
  }
  if (tuple.evidenceState !== 'ACTIVE_VERIFIED'
    || !tuple.packetKey
    || !tuple.evidenceSpan
    || !tuple.provenance.sourceRevision
    || !tuple.provenance.workspaceRevision
    || !tuple.provenance.evidenceSpanChecksum
    || !tuple.provenance.producerId) {
    return reject('ONTOLOGY_TUPLE_LINEAGE_OR_SPAN_INCOMPLETE');
  }
  if (proposal.sourceRef !== tuple.sourceRef
    || proposal.sourceRevision !== tuple.provenance.sourceRevision
    || proposal.workspaceRevision !== tuple.provenance.workspaceRevision
    || proposal.packetKey !== tuple.packetKey
    || proposalEvidenceRefs.length !== tupleEvidenceRefs.length
    || proposalEvidenceRefs.some((ref, index) => ref !== tupleEvidenceRefs[index])
    || proofEvidenceRefs.length !== tupleEvidenceRefs.length
    || proofEvidenceRefs.some((ref, index) => ref !== tupleEvidenceRefs[index])) {
    return reject('NARY_PROPOSAL_TUPLE_IDENTITY_MISMATCH');
  }
  const sourceSpan = tuple.evidenceSpan;
  if (proof.sourceRef !== sourceSpan.sourceRef
    || proof.sourceRef !== tuple.sourceRef
    || proof.sourceRevision !== tuple.provenance.sourceRevision
    || proof.workspaceRevision !== tuple.provenance.workspaceRevision
    || proof.producerId !== tuple.provenance.producerId
    || proof.producerRevision !== tuple.provenance.producerRevision
    || proof.coordinateSystem !== 'utf8-byte'
    || !/^sha256:[a-f0-9]{64}$/i.test(proof.sourceRevision)
    || !/^sha256:[a-f0-9]{64}$/i.test(proof.workspaceRevision)
    || !proof.producerId || !proof.producerRevision
    || Boolean(proof.parserId) !== Boolean(proof.parserVersion)
    || !Number.isSafeInteger(sourceSpan.start) || sourceSpan.start < 0
    || !Number.isSafeInteger(sourceSpan.end) || sourceSpan.end <= sourceSpan.start
    || sourceSpan.end > proof.sourceBytes.byteLength) {
    return reject('ONTOLOGY_TUPLE_SOURCE_SPAN_PROOF_MISMATCH');
  }
  const sourceBytes = Buffer.from(proof.sourceBytes);
  const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
  const spanBytes = sourceBytes.subarray(sourceSpan.start, sourceSpan.end);
  const nodeContentSha256 = `sha256:${createHash('sha256').update(spanBytes).digest('hex')}`;
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    decoder.decode(sourceBytes.subarray(0, sourceSpan.start));
    const spanText = decoder.decode(spanBytes);
    decoder.decode(sourceBytes.subarray(sourceSpan.end));
    if (sourceRevision !== proof.sourceRevision
      || nodeContentSha256 !== tuple.provenance.evidenceSpanChecksum
      || spanText !== tuple.surfaceText) {
      return reject('ONTOLOGY_TUPLE_SOURCE_BYTES_MISMATCH');
    }
  } catch {
    return reject('ONTOLOGY_TUPLE_SOURCE_BYTES_INVALID_UTF8_BOUNDARY');
  }
  const tupleParticipants = new Set(tuple.participants.map((participant) => `${participant.entityId}\u0000${participant.role}\u0000${participant.entityKind.toUpperCase()}`));
  const proposalParticipants = new Set(proposal.participants.map((participant) => `${participant.canonicalId}\u0000${participant.role}\u0000${participant.entityType}`));
  if (tupleParticipants.size < 3 || tupleParticipants.size !== proposalParticipants.size
    || [...tupleParticipants].some((participant) => !proposalParticipants.has(participant))) {
    return reject('ONTOLOGY_TUPLE_PARTICIPANT_PROPOSAL_MISMATCH');
  }

  const participants: Array<{ nodeKey: string; role: string; ordinal: number }> = [];
  for (const participant of proposal.participants) {
    const matches = input.nodes.filter((node) => {
      if (!node.packetKey) return false;
      if (participant.entityType === 'PACKET') return node.nodeType === 'packet' && node.packetKey === participant.canonicalId;
      if (participant.entityType === 'AST_SYMBOL') return node.nodeType === 'symbol' && node.treeNodeId === participant.canonicalId;
      if (participant.entityType === 'TREE_NODE') return node.treeNodeId === participant.canonicalId;
      if (['CONCEPT', 'SEMANTIC_CONCEPT', 'TOPIC'].includes(participant.entityType)) {
        return node.nodeType === 'concept' && node.nodeKey === participant.canonicalId;
      }
      return false;
    });
    if (matches.length !== 1) return reject(matches.length ? 'ONTOLOGY_TUPLE_PARTICIPANT_AMBIGUOUS' : 'ONTOLOGY_TUPLE_PARTICIPANT_NODE_MISSING');
    const node = matches[0];
    if (participant.sourceRef && participant.sourceRef !== node.sourceRef) {
      return reject('ONTOLOGY_TUPLE_PARTICIPANT_SOURCE_REF_MISMATCH');
    }
    if (participant.entityRevision && participant.entityRevision !== node.properties.sourceRevision) {
      return reject('ONTOLOGY_TUPLE_PARTICIPANT_SOURCE_REVISION_MISMATCH');
    }
    if (typeof node.properties.sourceRevision !== 'string'
      || !/^sha256:[a-f0-9]{64}$/i.test(node.properties.sourceRevision)
      || node.properties.workspaceRevision !== proof.workspaceRevision) {
      return reject('ONTOLOGY_TUPLE_PARTICIPANT_REVISION_UNQUALIFIED');
    }
    participants.push({ nodeKey: node.nodeKey, role: participant.role, ordinal: participant.ordinal ?? participants.length });
  }
  const sourcePacketNode = participants
    .map((participant) => input.nodes.find((node) => node.nodeKey === participant.nodeKey))
    .find((node) => node?.packetKey === tuple.packetKey
      && node.sourceRef === tuple.sourceRef
      && node.properties.sourceRevision === proof.sourceRevision
      && node.properties.workspaceRevision === proof.workspaceRevision);
  if (!sourcePacketNode) return reject('ONTOLOGY_TUPLE_SOURCE_PACKET_NODE_MISSING');

  return {
    reason: null,
    candidate: {
      relationId: `nary:${tuple.tupleId}`,
      relationType: proposal.predicate,
      sourceRef: tuple.sourceRef,
      sourceRevision: proof.sourceRevision,
      workspaceRevision: proof.workspaceRevision,
      confidence: tuple.confidence,
      sourceSpan: {
        coordinateSystem: proof.coordinateSystem,
        startByte: sourceSpan.start,
        endByte: sourceSpan.end,
        nodeContentSha256,
        producerId: proof.producerId,
        producerRevision: proof.producerRevision,
        ...(proof.parserId ? { parserId: proof.parserId } : {}),
        ...(proof.parserVersion ? { parserVersion: proof.parserVersion } : {}),
        evidenceRefs: [...proof.evidenceRefs]
      },
      participants
    }
  };
}

export interface GraphSnapshotMaterializerInput {
  snapshotId: string;
  workspaceId: string;
  workspaceRevision?: string | null;
  sourceInventorySnapshotId: string;
  identityContractVersion: string;
  parserContractVersion: string;
  treeNodes: readonly (Pick<
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
  > & { sourceRevision?: string | null })[];
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
    | 'sourceRevision'
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
    | 'byteStart'
    | 'byteEnd'
    | 'qdrantCollection'
    | 'qdrantVectorDim'
  >[];
  relationCandidates?: readonly GraphSnapshotRelationCandidateV1[];
  graphifyPacketEdgeCandidates?: readonly GraphSnapshotGraphifyPacketEdgeCandidateV1[];
  ontologyTupleCandidates?: readonly {
    tuple: OntologyLinkedTupleV1;
    proposal: NaryFactProposalV1;
    sourceSpanProof: GraphSnapshotSourceSpanProofV1;
  }[];
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
  const graphSnapshotRelationEvents: NewGraphRelationEventV2Row[] = [];
  const graphSnapshotRelationParticipants: NewGraphRelationParticipantV2Row[] = [];
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

  const sourceRevisionByRef = new Map<string, string | null>();
  for (const packet of packetMap.values()) {
    const revision = typeof packet.sourceRevision === 'string' && packet.sourceRevision.trim()
      ? packet.sourceRevision
      : null;
    if (!sourceRevisionByRef.has(packet.sourceRef)) {
      sourceRevisionByRef.set(packet.sourceRef, revision);
    } else if (sourceRevisionByRef.get(packet.sourceRef) !== revision) {
      sourceRevisionByRef.set(packet.sourceRef, null);
    }
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
    const packetRevision = treeNode.packetKey ? packetMap.get(treeNode.packetKey)?.sourceRevision : null;
    if (treeNode.sourceRevision && packetRevision && treeNode.sourceRevision !== packetRevision) {
      throw new Error(`GRAPH_TREE_PACKET_SOURCE_REVISION_MISMATCH:${treeNode.nodeId}`);
    }
    const sourceRevision = treeNode.sourceRevision ?? packetRevision ?? sourceRevisionByRef.get(treeNode.sourceRef) ?? null;
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
          sourceRevision,
          workspaceRevision: input.workspaceRevision ?? null,
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
          sourceRevision,
          workspaceRevision: input.workspaceRevision ?? null,
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
          sourceRevision: packet.sourceRevision ?? null,
          canonicalSourceRef: packet.canonicalSourceRef ?? null,
          directoryPath: packet.directoryPath,
          filePath: packet.filePath ?? null,
          functionSymbol: packet.functionSymbol ?? null,
          featureId: packet.featureId,
          featureLabel: packet.featureLabel,
          titleId: packet.titleId ?? null,
          communityId: packet.communityId ?? null,
          clusterId: packet.clusterId ?? null,
          byteStart: packet.byteStart ?? null,
          byteEnd: packet.byteEnd ?? null,
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
          sourceRevision: packet.sourceRevision ?? null,
          byteStart: packet.byteStart ?? null,
          byteEnd: packet.byteEnd ?? null,
          workspaceRevision: input.workspaceRevision ?? null,
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

  const packetGraphNodes = new Map(
    graphSnapshotNodes
      .filter((node) => node.nodeType === 'packet' && node.packetKey)
      .map((node) => [node.packetKey!, node])
  );
  const supportedGraphifyPredicates = new Set<GraphEdge['edgeType']>([
    'CALLS', 'IMPORTS', 'REFERENCES', 'IMPLEMENTS', 'DEPENDS_ON', 'USES_CONCEPT'
  ]);
  const relationCandidates: GraphSnapshotRelationCandidateV1[] = [...(input.relationCandidates ?? [])];
  const graphifySymbolNodes = new Map<string, NewGraphNodeV2Row>();
  for (const candidate of [...(input.graphifyPacketEdgeCandidates ?? [])].sort((left, right) =>
    left.edge.referenceId.localeCompare(right.edge.referenceId)
      || left.sourcePacketKey.localeCompare(right.sourcePacketKey)
      || left.targetPacketKey.localeCompare(right.targetPacketKey))) {
    const edgeResult = graphifyEdgeProjectionCandidateV1Schema.safeParse(candidate.edge);
    const subjectResult = graphifySymbolProjectionCandidateV1Schema.safeParse(candidate.subjectSymbol);
    const targetResult = graphifySymbolProjectionCandidateV1Schema.safeParse(candidate.targetSymbol);
    const edge = edgeResult.success ? edgeResult.data : candidate.edge;
    const reject = (reason: string) => graphSnapshotExclusions.push(buildExclusion(snapshotId, 'edge_materialization', reason, {
      candidateKey: `${edge.referenceId}:${candidate.sourcePacketKey}:${candidate.targetPacketKey}`,
      packetKey: candidate.sourcePacketKey,
      sourceRef: edge.sourceRef,
      evidence: { referenceId: edge.referenceId, sourcePacketKey: candidate.sourcePacketKey, targetPacketKey: candidate.targetPacketKey }
    }));
    if (!edgeResult.success || !subjectResult.success || !targetResult.success) {
      reject('GRAPHIFY_EDGE_OR_SYMBOL_SCHEMA_INVALID');
      continue;
    }
    const subjectSymbol = subjectResult.data;
    const targetSymbol = targetResult.data;
    if (!edge.objectStableSymbolKey || edge.unresolvedTarget
      || candidate.sourceSymbolKey !== edge.subjectStableSymbolKey
      || candidate.targetSymbolKey !== edge.objectStableSymbolKey
      || subjectSymbol.stableSymbolKey !== edge.subjectStableSymbolKey
      || targetSymbol.stableSymbolKey !== edge.objectStableSymbolKey) {
      reject('GRAPHIFY_EDGE_SYMBOL_BINDING_UNRESOLVED');
      continue;
    }
    if (edge.workspaceRevision !== (input.workspaceRevision ?? null)
      || !/^sha256:[a-f0-9]{64}$/i.test(edge.workspaceRevision)
      || !/^sha256:[a-f0-9]{64}$/i.test(edge.sourceRevision)
      || !/^sha256:[a-f0-9]{64}$/i.test(edge.objectSourceRevision ?? '')
      || !/^[a-f0-9]{64}$/i.test(candidate.graphRevision)) {
      reject('GRAPHIFY_EDGE_REVISION_UNQUALIFIED');
      continue;
    }
    const subjectSourceRevision = `sha256:${createHash('sha256').update(candidate.sourceBytes).digest('hex')}`;
    const targetSourceRevision = `sha256:${createHash('sha256').update(candidate.targetSourceBytes).digest('hex')}`;
    const symbolBytesMatch = (symbol: GraphifySymbolProjectionCandidateV1, sourceBytes: Uint8Array) => {
      if (!Number.isSafeInteger(symbol.startByte) || !Number.isSafeInteger(symbol.endByte)
        || symbol.startByte < 0 || symbol.endByte <= symbol.startByte || symbol.endByte > sourceBytes.byteLength) return false;
      try {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        decoder.decode(sourceBytes);
        decoder.decode(sourceBytes.slice(0, symbol.startByte));
        decoder.decode(sourceBytes.slice(0, symbol.endByte));
      } catch {
        return false;
      }
      return createHash('sha256').update(sourceBytes.slice(symbol.startByte, symbol.endByte)).digest('hex')
        === symbol.sourceTextHash;
    };
    const subjectSymbolBound = subjectSymbol.sourceRef === edge.sourceRef
      && subjectSymbol.sourceRevision === edge.sourceRevision
      && subjectSymbol.workspaceRevision === edge.workspaceRevision
      && subjectSourceRevision === edge.sourceRevision
      && symbolBytesMatch(subjectSymbol, candidate.sourceBytes);
    const targetSymbolBound = targetSymbol.sourceRef === edge.objectSourceRef
      && targetSymbol.sourceRevision === edge.objectSourceRevision
      && targetSymbol.workspaceRevision === edge.workspaceRevision
      && targetSourceRevision === edge.objectSourceRevision
      && symbolBytesMatch(targetSymbol, candidate.targetSourceBytes);
    const span = edge.evidenceSpan;
    let spanBoundaryValid = false;
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      decoder.decode(candidate.sourceBytes);
      decoder.decode(candidate.sourceBytes.slice(0, span.startByte));
      decoder.decode(candidate.sourceBytes.slice(0, span.endByte));
      spanBoundaryValid = Number.isSafeInteger(span.startByte)
        && Number.isSafeInteger(span.endByte)
        && span.startByte >= 0
        && span.endByte > span.startByte
        && span.endByte <= candidate.sourceBytes.byteLength;
    } catch {
      spanBoundaryValid = false;
    }
    if (!subjectSymbolBound || !targetSymbolBound || !spanBoundaryValid) {
      reject('GRAPHIFY_EDGE_SOURCE_BYTES_OR_SPAN_MISMATCH');
      continue;
    }
    const sourceNode = packetGraphNodes.get(candidate.sourcePacketKey);
    const targetNode = packetGraphNodes.get(candidate.targetPacketKey);
    const sourceProps = (sourceNode?.properties ?? {}) as Record<string, unknown>;
    const targetProps = (targetNode?.properties ?? {}) as Record<string, unknown>;
    if (!sourceNode || !targetNode
      || sourceProps.sourceRef !== edge.sourceRef
      || sourceProps.sourceRevision !== edge.sourceRevision
      || sourceProps.workspaceRevision !== edge.workspaceRevision
      || targetProps.sourceRef !== edge.objectSourceRef
      || targetProps.sourceRevision !== edge.objectSourceRevision
      || targetProps.workspaceRevision !== edge.workspaceRevision) {
      reject('GRAPHIFY_EDGE_PACKET_BINDING_MISMATCH');
      continue;
    }
    const packetCoversSymbol = (node: NewGraphNodeV2Row, symbol: GraphifySymbolProjectionCandidateV1) => {
      const props = (node.properties ?? {}) as Record<string, unknown>;
      const startByte = props.byteStart;
      const endByte = props.byteEnd;
      return Number.isSafeInteger(startByte) && Number.isSafeInteger(endByte)
        && (startByte as number) <= symbol.startByte
        && (endByte as number) >= symbol.endByte;
    };
    if (!packetCoversSymbol(sourceNode, subjectSymbol) || !packetCoversSymbol(targetNode, targetSymbol)) {
      reject('GRAPHIFY_EDGE_PACKET_SPAN_DOES_NOT_COVER_SYMBOL');
      continue;
    }
    const edgeType = edge.predicate.toUpperCase() as GraphEdge['edgeType'];
    if (!supportedGraphifyPredicates.has(edgeType)) {
      reject('GRAPHIFY_EDGE_PREDICATE_UNSUPPORTED');
      continue;
    }
    if (sourceNode.nodeKey === targetNode.nodeKey) {
      selfLoopCount += 1;
      reject('GRAPHIFY_EDGE_PACKET_SELF_LOOP');
      continue;
    }
    const buildGraphifySymbolNode = (
      symbol: GraphifySymbolProjectionCandidateV1,
      packetKey: string,
      sourceRef: string,
      sourceRevision: string
    ): NewGraphNodeV2Row => {
      const nodeKey = `graphify-symbol:${hashStableRecord({
        stableSymbolKey: symbol.stableSymbolKey,
        packetKey,
        sourceRef,
        sourceRevision,
        workspaceRevision: edge.workspaceRevision,
        graphRevision: candidate.graphRevision,
        startByte: symbol.startByte,
        endByte: symbol.endByte,
        sourceTextHash: symbol.sourceTextHash,
        extractorRevision: symbol.extractorRevision
      })}`;
      const prior = graphifySymbolNodes.get(nodeKey);
      if (prior) return prior;
      const node = parseGraphNode({
        snapshotId,
        nodeKey,
        nodeType: 'symbol',
        packetKey,
        treeNodeId: null,
        sourceRef,
        properties: {
          graphifyStableSymbolKey: symbol.stableSymbolKey,
          upstreamNodeId: symbol.upstreamNodeId,
          sourceRevision,
          workspaceRevision: edge.workspaceRevision,
          graphRevision: candidate.graphRevision,
          byteStart: symbol.startByte,
          byteEnd: symbol.endByte,
          sourceTextHash: symbol.sourceTextHash,
          astFingerprint: symbol.astFingerprint,
          extractorRevision: symbol.extractorRevision,
          materializedFrom: 'graphify_structural_reference',
          canonicalAuthority: false
        }
      });
      graphifySymbolNodes.set(nodeKey, node);
      graphSnapshotNodes.push(node);
      return node;
    };
    const subjectSymbolNode = buildGraphifySymbolNode(subjectSymbol, sourceNode.packetKey!, edge.sourceRef, edge.sourceRevision);
    const targetSymbolNode = buildGraphifySymbolNode(targetSymbol, targetNode.packetKey!, edge.objectSourceRef!, edge.objectSourceRevision!);
    const edgeKey = `graphify:${hashStableRecord({
      referenceId: edge.referenceId,
      sourcePacketKey: candidate.sourcePacketKey,
      targetPacketKey: candidate.targetPacketKey,
      sourceRevision: edge.sourceRevision,
      targetSourceRevision: edge.objectSourceRevision,
      workspaceRevision: edge.workspaceRevision,
      graphRevision: candidate.graphRevision
    })}`;
    addEdge(graphSnapshotEdges, seenEdgeKeys, graphSnapshotExclusions, snapshotId, {
      snapshotId,
      edgeKey,
      sourceNodeKey: sourceNode.nodeKey,
      targetNodeKey: targetNode.nodeKey,
      edgeType,
      weight: edge.confidence,
      confidence: edge.confidence,
      provenance: 'graphify_structural_reference',
      properties: {
        referenceId: edge.referenceId,
        sourceSymbolKey: candidate.sourceSymbolKey,
        targetSymbolKey: candidate.targetSymbolKey,
        subjectSymbolSpan: { startByte: subjectSymbol.startByte, endByte: subjectSymbol.endByte, astFingerprint: subjectSymbol.astFingerprint },
        targetSymbolSpan: { startByte: targetSymbol.startByte, endByte: targetSymbol.endByte, astFingerprint: targetSymbol.astFingerprint },
        sourceRef: edge.sourceRef,
        sourceRevision: edge.sourceRevision,
        targetSourceRef: edge.objectSourceRef,
        targetSourceRevision: edge.objectSourceRevision,
        workspaceRevision: edge.workspaceRevision,
        graphRevision: candidate.graphRevision,
        evidenceKind: edge.evidenceKind,
        evidenceSpan: { ...span },
        evidenceSpanSha256: createHash('sha256').update(candidate.sourceBytes.slice(span.startByte, span.endByte)).digest('hex'),
        evidenceRefs: [...edge.evidenceRefs].sort(),
        canonicalAuthority: false
      }
    });

    const evidenceBytes = candidate.sourceBytes.slice(span.startByte, span.endByte);
    relationCandidates.push({
        relationId: `graphify-nary:${hashStableRecord({
          referenceId: edge.referenceId,
          sourcePacketKey: candidate.sourcePacketKey,
          subjectNodeKey: subjectSymbolNode.nodeKey,
          targetSymbolNodeKey: targetSymbolNode.nodeKey,
          targetPacketKey: candidate.targetPacketKey,
          sourceRevision: edge.sourceRevision,
          targetSourceRevision: edge.objectSourceRevision,
          workspaceRevision: edge.workspaceRevision,
          graphRevision: candidate.graphRevision
        })}`,
        relationType: edgeType,
        sourceRef: edge.sourceRef,
        sourceRevision: edge.sourceRevision,
        workspaceRevision: edge.workspaceRevision,
        confidence: edge.confidence,
        sourceSpan: {
          coordinateSystem: 'utf8-byte',
          startByte: span.startByte,
          endByte: span.endByte,
          nodeContentSha256: `sha256:${createHash('sha256').update(evidenceBytes).digest('hex')}`,
          producerId: 'graphify_structural_reference',
          producerRevision: subjectSymbol.extractorRevision,
          evidenceRefs: [...new Set([...edge.evidenceRefs, `reference:${edge.referenceId}`])].sort()
        },
        participants: [
          { nodeKey: sourceNode.nodeKey, role: 'CALLER_PACKET', ordinal: 0 },
          { nodeKey: subjectSymbolNode.nodeKey, role: 'CALLER_AST_SYMBOL', ordinal: 1 },
          { nodeKey: targetSymbolNode.nodeKey, role: 'CALLEE_AST_SYMBOL', ordinal: 2 },
          { nodeKey: targetNode.nodeKey, role: 'CALLEE_PACKET', ordinal: 3 }
        ]
      });
  }

  const includedNodes = [...graphSnapshotNodes].sort((left, right) => left.nodeKey.localeCompare(right.nodeKey));
  const includedEdges = [...graphSnapshotEdges].sort((left, right) => left.edgeKey.localeCompare(right.edgeKey));

  const materializedNodes = includedNodes.map((node) => parseGraphNode(node));
  const materializedEdges = includedEdges.map((edge) => parseGraphEdge(edge));
  const nodesByKey = new Map(materializedNodes.map((node) => [node.nodeKey, node]));
  const seenCandidateRelationIds = new Set<string>();
  for (const tupleCandidate of input.ontologyTupleCandidates ?? []) {
    const adapted = buildGraphSnapshotRelationCandidateFromTupleV1({
      ...tupleCandidate,
      nodes: materializedNodes
    });
    if (!adapted.candidate) {
      graphSnapshotExclusions.push(buildExclusion(snapshotId, 'relation_materialization', adapted.reason, {
        candidateKey: `nary:${tupleCandidate.tuple.tupleId}`,
        packetKey: tupleCandidate.tuple.packetKey ?? null,
        sourceRef: tupleCandidate.tuple.sourceRef,
        evidence: { tupleId: tupleCandidate.tuple.tupleId, reason: adapted.reason }
      }));
      continue;
    }
    relationCandidates.push(adapted.candidate);
  }

  for (const candidate of relationCandidates.sort((a, b) => a.relationId.localeCompare(b.relationId))) {
    const reject = (reason: string, evidence: Record<string, unknown>) => {
      graphSnapshotExclusions.push(buildExclusion(snapshotId, 'relation_materialization', reason, {
        candidateKey: candidate.relationId,
        sourceRef: candidate.sourceRef,
        evidence: { relationId: candidate.relationId, ...evidence }
      }));
    };
    if (seenCandidateRelationIds.has(candidate.relationId)) {
      reject('DUPLICATE_RELATION_ID', {});
      continue;
    }
    seenCandidateRelationIds.add(candidate.relationId);
    if (!/^sha256:[a-f0-9]{64}$/i.test(candidate.sourceRevision)
      || !/^sha256:[a-f0-9]{64}$/i.test(candidate.workspaceRevision)
      || candidate.workspaceRevision !== (input.workspaceRevision ?? null)) {
      reject('RELATION_REVISION_UNQUALIFIED', {
        sourceRevision: candidate.sourceRevision,
        relationWorkspaceRevision: candidate.workspaceRevision,
        snapshotWorkspaceRevision: input.workspaceRevision ?? null
      });
      continue;
    }
    const span = candidate.sourceSpan;
    if (span.coordinateSystem !== 'utf8-byte'
      || !Number.isSafeInteger(span.startByte) || span.startByte < 0
      || !Number.isSafeInteger(span.endByte) || span.endByte <= span.startByte
      || !/^sha256:[a-f0-9]{64}$/i.test(span.nodeContentSha256)
      || !span.producerId || !span.producerRevision
      || Boolean(span.parserId) !== Boolean(span.parserVersion)
      || !Array.isArray(span.evidenceRefs) || span.evidenceRefs.length === 0
      || span.evidenceRefs.some((ref) => typeof ref !== 'string' || ref.trim().length === 0)) {
      reject('RELATION_SOURCE_SPAN_UNQUALIFIED', {});
      continue;
    }
    const participants = [...candidate.participants].sort((a, b) => a.ordinal - b.ordinal
      || a.role.localeCompare(b.role) || a.nodeKey.localeCompare(b.nodeKey));
    const distinctNodeKeys = new Set(participants.map((participant) => participant.nodeKey));
    if (participants.length < 3 || distinctNodeKeys.size < 3
      || participants.some((participant) => !participant.nodeKey || !participant.role
        || !Number.isSafeInteger(participant.ordinal) || participant.ordinal < 0)
      || new Set(participants.map((participant) => participant.ordinal)).size !== participants.length) {
      reject('RELATION_ARITY_OR_PARTICIPANTS_INVALID', { participantCount: participants.length });
      continue;
    }
    const participantNodes = participants.map((participant) => nodesByKey.get(participant.nodeKey));
    const sourceNode = participantNodes.find((node) => node?.sourceRef === candidate.sourceRef
      && node.properties.sourceRevision === candidate.sourceRevision
      && node.properties.workspaceRevision === candidate.workspaceRevision);
    const revisionsQualified = participantNodes.every((node) => node?.packetKey
      && node.sourceRef
      && typeof node.properties.sourceRevision === 'string'
      && /^sha256:[a-f0-9]{64}$/i.test(node.properties.sourceRevision)
      && node.properties.workspaceRevision === candidate.workspaceRevision);
    if (!sourceNode || !revisionsQualified) {
      reject('RELATION_PARTICIPANT_IDENTITY_UNQUALIFIED', {
        participantNodeKeys: participants.map((participant) => participant.nodeKey),
        sourceAnchorFound: Boolean(sourceNode),
        allParticipantsPacketBound: participantNodes.every((node) => Boolean(node?.packetKey))
      });
      continue;
    }
    graphSnapshotRelationEvents.push({
      snapshotId,
      relationId: candidate.relationId,
      relationType: candidate.relationType,
      sourceRef: candidate.sourceRef,
      evidenceSpan: JSON.stringify({
        sourceRevision: candidate.sourceRevision,
        workspaceRevision: candidate.workspaceRevision,
        ...span,
        evidenceRefs: [...span.evidenceRefs].sort()
      }),
      confidence: candidate.confidence,
      topologyHash: ''
    });
    for (const participant of participants) {
      graphSnapshotRelationParticipants.push({ snapshotId, relationId: candidate.relationId, ...participant });
    }
  }

  const includedTopologyHash = topologyHash(
    materializedNodes,
    materializedEdges,
    graphSnapshotRelationEvents as GraphRelationEvent[],
    graphSnapshotRelationParticipants as GraphRelationParticipant[]
  );
  for (const relation of graphSnapshotRelationEvents) relation.topologyHash = includedTopologyHash;
  validateGraphSnapshotIdentity({
    snapshotId,
    nodes: materializedNodes,
    edges: materializedEdges,
    relationEvents: graphSnapshotRelationEvents as GraphRelationEvent[],
    relationParticipants: graphSnapshotRelationParticipants as GraphRelationParticipant[]
  });
  const replayedTopologyHash = topologyHash(
    materializedNodes.map((node) => ({ ...node })),
    materializedEdges.map((edge) => ({ ...edge })),
    graphSnapshotRelationEvents as GraphRelationEvent[],
    graphSnapshotRelationParticipants as GraphRelationParticipant[]
  );

  const sourceInventoryHash = hashStableRecord({
    snapshotId,
    workspaceId,
    workspaceRevision: input.workspaceRevision ?? null,
    sourceInventorySnapshotId,
    identityContractVersion,
    parserContractVersion,
    treeNodes: sortedTreeNodes.map((treeNode) => normalizeTreeNode(treeNode)),
    packets: sortedPackets.map((packet) => normalizePacket(packet)),
    relationCandidates: relationCandidates.map((candidate) => ({
      ...candidate,
      sourceSpan: { ...candidate.sourceSpan, evidenceRefs: [...candidate.sourceSpan.evidenceRefs].sort() },
      participants: [...candidate.participants].sort((a, b) => a.ordinal - b.ordinal
        || a.role.localeCompare(b.role) || a.nodeKey.localeCompare(b.nodeKey))
    })).sort((a, b) => a.relationId.localeCompare(b.relationId)),
    ontologyTupleCandidates: [...(input.ontologyTupleCandidates ?? [])]
      .map((candidate) => ({
        tuple: candidate.tuple,
        proposal: candidate.proposal,
        sourceSpanProof: (() => {
          const { sourceBytes, ...proofMetadata } = candidate.sourceSpanProof;
          return {
            ...proofMetadata,
            sourceBytesSha256: `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`
          };
        })()
      }))
      .sort((a, b) => a.tuple.tupleId.localeCompare(b.tuple.tupleId)),
    graphifyPacketEdgeCandidates: [...(input.graphifyPacketEdgeCandidates ?? [])]
      .map((candidate) => ({
        edge: candidate.edge,
        subjectSymbol: candidate.subjectSymbol,
        targetSymbol: candidate.targetSymbol,
        sourcePacketKey: candidate.sourcePacketKey,
        targetPacketKey: candidate.targetPacketKey,
        sourceSymbolKey: candidate.sourceSymbolKey,
        targetSymbolKey: candidate.targetSymbolKey,
        graphRevision: candidate.graphRevision,
        sourceBytesSha256: createHash('sha256').update(candidate.sourceBytes).digest('hex'),
        targetSourceBytesSha256: createHash('sha256').update(candidate.targetSourceBytes).digest('hex')
      }))
      .sort((a, b) => a.edge.referenceId.localeCompare(b.edge.referenceId)
        || a.sourcePacketKey.localeCompare(b.sourcePacketKey)
        || a.targetPacketKey.localeCompare(b.targetPacketKey)),
    edgeOrientationPolicy,
    duplicateEdgePolicy,
    selfLoopPolicy
  });

  const policyHash = hashStableRecord({
    relationshipTypes,
    edgeOrientationPolicy,
    duplicateEdgePolicy,
    selfLoopPolicy,
    ...(relationCandidates.length ? { relationAdmission: 'packet-bound-source-span-nary-v1' } : {}),
    ...(input.graphifyPacketEdgeCandidates?.length ? { graphifyEdgeAdmission: 'packet-bound-source-span-binary-v1' } : {})
  });

  const graphSnapshotManifest: GraphSnapshotManifest = {
    snapshotId,
    workspaceId,
    workspaceRevision: input.workspaceRevision ?? null,
    sourceInventorySnapshotId,
    identityContractVersion,
    parserContractVersion,
    nodeCount: includedNodes.length,
    edgeCount: includedEdges.length,
    relationEventCount: graphSnapshotRelationEvents.length,
    excludedNodeCount: graphSnapshotExclusions.filter((item) => item.exclusionStage === 'node_materialization').length,
    excludedEdgeCount: graphSnapshotExclusions.filter((item) => item.exclusionStage === 'edge_materialization').length,
    excludedRelationCount: graphSnapshotExclusions.filter((item) => item.exclusionStage === 'relation_materialization').length,
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
      workspaceRevision: input.workspaceRevision ?? null,
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
    relationEventCount: graphSnapshotRelationEvents.length,
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
  const relationRejectionCounts: Record<string, number> = {};
  for (const exclusion of graphSnapshotExclusions) {
    if (exclusion.exclusionStage !== 'relation_materialization') continue;
    relationRejectionCounts[exclusion.exclusionReason] = (relationRejectionCounts[exclusion.exclusionReason] ?? 0) + 1;
  }

  const graphSnapshotProof: GraphSnapshotProof = {
    snapshotId,
    rejectionCounts,
    relationRejectionCounts,
    sourceInventoryHash,
    policyHash,
    topologyHash: includedTopologyHash,
    replayedTopologyHash,
    replayMatches: includedTopologyHash === replayedTopologyHash,
    eligibleNodeCount: includedNodes.length,
    persistedNodeCount: includedNodes.length,
    eligibleEdgeCount: includedEdges.length,
    persistedEdgeCount: includedEdges.length,
    eligibleRelationCount: relationCandidates.length,
    persistedRelationCount: graphSnapshotRelationEvents.length,
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
    graphSnapshotRelationEvents,
    graphSnapshotRelationParticipants,
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

function normalizeTreeNode(node: Pick<GraphSnapshotMaterializerInput['treeNodes'][number], 'nodeId' | 'parentId' | 'rootId' | 'pageIndexPath' | 'nodeType' | 'treeDepth' | 'sourceRef' | 'sourceRevision' | 'filePath' | 'packetKey' | 'featureId' | 'title' | 'summary' | 'contentPreview' | 'domain' | 'somCluster' | 'communityId' | 'metadata' | 'ledgerType' | 'lineageVersion'>) {
  return {
    nodeId: node.nodeId,
    parentId: node.parentId ?? null,
    rootId: node.rootId,
    pageIndexPath: node.pageIndexPath,
    nodeType: node.nodeType,
    treeDepth: node.treeDepth,
    sourceRef: node.sourceRef,
    sourceRevision: node.sourceRevision ?? null,
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

function normalizePacket(node: Pick<GraphSnapshotMaterializerInput['packets'][number], 'packetKey' | 'sourceRef' | 'canonicalSourceRef' | 'directoryPath' | 'filePath' | 'functionSymbol' | 'featureId' | 'featureLabel' | 'titleId' | 'communityId' | 'clusterId' | 'sha256' | 'sourceRevision' | 'byteStart' | 'byteEnd' | 'sourceKind' | 'sourcePath' | 'topology' | 'vectors' | 'metadata' | 'domainClass' | 'tags' | 'lineageVersion' | 'ledgerType' | 'canonical' | 'treeNodeId' | 'qdrantCollection' | 'qdrantVectorDim'>) {
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
    byteStart: node.byteStart ?? null,
    byteEnd: node.byteEnd ?? null,
    sourceRevision: node.sourceRevision ?? null,
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
