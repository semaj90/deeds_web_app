/**
 * Canonical record definitions for records that have passed through the full
 * lineage pipeline, including mandatory source provenance.
 *
 * These are the single-source-of-truth shapes before committing to cache or index.
 */

// ── Provenance ────────────────────────────────────────────────────────────────

export interface CanonicalSourceMetadata {
  /** Absolute filesystem path to the raw source artifact. */
  source_path: string;

  /** Project-relative canonical path. */
  file_path: string;

  /** Persistent, system-generated provenance identifier (primary key for lineage). */
  canonical_source_ref: string;

  /** User or system that created the initial record. */
  associated_user_id?: string;
}

// ── Shared building blocks ────────────────────────────────────────────────────

interface BaseAtlasRecord {
  id: string;
  source_ref: string;
  kind: string;
}

interface RewardMetrics {
  reward_count: number;
  reward_avg: number;
  total_reward: number;
  outcome_count: number;
  outcome_reward_sum: number;
}

// ── Metadata envelope (extensible) ───────────────────────────────────────────

export interface CanonicalMetadata {
  source: CanonicalSourceMetadata;
  // Future lanes: ontology?, embeddings?, ast?, domains?
}

// ── Atlas record shapes ───────────────────────────────────────────────────────

/**
 * A card record enriched with SOM coordinates, reward metrics, and a latent vector.
 * Used inside the OpenCode card pipeline before promotion to the parent-atlas entry.
 */
export interface EnrichedCardRecord extends BaseAtlasRecord, Partial<RewardMetrics> {
  metadata: CanonicalMetadata;

  /** SOM grid row of the best-matching unit for this record. */
  som_bmu_row?: number;

  /** SOM grid column of the best-matching unit for this record. */
  som_bmu_col?: number;

  /**
   * 64-dimensional latent-space vector produced by the autoencoder.
   * Use Float32Array for in-memory ML pipelines; number[] for serialized JSON.
   */
  latent64?: Float32Array | number[];
}

/**
 * A fully promoted parent-atlas entry with required reward metrics and a latent vector.
 * All optional fields from EnrichedCardRecord become required here after promotion.
 */
export interface EnrichedParentAtlasEntry extends BaseAtlasRecord, RewardMetrics {
  source: CanonicalSourceMetadata;

  /** Required 64-dimensional latent vector after promotion. */
  latent64: Float32Array | number[];
}

// ── Audit report (used by reconciliation pipeline) ───────────────────────────

export type AuditStatus = 'PASS' | 'WARN' | 'FAIL';

export interface AuditReport {
  status: AuditStatus;

  issues: {
    missing: {
      point_ids: string[];
    };
    contradictions: {
      mismatches: Array<{
        packet_key: string;
        qdrant_point_id: string;
        reason: string;
      }>;
    };
  };
}
