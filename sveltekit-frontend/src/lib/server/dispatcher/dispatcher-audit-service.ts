/**
 * Dispatcher Audit Service
 * Persists dispatcher decisions to Postgres audit log
 */

import type { DrizzleORM } from 'drizzle-orm';
import { eq, desc, and, gte, lte } from 'drizzle-orm';
import { dispatcherAuditLog, type DispatcherAuditLogInsert } from './dispatcher-audit-schema.js';
import type { DispatcherOrchestrationResult } from './dispatcher-orchestrator.js';

/**
 * Persist dispatcher decision to audit log
 *
 * @param db — Drizzle database client
 * @param result — Orchestration result to audit
 * @param packet_key — Primary packet key being processed
 * @returns Inserted audit log record
 */
export async function persistDispatcherDecision(
  db: any, // DrizzleORM client
  result: DispatcherOrchestrationResult,
  packet_key: string
): Promise<{ id: bigint; created_at: Date }> {
  try {
    const auditEntry: DispatcherAuditLogInsert = {
      packet_key,
      dispatch_decision: result.dispatch_decision,
      dispatch_confidence: 0.95, // From state
      identity_lane: 'canonical', // From state
      parity_status: 'in_sync', // From state
      mirror_syncs: result.mirror_syncs,
      events_emitted: result.events_emitted,
      synthesis_path: result.synthesis_path,
      tool_calls: result.mirror_syncs as any, // Placeholder
      errors: result.errors,
      latency_ms: result.total_duration_ms,
      status: result.success ? 'success' : result.errors.length > 2 ? 'failure' : 'partial_failure',
      result: {
        success: result.success,
        dispatch_decision: result.dispatch_decision,
        events_emitted: result.events_emitted,
      },
    };

    const inserted = await db
      .insert(dispatcherAuditLog)
      .values(auditEntry)
      .returning({ id: dispatcherAuditLog.id, created_at: dispatcherAuditLog.created_at });

    if (inserted && inserted.length > 0) {
      console.log(`[dispatcher-audit] Persisted decision: ${result.dispatch_decision} (packet: ${packet_key})`);
      return inserted[0];
    }

    throw new Error('Insert returned no rows');
  } catch (err) {
    console.error(`[dispatcher-audit] Failed to persist decision: ${String(err)}`);
    throw err;
  }
}

/**
 * Query audit log for recent decisions
 *
 * @param db — Drizzle database client
 * @param options — Query options
 * @returns Array of audit log entries
 */
export async function getRecentDecisions(
  db: any,
  options: {
    limit?: number;
    offset?: number;
    packet_key?: string;
    decision?: string;
    status?: string;
    since_minutes?: number;
  } = {}
): Promise<
  Array<{
    id: bigint;
    packet_key: string;
    dispatch_decision: string;
    status: string;
    latency_ms: number;
    created_at: Date;
  }>
> {
  const { limit = 100, offset = 0, packet_key, decision, status, since_minutes = 60 } = options;

  try {
    // Build WHERE clause
    const conditions = [];

    if (packet_key) {
      conditions.push(eq(dispatcherAuditLog.packet_key, packet_key));
    }

    if (decision) {
      conditions.push(eq(dispatcherAuditLog.dispatch_decision, decision));
    }

    if (status) {
      conditions.push(eq(dispatcherAuditLog.status, status));
    }

    // Filter by time
    const sinceTime = new Date(Date.now() - since_minutes * 60 * 1000);
    conditions.push(gte(dispatcherAuditLog.created_at, sinceTime));

    // Execute query
    const results = await db
      .select({
        id: dispatcherAuditLog.id,
        packet_key: dispatcherAuditLog.packet_key,
        dispatch_decision: dispatcherAuditLog.dispatch_decision,
        status: dispatcherAuditLog.status,
        latency_ms: dispatcherAuditLog.latency_ms,
        created_at: dispatcherAuditLog.created_at,
      })
      .from(dispatcherAuditLog)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(dispatcherAuditLog.created_at))
      .limit(limit)
      .offset(offset);

    return results;
  } catch (err) {
    console.error(`[dispatcher-audit] Query failed: ${String(err)}`);
    throw err;
  }
}

/**
 * Get audit log statistics
 *
 * @param db — Drizzle database client
 * @param since_minutes — Time window (default: 1440 = 24 hours)
 * @returns Statistics object
 */
export async function getAuditStats(
  db: any,
  since_minutes: number = 1440
): Promise<{
  total_decisions: number;
  successful: number;
  partial_failures: number;
  failures: number;
  avg_latency_ms: number;
  decision_distribution: Record<string, number>;
}> {
  try {
    const sinceTime = new Date(Date.now() - since_minutes * 60 * 1000);

    // Get all entries in time window
    const entries = await db
      .select({
        status: dispatcherAuditLog.status,
        decision: dispatcherAuditLog.dispatch_decision,
        latency_ms: dispatcherAuditLog.latency_ms,
      })
      .from(dispatcherAuditLog)
      .where(gte(dispatcherAuditLog.created_at, sinceTime));

    // Compute statistics
    const stats = {
      total_decisions: entries.length,
      successful: 0,
      partial_failures: 0,
      failures: 0,
      total_latency_ms: 0,
      decision_distribution: {} as Record<string, number>,
    };

    for (const entry of entries) {
      // Count by status
      if (entry.status === 'success') stats.successful++;
      else if (entry.status === 'partial_failure') stats.partial_failures++;
      else if (entry.status === 'failure') stats.failures++;

      // Sum latency
      stats.total_latency_ms += entry.latency_ms || 0;

      // Count by decision
      stats.decision_distribution[entry.decision] = (stats.decision_distribution[entry.decision] || 0) + 1;
    }

    return {
      total_decisions: stats.total_decisions,
      successful: stats.successful,
      partial_failures: stats.partial_failures,
      failures: stats.failures,
      avg_latency_ms: stats.total_decisions > 0 ? Math.round(stats.total_latency_ms / stats.total_decisions) : 0,
      decision_distribution: stats.decision_distribution,
    };
  } catch (err) {
    console.error(`[dispatcher-audit] Stats query failed: ${String(err)}`);
    throw err;
  }
}

/**
 * Clean up old audit logs (retention policy: 30 days)
 *
 * @param db — Drizzle database client
 * @param retention_days — Retention period (default: 30)
 * @returns Number of deleted records
 */
export async function cleanupOldAuditLogs(
  db: any,
  retention_days: number = 30
): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - retention_days * 24 * 60 * 60 * 1000);

    const result = await db.delete(dispatcherAuditLog).where(lte(dispatcherAuditLog.created_at, cutoff));

    console.log(`[dispatcher-audit] Cleaned up ${result.rowCount} old audit logs (before ${cutoff.toISOString()})`);
    return result.rowCount || 0;
  } catch (err) {
    console.error(`[dispatcher-audit] Cleanup failed: ${String(err)}`);
    throw err;
  }
}
