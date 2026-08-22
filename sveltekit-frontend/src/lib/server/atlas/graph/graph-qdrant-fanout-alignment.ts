export interface GraphQdrantFanoutAlignmentInput {
  packetKey: string;
  canonicalId?: string | null;
  symbolVersionId?: string | null;
  sourceRef?: string | null;
  treeNodeId?: string | null;
  sourceRevision?: string | null;
  /** Canonical WorkspaceRevisionRecordV1 identity: sha256:<source manifest>. */
  workspaceRevision: string;
  /** Optional Git commit/tree provenance coordinate; never workspace authority. */
  repositoryRevision?: string | null;
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
  workspaceRevisionAligned: boolean;
  repositoryRevisionAligned: boolean;
  graphRevisionAligned: boolean;
  semanticRepresentationAligned: boolean;
  representationRevisionAligned: boolean;
  qdrantPayloadPresent: boolean;
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
 * Qdrant is a projection, not identity/revision authority.
 *
 * Revision coordinates are deliberately separate:
 * - payload.workspace_revision MUST equal WorkspaceRevisionRecordV1.workspaceRevision.
 * - payload.repository_revision MAY carry Git provenance and is checked only
 *   when an expected repositoryRevision is supplied.
 * - payload.workspace_cache_revision is a legacy numeric/cache epoch and never
 *   satisfies workspace revision authority.
 */
export function evaluateGraphQdrantFanoutAlignment(input: GraphQdrantFanoutAlignmentInput): GraphQdrantFanoutAlignmentResult {
  const payload = input.qdrantPayload;
  if (!payload) {
    return {
      canonicalIdentityMatch: false, strongIdentityEvidence: null,
      sourceRefCorroborated: false, treeNodeIdCorroborated: false,
      sourceRevisionAligned: false, workspaceRevisionAligned: false,
      repositoryRevisionAligned: false, graphRevisionAligned: false,
      semanticRepresentationAligned: false, representationRevisionAligned: false,
      qdrantPayloadPresent: false, legacyWorkspaceCacheRevisionObserved: null,
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
    : symbolVersionIdMatches ? 'SYMBOL_VERSION_ID' as const
      : packetKeyMatches ? 'PACKET_KEY' as const : null;
  const identityContradiction =
    contradicts(input.canonicalId, payloadCanonicalId) ||
    contradicts(input.symbolVersionId, payloadSymbolVersionId) ||
    contradicts(input.packetKey, payloadPacketKey) ||
    contradicts(input.sourceRef, payloadSourceRef) ||
    contradicts(input.treeNodeId, payloadTreeNodeId);

  const canonicalIdentityMatch = Boolean(strongIdentityEvidence) && !identityContradiction;
  const sourceRefCorroborated = Boolean(input.sourceRef && payloadSourceRef === input.sourceRef);
  const treeNodeIdCorroborated = Boolean(input.treeNodeId && payloadTreeNodeId === input.treeNodeId);
  // payload.repository_revision is the legacy Qdrant field name that now carries the
  // canonical WorkspaceRevisionRecordV1 proof; payload.workspace_revision/workspace_cache_revision
  // are legacy numeric cache epochs and never satisfy workspace revision authority.
  const workspaceRevisionAligned = text(payload.repository_revision) === input.workspaceRevision;
  const repositoryRevisionAligned = input.repositoryRevision
    ? text(payload.repository_revision) === input.repositoryRevision
    : text(payload.repository_revision) === input.workspaceRevision;
  const legacyWorkspaceCacheRevisionObserved = comparableRevision(payload.workspace_cache_revision);
  const graphRevisionAligned = text(payload.graph_revision) === input.graphRevision;
  const sourceRevisionAligned = input.sourceRevision ? text(payload.source_revision) === input.sourceRevision : false;
  const semanticRepresentationAligned =
    text(payload.representation_id) === 'semantic_768' &&
    Number(payload.embedding_dimension ?? payload.qdrant_vector_dim) === 768;
  const representationRevisionAligned = input.representationRevision !== null && input.representationRevision !== undefined
    ? comparableRevision(payload.representation_revision) === comparableRevision(input.representationRevision)
    : comparableRevision(payload.representation_revision) !== null;

  const status = !canonicalIdentityMatch
    ? 'IDENTITY_MISMATCH'
    : !workspaceRevisionAligned
      || !repositoryRevisionAligned
      || !graphRevisionAligned
      || !sourceRevisionAligned
      || !semanticRepresentationAligned
      || !representationRevisionAligned
      ? 'LINEAGE_GAP'
      : 'ALIGNED';

  return {
    canonicalIdentityMatch, strongIdentityEvidence,
    sourceRefCorroborated, treeNodeIdCorroborated,
    sourceRevisionAligned, workspaceRevisionAligned, repositoryRevisionAligned,
    graphRevisionAligned, semanticRepresentationAligned, representationRevisionAligned,
    qdrantPayloadPresent: true, legacyWorkspaceCacheRevisionObserved, status,
  };
}
