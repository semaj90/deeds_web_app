export interface GraphQdrantFanoutAlignmentInput {
  packetKey: string;
  canonicalId?: string | null;
  symbolVersionId?: string | null;
  sourceRef?: string | null;
  treeNodeId?: string | null;
  sourceRevision?: string | null;
  workspaceWorldRevision: string;
  graphRevision: string;
  representationRevision?: string | number | null;
  qdrantPayload: Record<string, unknown> | null;
}

export interface GraphQdrantFanoutAlignmentResult {
  canonicalIdentityMatch: boolean;
  strongIdentityEvidence: 'CANONICAL_ID' | 'SYMBOL_VERSION_ID' | 'PACKET_KEY' | null;
  sourceRefCorroborated: boolean;
  treeNodeIdCorroborated: boolean;
  sourceRevisionAligned: boolean;
  workspaceWorldRevisionAligned: boolean;
  graphRevisionAligned: boolean;
  semanticRepresentationAligned: boolean;
  representationRevisionAligned: boolean;
  qdrantPayloadPresent: boolean;
  repositoryRevisionObserved: string | null;
  legacyWorkspaceCacheRevisionObserved: string | null;
  status: 'ALIGNED' | 'LINEAGE_GAP' | 'IDENTITY_MISMATCH' | 'MISSING_PROJECTION';
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function comparableRevision(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return text(value);
}

function contradicts(expected: string | null | undefined, observed: string | null): boolean {
  return Boolean(expected && observed && expected !== observed);
}

/**
 * Qdrant is a retrieval projection, never identity or revision authority.
 *
 * Admission requires one matching strong canonical identity coordinate plus
 * exact logical workspace/source/graph/representation lineage. source_ref and
 * tree_node_id may corroborate or contradict but never mint identity.
 *
 * Revision namespaces are intentionally non-interchangeable:
 * - workspace_world_revision: WorkspaceRevisionRecordV1 logical world state;
 * - repository_revision: Git provenance only;
 * - workspace_revision/workspace_cache_revision: legacy cache epoch only.
 */
export function evaluateGraphQdrantFanoutAlignment(
  input: GraphQdrantFanoutAlignmentInput,
): GraphQdrantFanoutAlignmentResult {
  const payload = input.qdrantPayload;
  if (!payload) {
    return {
      canonicalIdentityMatch: false,
      strongIdentityEvidence: null,
      sourceRefCorroborated: false,
      treeNodeIdCorroborated: false,
      sourceRevisionAligned: false,
      workspaceWorldRevisionAligned: false,
      graphRevisionAligned: false,
      semanticRepresentationAligned: false,
      representationRevisionAligned: false,
      qdrantPayloadPresent: false,
      repositoryRevisionObserved: null,
      legacyWorkspaceCacheRevisionObserved: null,
      status: 'MISSING_PROJECTION',
    };
  }

  const payloadCanonicalId = text(payload.canonical_id);
  const payloadSymbolVersionId = text(payload.symbol_version_id);
  const payloadPacketKey = text(payload.packet_key);
  const payloadSourceRef = text(payload.source_ref);
  const payloadTreeNodeId = text(payload.tree_node_id);

  const canonicalIdMatches = Boolean(input.canonicalId && payloadCanonicalId === input.canonicalId);
  const symbolVersionIdMatches = Boolean(input.symbolVersionId && payloadSymbolVersionId === input.symbolVersionId);
  const packetKeyMatches = Boolean(input.packetKey && payloadPacketKey === input.packetKey);

  const strongIdentityEvidence = canonicalIdMatches
    ? 'CANONICAL_ID' as const
    : symbolVersionIdMatches
      ? 'SYMBOL_VERSION_ID' as const
      : packetKeyMatches
        ? 'PACKET_KEY' as const
        : null;

  const identityContradiction =
    contradicts(input.canonicalId, payloadCanonicalId) ||
    contradicts(input.symbolVersionId, payloadSymbolVersionId) ||
    contradicts(input.packetKey, payloadPacketKey) ||
    contradicts(input.sourceRef, payloadSourceRef) ||
    contradicts(input.treeNodeId, payloadTreeNodeId);

  const canonicalIdentityMatch = Boolean(strongIdentityEvidence) && !identityContradiction;
  const sourceRefCorroborated = Boolean(input.sourceRef && payloadSourceRef === input.sourceRef);
  const treeNodeIdCorroborated = Boolean(input.treeNodeId && payloadTreeNodeId === input.treeNodeId);
  const workspaceWorldRevisionAligned = text(payload.workspace_world_revision) === input.workspaceWorldRevision;
  const graphRevisionAligned = text(payload.graph_revision) === input.graphRevision;
  const sourceRevisionAligned = input.sourceRevision
    ? text(payload.source_revision) === input.sourceRevision
    : false;
  const semanticRepresentationAligned =
    text(payload.representation_id) === 'semantic_768' &&
    Number(payload.embedding_dimension ?? payload.qdrant_vector_dim) === 768;
  const representationRevisionAligned = input.representationRevision !== null && input.representationRevision !== undefined
    ? comparableRevision(payload.representation_revision) === comparableRevision(input.representationRevision)
    : comparableRevision(payload.representation_revision) !== null;

  const status = !canonicalIdentityMatch
    ? 'IDENTITY_MISMATCH'
    : !workspaceWorldRevisionAligned
      || !graphRevisionAligned
      || !sourceRevisionAligned
      || !semanticRepresentationAligned
      || !representationRevisionAligned
      ? 'LINEAGE_GAP'
      : 'ALIGNED';

  return {
    canonicalIdentityMatch,
    strongIdentityEvidence,
    sourceRefCorroborated,
    treeNodeIdCorroborated,
    sourceRevisionAligned,
    workspaceWorldRevisionAligned,
    graphRevisionAligned,
    semanticRepresentationAligned,
    representationRevisionAligned,
    qdrantPayloadPresent: true,
    repositoryRevisionObserved: text(payload.repository_revision),
    legacyWorkspaceCacheRevisionObserved: comparableRevision(
      payload.workspace_cache_revision ?? payload.workspace_revision,
    ),
    status,
  };
}
