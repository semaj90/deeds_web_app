/**
 * Shared canonical identity resolution primitive.
 *
 * Extracted from the proven, tested precedence in `rrf-integration.ts`
 * (`resolveCanonicalCandidateId`/`normalizeCanonicalIdentity`). This module has no dependency on
 * any specific candidate/hit shape — callers adapt their own fields into `IdentityResolutionInput`
 * so both `rrf-integration.ts`'s `ContextHit` and `search-runtime.ts`'s `Candidate` (and any
 * future fusion owner migrated onto this boundary) can share one precedence rule instead of each
 * reimplementing it.
 *
 * Canonical rule: Postgres/atlas identity (symbol_version_id, packet_key, source_ref) is truth.
 * Qdrant point IDs, TurboVec candidate IDs, and other backend-local lane IDs are projections, not
 * identity — they are only used as a last-resort fallback, and that fallback is always marked
 * `status: 'degraded'` so callers can observe it rather than silently trusting it as canonical.
 */

export type IdentityResolutionSource =
  | 'symbol_version_id'
  | 'packet_key'
  | 'content_hash'
  | 'source_ref'
  | 'lane_id_fallback';

export interface ResolvedIdentity {
  canonicalId: string;
  source: IdentityResolutionSource;
  status: 'canonical' | 'projection_exact' | 'source_group' | 'degraded';
}

export interface IdentityResolutionInput {
  symbolVersionId?: string | null;
  packetKey?: string | null;
  /**
   * Chunk-level content hash. NOT part of the original 3-field canonical model
   * (symbol_version_id/packet_key/source_ref) — added 2026-08-08 after a live trace against
   * `codebase_chunks_768_v2` found `source_ref` is NOT chunk-unique at this collection's
   * granularity (23 distinct chunks of one file sharing one `source_ref`, confirmed live).
   * Resolving before `source_ref` closes that over-merge risk for any collection storing
   * multiple chunks per file. A content hash is a weaker identity guarantee than a real symbol/
   * packet identity (it changes when content changes, so it won't dedupe across revisions of
   * the same logical chunk) — it sits below packet_key precisely because of that.
   */
  contentHash?: string | null;
  sourceRef?: string | null;
  /** The backend-local id (Qdrant point id, TurboVec candidate id, etc.) used only as last resort. */
  fallbackId: string;
}

/**
 * Resolve canonical identity with precedence symbol_version_id -> packet_key -> content_hash ->
 * source_ref -> lane-local fallback. Symbol and packet IDs are canonical; content hashes are
 * exact projection evidence; source refs are grouping evidence. The fallback tier is degraded.
 */
export function resolveCanonicalIdentity(input: IdentityResolutionInput): ResolvedIdentity {
  const symbolVersionId = input.symbolVersionId?.trim();
  if (symbolVersionId) {
    return { canonicalId: symbolVersionId, source: 'symbol_version_id', status: 'canonical' };
  }
  const packetKey = input.packetKey?.trim();
  if (packetKey) {
    return { canonicalId: packetKey, source: 'packet_key', status: 'canonical' };
  }
  const contentHash = input.contentHash?.trim();
  if (contentHash) {
    return { canonicalId: contentHash, source: 'content_hash', status: 'projection_exact' };
  }
  const sourceRef = input.sourceRef?.trim();
  if (sourceRef) {
    return { canonicalId: sourceRef, source: 'source_ref', status: 'source_group' };
  }
  return { canonicalId: input.fallbackId, source: 'lane_id_fallback', status: 'degraded' };
}

/**
 * RF-IDENTITY-SEMANTICS-02 (contract correction, additive on top of the `status` broadening
 * above). This adds the two pieces that broadening `ResolvedIdentity.status` alone doesn't cover:
 *
 * 1. `canonical_chunk_id` as its own CANONICAL tier -- consumed only when the caller supplies it
 *    from proven packet<->chunk ProjectionRegistryV1/lineage hydration (e.g. a
 *    `PacketChunkMembershipV1` row read live from Postgres). This resolver NEVER reconstructs one
 *    from a hash, source path, AST range, Qdrant point ID, or file grouping -- if the caller
 *    doesn't have a hydrated value, it must leave the field absent rather than guess.
 * 2. Hash-domain qualification for `content_hash`: a bare content hash is evidence, not proven
 *    identity, unless the caller also supplies a `HashContractV1` (hashAlgorithm + hashDomain +
 *    producerRevision) proving this hash domain is known and safe for exact-projection dedup.
 *    This repo has at least one confirmed historical producer that hashed generated artifact
 *    content rather than source chunk bytes under the same field name -- an unqualified hash must
 *    never be silently trusted as interchangeable with a qualified one from a different producer.
 *
 * This is a distinct, additive type (`IdentityResolutionV2`) rather than a further change to
 * `ResolvedIdentity`'s shape -- V1 callers (all of `rrf-integration.ts`, `retrieve-candidates.ts`,
 * and their existing tests) are untouched. A future RF-QDRANT-HYDRATION-02 migrates callers onto
 * this V2 shape once they have a real source for `canonicalChunkId`/`hashContract`; this task is
 * scoped to the type/contract correction only, not a retrieval redesign.
 */

