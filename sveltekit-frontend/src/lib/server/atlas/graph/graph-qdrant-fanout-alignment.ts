export interface GraphQdrantFanoutAlignmentInput {
  packetKey: string;
  sourceRef?: string | null;
  treeNodeId?: string | null;
  workspaceRevision: string;
  graphRevision: string;
  qdrantPayload: Record<string, unknown> | null;
}

export interface GraphQdrantFanoutAlignmentResult {
  canonicalIdentityMatch: boolean;
  workspaceRevisionAligned: boolean;
  graphRevisionAligned: boolean;
  semanticRepresentationAligned: boolean;
  qdrantPayloadPresent: boolean;
  status: 'ALIGNED' | 'LINEAGE_GAP' | 'IDENTITY_MISMATCH' | 'MISSING_PROJECTION';
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function evaluateGraphQdrantFanoutAlignment(
  input: GraphQdrantFanoutAlignmentInput,
): GraphQdrantFanoutAlignmentResult {
  const payload = input.qdrantPayload;
  if (!payload) {
    return {
      canonicalIdentityMatch: false,
      workspaceRevisionAligned: false,
      graphRevisionAligned: false,
      semanticRepresentationAligned: false,
      qdrantPayloadPresent: false,
      status: 'MISSING_PROJECTION',
    };
  }

  const payloadPacketKey = text(payload.packet_key);
  const payloadSourceRef = text(payload.source_ref);
  const payloadTreeNodeId = text(payload.tree_node_id);
  const canonicalIdentityMatch =
    (!payloadPacketKey || payloadPacketKey === input.packetKey) &&
    (!input.sourceRef || !payloadSourceRef || payloadSourceRef === input.sourceRef) &&
    (!input.treeNodeId || !payloadTreeNodeId || payloadTreeNodeId === input.treeNodeId) &&
    Boolean(payloadPacketKey || payloadSourceRef || payloadTreeNodeId);
  const workspaceRevisionAligned = text(payload.workspace_revision) === input.workspaceRevision;
  const graphRevisionAligned = text(payload.graph_revision) === input.graphRevision;
  const semanticRepresentationAligned =
    text(payload.representation_id) === 'semantic_768' &&
    Number(payload.embedding_dimension ?? payload.qdrant_vector_dim) === 768;

  const status = !canonicalIdentityMatch
    ? 'IDENTITY_MISMATCH'
    : !workspaceRevisionAligned || !graphRevisionAligned || !semanticRepresentationAligned
      ? 'LINEAGE_GAP'
      : 'ALIGNED';

  return {
    canonicalIdentityMatch,
    workspaceRevisionAligned,
    graphRevisionAligned,
    semanticRepresentationAligned,
    qdrantPayloadPresent: true,
    status,
  };
}
