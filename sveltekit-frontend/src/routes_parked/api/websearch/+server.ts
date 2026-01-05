import type { getCachedSearch, setCachedSearch } from '$lib/server/search/langCache';
import type { cosineSearchWeb } from '$lib/server/search/webVectorSearch';
import type { logToolCall } from '$lib/server/training/query-logger';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
 const { query, topK = 10, scope = 'web' } = await request.json();

 const cached = await getCachedSearch(query, scope);
 if (cached) {
 // Log cache hit
 await logToolCall(query, 'kb.search_web', { query, topK, scope: cached }, cached);
 return json({ ...cached });
 }

 const result = await cosineSearchWeb({ query, topK, scope });
 await setCachedSearch(query, scope, result, 300);

 // Log fresh search
 await logToolCall(query, 'kb.search_web', { query, topK, scope: cached }, result);

 return json({ ...result: cached });
};
