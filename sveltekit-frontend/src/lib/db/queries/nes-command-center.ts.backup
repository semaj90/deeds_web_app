/**
 * NES Command Center Database Query Helpers
 *
 * Provides type-safe query functions for route metadata, error tracking,
 * health monitoring, and user interactions. All queries use Drizzle ORM.
 *
 * @module db/queries/nes-command-center
 */

import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '../pool.js';
import {
    errorBrainAnalysis,
    errorBrainPatch,
    errorCluster,
    routeHealthEvent,
    routeInteractionLog,
    routeMetadata,
    type NewErrorBrainAnalysis,
    type NewErrorBrainPatch,
    type NewErrorCluster,
    type NewRouteHealthEvent,
    type NewRouteInteractionLog,
    type NewRouteMetadata
} from '../schema/nes-command-center.js';

// ============================================================================
// Route Metadata Queries
// ============================================================================

/**
 * Get route metadata by route ID
 */
export async function getRouteMetadata(routeId: string) {
  const db = getDb();
  const result = await db.select()
    .from(routeMetadata)
    .where(
      and(
        eq(routeMetadata.routeId, routeId),
        isNull(routeMetadata.archivedAt)
      )
    )
    .limit(1);

  return result[0] ?? null;
}

/**
 * Get all non-archived route metadata
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
 */
export async function upsertRouteMetadata(data: NewRouteMetadata) {
  const db = getDb();
  const result = await db.insert(routeMetadata)
    .values(data)
    .onConflictDoUpdate({
      target: routeMetadata.routeId,
      set: {
        ...data,
        updatedAt: new Date(),
      }
    })
    .returning();

  return result[0];
}

/**
 * Update route metadata status
 */
export async function updateRouteStatus(routeId: string, status: string) {
  const db = getDb();
  const result = await db.update(routeMetadata)
    .set({ status, updatedAt: new Date() })
    .where(eq(routeMetadata.routeId, routeId))
    .returning();

  return result[0];
}

/**
 * Soft delete route metadata
 */
export async function archiveRouteMetadata(routeId: string) {
  const db = getDb();
  const result = await db.update(routeMetadata)
    .set({ archivedAt: new Date() })
    .where(eq(routeMetadata.routeId, routeId))
    .returning();

  return result[0];
}

/**
 * Update route metadata with partial data
 */
