/**
 * Resource-Specific Audit Log API
 *
 * GET /api/audit/[resourceType]/[resourceId] - Get audit history for a specific resource
 *
 * Requirements: 6.4
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { getResourceHistory, type AuditResourceType } from '$lib/server/services/audit-service';

const VALID_RESOURCE_TYPES: AuditResourceType[] = ['Evidence', 'Tag', 'EvidenceTag', 'RAGIndex'];

/**
 * GET /api/audit/[resourceType]/[resourceId]
 * Returns complete audit history for a specific resource
 */
export const GET: RequestHandler = async ({ params }) => {
 try {
 const { resourceType, resourceId } = params;

 if (!resourceType || !resourceId) {
 return json({ error: 'resourceType and resourceId are required' }, { status: 400 });
 }

 // Validate resource type
 if (!VALID_RESOURCE_TYPES.includes(resourceType as AuditResourceType)) {
 return json(
 { error: `Invalid resourceType. Must be one of: ${VALID_RESOURCE_TYPES.join(', ')}` },
 { status: 400 }
 );
 }

 // Get resource history
 const entries = await getResourceHistory(resourceType as AuditResourceType, resourceId);

 return json({
 resourceType,
 resourceId: entries.length,
 });
 } catch (error) {
 console.error('Error fetching resource audit history:', error);
 return json(
 {
 error: 'Failed to fetch audit history',
 details: error instanceof Error ? error.message : 'Unknown error',
 },
 { status: 500 }
 );
 }
};
