/**
 * Feature Identity Helpers — Canonical Lineage Derivation
 *
 * Single source of truth for parsing feature_id into constituent parts.
 * Prevents duplicate/drifting source_ref and relative_path columns.
 *
 * Feature ID format: path:symbol:kind
 *   path = src/lib/server/db/schema-postgres.ts
 *   symbol = EvidenceAuditLog
 *   kind = interface
 *
 * Example: "src/lib/server/db/schema-postgres.ts:EvidenceAuditLog:interface"
 */

/**
 * Extract source_ref (canonical file path) from feature_id
 */
export function getSourceRef(featureId: string): string {
  const parts = featureId.split(':');
  return parts[0] || '';
}

/**
 * Extract relative_path (same as source_ref for our purposes)
 */
export function getRelativePath(featureId: string): string {
  return getSourceRef(featureId);
}

/**
 * Extract symbol (code identifier) from feature_id
 */
export function getSymbol(featureId: string): string {
  const parts = featureId.split(':');
  return parts[1] || '';
}

/**
 * Extract kind (function, type, class, etc.) from feature_id
 */
export function getKind(featureId: string): string {
  const parts = featureId.split(':');
  return parts[2] || '';
}

/**
 * Reconstruct feature_id from components
 */
export function makeFeatureId(path: string, symbol: string, kind: string): string {
  return `${path}:${symbol}:${kind}`;
}

/**
 * Parse feature_id into structured form
 */
export interface ParsedFeatureId {
  sourceRef: string;
  symbol: string;
  kind: string;
}

export function parseFeatureId(featureId: string): ParsedFeatureId {
  return {
    sourceRef: getSourceRef(featureId),
    symbol: getSymbol(featureId),
    kind: getKind(featureId)
  };
}

/**
 * Validate feature_id format
 */
export function isValidFeatureId(featureId: string): boolean {
  const parts = featureId.split(':');
  return parts.length === 3 && parts.every(p => p.length > 0);
}
