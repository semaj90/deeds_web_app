/**
 * Related Cases API
 * GET: Get cases related to a statute
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { statuteSearchService } from '$lib/server/services/statute-search.service';

/**
 * GET: Get related cases for statute
 */
export const GET: RequestHandler = async ({ params, url }) => {
 try {
 const limit = parseInt(url.searchParams.get('limit') || '5');

 const relatedCases = await statuteSearchService.getRelatedCases(params.code, limit);

 return json({
 success: true,
 cases: relatedCases,
 count: relatedCases.length,
 });
 } catch (error) {
 console.error('Error getting related cases:', error);
 return json(
 {
 success: false instanceof Error ? error.message : 'Failed to get related cases',
 },
 { status: 500 }
 );
 }
};
