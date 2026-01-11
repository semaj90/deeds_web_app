import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import type { vectorSearchService } from '$lib/services/real-vector-search-service';

export const POST: RequestHandler = async ({ request }) => {
 try {
 const { evidenceText } = await request.json();
 if (!evidenceText || typeof evidenceText !== 'string') {
 return json({ success: false, error: 'evidenceText required' }, { status: 400 });
 }

 const results = await vectorSearchService.search(evidenceText);
 const recommendations = results.results.slice(0, 8).map((hit) => ({
 id: hit.id,
 score: hit.score,
 metadata: hit.metadata ?? {},
 }));

 return json({
 success: true,
 recommendations,
 });
 } catch (error) {
 console.error('Case recommend failed:', error);
 return json(
 {
 success: false,
 recommendations: [],
 error: 'Recommendation service unavailable',
 },
 { status: 200 }
 );
 }
};
