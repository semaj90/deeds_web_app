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
} from '$lib/db/queries/route-health-queries';
import { isValidRouteId } from '$lib/server/validation.js';
import { error, json } from '@sveltejs/kit';
import { _broadcastHealthChange } from '../../events/+server.js';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';

const healthEventSchema = z.object({
  old_status: z.string().max(50).optional(),
  new_status: z.string().min(1, 'Missing required field: new_status').max(50),
  reason: z.string().max(1000).optional()
});

interface NewRouteHealthEvent {
  routeId: string;
  oldStatus: string;
  newStatus: string;
  reason?: string;
}

/**
 * POST /api/routes/:routeId/health-event
 *
 * Create a health event for a route
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const { routeId } = params;
  if (!isValidRouteId(routeId)) return error(400, { message: 'Invalid route ID format' });

  try {
    const raw = await request.json();
    const parsed = healthEventSchema.safeParse(raw);
    if (!parsed.success) {
      return error(400, {
        message: parsed.error.issues[0]?.message ?? 'Invalid input',
      });
    }
    const { old_status, new_status, reason } = parsed.data;

    const route = await getRouteMetadata(routeId);
    if (!route) {
      return error(409, {
        message: 'Route ' + routeId + ' not found in route_metadata',
      });
    }

    const healthEventData: NewRouteHealthEvent = {
      routeId,
      oldStatus: old_status || (route?.status ?? 'unknown'),
      newStatus: new_status,
      reason: reason ?? undefined,
    };

    const healthEvent = await createHealthEvent(healthEventData);

    _broadcastHealthChange({
      routeId,
      oldStatus: healthEventData.oldStatus,
      newStatus: healthEventData.newStatus,
      timestamp: new Date().toISOString(),
      reason: healthEventData?.reason ?? undefined,
    });

    return json(healthEvent, { status: 201 });
  } catch (err) {
    console.error('[POST /api/routes/' + routeId + '/health-event] Error:', err);
    return error(500, {
      message: 'Failed to create health event',
    });
  }
};

/**
 * GET /api/routes/:routeId/health-history
 *
 * Get health event history for a route
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const { routeId } = params;
  if (!isValidRouteId(routeId)) return error(400, { message: 'Invalid route ID format' });

  try {
    const limit = parseInt(url.searchParams.get('limit') ?? '50');
    const offset = parseInt(url.searchParams.get('offset') ?? '0');

    const route = await getRouteMetadata(routeId);
    if (!route) {
      return error(404, {
        message: 'Route ' + routeId + ' not found',
      });
    }

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
    console.error('[GET /api/routes/' + routeId + '/health-history] Error:', err);
    return error(500, {
      message: 'Failed to fetch health events',
    });
  }
};