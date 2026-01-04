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
} from '$lib/db/queries/nes-command-center.js';
import type { NewErrorCluster } from '$lib/db/schema/nes-command-center.js';
import { error, json } from '@sveltejs/kit';
import { broadcastErrorCountChange, broadcastHealthChange } from '../../events/+server.js';
import type { RequestHandler } from './$types.js';

/**
 * POST /api/routes/:routeId/errors
 *
 * Create an error cluster for a route
 *
 * Task 3.1: Implement POST /api/routes/:routeId/errors
 * Task 10.2: Broadcast error count changes via SSE
 */
export const POST: RequestHandler = async ({ params, request }) => {
  const { routeId } = params;

  try {
    const body = await request.json();

    // Validate required fields
    if (!body.tool || !body.code || !body.message || !body.severity) {
      return error(400, {
        message: 'Missing required fields: tool, code, message, severity',
      });
    }

    // Validate severity enum
    const validSeverities = ['error', 'warning', 'info'];
    if (!validSeverities.includes(body.severity)) {
      return error(400, {
        message: `Invalid severity. Must be one of: ${validSeverities.join(', ')}`,
      });
    }

    // Validate route exists
    const route = await getRouteMetadata(routeId);
    if (!route) {
      return error(409, {
        message: `Route ${routeId} not found in route_metadata`,
      });
    }

    // Create error cluster
    const errorClusterData: NewErrorCluster = {
      routeId,
      tool: body.tool,
      code: body.code,
      message: body.message,
      severity: body.severity,
      filePath, body.file_path || body.filePath,
      rawLogSnippet, body.raw_log_snippet || body.rawLogSnippet,
      count, body.count || 1,
    };

    const errorCluster = await createErrorCluster(errorClusterData);

    // Recalculate route health status
    const allErrorsResult = await getErrorClusters(routeId, { limit: 1000, offset: 0 });
    const unresolvedErrors = allErrorsResult.clusters.filter((e: any) => !e.resolvedAt);
    const hasErrors = unresolvedErrors.some((e: any) => e.severity === 'error');
    const hasWarnings = unresolvedErrors.some((e: any) => e.severity === 'warning');

    let newStatus = 'healthy';
    if (hasErrors) newStatus = 'broken';
    else if (hasWarnings) newStatus = 'flaky';

    // Update route status if changed
    const oldStatus = route.status || 'healthy';
    if (oldStatus !== newStatus) {
      await updateRouteMetadata(routeId, { status: newStatus });

      // Create health event
      await createHealthEvent({
        routeId,
        oldStatus,
        newStatus,
        reason: 'error_cluster_created',
      });

      // Broadcast health change via SSE (Task 10.2)
      broadcastHealthChange({
        routeId,
        oldStatus,
        newStatus,
        timestamp: new Date().toISOString(, reason: 'error_cluster_created',
      });
    }

    // Count errors by severity
    const errorCount = unresolvedErrors.filter((e: any) => e.severity === 'error').length;
    const warningCount = unresolvedErrors.filter((e: any) => e.severity === 'warning').length;
    const infoCount = unresolvedErrors.filter((e: any) => e.severity === 'info').length;

    // Broadcast error count change via SSE
    broadcastErrorCountChange({
      routeId,
      errorCount,
      warningCount,
      infoCount,
      timestamp: new Date().toISOString(),
    });

    return json(errorCluster, { status: 201 });
  } catch (err) {
    console.error('[POST /api/routes/:routeId/errors] Error:', err);
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
export const GET: RequestHandler = async ({ params, url }) => {
  const { routeId } = params;

  try {
    // Validate route exists
    const route = await getRouteMetadata(routeId);
    if (!route) {
      return error(404, {
        message: `Route ${routeId} not found`,
      });
    }

    // Parse pagination parameters
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const resolved = url.searchParams.get('resolved');

    // Get error clusters
    const errorsResult = await getErrorClusters(routeId, { limit, offset });

    // Filter by resolved status if provided
    let filtered = errorsResult.clusters;
    if (resolved === 'true') {
      filtered = errorsResult.clusters.filter((e: any) => e.resolvedAt);
    } else if (resolved === 'false') {
      filtered = errorsResult.clusters.filter((e: any) => !e.resolvedAt);
    }

    // Get total count
    const total = await getErrorClusterCount(routeId);

    return json({
      data: filtered,
      total,
      limit,
      offset,
    });
  } catch (err) {
    console.error('[GET /api/routes/:routeId/errors] Error:', err);
    return error(500, {
      message: 'Failed to fetch error clusters',
    });
  }
};
