/**
 * NES Command Center Database Query Helpers
 *
 * Provides type-safe query functions for route metadata, error tracking,
 * health monitoring, and user interactions. All queries use Drizzle ORM
 * for type safety and SQL injection protection.
 *
 * @module db/queries/nes-command-center
 */

import { eq, desc, and, isNull, sql } from 'drizzle-orm';
import { getDb } from '../pool.js';
import {
  routeMetadata,
  errorCluster,
  routeHealthEvent,
  errorBrainAnalysis,
  errorBrainPatch,
  routeInteractionLog,
  type NewRouteMetadata,
  type NewErrorCluster,
  type NewRouteHealthEvent,
  type NewErrorBrainAnalysis,
  type NewErrorBrainPatch,
  type NewRouteInteractionLog,
} from '../schema/nes-command-center.js';

// ============================================================================
// Route Metadata Queries
// ============================================================================

/**
 * Get route metadata by route ID
 *
 * @param routeId - Unique route identifier (e.g., "/cases/[id]/overview")
 * @returns Route metadata or null if not found
 */
export async function getRouteMetadata(routeId: string) {
  const db = getDb();
  const result = await db
    .select()
    .from(routeMetadata)
    .where(
      and(
        eq(routeMetadata.routeId, routeId),
        isNull(routeMetadata.archivedAt)
      )
    )
    .limit(1);

  return result[0] || null;
}

/**
 * Get all non-archived route metadata
 *
 * @returns Array of route metadata records
 */
export async function getAllRouteMetadata() {
  const db = getDb();
  return await db
    .select()
    .from(routeMetadata)
    .where(isNull(routeMetadata.archivedAt))
    .orderBy(routeMetadata.path);
}

/**
 * Create or update route metadata
 *
 * If a route with the same routeId exists, updates it.
 * Otherwise, creates a new route metadata record.
 *
 * @param data - Route metadata to create/update
 * @returns Created or updated route metadata
 */
export async function upsertRouteMetadata(data: NewRouteMetadata) {
  const db = getDb();

  // Check if route exists
  const existing = await getRouteMetadata(data.routeId);

  if (existing) {
    // Update existing route
    const result = await db
      .update(routeMetadata)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(routeMetadata.routeId, data.routeId))
      .returning();

    return result[0];
  } else {
    // Create new route
    const result = await db.insert(routeMetadata).values(data).returning();

    return result[0];
  }
}

/**
 * Update route metadata status
 *
 * @param routeId - Route identifier
 * @param status - New status (healthy, flaky, broken)
 * @returns Updated route metadata
 */
export async function updateRouteStatus(routeId: string, status: string) {
  const db = getDb();
  const result = await db
    .update(routeMetadata)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(routeMetadata.routeId, routeId))
    .returning();

  return result[0];
}

/**
 * Soft delete route metadata
 *
 * @param routeId - Route identifier
 * @returns Archived route metadata
 */
export async function archiveRouteMetadata(routeId: string) {
  const db = getDb();
  const result = await db
    .update(routeMetadata)
    .set({
      archivedAt: new Date(),
    })
    .where(eq(routeMetadata.routeId, routeId))
    .returning();

  return result[0];
}

/**
 * Update route metadata with partial data
 *
 * @param routeId - Route identifier
 * @param data - Partial route metadata to update
 * @returns Updated route metadata
 */
export async function updateRouteMetadata(routeId: string, data: Partial<NewRouteMetadata>) {
  const db = getDb();
  const result = await db
    .update(routeMetadata)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(routeMetadata.routeId, routeId))
    .returning();

  return result[0];
}

/**
 * Get error cluster count for a route
 *
 * @param routeId - Route identifier
 * @returns Count of error clusters
 */
export async function getErrorClusterCount(routeId: string): Promise<number> {
  const db = getDb();
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(errorCluster)
    .where(and(eq(errorCluster.routeId, routeId), isNull(errorCluster.archivedAt)));

  return Number(result[0]?.count || 0);
}

// ============================================================================
// Error Cluster Queries
// ============================================================================

/**
 * Get error clusters for a route
 *
 * @param routeId - Route identifier
 * @param options - Query options (resolved, limit, offset)
 * @returns Array of error clusters with total count
 */
