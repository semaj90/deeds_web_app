import { eq, desc, isNull, isNotNull, sql } from 'drizzle-orm';
import { getDb } from './pool';
import {
  routeMetadata,
  errorCluster,
  routeHealthEvent,
  errorBrainAnalysis,
  errorBrainPatch,
  routeInteractionLog,
  type RouteMetadata,
  type RouteMetadataInsert,
  type ErrorCluster,
  type ErrorClusterInsert,
  type RouteHealthEvent,
  type RouteHealthEventInsert,
  type ErrorBrainAnalysis,
  type ErrorBrainAnalysisInsert,
  type ErrorBrainPatch,
  type ErrorBrainPatchInsert,
  type RouteInteractionLog,
  type RouteInteractionLogInsert,
} from './schema';

// ─────────────────────────────────────────────────────────
// Route Metadata Queries
// ─────────────────────────────────────────────────────────

export async function getRouteMetadata(routeId: string): Promise<RouteMetadata | undefined> {
  const db = getDb();
  const result = await db
    .select()
    .from(routeMetadata)
    .where(eq(routeMetadata.routeId, routeId))
    .limit(1);
  return result[0];
}

export async function getAllRouteMetadata(includeArchived = false): Promise<RouteMetadata[]> {
  const db = getDb();
  const query = db.select().from(routeMetadata);

  if (!includeArchived) {
    return query.where(isNull(routeMetadata.archivedAt));
  }

  return query;
}

export async function createRouteMetadata(data: RouteMetadataInsert): Promise<RouteMetadata> {
  const db = getDb();
  const result = await db.insert(routeMetadata).values(data).returning();
  return result[0];
}

