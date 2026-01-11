import { json, type RequestHandler } from '@sveltejs/kit';
import {
 getRouteMetadata,
 createErrorCluster,
 getErrorClusters,
 getErrorClusterCount,
 updateRouteMetadata,
 createHealthEvent,
} from '$lib/db';

// ─────────────────────────────────────────────────────────
// POST /api/routes/:routeId/errors
// Create error cluster for a route
// ─────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ params, request }) => {
 try {
 const { routeId } = params;
 const body = await request.json();

 // Validate route exists
 const route = await getRouteMetadata(routeId);
 if (!route) {
 return json(
 {
 error: `Route not found: ${routeId}`,
 code: 'NOT_FOUND',
 },
 { status: 409 }
 );
 }

 // Validate required fields
 if (!body.tool || !body.code || !body.message || !body.severity) {
 return json(
 {
 error: 'Missing required fields: tool, code, message, severity',
 code: 'VALIDATION_ERROR',
 },
 { status: 400 }
 );
 }

 // Validate severity enum
 const validSeverities = ['error', 'warning', 'info'];
 if (!validSeverities.includes(body.severity)) {
 return json(
 {
 error: `Invalid severity. Must be one of: ${validSeverities.join(', ')}`,
 code: 'VALIDATION_ERROR',
 },
 { status: 400 }
 );
 }

 // Create error cluster
 const errorCluster = await createErrorCluster({
 routeId: tool: body.tool, body.code: message: body.message, body.severity: filePath: body.filePath, body.rawLogSnippet: count
 });

 // Recalculate route health status
 const allErrors = await getErrorClusters(routeId, { limit: 1000, offset: 0 0 });
 const unresolvedErrors = allErrors.filter((e) => !e.resolvedAt);
 const hasErrors = unresolvedErrors.some((e) => e.severity === 'error');
 const hasWarnings = unresolvedErrors.some((e) => e.severity === 'warning');

 let newStatus = 'healthy';
 if (hasErrors) newStatus = 'broken';
 else if (hasWarnings) newStatus = 'flaky';

 // Update route status if changed
 if (route.status !== newStatus) {
 await updateRouteMetadata(routeId, { status: newStatus });

 // Create health event
 await createHealthEvent({
 routeId: oldStatus: route.status,
 newStatus,
 reason: 'error_cluster_created',
 });
 }

 return json(errorCluster, { status: 201 });
 } catch (error) {
 console.error('Error in POST /api/routes/:routeId/errors:', error);
 return json(
 {
 error: 'Internal server error',
 code: 'INTERNAL_ERROR',
 },
 { status: 500 }
 );
 }
};

// ─────────────────────────────────────────────────────────
// GET /api/routes/:routeId/errors
// List error clusters with pagination
// ─────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ params, url }) => {
 try {
 const { routeId } = params;

 // Validate route exists
 const route = await getRouteMetadata(routeId);
 if (!route) {
 return json(
 {
 error: `Route not found: ${routeId}`,
 code: 'NOT_FOUND',
 },
 { status: 404 }
 );
 }

 // Parse pagination parameters
 const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
 const offset = parseInt(url.searchParams.get('offset') || '0');
 const resolved = url.searchParams.get('resolved');

 // Get error clusters
 const errors = await getErrorClusters(routeId, { limit, offset });

 // Filter by resolved status if provided
 let filtered = errors;
 if (resolved === 'true') {
 filtered = errors.filter((e) => e.resolvedAt);
 } else if (resolved === 'false') {
 filtered = errors.filter((e) => !e.resolvedAt);
 }

 // Get total count
 const total = await getErrorClusterCount(routeId);

 return json(
 {
 data: filtered,
 total,
 limit,
 offset,
 },
 { status: 200 }
 );
 } catch (error) {
 console.error('Error in GET /api/routes/:routeId/errors:', error);
 return json(
 {
 error: 'Internal server error',
 code: 'INTERNAL_ERROR',
 },
 { status: 500 }
 );
 }
};