export async function getErrorClusters(
  routeId: string,
  options: {
    resolved?: boolean;
    limit?: number;
    offset?: number;
  } = {}
) {
  const db = getDb();
  const { resolved, limit = 50, offset = 0 } = options;

  // Build where conditions
  const conditions = [eq(errorCluster.routeId, routeId), isNull(errorCluster.archivedAt)];

  if (resolved !== undefined) {
    if (resolved) {
      conditions.push(sql`${errorCluster.resolvedAt} IS NOT NULL`);
    } else {
      conditions.push(isNull(errorCluster.resolvedAt));
    }
  }

  // Get clusters
  const clusters = await db
    .select()
    .from(errorCluster)
    .where(and(...conditions))
    .orderBy(
      sql`CASE ${errorCluster.severity}
        WHEN 'error' THEN 1
        WHEN 'warning' THEN 2
        ELSE 3
      END`,
      desc(errorCluster.createdAt)
    )
    .limit(limit)
    .offset(offset);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(errorCluster)
    .where(and(...conditions));

  const total = Number(countResult[0]?.count || 0);

  return {
    clusters,
    total,
    limit,
    offset,
  };
}

/**
 * Create error cluster
 *
 * @param data - Error cluster data
 * @returns Created error cluster
 */
export async function createErrorCluster(data: NewErrorCluster) {
  const db = getDb();
  const result = await db.insert(errorCluster).values(data).returning();

  return result[0];
}

/**
 * Mark error cluster as resolved
 *
 * @param clusterId - Error cluster ID
 * @returns Updated error cluster
 */
export async function resolveErrorCluster(clusterId: string) {
  const db = getDb();
  const result = await db
    .update(errorCluster)
    .set({
      resolvedAt: new Date(),
    })
    .where(eq(errorCluster.id, clusterId))
    .returning();

  return result[0];
}

/**
 * Get unresolved error count for a route
 *
 * @param routeId - Route identifier
 * @returns Count of unresolved errors
 */
export async function getUnresolvedErrorCount(routeId: string): Promise<number> {
  const db = getDb();
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(errorCluster)
    .where(
      and(
        eq(errorCluster.routeId, routeId),
        isNull(errorCluster.resolvedAt),
        isNull(errorCluster.archivedAt)
      )
    );

  return Number(result[0]?.count || 0);
}

/**
 * Get last error for a route
 *
 * @param routeId - Route identifier
 * @returns Most recent unresolved error or null
 */
export async function getLastError(routeId: string) {
  const db = getDb();
  const result = await db
    .select()
    .from(errorCluster)
    .where(
      and(
        eq(errorCluster.routeId, routeId),
        isNull(errorCluster.resolvedAt),
        isNull(errorCluster.archivedAt)
      )
    )
    .orderBy(desc(errorCluster.createdAt))
    .limit(1);

  return result[0] || null;
}

// ============================================================================
// Route Health Event Queries
// ============================================================================

/**
 * Get health events for a route
 *
 * @param routeId - Route identifier
 * @param options - Query options (limit, offset)
 * @returns Array of health events with total count
 */
export async function getHealthEvents(
  routeId: string,
  options: {
    limit?: number;
    offset?: number;
  } = {}
) {
  const db = getDb();
  const { limit = 50, offset = 0 } = options;

  const events = await db
    .select()
    .from(routeHealthEvent)
    .where(eq(routeHealthEvent.routeId, routeId))
    .orderBy(desc(routeHealthEvent.createdAt))
    .limit(limit)
    .offset(offset);

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(routeHealthEvent)
    .where(eq(routeHealthEvent.routeId, routeId));

  const total = Number(countResult[0]?.count || 0);

  return {
    events,
    total,
    limit,
    offset,
  };
}

/**
 * Create health event
 *
 * @param data - Health event data
 * @returns Created health event
 */
export async function createHealthEvent(data: NewRouteHealthEvent) {
  const db = getDb();
  const result = await db.insert(routeHealthEvent).values(data).returning();

  return result[0];
}

/**
 * Get most recent health status for a route
 *
 * @param routeId - Route identifier
 * @returns Most recent health event or null
 */
export async function getMostRecentHealthStatus(routeId: string) {
  const db = getDb();
  const result = await db
    .select()
    .from(routeHealthEvent)
    .where(eq(routeHealthEvent.routeId, routeId))
    .orderBy(desc(routeHealthEvent.createdAt))
    .limit(1);

  return result[0] || null;
}

// ============================================================================
// Error Brain Analysis Queries
// ============================================================================

/**
 * Get error brain analyses for a route
 *
 * @param routeId - Route identifier
 * @returns Array of analyses
 */
export async function getErrorBrainAnalyses(routeId: string) {
  const db = getDb();
  return await db
    .select()
    .from(errorBrainAnalysis)
    .where(eq(errorBrainAnalysis.routeId, routeId))
    .orderBy(desc(errorBrainAnalysis.createdAt));
}

