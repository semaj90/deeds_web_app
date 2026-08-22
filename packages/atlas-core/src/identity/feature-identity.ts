/**
 * Feature Identity — Canonical Deterministic Identity
 *
 * Format: feature:<sourceKind>:<24 hex>
 *
 * Derived from:
 *   sourceKey + normalizedSection + normalizedTitle
 *   joined by \x1f -> sha256 -> first 24 hex
 *
 * Pure, deterministic, no downstream dependencies.
 *
 * Source: scripts/atlas/lib/derive-feature-identity.mjs
 */

export type FeatureId =
  `feature:${string}:${string}`;

export interface FeatureIdentity {
  /** Cryptographic identity: feature:<sourceKind>:<24 hex> */
  featureId: FeatureId;
  /** Human-readable section:title */
  featureKey: string;
  /** Normalized source document identity */
  sourceKey: string;
  /** Primary source reference */
  sourceRef: string | null;
  /** All source references (provenance only) */
  sourceRefs: string[];
}

export const FEATURE_ID_RE = /^feature:[a-z][a-z0-9+.-]*:[0-9a-f]{24}$/;

export function isValidFeatureId(id: string): id is FeatureId {
  return FEATURE_ID_RE.test(id);
}
