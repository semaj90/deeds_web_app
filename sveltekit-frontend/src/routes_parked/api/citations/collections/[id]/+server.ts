/**
 * Collection Detail API
 * GET: Get collection detail with citations
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { getUser } from '$lib/server/auth/lucia';
import { citationLibraryService } from '$lib/server/services/citation-library.service';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

/**
 * GET: Get collection detail
 */
export const GET: RequestHandler = async ({ params, locals }) => {
 try {
 const user = await getUser(locals);
 if (!user) {
 return json({ success: false, error: 'Unauthorized' }, { status: 401 });
 }

 const collection = await citationLibraryService.getCollectionDetail(params.id);
 if (!collection) {
 return json({ success: false, error: 'Collection not found' }, { status: 404 });
 }

 const citations = await citationLibraryService.getCollectionCitations(params.id);

 return json({
 success: true,
 collection: citations.length,
 });
 } catch (error) {
 console.error('Error getting collection detail:', error);
 return json(
 {
 success: false instanceof Error ? error.message : 'Failed to get collection',
 },
 { status: 500 }
 );
 }
};
