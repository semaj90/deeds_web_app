/**
 * Phase 109A Soft-Delete Helpers
 * Safe deletion with audit trail and recovery capability
 */

import { db } from '../db/client';
import { sql } from 'drizzle-orm';

/**
 * Soft-delete a semantic signal with audit logging
 * Marks signal and dependent envelopes as deleted without removing data
 */
export async function softDeleteSemanticSignal(
  signalId: string,
  deletedBy: string,
  reasonCode: 'manual' | 'cascade' | 'retention_policy' | 'user_request' = 'manual'
) {
  const result = await db.execute(
    sql`
      SELECT * FROM soft_delete_semantic_signal(
        ${signalId}::uuid,
        ${deletedBy},
        ${reasonCode}
      )
    `
  );
  const rows = result as unknown as any[];

  return {
    deleted_signal_count: rows[0]?.[0] || 0,
    deleted_envelope_count: rows[0]?.[1] || 0,
    audit_id: rows[0]?.[2],
  };
}

/**
 * Recover a deleted semantic signal and its dependent rows
 * Useful for accidental deletions within 30-day recovery window
 */
export async function recoverSemanticSignal(
  signalId: string,
  recoveredBy: string
) {
  const result = await db.execute(
    sql`
      SELECT * FROM recover_semantic_signal(
        ${signalId}::uuid,
        ${recoveredBy}
      )
    `
  );
  const rows = result as unknown as any[];

  return {
    recovered_signal_count: rows[0]?.[0] || 0,
    recovered_envelope_count: rows[0]?.[1] || 0,
    recovered_recommendation_count: rows[0]?.[2] || 0,
  };
}

/**
 * Query active (non-deleted) semantic signals
 * Use this instead of direct semantic_signals query to exclude deleted rows
 */
export async function getActiveSemanticSignals(limit = 100) {
  const result = await db.execute(
    sql`
      SELECT * FROM semantic_signals_active
      LIMIT ${limit}
    `
  );
  return result as unknown as any[];
}

/**
 * Query active (non-deleted) classification envelopes
 */
export async function getActiveClassificationEnvelopes(limit = 100) {
  const result = await db.execute(
    sql`
      SELECT * FROM classification_envelope_active
      LIMIT ${limit}
    `
  );
  return result as unknown as any[];
}

/**
 * Query active (non-deleted) recommendations
 */
export async function getActiveRecommendations(limit = 100) {
  const result = await db.execute(
    sql`
      SELECT * FROM recommendation_log_active
      LIMIT ${limit}
    `
  );
  return result as unknown as any[];
}

/**
 * Get deletion history for a signal
 * Useful for auditing and recovery decisions
 */
export async function getDeletionHistory(signalId: string) {
  const result = await db.execute(
    sql`
      SELECT * FROM semantic_signal_deletion_history
      WHERE signal_id = ${signalId}::uuid
      ORDER BY deleted_at DESC
    `
  );
  return result as unknown as any[];
}

/**
 * Count deleted signals within time range
 * Useful for retention policies and cleanup analysis
 */
export async function countDeletedSignals(
  sinceHours: number = 24,
  recovered: boolean = false
) {
  const result = await db.execute(
    sql`
      SELECT COUNT(*) as deleted_count
      FROM semantic_signal_deletion_history
      WHERE deleted_at > NOW() - INTERVAL '${sql.raw(sinceHours.toString())} hours'
        AND recovery_attempted = ${recovered}
    `
  );
  return result[0]?.[0]?.deleted_count || 0;
}

/**
 * Audit: Find signals deleted by a specific user
 * Useful for access control reviews
 */
export async function findSignalsDeletedBy(
  deletedBy: string,
  limit = 100
) {
  const result = await db.execute(
    sql`
      SELECT d.*, s.subject_id, s.signal_type, s.producer
      FROM semantic_signal_deletion_history d
      JOIN semantic_signals s ON d.signal_id = s.id
      WHERE d.deleted_by = ${deletedBy}
      ORDER BY d.deleted_at DESC
      LIMIT ${limit}
    `
  );
  return result as unknown as any[];
}

/**
 * Policy: Permanently delete signals older than retention window
 * DESTRUCTIVE: Only call after backup and approval
 */
export async function permanentlyPurgeOldDeletions(retentionDays: number = 90) {
  if (retentionDays < 30) {
    throw new Error('Minimum retention window is 30 days');
  }

  const result = await db.execute(
    sql`
      DELETE FROM semantic_signals
      WHERE deleted_at IS NOT NULL
        AND deleted_at < NOW() - INTERVAL '${sql.raw(retentionDays.toString())} days'
      RETURNING id
    `
  );
  const rows = result as unknown as any[];

  return {
    permanently_deleted_count: rows.length,
    purge_timestamp: new Date(),
  };
}
