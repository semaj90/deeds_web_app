import { json, type RequestHandler } from '@sveltejs/kit';
import {
 getRouteMetadata,
 createRouteMetadata,
 updateRouteMetadata,
 getErrorClusters,
 getLatestHealthEvent,
 getErrorBrainAnalyses,
} from '$lib/db';

// ─────────────────────────────────────────────────────────
// POST /api/routes/metadata
// Create or update route metadata
// ─────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request }) => {
 try {
 const body = await request.json();

 // Validate required fields
 if (!body.routeId || !body.path || !body.kind) {
 return json(
 {
 error: 'Missing required fields: routeId, path, kind',
 code: 'VALIDATION_ERROR',
 },
 { status: 400 }
 );
 }

 // Validate kind enum
 const validKinds = ['page', 'layout', 'server', 'endpoint'];
 if (!validKinds.includes(body.kind)) {
 return json(
 {
 error: `Invalid kind. Must be one of: ${validKinds.join(', ')}`,
 code: 'VALIDATION_ERROR',
 },
 { status: 400 }
 );
 }

 // Check if route already exists
 const existing = await getRouteMetadata(body.routeId);

 let result;
 if (existing) {
 // Update existing route
 result = await updateRouteMetadata(body.routeId, {
 path: body.path,
 kind: body.kind,
 group: body.group,
 priority: body.priority,
 badges: body.badges,
 });
 } else {
 // Create new route
 result = await createRouteMetadata({
 routeId: body.routeId,
 path: body.path,
 kind: body.kind,
 group: body.group,
 priority: body.priority,
 badges: body.badges,
 status: 'healthy',
 });
 }

 return json(result, { status: existing ? 200 : 201 });
 } catch (error) {
 console.error('Error in POST /api/routes/metadata:', error);
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
// GET /api/routes/:routeId/metadata
// Get route metadata with current health status
// ─────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url }) => {
 try {
 // Extract routeId from query parameter
 const routeId = url.searchParams.get('routeId');

 if (!routeId) {
 return json(
 {
 error: 'Missing required query parameter: routeId',
 code: 'VALIDATION_ERROR',
 },
 { status: 400 }
 );
 }

 // Get route metadata
 const metadata = await getRouteMetadata(routeId);

 if (!metadata) {
 return json(
 {
 error: `Route not found: ${routeId}`,
 code: 'NOT_FOUND',
 },
 { status: 404 }
 );
 }

 // Get error count
 const errors = await getErrorClusters(routeId, { limit: 1000, offset: 0 });
 const unresolvedErrors = errors.filter((e) => !e.resolvedAt);
 const errorCount = unresolvedErrors.length;
 const lastError = unresolvedErrors[0];

 // Get latest health event
 const healthEvent = await getLatestHealthEvent(routeId);

 // Get suggestion count
 const analyses = await getErrorBrainAnalyses(routeId, { limit: 1000, offset: 0 });
 const suggestionCount = analyses.reduce((sum, a) => sum + (a.suggestions?.length || 0), 0);

 // Enrich metadata with current data
 const enriched = {
 ...metadata,
 errorCount,
 lastErrorAt: lastError?.createdAt,
 lastErrorMessage: lastError?.message,
 suggestionCount,
 currentStatus: healthEvent?.newStatus || metadata.status,
 };

 return json(enriched, { status: 200 });
 } catch (error) {
 console.error('Error in GET /api/routes/metadata:', error);
 return json(
 {
 error: 'Internal server error',
 code: 'INTERNAL_ERROR',
 },
 { status: 500 }
 );
 }
};
