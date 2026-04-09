/**
 * NES Command Center Archive Query Helpers
 *
 * Provides query functions for accessing archived data (error clusters and interaction logs).
 * Archived data is stored in separate tables for long-term retention and historical analysis.
 *
 * @module db/queries/route-health-archive
 */

import { sql } from 'drizzle-orm';
import { getDb } from '../pool.js';

// ============================================================================
// Archive Query Helpers
// ============================================================================

/**
 * Get archived error clusters for a route
 *
 * @param routeId - Route identifier
 * @param options - Query options (limit, offset, dateRange)
 * @returns Paginated archived error clusters
 */
export async function getArchivedErrorClusters(
  routeId: string,
  options: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
  } = {}
) {
  const db = getDb();
  const { limit = 50, offset = 0, startDate, endDate } = options;

  // Build WHERE conditions
  const conditions = [sql`route_id = ${routeId}`];

  if (startDate) {
    conditions.push(sql`archived_at >= ${startDate}`);
  }

  if (endDate) {
    conditions.push(sql`archived_at <= ${endDate}`);
  }

  const whereClause = conditions.length > 1
    ? sql`${sql.join(conditions, sql` AND `)}`
    : conditions[0];

  // Query archived error clusters
  const result = await db.execute(sql`
    SELECT
      id, route_id, tool, code, message, severity,
      count, file_path, raw_log_snippet, cluster_id,
      error_code, category, affected_routes, first_seen_at,
      last_seen_at, updated_at, created_at, resolved_at,
      archived_at, archived_from_table, archive_reason
    FROM error_cluster_archive
    WHERE ${whereClause}
    ORDER BY archived_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  // Get total count
  const countResult = await db.execute(sql`
    SELECT COUNT(*) as total
    FROM error_cluster_archive
    WHERE ${whereClause}
  `);

  const total = Number(countResult[0]?.total ?? 0);

  return {
    data: result,
    total,
    offset,
    hasMore: offset + limit < total,
  };
}

/**
 * Get archived interaction logs for a route
 *
 * @param routeId - Route identifier
 * @param options - Query options (limit, offset, dateRange, interactionType)
 * @returns Paginated archived interaction logs
 */
export async function getArchivedInteractions(
  routeId: string,
  options: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
    interactionType?: string;
  } = {}
) {
  const db = getDb();
  const { limit = 50, offset = 0, startDate, endDate, interactionType } = options;

  // Build WHERE conditions
  const conditions = [sql`route_id = ${routeId}`];

  if (startDate) {
    conditions.push(sql`archived_at >= ${startDate}`);
  }

  if (endDate) {
    conditions.push(sql`archived_at <= ${endDate}`);
  }

  if (interactionType) {
    conditions.push(sql`interaction_type = ${interactionType}`);
  }

  const whereClause = conditions.length > 1
    ? sql`${sql.join(conditions, sql` AND `)}`
    : conditions[0];

  // Query archived interactions
  const result = await db.execute(sql`
    SELECT
      id, route_id, user_id, interaction_type,
      metadata, session_id, duration_ms, success,
      error_message, ip_address, user_agent, created_at,
      archived_at, archived_from_table, archive_reason
    FROM route_interaction_log_archive
    WHERE ${whereClause}
    ORDER BY archived_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  // Get total count
  const countResult = await db.execute(sql`
    SELECT COUNT(*) as total
    FROM route_interaction_log_archive
    WHERE ${whereClause}
  `);

  const total = Number(countResult[0]?.total ?? 0);

  return {
    data: result,
    total,
    offset,
    hasMore: offset + limit < total,
  };
}

/**
 * Get combined error clusters (active + archived)
 *
 * Queries both main and archive tables and combines results.
 * Useful for historical analysis across all data.
 *
 * @param routeId - Route identifier
 * @param options - Query options
 * @returns Combined error clusters from both tables
 */
export async function getCombinedErrorClusters(
  routeId: string,
  options: {
    limit?: number;
    offset?: number;
    includeArchived?: boolean;
  } = {}
) {
  const db = getDb();
  const { limit = 50, offset = 0, includeArchived = false } = options;

  if (!includeArchived) {
    // Only query main table
    const result = await db.execute(sql`
      SELECT
        id, route_id, tool, code, message, severity,
        count, file_path, raw_log_snippet, cluster_id,
        error_code, category, affected_routes, first_seen_at,
        last_seen_at, updated_at, created_at, resolved_at,
        archived_at, 'error_cluster' as source_table
      FROM error_cluster
      WHERE route_id = ${routeId}
        AND archived_at IS NULL
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    const countResult = await db.execute(sql`
      SELECT COUNT(*) as total
      FROM error_cluster
      WHERE route_id = ${routeId}
        AND archived_at IS NULL
    `);

    const total = Number(countResult[0]?.total ?? 0);

    return {
      data: result,
      total,
      offset,
      hasMore: offset + limit < total,
    };
  }

  // Query both tables and combine
  const result = await db.execute(sql`
    (
      SELECT
        id, route_id, tool, code, message, severity,
        count, file_path, raw_log_snippet, cluster_id,
        error_code, category, affected_routes, first_seen_at,
        last_seen_at, updated_at, created_at, resolved_at,
        archived_at, 'error_cluster' as source_table
      FROM error_cluster
      WHERE route_id = ${routeId}
        AND archived_at IS NULL
    )
    UNION ALL
    (
      SELECT
        id, route_id, tool, code, message, severity,
        count, file_path, raw_log_snippet, cluster_id,
        error_code, category, affected_routes, first_seen_at,
        last_seen_at, updated_at, created_at, resolved_at,
        archived_at, 'error_cluster_archive' as source_table
      FROM error_cluster_archive
      WHERE route_id = ${routeId}
    )
    ORDER BY created_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  // Get combined count
  const countResult = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM error_cluster WHERE route_id = ${routeId} AND archived_at IS NULL) +
      (SELECT COUNT(*) FROM error_cluster_archive WHERE route_id = ${routeId})
      as total
  `);

  const total = Number(countResult[0]?.total ?? 0);

  return {
    data: result,
    total,
    offset,
    hasMore: offset + limit < total,
  };
}

/**
 * Get combined interaction logs (active + archived)
 *
 * Queries both main and archive tables and combines results.
 * Useful for complete user behavior analysis.
 *
 * @param routeId - Route identifier
 * @param options - Query options
 * @returns Combined interactions from both tables
 */
export async function getCombinedInteractions(
  routeId: string,
  options: {
    limit?: number;
    offset?: number;
    includeArchived?: boolean;
  } = {}
) {
  const db = getDb();
  const { limit = 50, offset = 0, includeArchived = false } = options;

  if (!includeArchived) {
    // Only query main table
    const result = await db.execute(sql`
      SELECT
        id, route_id, user_id, interaction_type,
        metadata, session_id, duration_ms, success,
        error_message, ip_address, user_agent, created_at,
        NULL as archived_at, 'route_interaction_log' as source_table
      FROM route_interaction_log
      WHERE route_id = ${routeId}
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    const countResult = await db.execute(sql`
      SELECT COUNT(*) as total
      FROM route_interaction_log
      WHERE route_id = ${routeId}
    `);

    const total = Number(countResult[0]?.total ?? 0);

    return {
      data: result,
      total,
      offset,
      hasMore: offset + limit < total,
    };
  }

  // Query both tables and combine
  const result = await db.execute(sql`
    (
      SELECT
        id, route_id, user_id, interaction_type,
        metadata, session_id, duration_ms, success,
        error_message, ip_address, user_agent, created_at,
        NULL as archived_at, 'route_interaction_log' as source_table
      FROM route_interaction_log
      WHERE route_id = ${routeId}
    )
    UNION ALL
    (
      SELECT
        id, route_id, user_id, interaction_type,
        metadata, session_id, duration_ms, success,
        error_message, ip_address, user_agent, created_at,
        archived_at, 'route_interaction_log_archive' as source_table
      FROM route_interaction_log_archive
      WHERE route_id = ${routeId}
    )
    ORDER BY created_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  // Get combined count
  const countResult = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM route_interaction_log WHERE route_id = ${routeId}) +
      (SELECT COUNT(*) FROM route_interaction_log_archive WHERE route_id = ${routeId})
      as total
  `);

  const total = Number(countResult[0]?.total ?? 0);

  return {
    data: result,
    total,
    offset,
    hasMore: offset + limit < total,
  };
}

/**
 * Get archive statistics
 *
 * Returns overview of archived data including record counts,
 * date ranges, and storage size.
 *
 * @returns Archive statistics for monitoring
 */
export async function getArchiveStatistics() {
  const db = getDb();

  const result = await db.execute(sql`
    SELECT * FROM archive_statistics
  `);

  return result;
}

/**
 * Export for convenience
 */
export default {
  getArchivedErrorClusters,
  getArchivedInteractions,
  getCombinedErrorClusters,
  getCombinedInteractions,
  getArchiveStatistics,
};