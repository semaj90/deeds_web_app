/**
 * Repository search identity mapping.
 *
 * Canonical identity is supplied by Atlas/Postgres fields. UUIDs and ULIDs are
 * accepted as opaque storage/projection identifiers only; this mapper never
 * invents a canonical identity from a Qdrant point ID.
 */

export type IdentityResolutionSource =
  | 'symbol_version_id'
  | 'packet_key'
  | 'content_hash'
  | 'source_ref'
  | 'lane_id_fallback';

type IdentityResolutionStatus = 'canonical' | 'degraded';

export type SearchProjectionKind = 'qdrant' | 'pgvector' | 'graph' | 'none';

export interface RepoSearchIdentityInput {
  repositoryId?: string | null;
  symbolVersionId?: string | null;
  packetKey?: string | null;
  contentHash?: string | null;
  sourceRef?: string | null;
  canonicalSourceRef?: string | null;
  workspaceRevision?: string | null;
  sourceRevision?: string | null;
  representationId?: string | null;
  representationRevision?: string | number | null;
  projectionId?: string | number | null;
  projectionKind?: SearchProjectionKind;
}

export interface RepoSearchIdentityV1 {
  schema: 'atlas.repo-search-identity.v1';
  repositoryId: string | null;
  canonicalId: string | null;
  identityResolutionSource: IdentityResolutionSource | null;
  identityResolutionStatus: IdentityResolutionStatus | 'unresolved';
  packetKey: string | null;
  symbolVersionId: string | null;
  sourceRef: string | null;
  canonicalSourceRef: string | null;
  contentHash: string | null;
  workspaceRevision: string | null;
  sourceRevision: string | null;
  representationId: string | null;
  representationRevision: string | null;
  projectionId: string | null;
  projectionKind: SearchProjectionKind;
}

function clean(value: unknown): string | null {
  const result = String(value ?? '').trim();
  return result || null;
}

function resolveIdentity(input: {
  symbolVersionId: string | null;
  packetKey: string | null;
  contentHash: string | null;
  sourceRef: string | null;
  fallbackId: string;
}): { canonicalId: string; source: IdentityResolutionSource; status: IdentityResolutionStatus } {
  if (input.symbolVersionId) return { canonicalId: input.symbolVersionId, source: 'symbol_version_id', status: 'canonical' };
  if (input.packetKey) return { canonicalId: input.packetKey, source: 'packet_key', status: 'canonical' };
  if (input.contentHash) return { canonicalId: input.contentHash, source: 'content_hash', status: 'canonical' };
  if (input.sourceRef) return { canonicalId: input.sourceRef, source: 'source_ref', status: 'canonical' };
  return { canonicalId: input.fallbackId, source: 'lane_id_fallback', status: 'degraded' };
}

/**
 * Maps a Go/Qdrant/Postgres search hit into one identity envelope.
 *
 * The canonical source reference wins over a raw source reference when both
 * are present. A projection ID is retained for hydration/debugging only.
 */
export function mapRepoSearchIdentityV1(input: RepoSearchIdentityInput): RepoSearchIdentityV1 {
  const symbolVersionId = clean(input.symbolVersionId);
  const packetKey = clean(input.packetKey);
  const contentHash = clean(input.contentHash);
  const sourceRef = clean(input.sourceRef);
  const canonicalSourceRef = clean(input.canonicalSourceRef) ?? sourceRef;
  const projectionId = clean(input.projectionId);
  const resolved = resolveIdentity({
    symbolVersionId,
    packetKey,
    contentHash,
    sourceRef: canonicalSourceRef,
    fallbackId: projectionId ?? '',
  });
  const hasCanonicalIdentity = Boolean(symbolVersionId || packetKey || contentHash || canonicalSourceRef);

  return {
    schema: 'atlas.repo-search-identity.v1',
    repositoryId: clean(input.repositoryId),
    canonicalId: hasCanonicalIdentity ? resolved.canonicalId : null,
    identityResolutionSource: hasCanonicalIdentity ? resolved.source : null,
    identityResolutionStatus: hasCanonicalIdentity ? resolved.status : 'unresolved',
    packetKey,
    symbolVersionId,
    sourceRef,
    canonicalSourceRef,
    contentHash,
    workspaceRevision: clean(input.workspaceRevision),
    sourceRevision: clean(input.sourceRevision),
    representationId: clean(input.representationId),
    representationRevision: clean(input.representationRevision),
    projectionId,
    projectionKind: input.projectionKind ?? (projectionId ? 'qdrant' : 'none'),
  };
}
