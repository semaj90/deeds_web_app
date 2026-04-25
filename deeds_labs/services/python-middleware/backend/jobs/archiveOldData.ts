/**
 * Data Archival Background Job
 *
 * Archives old error clusters (90+ days) and interaction logs (180+ days)
 * to maintain database performance while preserving historical data.
 *
 * Retention Policy:
 * - Error Clusters: 90 days in main table, then moved to archive
 * - Interaction Logs: 180 days in main table, then moved to archive
 *
 * @module jobs/archiveOldData
 */

import { db } from '../db/connection.js';
import { sql } from 'drizzle-orm';

/**
 * Archival Configuration
 */
const ARCHIVAL_CONFIG = {
  errorClusterRetentionDays: 90,
  interactionLogRetentionDays: 180,
  batchSize: 1000, // Process in batches to avoid long transactions
  dryRun: false, // Set to true for testing without actual archival
};

/**
 * Archival Statistics
 */
interface ArchivalStats {
  errorClustersArchived: number;
  interactionLogsArchived: number;
  errorClustersDeleted: number;
  interactionLogsDeleted: number;
  executionTimeMs: number;
  errors: string[];
}

/**
 * Archive Old Error Clusters
 *
 * Moves error clusters older than 90 days to the archive table.
 * Uses transaction to ensure data integrity.
 *
 * @returns Number of records archived
 */
async function archiveOldErrorClusters(): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - ARCHIVAL_CONFIG.errorClusterRetentionDays);

  console.log(`[Archive] Archiving error clusters older than ${cutoffDate.toISOString()}`);

  if (ARCHIVAL_CONFIG.dryRun) {
    // Dry run: Count records that would be archived
    const result = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM error_cluster
      WHERE created_at < ${cutoffDate}
        AND archived_at IS NULL
        AND resolved_at IS NOT NULL
    `);

    const count = Number(result.rows[0]?.count || 0);
    console.log(`[Archive] [DRY RUN] Would archive ${count} error clusters`);
    return count;
  }

  // Real archival: Move records in transaction
  let totalArchived = 0;
  let hasMore = true;

  while (hasMore) {
    const result = await db.transaction(async (tx) => {
      // Insert into archive table
      const insertResult = await tx.execute(sql`
        INSERT INTO error_cluster_archive (
          id, route_id, tool, code, message, severity, count,
          file_path, raw_log_snippet, cluster_id, error_code, category,
          affected_routes, first_seen_at, last_seen_at, updated_at,
          created_at, resolved_at, archived_at, archived_from_table, archive_reason
        )
        SELECT
          id, route_id, tool, code, message, severity, count,
          file_path, raw_log_snippet, cluster_id, error_code, category,
          affected_routes, first_seen_at, last_seen_at, updated_at,
          created_at, resolved_at, NOW() as archived_at,
          'error_cluster' as archived_from_table,
          'retention_policy_90_days' as archive_reason
        FROM error_cluster
        WHERE created_at < ${cutoffDate}
          AND archived_at IS NULL
          AND resolved_at IS NOT NULL
        LIMIT ${ARCHIVAL_CONFIG.batchSize}
        RETURNING id
      `);

      const archivedIds = insertResult.rows.map((row: any) => row.id);

      if (archivedIds.length === 0) {
        return { archived: 0, deleted: 0 };
      }

      // Delete from main table
      const deleteResult = await tx.execute(sql`
        DELETE FROM error_cluster
        WHERE id = ANY(${archivedIds}::uuid[])
      `);

      return {
        archived: archivedIds.length,
        deleted: deleteResult.rowCount || 0,
      };
    });

    totalArchived += result.archived;
    hasMore = result.archived === ARCHIVAL_CONFIG.batchSize;

    console.log(
      `[Archive] Batch complete: ${result.archived} archived, ${result.deleted} deleted (Total: ${totalArchived})`
    );

    // Small delay between batches to avoid overwhelming the database
    if (hasMore) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  console.log(`[Archive] Error cluster archival complete: ${totalArchived} records archived`);
  return totalArchived;
}

/**
 * Archive Old Interaction Logs
 *
 * Moves interaction logs older than 180 days to the archive table.
 * Uses transaction to ensure data integrity.
 *
 * @returns Number of records archived
 */
async function archiveOldInteractionLogs(): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - ARCHIVAL_CONFIG.interactionLogRetentionDays);

  console.log(`[Archive] Archiving interaction logs older than ${cutoffDate.toISOString()}`);

  if (ARCHIVAL_CONFIG.dryRun) {
    // Dry run: Count records that would be archived
    const result = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM route_interaction_log
      WHERE created_at < ${cutoffDate}
    `);

    const count = Number(result.rows[0]?.count || 0);
    console.log(`[Archive] [DRY RUN] Would archive ${count} interaction logs`);
    return count;
  }

  // Real archival: Move records in transaction
  let totalArchived = 0;
  let hasMore = true;

  while (hasMore) {
    const result = await db.transaction(async (tx) => {
      // Insert into archive table
      const insertResult = await tx.execute(sql`
        INSERT INTO route_interaction_log_archive (
          id, route_id, user_id, interaction_type, metadata,
          session_id, duration_ms, success, error_message,
          ip_address, user_agent, created_at, archived_at,
          archived_from_table, archive_reason
        )
        SELECT
          id, route_id, user_id, interaction_type, metadata,
          session_id, duration_ms, success, error_message,
          ip_address, user_agent, created_at, NOW() as archived_at,
          'route_interaction_log' as archived_from_table,
          'retention_policy_180_days' as archive_reason
        FROM route_interaction_log
        WHERE created_at < ${cutoffDate}
        LIMIT ${ARCHIVAL_CONFIG.batchSize}
        RETURNING id
      `);

      const archivedIds = insertResult.rows.map((row: any) => row.id);

      if (archivedIds.length === 0) {
        return { archived: 0, deleted: 0 };
      }

      // Delete from main table
      const deleteResult = await tx.execute(sql`
        DELETE FROM route_interaction_log
        WHERE id = ANY(${archivedIds}::uuid[])
      `);

      return {
        archived: archivedIds.length,
        deleted: deleteResult.rowCount || 0,
      };
    });

    totalArchived += result.archived;
    hasMore = result.archived === ARCHIVAL_CONFIG.batchSize;

    console.log(
      `[Archive] Batch complete: ${result.archived} archived, ${result.deleted} deleted (Total: ${totalArchived})`
    );

    // Small delay between batches to avoid overwhelming the database
    if (hasMore) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  console.log(`[Archive] Interaction log archival complete: ${totalArchived} records archived`);
  return totalArchived;
}