export type IdentityResolutionStatus = 'CANONICAL' | 'PROJECTION_EXACT' | 'SOURCE_GROUP' | 'DEGRADED';

export type IdentitySource =
  | 'symbol_version_id'
  | 'packet_key'
  | 'canonical_chunk_id'
  | 'content_hash'
  | 'source_ref'
  | 'lane_id';

/**
 * Proof that a `content_hash` value belongs to a known, qualified hash domain. Supplying this is
 * entirely the caller's responsibility -- `resolveCanonicalIdentityV2` never infers or guesses one.
 */
export interface HashContractV1 {
  hashAlgorithm: string;
  hashDomain: string;
  producerRevision: string;
}

export interface IdentityResolutionInputV2 {
  symbolVersionId?: string | null;
  packetKey?: string | null;
  /**
   * ONLY set this from proven packet<->chunk ProjectionRegistryV1/lineage hydration. Never derive
   * it from a hash, source path, AST range, Qdrant point ID, or file grouping.
   */
  canonicalChunkId?: string | null;
  contentHash?: string | null;
  /** Required for `contentHash` to be trusted as `PROJECTION_EXACT` -- see `HashContractV1`. */
  hashContract?: HashContractV1 | null;
  sourceRef?: string | null;
  /** The backend-local id (Qdrant point id, TurboVec candidate id, etc.) used only as last resort. */
  laneId: string;
  /** Report/receipt paths substantiating a non-lane-id resolution, for audit trails. */
  evidenceRefs?: string[];
}

export interface IdentityResolutionV2 {
  key: string;
  resolutionStatus: IdentityResolutionStatus;
  identitySource?: IdentitySource;
  /** Populated only when resolutionStatus is 'CANONICAL' via symbol_version_id. */
  canonicalEntityId?: string;
  packetKey?: string;
  canonicalChunkId?: string;
  evidenceRefs?: string[];
}

/**
 * Resolve identity under the corrected model. Precedence:
 *   symbol_version_id -> packet_key -> canonical_chunk_id (hydrated only) ->
 *   content_hash (only with a qualifying hashContract) -> source_ref -> lane_id
 *
 * Unlike the broadened V1 `resolveCanonicalIdentity` above, an unqualified `content_hash` here
 * does NOT reach `PROJECTION_EXACT` at all -- it falls through to `source_ref`/`lane_id`, since
 * this function additionally enforces hash-domain qualification, which V1 (kept untouched for its
 * existing callers/tests) does not yet check.
 */
export function resolveCanonicalIdentityV2(input: IdentityResolutionInputV2): IdentityResolutionV2 {
  const evidenceRefs = input.evidenceRefs?.length ? input.evidenceRefs : undefined;

  const symbolVersionId = input.symbolVersionId?.trim();
  if (symbolVersionId) {
    return {
      key: symbolVersionId,
      resolutionStatus: 'CANONICAL',
      identitySource: 'symbol_version_id',
      canonicalEntityId: symbolVersionId,
      evidenceRefs,
    };
  }

  const packetKey = input.packetKey?.trim();
  if (packetKey) {
    return {
      key: packetKey,
      resolutionStatus: 'CANONICAL',
      identitySource: 'packet_key',
      packetKey,
      evidenceRefs,
    };
  }

  const canonicalChunkId = input.canonicalChunkId?.trim();
  if (canonicalChunkId) {
    return {
      key: canonicalChunkId,
      resolutionStatus: 'CANONICAL',
      identitySource: 'canonical_chunk_id',
      canonicalChunkId,
      evidenceRefs,
    };
  }

  const contentHash = input.contentHash?.trim();
  const hashContract = input.hashContract;
  const hashContractQualified = Boolean(
    hashContract?.hashAlgorithm?.trim() && hashContract?.hashDomain?.trim() && hashContract?.producerRevision?.trim(),
  );
  if (contentHash && hashContractQualified) {
    return {
      key: contentHash,
      resolutionStatus: 'PROJECTION_EXACT',
      identitySource: 'content_hash',
      evidenceRefs,
    };
  }
  // contentHash present but hashContract missing/unqualified: HASH_EVIDENCE_UNQUALIFIED, not
  // PROJECTION_EXACT -- fall through rather than trusting an unproven hash domain.

  const sourceRef = input.sourceRef?.trim();
  if (sourceRef) {
    return {
      key: sourceRef,
      resolutionStatus: 'SOURCE_GROUP',
      identitySource: 'source_ref',
      evidenceRefs,
    };
  }

  return {
    key: input.laneId,
    resolutionStatus: 'DEGRADED',
    identitySource: 'lane_id',
    evidenceRefs,
  };
}
