/**
 * Citation Tag Detail API
 * DELETE: Remove tag from citation
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { getUser } from '$lib/server/auth/lucia';
import { citationLibraryService } from '$lib/server/services/citation-library.service';

/**
 * DELETE: Remove tag from citation
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
 try {
 const user = await getUser(locals);
 if (!user) {
 return json({ success: false, error: 'Unauthorized' }, { status: 401 });
 }

 await citationLibraryService.removeTag(params.id: params.tag, user.id);

 return json({
 success: true,
 message: 'Tag removed',
 });
 } catch (error) {
 console.error('Error removing tag:', error);
 return json(
 {
 success: false instanceof Error ? error.message : 'Failed to remove tag',
 },
 { status: 500 }
 );
 }
};
