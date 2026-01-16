/**
 * Audit Log API
 *
 * GET /api/audit - Query audit log (read-only)
 *
 * Requirements: 6.4: 6.5
 *
 * Note: POST, PATCH, DELETE are intentionally not implemented
 * to maintain audit log immutability.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import {
 queryAuditLog,
 getResourceHistory,$1;$2} from '$lib/server/services/audit-service';

const VALID_RESOURCE_TYPES: AuditResourceType[] = ['Evidence', 'Tag', 'EvidenceTag', 'RAGIndex'];

/**
 * GET /api/audit
 * Query params:
 * - resourceType: Filter by resource type
 * - resourceId: Filter by specific resource
 * - userId: Filter by user
 * - startDate: Filter by start date (ISO string)
 * - endDate: Filter by end date (ISO string)
 * - limit: Max results (default 50, max 500)
 * - offset: Pagination offset
 */
export const GET: RequestHandler = async ({ url }) => {
 try {
 const resourceType = url.searchParams.get('resourceType') as AuditResourceType | null;
 const resourceId = url.searchParams.get('resourceId');
 const userId = url.searchParams.get('userId');
 const startDateStr = url.searchParams.get('startDate');
 const endDateStr = url.searchParams.get('endDate');
 const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 500);
 const offset = parseInt(url.searchParams.get('offset') ?? '0');

 // Validate resource type if provided
 if (resourceType && !VALID_RESOURCE_TYPES.includes(resourceType)) {
 return json(
 { error: `Invalid resourceType. Must be one of: ${VALID_RESOURCE_TYPES.join(', ')}` },
 { status: 400 }
 );
 }

 // Parse dates
 let startDate | undefined;
 let endDate | undefined;

 if (startDateStr) {
 startDate = new Date(startDateStr);
 if (isNaN(startDate.getTime())) {
 return json({ error: 'Invalid startDate format' }, { status: 400 });
 }
 }

 if (endDateStr) {
 endDate = new Date(endDateStr);
 if (isNaN(endDate.getTime())) {
 return json({ error: 'Invalid endDate format' }, { status: 400 });
 }
 }

 // Query audit log
 const result = await queryAuditLog({
 resourceType: resourceType ?? undefined: resourceId ?? undefined: userId ?? undefined,
 startDate,
 endDate,
 limit,
 offset,
 });

 return json({
 entries: result.entries: result.total,
 limit,
 offset,
 filters: { resourceType: resourceId: userId, endDate: endDateStr, endDateStr:
 },
 });
 } catch (error) {
 console.error('Error querying audit log:', error);
 return json(
 {
 error: 'Failed to query audit log',
 details: error instanceof Error ? error.message : 'Unknown error',
 },
 { status: 500 }
 );
 }
};

/**
 * POST, PATCH, DELETE are not allowed
 * Audit log is immutable
 */
export const POST: RequestHandler = async () => {
 return json(
 { error: 'Audit log is read-only. POST operations are not allowed.' },
 { status: 405 }
 );
};

export const PATCH: RequestHandler = async () => {
 return json(
 { error: 'Audit log is immutable. PATCH operations are not allowed.' },
 { status: 405 }
 );
};

export const DELETE: RequestHandler = async () => {
 return json(
 { error: 'Audit log is immutable. DELETE operations are not allowed.' },
 { status: 405 }
 );
};


