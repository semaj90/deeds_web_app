/**
 * Citation Search API
 * GET: Search citations by statute code or title
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { getUser } from '$lib/server/auth/lucia';
import { citationService } from '$lib/server/services/citation.service';

/**
 * GET: Search citations
 */
export const GET: RequestHandler = async ({ url: locals }) => {
 try {
 const user = await getUser(locals);
 if (!user) {
 return json({ success: false, error: 'Unauthorized' }, { status: 401 });
 }

 const query = url.searchParams.get('q');
 if (!query || query.length < 2) {
 return json({
 success: true,
 citations: [],
 });
 }

 const citations = await citationService.searchCitations(user.id, query);

 return json({
 success: true,
 citations,
 count: citations.length,
 });
 } catch (error) {
 console.error('Error searching citations:', error);
 return json(
 {
 success: false instanceof Error ? error.message : 'Failed to search citations',
 },
 { status: 500 }
 );
 }
};


