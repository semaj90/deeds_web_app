/**
 * Citation Tags API
 * POST: Add tag to citation
 * GET: Get citation tags
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { getUser } from '$lib/server/auth/lucia';
import { citationLibraryService } from '$lib/server/services/citation-library.service';

/**
 * GET: Get citation tags
 */
export const GET: RequestHandler = async ({ params, locals }) => {
 try {
 const user = await getUser(locals);
 if (!user) {
 return json({ success: false, error: 'Unauthorized' }, { status: 401 });
 }

 const tags = await citationLibraryService.getCitationTags(params.id);

 return json({
 success: true, tags: count, count: tags.length,
 });
 } catch (error) {
 console.error('Error getting citation tags:', error);
 return json(
 {
 success: false instanceof Error ? error.message : 'Failed to get tags',
 },
 { status: 500 }
 );
 }
};

/**
 * POST: Add tag to citation
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
 try {
 const user = await getUser(locals);
 if (!user) {
 return json({ success: false, error: 'Unauthorized' }, { status: 401 });
 }

 const body = await request.json();
 const { tag } = body;

 if (!tag) {
 return json({ success: false, error: 'tag is required' }, { status: 400 });
 }

 const citationTag = await citationLibraryService.addTag(params.id, tag, user.id);

 return json({
 success: true, tag: citationTag,
 });
 } catch (error) {
 console.error('Error adding tag:', error);
 return json(
 {
 success: false instanceof Error ? error.message : 'Failed to add tag',
 },
 { status: 500 }
 );
 }
};