/**
 * Create error brain analysis
 *
 * @param data - Analysis data
 * @returns Created analysis
 */
export async function createErrorBrainAnalysis(data: NewErrorBrainAnalysis) {
  const db = getDb();
  const result = await db.insert(errorBrainAnalysis).values(data).returning();

  return result[0];
}

/**
 * Get suggestion count for a route
 *
 * @param routeId - Route identifier
 * @returns Count of analyses
 */
export async function getSuggestionCount(routeId: string): Promise<number> {
  const db = getDb();
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(errorBrainAnalysis)
    .where(eq(errorBrainAnalysis.routeId, routeId));

  return Number(result[0]?.count || 0);
}

// ============================================================================
// Error Brain Patch Queries
// ============================================================================

/**
 * Create error brain patch
 *
 * @param data - Patch data
 * @returns Created patch
 */
export async function createErrorBrainPatch(data: NewErrorBrainPatch) {
  const db = getDb();
  const result = await db.insert(errorBrainPatch).values(data).returning();

  return result[0];
}

/**
 * Update patch verification status
 *
 * @param patchId - Patch ID
 * @param status - Verification status (pending, passed, failed)
 * @param message - Verification message
 * @returns Updated patch
 */
export async function updatePatchVerificationStatus(
  patchId: string,
  status: string,
  message?: string
) {
  const db = getDb();
  const result = await db
    .update(errorBrainPatch)
    .set({
      verificationStatus: status,
      verificationTimestamp: new Date(),
      verificationMessage: message,
    })
    .where(eq(errorBrainPatch.id, patchId))
    .returning();

  return result[0];
}

// ============================================================================
// Route Interaction Log Queries
// ============================================================================

/**
 * Log route interaction
 *
 * @param data - Interaction data
 * @returns Created interaction log
 */
export async function logInteraction(data: NewRouteInteractionLog) {
  const db = getDb();
  const result = await db.insert(routeInteractionLog).values(data).returning();

  return result[0];
}

/**
 * Get interactions for a route
 *
 * @param routeId - Route identifier
 * @param options - Query options (limit, offset)
 * @returns Array of interactions with total count
 */
export async function getInteractions(
  routeId: string,
  options: {
    limit?: number;
    offset?: number;
  } = {}
) {
  const db = getDb();
  const { limit = 50, offset = 0 } = options;

  const interactions = await db
    .select()
    .from(routeInteractionLog)
    .where(eq(routeInteractionLog.routeId, routeId))
    .orderBy(desc(routeInteractionLog.createdAt))
    .limit(limit)
    .offset(offset);

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(routeInteractionLog)
    .where(eq(routeInteractionLog.routeId, routeId));

  const total = Number(countResult[0]?.count || 0);

  return {
    interactions,
    total,
    limit,
    offset,
  };
}

// ============================================================================
// Enriched Queries (Combining Multiple Tables)
// ============================================================================

/**
 * Get enriched route metadata with health status and error counts
 *
 * @param routeId - Route identifier
 * @returns Enriched route data or null
 */
export async function getEnrichedRouteMetadata(routeId: string) {
  const route = await getRouteMetadata(routeId);
  if (!route) return null;

  const [errorCount, recentHealth, suggestionCount, lastError] = await Promise.all([
    getUnresolvedErrorCount(routeId),
    getMostRecentHealthStatus(routeId),
    getSuggestionCount(routeId),
    getLastError(routeId),
  ]);

  return {
    ...route,
    errorCount,
    healthStatus: recentHealth?.newStatus || route.status,
    suggestionCount,
    lastHealthChange: recentHealth?.createdAt,
    lastErrorMessage: lastError?.message,
    lastErrorAt: lastError?.createdAt,
  };
}

/**
 * Get all enriched route metadata
 *
 * @returns Array of enriched route data
 */
export async function getAllEnrichedRouteMetadata() {
  const routes = await getAllRouteMetadata();

  return await Promise.all(
    routes.map(async (route) => {
      const [errorCount, recentHealth, suggestionCount, lastError] = await Promise.all([
        getUnresolvedErrorCount(route.routeId),
        getMostRecentHealthStatus(route.routeId),
        getSuggestionCount(route.routeId),
        getLastError(route.routeId),
      ]);

      return {
        ...route,
        errorCount,
        healthStatus: recentHealth?.newStatus || route.status,
        suggestionCount,
        lastHealthChange: recentHealth?.createdAt,
        lastErrorMessage: lastError?.message,
        lastErrorAt: lastError?.createdAt,
      };
    })
  );
}
