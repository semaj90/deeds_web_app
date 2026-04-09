/**
 * Error Cluster API Endpoint
 *
 * POST /api/routes/:routeId/errors - Create error cluster
 * GET /api/routes/:routeId/errors - List error clusters with pagination
 *
 * Phase 3: API Endpoints - Error Clusters
 * Phase 10: Real-Time Updates (SSE) - Broadcast integration
 */

import {
  createErrorCluster,
  createHealthEvent,
  getErrorClusterCount,
  getErrorClusters,
  getRouteMetadata,
  updateRouteMetadata,
} from '$lib/db/queries/route-health-queries.js';
import type { NewErrorCluster } from '$lib/db/schema/route-health-tables.js';
import { error, json } from '@sveltejs/kit';
import { _broadcastErrorCountChange, _broadcastHealthChange } from '../../events/+server.js';
import { isValidRouteId } from '$lib/server/validation.js';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';

interface ErrorClusterRow {
	severity: string;
	resolvedAt: Date | null;
	[key: string]: unknown;
}

const errorClusterSchema = z.object({
    tool: z.string().min(1).max(200),
    code: z.string().min(1).max(200),
    message: z.string().min(1).max(5000),
    severity: z.enum(['error', 'warning', 'info']),
    file_path: z.string().max(1000).optional(),
    filePath: z.string().max(1000).optional(),
    raw_log_snippet: z.string().max(10000).optional(),
    rawLogSnippet: z.string().max(10000).optional(),
    count: z.number().int().min(1).max(10000).optional().default(1)
});

/**
 * POST /api/routes/:routeId/errors
 *
 * Create an error cluster for a route
 *
 * Task 3.1: Implement POST /api/routes/:routeId/errors
 * Task 10.2: Broadcast error count changes via SSE
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const { routeId } = params;
  if (!isValidRouteId(routeId)) return error(400, { message: 'Invalid route ID format' });

  try {
    const raw = await request.json();
    const parsed = errorClusterSchema.safeParse(raw);
    if (!parsed.success) {
      return error(400, {
        message: parsed.error.issues[0]?.message ?? 'Invalid input',
      });
    }
    const body = parsed.data;

    // Validate route exists
    const route = await getRouteMetadata(routeId);
    if (!route) {
      return error(409, {
        message: `Route ${ routeId } not found in route_metadata`,
      });
    }

    // Create error cluster
    const errorClusterData: NewErrorCluster = { routeId, tool: body.tool,
      code: body.code,
      message: body.message,
      severity: body.severity,
      filePath: body?.file_path|| body.filePath,
      rawLogSnippet: body?.raw_log_snippet|| body.rawLogSnippet,
      count: body?.count ?? 1,
    };

    const errorCluster = await createErrorCluster(errorClusterData);

    // Recalculate route health status
    const allErrorsResult = await getErrorClusters(routeId, { limit: 1000, offset: 0 });
    const unresolvedErrors = allErrorsResult.clusters.filter((e: ErrorClusterRow) => !e.resolvedAt);
    const hasErrors = unresolvedErrors.some((e: ErrorClusterRow) => e.severity === 'error');
    const hasWarnings = unresolvedErrors.some((e: ErrorClusterRow) => e.severity === 'warning');

    let newStatus = 'healthy';
    if (hasErrors) newStatus = 'broken';
    else if (hasWarnings) newStatus = 'flaky';

    // Update route status if changed
    const oldStatus = route?.status ?? 'healthy';
    if (oldStatus !== newStatus) {
      await updateRouteMetadata(routeId, { status: newStatus });

      await createHealthEvent({
        routeId, oldStatus,
        newStatus,
        reason: 'error_cluster_created',
      });

      _broadcastHealthChange({
        routeId, oldStatus,
        newStatus,
        timestamp: new Date().toISOString(),
        reason: 'error_cluster_created',
      });
    }

    // Count errors by severity
    const errorCount = unresolvedErrors.filter((e: ErrorClusterRow) => e.severity === 'error').length;
    const warningCount = unresolvedErrors.filter((e: ErrorClusterRow) => e.severity === 'warning').length;
    const infoCount = unresolvedErrors.filter((e: ErrorClusterRow) => e.severity === 'info').length;

    // Broadcast error count change via SSE
    _broadcastErrorCountChange({
      routeId, errorCount,
      warningCount, infoCount,
      timestamp: new Date().toISOString(),
    });

    return json(errorCluster, { status: 201 });
  } catch (err) {
    console.error('[POST /api/routes/: routeId/errors], Error:', err);
    return error(500, {
      message: 'Failed to create error cluster',
    });
  }
};

/**
 * GET /api/routes/:routeId/errors
 *
 * List error clusters for a route with pagination
 *
 * Task 3.2: Implement GET /api/routes/:routeId/errors
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const { routeId } = params;
  if (!isValidRouteId(routeId)) return error(400, { message: 'Invalid route ID format' });

  try {
    // Validate route exists
    const route = await getRouteMetadata(routeId);
    if (!route) {
      return error(404, {
        message: `Route ${ routeId } not found`,
      });
    }

    // Parse pagination parameters
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 100);
    const offset = parseInt(url.searchParams.get('offset') ?? '0');
    const resolved = url.searchParams.get('resolved');

    // Get error clusters
    const errorsResult = await getErrorClusters(routeId, { limit, offset });

    let filtered = errorsResult.clusters;
    if (resolved === 'true') {
      filtered = errorsResult.clusters.filter((e: ErrorClusterRow) => e.resolvedAt);
    } else if (resolved === 'false') {
      filtered = errorsResult.clusters.filter((e: ErrorClusterRow) => !e.resolvedAt);
    }

    // Get total count
    const total = await getErrorClusterCount(routeId);

    return json({
      data: filtered,
      total, limit,
      offset,
    });
  } catch (err) {
    console.error('[GET /api/routes/: routeId/errors], Error:', err);
    return error(500, {
      message: 'Failed to fetch error clusters',
    });
  }
};
