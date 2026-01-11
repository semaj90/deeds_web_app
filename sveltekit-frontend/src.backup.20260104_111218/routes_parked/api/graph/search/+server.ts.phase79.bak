import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import type { vectorSearchService } from '$lib/services/real-vector-search-service';

export const POST: RequestHandler = async ({ request }) => {
 try {
 const { query, options } = await request.json();
 if (!query || typeof query !== 'string') {
 return json({ success: false, error: 'Missing query' }, { status: 400 });
 }

 const result = await vectorSearchService.search(query, options);

 return json({
 success: true,
 totalResults: result.totalResults,
 queryTime: result.queryTime,
 model: result.model,
 results: result.results.map((hit) => ({
 id: hit.id,
 score: hit.score,
 metadata: hit.metadata ?? {},
 })),
 });
 } catch (error) {
 console.error('Graph search failed:', error);
 return json(
 {
 success: false,
 results: [],
 error: 'Semantic search unavailable',
 },
 { status: 200 }
 );
 }
};
