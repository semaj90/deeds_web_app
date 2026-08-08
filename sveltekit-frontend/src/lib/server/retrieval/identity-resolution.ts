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
  status: 'canonical' | 'degraded';
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
 * source_ref -> lane-local fallback. The first four tiers produce `status: 'canonical'`; the
 * fallback tier is always `status: 'degraded'` — a candidate reaching this tier has no proven
 * canonical identity, and fusion/dedup logic must not treat it as equally trustworthy as a real
 * match.
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
    return { canonicalId: contentHash, source: 'content_hash', status: 'canonical' };
  }
  const sourceRef = input.sourceRef?.trim();
  if (sourceRef) {
    return { canonicalId: sourceRef, source: 'source_ref', status: 'canonical' };
  }
  return { canonicalId: input.fallbackId, source: 'lane_id_fallback', status: 'degraded' };
}
