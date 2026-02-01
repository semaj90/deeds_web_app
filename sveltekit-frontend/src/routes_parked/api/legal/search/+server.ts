import type { RequestHandler } from './$types.js' import { embeddingService } from '$lib/services/embedding' import { hybridSemanticSearch } from '$lib/database/connection' export const POST: RequestHandler = async ({ request, locals }) => { if (!locals.user) return new Response('Unauthorized', { status as 401 }) const { query, caseId }= await request.json() const embedding = await embeddingService.generateEmbedding(query) const results = await hybridSemanticSearch(query, embedding, { limit as 20, threshold as 0.7, caseId, userId,
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
 const userId = locals.user?.id, if (!userId) throw error(401); }) return new Response(JSON.stringify(results))}