/**
 * Main Archival Job
 *
 * Executes the complete archival process for both error clusters
 * and interaction logs. Returns statistics about the archival.
 *
 * @returns Archival statistics
 */
export async function archiveOldData(): Promise<ArchivalStats> {
  const startTime = Date.now();
  const stats: ArchivalStats = {
    errorClustersArchived: 0,
    interactionLogsArchived: 0,
    errorClustersDeleted: 0,
    interactionLogsDeleted: 0,
    executionTimeMs: 0,
    errors: [],
  };

  console.log('='.repeat(80));
  console.log('[Archive] Starting data archival job');
  console.log(`[Archive] Dry run: ${ARCHIVAL_CONFIG.dryRun}`);
  console.log(
    `[Archive] Error cluster retention: ${ARCHIVAL_CONFIG.errorClusterRetentionDays} days`
  );
  console.log(
    `[Archive] Interaction log retention: ${ARCHIVAL_CONFIG.interactionLogRetentionDays} days`
  );
  console.log('='.repeat(80));

  try {
    // Archive error clusters
    console.log('\n[Archive] Phase 1: Error Clusters');
    console.log('-'.repeat(80));
    stats.errorClustersArchived = await archiveOldErrorClusters();
    stats.errorClustersDeleted = stats.errorClustersArchived; // Same count for successful archival
  } catch (error) {
    const errorMessage = `Error archiving error clusters: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[Archive] ${errorMessage}`);
    stats.errors.push(errorMessage);
  }

  try {
    // Archive interaction logs
    console.log('\n[Archive] Phase 2: Interaction Logs');
    console.log('-'.repeat(80));
    stats.interactionLogsArchived = await archiveOldInteractionLogs();
    stats.interactionLogsDeleted = stats.interactionLogsArchived; // Same count for successful archival
  } catch (error) {
    const errorMessage = `Error archiving interaction logs: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[Archive] ${errorMessage}`);
    stats.errors.push(errorMessage);
  }

  stats.executionTimeMs = Date.now() - startTime;

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('[Archive] Archival job complete');
  console.log('='.repeat(80));
  console.log(`[Archive] Error clusters archived: ${stats.errorClustersArchived}`);
  console.log(`[Archive] Interaction logs archived: ${stats.interactionLogsArchived}`);
  console.log(`[Archive] Execution time: ${stats.executionTimeMs}ms`);
  console.log(`[Archive] Errors: ${stats.errors.length}`);
  if (stats.errors.length > 0) {
    stats.errors.forEach((error) => console.error(`[Archive]   - ${error}`));
  }
  console.log('='.repeat(80));

  return stats;
}

/**
 * CLI Entry Point
 *
 * Allows running the archival job from command line:
 * node backend/jobs/archiveOldData.js
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('[Archive] Running archival job from CLI');

  archiveOldData()
    .then((stats) => {
      console.log('[Archive] Job completed successfully');
      process.exit(stats.errors.length > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('[Archive] Job failed:', error);
      process.exit(1);
    });
}

/**
 * Export for use in scheduler
 */
export default archiveOldData;
