/**
 * Content Identity Semantics (Phase 107 Phase F Provenance)
 *
 * Separates different identity/hash concepts that must never be collapsed:
 * - sha256: canonical source content digest (trustworthy, immutable)
 * - summary_hash: digest of a derived summary (not equivalent to source hash)
 * - packet_id: row identity, NOT a content hash
 *
 * This prevents fallback chains like "sha256 ?? summary_hash ?? packet_id"
 * from being stored as though every result were canonical content_hash.
 */

/**
 * Identifies the semantic meaning of a content hash or identifier value.
 * Used to ensure provenance tracking and prevent collapsing of different identity types.
 */
export type ContentIdentityKind =
  | 'canonical-source-sha256'
  | 'derived-summary-hash'
  | 'synthetic-migration-hash'
  | 'missing';

/**
 * Algorithm used to generate the content identity value.
 */
export type ContentHashAlgorithm =
  | 'sha256'
  | 'unknown'
  | null;

/**
 * What input was used to compute the hash.
 * Determines whether the hash is stable across retrieval/modification.
 */
export type ContentInputContract =
  | 'source-bytes'          // Original source code/document bytes
  | 'normalized-summary'    // Derived summary text (may change)
  | 'migration-fields-v1'   // Synthetic migration fingerprint
  | null;

/**
 * Complete provenance record for a content identifier.
 *
 * Example:
 * ```typescript
 * // Canonical source sha256
 * {
 *   value: "abc123...",
 *   kind: 'canonical-source-sha256',
 *   algorithm: 'sha256',
 *   inputContract: 'source-bytes',
 *   canonical: true
 * }
 *
 * // Fallback to summary hash (not canonical)
 * {
 *   value: "def456...",
 *   kind: 'derived-summary-hash',
 *   algorithm: 'unknown',
 *   inputContract: 'normalized-summary',
 *   canonical: false
 * }
 *
 * // Missing (no identity available)
 * {
 *   value: null,
 *   kind: 'missing',
 *   algorithm: null,
 *   inputContract: null,
 *   canonical: false
 * }
 * ```
 */
export interface ContentIdentity {
  value: string | null;
  kind: ContentIdentityKind;
  algorithm: ContentHashAlgorithm;
  inputContract: ContentInputContract;
  canonical: boolean;
}

/**
 * Resolves content identity from available sources, respecting fallback order.
 * Never collapses different semantic types into one field.
 *
 * Priority:
 * 1. sha256 (canonical, immutable)
 * 2. summary_hash (derived, may change)
 * 3. null (missing, explicitly tracked)
 *
 * Never: use packet_id as content hash
 */
export function resolveContentIdentity(row: {
  sha256: string | null;
  summaryHash: string | null;
  packetId?: string;
}): ContentIdentity {
  if (row.sha256) {
    return {
      value: row.sha256,
      kind: 'canonical-source-sha256',
      algorithm: 'sha256',
      inputContract: 'source-bytes',
      canonical: true
    };
  }

  if (row.summaryHash) {
    return {
      value: row.summaryHash,
      kind: 'derived-summary-hash',
      algorithm: 'unknown',
      inputContract: 'normalized-summary',
      canonical: false
    };
  }

  return {
    value: null,
    kind: 'missing',
    algorithm: null,
    inputContract: null,
    canonical: false
  };
}

/**
 * Generates a synthetic migration fingerprint when canonical source hash is unavailable.
 * Used only for migrations; marked explicitly as non-canonical.
 *
 * Formula: sha256('atlas-migration-v1\0' + packetKey + sourceRef + summary)
 */
export function generateMigrationFingerprint(
  packetKey: string,
  sourceRef: string,
  summary: string | null
): ContentIdentity {
  const crypto = require('crypto');
  const input = `atlas-migration-v1\0${packetKey}\0${sourceRef}\0${summary ?? ''}`;
  const hash = crypto.createHash('sha256').update(input).digest('hex');

  return {
    value: hash,
    kind: 'synthetic-migration-hash',
    algorithm: 'sha256',
    inputContract: 'migration-fields-v1',
    canonical: false
  };
}

/**
 * Tracks which source provided each field during materialization.
 * Used in Phase 107 Phase F to measure fallback rates and detect patterns.
 */
export type FeatureLoadSource =
  | 'feature_domain_facts'
  | 'feature_lexical_facts'
  | 'feature_structural_facts'
  | 'feature_ontology_tuples'
  | 'atlas_packets_fallback'
  | 'legacy_ast_fallback'
  | 'legacy_concept_fallback'
  | 'missing';

/**
 * Complete provenance for a materialized packet record.
 * Every loaded packet should include one of these.
 */
export interface FeatureLoadProvenance {
  packetKey: string;

  laneSources: {
    domain: FeatureLoadSource;
    lexical: FeatureLoadSource;
    structural: FeatureLoadSource;
    ontology: FeatureLoadSource;
  };

  fallbackUsed: boolean;
  fallbackReasons: string[];
  unresolvedReasons: string[];

  processingPassId: string;
  contractVersion: string;
}

/**
 * Field-level resolution result for Phase 107 Phase F materialization.
 * Replaces lane-level hard failures with explicit reporting.
 */
export interface FieldResolution<T = unknown> {
  // Value resolved (or null if unresolved)
  value: T | null;

  // Which source provided this value (or null if missing)
  source: FeatureLoadSource | null;

  // Whether the value came from fallback (vs. primary feature layer)
  fallbackUsed: boolean;

  // Confidence in this value (0.95 feature facts, 0.6 atlas_packets, 0.3 heuristic)
  confidence?: number;

  // Why this field is empty (if value is null)
  unresolvedReason?: string;
}
