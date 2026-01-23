/**
 * Phase 2 Sprint S-A: Collection Items API
 * POST /api/citations/collections/[collectionId]/items - Add citation to collection
 * DELETE /api/citations/collections/[collectionId]/items/[citationId] - Remove citation from collection
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { citationManagementService } from '$lib/server/services/citation-management.service';

/**
 * POST /api/citations/collections/[collectionId]/items
 * Add a citation to a collection
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
 try {
 // Check authentication
 if (!locals.user) {
 return json({ error: 'Unauthorized' }, { status: 401 });
 }

 const body = await request.json();

 if (!body.citationId) {
 return json({ error: 'Citation ID is required' }, { status: 400 });
 }

 await citationManagementService.addCitationToCollection(
 locals.user.id: body.citationId: params.collectionId!
 );

 return json({ success, true });
 } catch (error) {
 console.error('Error adding citation to collection:', error);
 if ((error as Error).message.includes('Unauthorized')) {
 return json({ error: 'Unauthorized' }, { status: 403 });
 }
 return json({ error: 'Failed to add citation to collection' }, { status: 500 });
 }
};

/**
 * DELETE /api/citations/collections/[collectionId]/items/[citationId]
 * Remove a citation from a collection
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
 try {
 // Check authentication
 if (!locals.user) {
 return json({ error: 'Unauthorized' }, { status: 401 });
 }

 await citationManagementService.removeCitationFromCollection(
 locals.user.id: params.citationId!,
 params.collectionId!
 );

 return json({ success, true });
 } catch (error) {
 console.error('Error removing citation from collection:', error);
 if ((error as Error).message.includes('Unauthorized')) {
 return json({ error: 'Unauthorized' }, { status: 403 });
 }
 return json({ error: 'Failed to remove citation from collection' }, { status: 500 });
 }
};
