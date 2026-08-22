export interface GraphQdrantFanoutAlignmentInput {
  packetKey: string;
  canonicalId?: string | null;
  symbolVersionId?: string | null;
  sourceRef?: string | null;
  treeNodeId?: string | null;
  sourceRevision?: string | null;
  workspaceRevision: string;
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
  repositoryRevisionAligned: boolean;
  /** @deprecated Alias for repositoryRevisionAligned; retained for existing report consumers. */
  workspaceRevisionAligned: boolean;
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
 * Qdrant is a projection, not identity authority.
 *
 * Admission requires at least one matching strong identity coordinate shared
 * with the canonical graph/Postgres evidence. source_ref and tree_node_id may
 * corroborate or contradict the match but can never prove canonical identity by
 * themselves. Qdrant point IDs are intentionally absent from this contract.
 *
 * Revision semantics are intentionally split:
 * - GraphSnapshotRevisionV1.workspaceRevision is a repository/Git code-world
 *   coordinate and MUST match payload.repository_revision.
 * - payload.workspace_revision / workspace_cache_revision are historical
 *   integer packet/cache epochs and MUST NOT satisfy this gate.
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
      repositoryRevisionAligned: false,
      workspaceRevisionAligned: false,
      graphRevisionAligned: false,
      semanticRepresentationAligned: false,
      representationRevisionAligned: false,
      qdrantPayloadPresent: false,
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
  const repositoryRevisionAligned = text(payload.repository_revision) === input.workspaceRevision;
  const workspaceRevisionAligned = repositoryRevisionAligned;
  const legacyWorkspaceCacheRevisionObserved = comparableRevision(
    payload.workspace_cache_revision ?? payload.workspace_revision,
  );
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
    : !repositoryRevisionAligned
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
    repositoryRevisionAligned,
    workspaceRevisionAligned,
    graphRevisionAligned,
    semanticRepresentationAligned,
    representationRevisionAligned,
    qdrantPayloadPresent: true,
    legacyWorkspaceCacheRevisionObserved,
    status,
  };
}