export async function updateRouteMetadata(
  routeId: string,
  data: Partial<RouteMetadataInsert>
): Promise<RouteMetadata | undefined> {
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

export async function archiveRouteMetadata(routeId: string): Promise<RouteMetadata | undefined> {
  const db = getDb();
  const result = await db
    .update(routeMetadata)
    .set({
      archivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(routeMetadata.routeId, routeId))
    .returning();
  return result[0];
}

// ─────────────────────────────────────────────────────────
// Error Cluster Queries
// ─────────────────────────────────────────────────────────

export async function getErrorClusters(
  routeId: string,
  options?: {
    limit?: number;
    offset?: number;
    resolved?: boolean;
  }
): Promise<ErrorCluster[]> {
  const db = getDb();
  let query = db
    .select()
    .from(errorCluster)
    .where(eq(errorCluster.routeId, routeId));

  if (options?.resolved === false) {
    query = query.where(isNull(errorCluster.resolvedAt));
  } else if (options?.resolved === true) {
    query = query.where(isNotNull(errorCluster.resolvedAt));
  }

  query = query.orderBy(
    desc(errorCluster.severity),
    desc(errorCluster.createdAt)
  );

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.offset(options.offset);
  }

  return query;
}

export async function getErrorClusterCount(
  routeId: string,
  resolved?: boolean
): Promise<number> {
  const db = getDb();
  let query = db
    .select({ count: sql<number>`count(*)` })
    .from(errorCluster)
    .where(eq(errorCluster.routeId, routeId));

  if (resolved === false) {
    query = query.where(isNull(errorCluster.resolvedAt));
  } else if (resolved === true) {
    query = query.where(isNotNull(errorCluster.resolvedAt));
  }

  const result = await query;
  return result[0]?.count || 0;
}

export async function createErrorCluster(data: ErrorClusterInsert): Promise<ErrorCluster> {
  const db = getDb();
  const result = await db.insert(errorCluster).values(data).returning();
  return result[0];
}

export async function resolveErrorCluster(clusterId: string): Promise<ErrorCluster | undefined> {
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

// ─────────────────────────────────────────────────────────
// Route Health Event Queries
// ─────────────────────────────────────────────────────────

export async function getHealthEvents(
  routeId: string,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<RouteHealthEvent[]> {
  const db = getDb();
  let query = db
    .select()
    .from(routeHealthEvent)
    .where(eq(routeHealthEvent.routeId, routeId))
    .orderBy(desc(routeHealthEvent.createdAt));

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.offset(options.offset);
  }

  return query;
}

export async function getLatestHealthEvent(routeId: string): Promise<RouteHealthEvent | undefined> {
  const db = getDb();
  const result = await db
    .select()
    .from(routeHealthEvent)
    .where(eq(routeHealthEvent.routeId, routeId))
    .orderBy(desc(routeHealthEvent.createdAt))
    .limit(1);
  return result[0];
}

export async function createHealthEvent(data: RouteHealthEventInsert): Promise<RouteHealthEvent> {
  const db = getDb();
  const result = await db.insert(routeHealthEvent).values(data).returning();
  return result[0];
}

// ─────────────────────────────────────────────────────────
// Error Brain Analysis Queries
// ─────────────────────────────────────────────────────────

export async function getErrorBrainAnalyses(
  routeId: string,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<ErrorBrainAnalysis[]> {
  const db = getDb();
  let query = db
    .select()
    .from(errorBrainAnalysis)
    .where(eq(errorBrainAnalysis.routeId, routeId))
    .orderBy(desc(errorBrainAnalysis.createdAt));

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.offset(options.offset);
  }

  return query;
}

export async function createErrorBrainAnalysis(
  data: ErrorBrainAnalysisInsert
): Promise<ErrorBrainAnalysis> {
  const db = getDb();
  const result = await db.insert(errorBrainAnalysis).values(data).returning();
  return result[0];
}

export async function updateErrorBrainAnalysis(
  analysisId: string,
  data: Partial<ErrorBrainAnalysisInsert>
): Promise<ErrorBrainAnalysis | undefined> {
  const db = getDb();
  const result = await db
    .update(errorBrainAnalysis)
    .set(data)
    .where(eq(errorBrainAnalysis.id, analysisId))
    .returning();
  return result[0];
}

// ─────────────────────────────────────────────────────────
// Error Brain Patch Queries
// ─────────────────────────────────────────────────────────

export async function getErrorBrainPatches(
  analysisId: string,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<ErrorBrainPatch[]> {
  const db = getDb();
  let query = db
    .select()
    .from(errorBrainPatch)
    .where(eq(errorBrainPatch.analysisId, analysisId))
    .orderBy(desc(errorBrainPatch.createdAt));

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.offset(options.offset);
  }

  return query;
}

export async function createErrorBrainPatch(
  data: ErrorBrainPatchInsert
): Promise<ErrorBrainPatch> {
  const db = getDb();
  const result = await db.insert(errorBrainPatch).values(data).returning();
  return result[0];
}

export async function updateErrorBrainPatchVerification(
  patchId: string,
  verificationStatus: 'passed' | 'failed',
  verificationMessage?: string
): Promise<ErrorBrainPatch | undefined> {
  const db = getDb();
  const result = await db
    .update(errorBrainPatch)
    .set({
      verificationStatus,
      verificationTimestamp: new Date(),
      verificationMessage,
    })
    .where(eq(errorBrainPatch.id, patchId))
    .returning();
  return result[0];
}

export async function getPatchSuccessRate(routeId: string): Promise<number> {
  const db = getDb();
  const result = await db
    .select({
      passed: sql<number>`count(case when verification_status = 'passed' then 1 end)`,
      total: sql<number>`count(*)`,
    })
    .from(errorBrainPatch)
    .where(eq(errorBrainPatch.routeId, routeId));

  const { passed, total } = result[0] || { passed: 0, total: 0 };
  return total > 0 ? (passed / total) * 100 : 0;
}

// ─────────────────────────────────────────────────────────
// Route Interaction Log Queries
// ─────────────────────────────────────────────────────────

export async function getInteractionLogs(
  routeId: string,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<RouteInteractionLog[]> {
  const db = getDb();
  let query = db
    .select()
    .from(routeInteractionLog)
    .where(eq(routeInteractionLog.routeId, routeId))
    .orderBy(desc(routeInteractionLog.createdAt));

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.offset(options.offset);
  }

  return query;
}

export async function createInteractionLog(
  data: RouteInteractionLogInsert
): Promise<RouteInteractionLog> {
  const db = getDb();
  const result = await db.insert(routeInteractionLog).values(data).returning();
  return result[0];
}

// ─────────────────────────────────────────────────────────
// Utility Queries
// ─────────────────────────────────────────────────────────

export async function calculateRouteHealth(routeId: string): Promise<'healthy' | 'flaky' | 'broken'> {
  const unresolvedErrors = await getErrorClusters(routeId, { resolved: false });

  const hasErrors = unresolvedErrors.some((e) => e.severity === 'error');
  const hasWarnings = unresolvedErrors.some((e) => e.severity === 'warning');

  if (hasErrors) return 'broken';
  if (hasWarnings) return 'flaky';
  return 'healthy';
}

export async function getRouteStats(routeId: string): Promise<{
  errorCount: number;
  warningCount: number;
  infoCount: number;
  lastErrorAt?: Date;
  lastErrorMessage?: string;
  suggestionCount: number;
  patchSuccessRate: number;
}> {
  const errors = await getErrorClusters(routeId, { resolved: false });
  const analyses = await getErrorBrainAnalyses(routeId, { limit: 1 });
  const successRate = await getPatchSuccessRate(routeId);

  const errorCount = errors.filter((e) => e.severity === 'error').length;
  const warningCount = errors.filter((e) => e.severity === 'warning').length;
  const infoCount = errors.filter((e) => e.severity === 'info').length;

  const lastError = errors[0];

  return {
    errorCount,
    warningCount,
    infoCount,
    lastErrorAt: lastError?.createdAt,
    lastErrorMessage: lastError?.message,
    suggestionCount: analyses.length,
    patchSuccessRate: successRate,
  };
}