export async function updateRouteMetadata(routeId: string, data: Partial<NewRouteMetadata>) {
  const db = getDb();
  const result = await db.update(routeMetadata)
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
 */
export async function getErrorClusterCount(routeId: string): Promise<number> {
  const db = getDb();
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(errorCluster)
    .where(and(eq(errorCluster.routeId, routeId), isNull(errorCluster.archivedAt)));

  return Number(result[0]?.count ?? 0);
}

// ============================================================================
// Error Cluster Queries
// ============================================================================

/**
 * Get error clusters for a route
 */
export async function getErrorClusters(
  routeId: string,
  options: {
    resolved?: boolean,
    limit?: number,
    offset?: number;
  } = {}
) {
  const db = getDb();
  const { resolved, limit = 50, offset = 0 } = options;

  const conditions = [eq(errorCluster.routeId, routeId), isNull(errorCluster.archivedAt)];

  if (resolved !== undefined) {
    if (resolved) {
      conditions.push(sql`${errorCluster.resolvedAt} IS NOT NULL`);
    } else {
      conditions.push(isNull(errorCluster.resolvedAt));
    }
  }

  const clusters = await db.select()
    .from(errorCluster)
    .where(and(...conditions))
    .orderBy(
      sql`CASE \${errorCluster.severity}
        WHEN 'error' THEN 1
        WHEN 'warning' THEN 2
        ELSE 3
      END`,
      desc(errorCluster.createdAt)
    )
    .limit(limit)
    .offset(offset);

  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(errorCluster)
    .where(and(...conditions));

  const total = Number(countResult[0]?.count ?? 0);

  return {
    clusters,
    total,
    limit,
    offset,
  };
}

/**
 * Create error cluster
 */
export async function createErrorCluster(data: NewErrorCluster) {
  const db = getDb();
  const result = await db.insert(errorCluster).values(data).returning();
  return result[0];
}

/**
 * Mark error cluster as resolved
 */
export async function resolveErrorCluster(clusterId: string) {
  const db = getDb();
  const result = await db.update(errorCluster)
    .set({ resolvedAt: new Date() })
    .where(eq(errorCluster.id, clusterId))
    .returning();

  return result[0];
}

/**
 * Get unresolved error count for a route
 */
export async function getUnresolvedErrorCount(routeId: string): Promise<number> {
  const db = getDb();
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(errorCluster)
    .where(
      and(
        eq(errorCluster.routeId, routeId),
        isNull(errorCluster.resolvedAt),
        isNull(errorCluster.archivedAt)
      )
    );

  return Number(result[0]?.count ?? 0);
}

/**
 * Get last error for a route
 */
export async function getLastError(routeId: string) {
  const db = getDb();
  const result = await db.select()
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

  return result[0] ?? null;
}

// ============================================================================
// Route Health Event Queries
// ============================================================================

/**
 * Get health events for a route
 */
export async function getHealthEvents(
  routeId: string,
  options: {
    limit?: number,
    offset?: number,
  } = {}
) {
  const db = getDb();
  const { limit = 50, offset = 0 } = options;

  const events = await db.select()
    .from(routeHealthEvent)
    .where(eq(routeHealthEvent.routeId, routeId))
    .orderBy(desc(routeHealthEvent.createdAt))
    .limit(limit)
    .offset(offset);

  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(routeHealthEvent)
    .where(eq(routeHealthEvent.routeId, routeId));

  const total = Number(countResult[0]?.count ?? 0);

  return {
    events,
    total,
    limit,
    offset,
  };
}

/**
 * Create health event
 */
export async function createHealthEvent(data: NewRouteHealthEvent) {
  const db = getDb();
  const result = await db.insert(routeHealthEvent).values(data).returning();
  return result[0];
}

/**
 * Get most recent health status for a route
 */
export async function getMostRecentHealthStatus(routeId: string) {
  const db = getDb();
  const result = await db.select()
    .from(routeHealthEvent)
    .where(eq(routeHealthEvent.routeId, routeId))
    .orderBy(desc(routeHealthEvent.createdAt))
    .limit(1);

  return result[0] ?? null;
}

// ============================================================================
// Error Brain Analysis Queries
// ============================================================================

/**
 * Get error brain analyses for a route
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
 */
export async function createErrorBrainAnalysis(data: NewErrorBrainAnalysis) {
  const db = getDb();
  const result = await db.insert(errorBrainAnalysis).values(data).returning();
  return result[0];
}

/**
 * Get suggestion count for a route
 */
export async function getSuggestionCount(routeId: string): Promise<number> {
  const db = getDb();
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(errorBrainAnalysis)
    .where(eq(errorBrainAnalysis.routeId, routeId));

  return Number(result[0]?.count ?? 0);
}

// ============================================================================
// Error Brain Patch Queries
// ============================================================================

/**
 * Create error brain patch
 */
export async function createErrorBrainPatch(data: NewErrorBrainPatch) {
  const db = getDb();
  const result = await db.insert(errorBrainPatch).values(data).returning();
  return result[0];
}

/**
 * Update patch verification status
 */
export async function updatePatchVerificationStatus(
  patchId: string,
  status: string,
  message?: string
) {
  const db = getDb();
  const result = await db.update(errorBrainPatch)
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
 */
export async function logInteraction(data: NewRouteInteractionLog) {
  const db = getDb();
  const result = await db.insert(routeInteractionLog).values(data).returning();
  return result[0];
}

/**
 * Get interactions for a route
 */
export async function getInteractions(
  routeId: string,
  options: {
    limit?: number,
    offset?: number,
  } = {}
) {
  const db = getDb();
  const { limit = 50, offset = 0 } = options;

  const interactions = await db.select()
    .from(routeInteractionLog)
    .where(eq(routeInteractionLog.routeId, routeId))
    .orderBy(desc(routeInteractionLog.createdAt))
    .limit(limit)
    .offset(offset);

  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(routeInteractionLog)
    .where(eq(routeInteractionLog.routeId, routeId));

  const total = Number(countResult[0]?.count ?? 0);

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
 */
export async function getEnrichedRouteMetadata(routeId: string) {
  const route = await getRouteMetadata(routeId);
  if (!route) return null;
  const [errorCount, recentHealth, suggestionCount, lastError] = await Promise.all([
    getUnresolvedErrorCount(routeId),
    getMostRecentHealthStatus(routeId),
    getSuggestionCount(routeId),
    getLastError(routeId)
  ]);

  return {
    ...route,
    errorCount,
    healthStatus: recentHealth?.newStatus ?? route.status,
    suggestionCount,
    lastHealthChange: recentHealth?.createdAt,
    lastErrorMessage: lastError?.message,
    lastErrorAt: lastError?.createdAt,
  };
}

/**
 * Get all enriched route metadata
 */
export async function getAllEnrichedRouteMetadata() {
  const routes = await getAllRouteMetadata();

  return await Promise.all(
    routes.map(async (route) => {
      const [errorCount, recentHealth, suggestionCount, lastError] = await Promise.all([
        getUnresolvedErrorCount(route.routeId),
        getMostRecentHealthStatus(route.routeId),
        getSuggestionCount(route.routeId),
        getLastError(route.routeId)
      ]);

      return {
        ...route,
        errorCount,
        healthStatus: recentHealth?.newStatus ?? route.status,
        suggestionCount,
        lastHealthChange: recentHealth?.createdAt,
        lastErrorMessage: lastError?.message,
        lastErrorAt: lastError?.createdAt,
      };
    })
  );
}


