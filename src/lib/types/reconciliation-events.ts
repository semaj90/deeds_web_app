/**
 * Structured payloads for automated data repair events produced by the
 * parity audit.  Each type maps to one repair lane in the reconciliation
 * pipeline.
 *
 * Repair eligibility rules (from the parity contract):
 *   coverage debt (missing / stale / incomplete) → auto-repair eligible
 *   identity contradiction                       → quarantine only
 *   projection contradiction                     → quarantine only
 */

import type { AuditReport } from './canonical-records';

// Re-export so consumers only need one import path.
export type { AuditReport };

// ── Repair event payloads ─────────────────────────────────────────────────────

/**
 * Signals that a Qdrant point is entirely absent and must be recreated from
 * the canonical Postgres source.  This event is written to the outbox; a
 * fan-out consumer loads the canonical packet, obtains or generates the
 * required vectors, creates the Qdrant point, and records the applied event.
 *
 * This script NEVER creates Qdrant points directly.
 */
export interface FullProjectionEventPayload {
  /** Postgres relational PK — join key within this checkout. */
  packet_id: string;

  /** Stable cross-service packet identity. */
  packet_key: string;

  /** Canonical source reference. */
  source_ref: string;

  /** Physical Qdrant point ID that must be recreated. */
  qdrant_point_id: string;

  /** Target Qdrant collection. */
  collection: string;

  /** Vector and payload components that must be present in the repaired point. */
  missing_components: string[];

  /** Human-readable reason recorded in the repair log. */
  reason: string;

  /** Postgres aggregate_version at the time the event was generated. */
  aggregate_version?: number;
}

/**
 * Signals that a required named vector (e.g. summary_384) is absent from an
 * existing Qdrant point.  The fan-out consumer must generate the vector and
 * patch the point without replacing existing vectors.
 */
export interface SummaryVectorRepairEventPayload {
  packet_id: string;
  packet_key: string;
  source_ref: string;
  qdrant_point_id: string;
  collection: string;

  /** Name of the named vector that must be computed and written. */
  vector_name: string;

  reason: string;
}

/**
 * Signals that an existing Qdrant point's payload fields have drifted from
 * the Postgres source.  Only mutable projection-metadata fields may be
 * updated; vectors and identity fields are never touched by this event.
 *
 * Allowed payload fields:
 *   packet_id, packet_key, source_ref, aggregate_version,
 *   classifier_version, title_generator_version, reranker_version,
 *   domain_class, feature_id, feature_label, summary, title_id, tags,
 *   updated_at.
 *
 * Guarded by compare-before-write: rejected when Qdrant aggregate_version
 * >= Postgres aggregate_version (Qdrant appears newer).
 */
export interface PayloadRepairEventPayload {
  packet_id: string;
  packet_key: string;
  source_ref: string;
  qdrant_point_id: string;
  collection: string;

  /** Fields to merge into the Qdrant payload (SET semantics, not replace). */
  payload: Record<string, unknown>;

  /** Postgres aggregate_version carried for the compare-before-write guard. */
  aggregate_version?: number;

  reason: string;
}

/**
 * Signals that a row must not be auto-repaired.  Written to
 * atlas_projection_quarantine for manual review.
 */
export interface QuarantineEventPayload {
  packet_id: string;
  packet_key: string;
  qdrant_point_id: string;
  collection: string;

  /** 'identity_contradiction' | 'projection_contradiction' */
  contradiction_type: string;

  reason: string;
}

// ── Union ─────────────────────────────────────────────────────────────────────

export type ReconciliationEvent =
  | FullProjectionEventPayload
  | SummaryVectorRepairEventPayload
  | PayloadRepairEventPayload
  | QuarantineEventPayload;
