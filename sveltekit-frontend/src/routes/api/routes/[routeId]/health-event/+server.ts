/**
 * Route Health Event API
 *
 * POST /api/routes/:routeId/health-event - Create health event
 * GET /api/routes/:routeId/health-history - Get health event history
 *
 * Phase 4: API Endpoints - Health Events
 * Phase 10: Real-Time Updates (SSE) - Broadcast integration
 */

import {
    createHealthEvent,
    getHealthEvents,
    getRouteMetadata,
    type NewRouteHealthEvent,
} from '$lib/db/queries/nes-command-center';
import { error, json } from '@sveltejs/kit';
import { broadcastHealthChange } from '../../events/+server.js';
import type { RequestHandler } from './$types.js';

/**
 * POST /api/routes/:routeId/health-event
 *
 * Create a health event for a route
 *
 * Task 4.1: Implement POST /api/routes/:routeId/health-event
 * Task 10.2: Broadcast health changes via SSE
 * - Accept old_status, new_status, reason
 * - Validate route_id exists in route_metadata (return 409 if not)
 * - Create route_health_event record
 * - Update route_metadata status field
 * - Broadcast to all connected SSE clients
 * - Return created health event record
 */
export const POST: RequestHandler = async ({ params, request }) => {
  const { routeId } = params;

  try {
    // Parse request body
    const body = await request.json();
    const { old_status, new_status, reason } = body;

    // Validate required fields
    if (!new_status) {
      return error(400, {
        message: 'Missing required field: new_status',
      });
    }

    // Validate route exists
    const route = await getRouteMetadata(routeId);
    if (!route) {
      return error(409, {
        message: `Route ${routeId} not found in route_metadata`,
      });
    }

    // Create health event
    const healthEventData: NewRouteHealthEvent = {
      routeId,
      oldStatus: old_status || route.status || 'unknown',
      newStatus: new_status || null,
    };

    const healthEvent = await createHealthEvent(healthEventData);

    // Broadcast to all connected SSE clients (Task 10.2)
    broadcastHealthChange({
      routeId,
      oldStatus: healthEventData.oldStatus,
      newStatus: healthEventData.newStatus,
      timestamp: new Date().toISOString(),
      reason: healthEventData.reason || undefined,
    });

    return json(healthEvent, { status: 201 });
  } catch (err) {
    console.error('[POST /api/routes/:routeId/health-event] Error:', err);
    return error(500, {
      message: 'Failed to create health event',
    });
  }
};

/**
 * GET /api/routes/:routeId/health-history
 *
 * Get health event history for a route
 *
 * Task 4.2: Implement GET /api/routes/:routeId/health-history
 * - Accept limit, offset query parameters
 * - Query route_health_event for route_id
 * - Order by timestamp descending
 * - Return paginated results with total count
 */
export const GET: RequestHandler = async ({ params, url }) => {
  const { routeId } = params;

  try {
    // Parse query parameters
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Validate route exists
    const route = await getRouteMetadata(routeId);
    if (!route) {
      return error(404, {
        message: `Route ${routeId} not found`,
      });
    }

    // Get health events
    const result = await getHealthEvents(routeId, { limit, offset });

    return json({
      events: result.events,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.offset + result.limit < result.total,
      },
    });
  } catch (err) {
    console.error('[GET /api/routes/:routeId/health-history] Error:', err);
    return error(500, {
      message: 'Failed to fetch health events',
    });
  }
};
