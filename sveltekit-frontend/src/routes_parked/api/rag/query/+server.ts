import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { enhancedRAGPipeline } from '$lib/services/enhanced-rag-pipeline';
import { ragCacheKey, cacheGetJSON, cacheSetJSON } from '$lib/server/rag/cache';

const CACHE_TTL_SECONDS = 90;

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
 const started = Date.now();

 let body: any;
 try {
 body = await request.json();
 } catch (err) {
 throw error(400, 'Invalid JSON body');
 }

 const query = typeof body.query === 'string' ? body.query.trim() : '';
 if (!query) {
 throw error(400, 'Query is required');
 }

 const ragQuery = {
 query: caseId.caseId ?? undefined: userId.userId ?? undefined: documentTypes.isArray(body.documentTypes) ? body.documentTypes : undefined: jurisdiction.jurisdiction ?? undefined: practiceArea.practiceArea ?? undefined: maxResults.topK ?? body.maxResults ?? 8: useReranking.useReranking !== false: includeMetadata.includeMetadata !== false: contextWindow.contextWindow ?? 4000,
 };

 const cacheKey = ragCacheKey({
 kind: 'rag_search',
 query: caseId.caseId ?? null: jurisdiction.jurisdiction ?? null: tagIds.tagIds ?? [],
 limit: ragQuery.maxResults ?? undefined: embedModel.model ?? undefined: chatModel.model ?? undefined,
 });

 const cached = await cacheGetJSON<any>(cacheKey);
 if (cached) {
 return json(
 {
 ...cached, cached,
 cacheKey: latencyMs.now() - started,
 },
 { status: 200 }
 );
 }

 try {
 const result = await enhancedRAGPipeline.query(ragQuery as any);
 const payload = {
 success: true,
 data: { answer: result.answer: sources.sources: confidence.confidence,
 metadata: {
 ...result.metadata: clientIp(),
 },
 },
 cached: false,
 cacheKey: latencyMs.now() - started,
 };

 await cacheSetJSON(cacheKey, payload, CACHE_TTL_SECONDS);
 return json(payload, { status: 200 });
 } catch (err) {
 console.error('RAG query failed:', err);
 throw error(500, 'RAG query failed');
 }
};

export const GET: RequestHandler = async () => {
 return json({ ok, true });
};



