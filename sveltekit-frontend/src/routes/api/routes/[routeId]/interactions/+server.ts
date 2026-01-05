/**
 * Route Interaction Logging API
 *
 * POST /api/routes/:routeId/interactions - Log user interaction
 * GET /api/routes/:routeId/interactions - Get interaction history
 *
 * Phase 5: API Endpoints - Interactions
 * Phase 7: Client-Side Integration - Interaction Logging
 */

import {
    getInteractions,
    getRouteMetadata,
    logInteraction,
    type NewRouteInteractionLog,
} from '$lib/db/queries/nes-command-center';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

/**
 * POST /api/routes/:routeId/interactions
 *
 * Log a user interaction with a route
 *
 * Task 5.1: Implement POST /api/routes/:routeId/interactions
 * - Accept interaction_type, user_id, metadata
 * - Validate route_id exists in route_metadata (return 409 if not)
 * - Validate interaction_type is one of: view, navigate, analyze, patch_apply
 * - Create route_interaction_log record
 * - Return created interaction record
 */
export const POST: RequestHandler = async ({ params, request }) => {
  const { routeId } = params;

  try {
    // Parse request body
    const body = await request.json();
    const { interaction_type, user_id, metadata } = body;

    // Validate interaction_type
    const validTypes = ['view', 'navigate', 'analyze', 'patch_apply'];
    if (!interaction_type || !validTypes.includes(interaction_type)) {
      return error(400, {
        message: `Invalid interaction_type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    // Validate route exists
    const route = await getRouteMetadata(routeId);
    if (!route) {
      return error(409, {
        message: `Route ${ routeId } not found in route_metadata`,
      });
    }

    // Create interaction log
    const interactionData: NewRouteInteractionLog = {
      routeId,
      interactionType: interaction_type,
      userId: user_id || null,
      metadata: metadata || null,
    };

    const interaction = await logInteraction(interactionData);

    return json(interaction, { status: 201 });
  } catch (err) {
    console.error('[POST /api/routes/:routeId/interactions] Error:', err);
    return error(500, {
      message: 'Failed to log interaction',
    });
  }
};

/**
 * GET /api/routes/:routeId/interactions
 *
 * Get interaction history for a route
 *
 * Task 5.2: Implement GET /api/routes/:routeId/interactions
 * - Accept limit, offset query parameters
 * - Query route_interaction_log for route_id
 * - Join with user information if available
 * - Order by timestamp descending
 * - Return paginated results with total count
 *
 * Task 11.4: Add archive query support
 * - Accept archived query parameter (true/false)
 * - When archived=true, query archive tables
 * - When archived=false (default), query main tables
 */
export const GET: RequestHandler = async ({ params, url }) => {
  const { routeId } = params;

  try {
    // Parse query parameters
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const includeArchived = url.searchParams.get('archived') === 'true';

    // Validate route exists
    const route = await getRouteMetadata(routeId);
    if (!route) {
      return error(404, {
        message: `Route ${ routeId } not found`,
      });
    }

    // Get interactions (with or without archived data)
    let result;
    if (includeArchived) {
      // Import archive query helper
      const { getCombinedInteractions } = await import(
        '$lib/db/queries/nes-command-center-archive.js'
      );
      result = await getCombinedInteractions(routeId, { limit, offset });

      return json({
        interactions: result.data,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.hasMore,
        },
        includesArchived: true,
      });
    } else {
      // Query only main table
      result = await getInteractions(routeId, { limit, offset });

      return json({
        interactions: result.interactions,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.offset + result.limit < result.total,
        },
        includesArchived: false,
      });
    }
  } catch (err) {
    console.error('[GET /api/routes/:routeId/interactions] Error:', err);
    return error(500, {
      message: 'Failed to fetch interactions',
    });
  }
};
