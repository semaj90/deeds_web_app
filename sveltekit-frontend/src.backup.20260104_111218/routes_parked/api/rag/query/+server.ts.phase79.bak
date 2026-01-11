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
 query,
 caseId: body.caseId ?? undefined,
 userId: body.userId ?? undefined,
 documentTypes: Array.isArray(body.documentTypes) ? body.documentTypes : undefined,
 jurisdiction: body.jurisdiction ?? undefined,
 practiceArea: body.practiceArea ?? undefined,
 maxResults: body.topK ?? body.maxResults ?? 8,
 useReranking: body.useReranking !== false,
 includeMetadata: body.includeMetadata !== false,
 contextWindow: body.contextWindow ?? 4000,
 };

 const cacheKey = ragCacheKey({
 kind: 'rag_search',
 query,
 caseId: ragQuery.caseId ?? null,
 jurisdiction: ragQuery.jurisdiction ?? null,
 tagIds: body.tagIds ?? [],
 limit: ragQuery.maxResults ?? undefined,
 embedModel: body.model ?? undefined,
 chatModel: body.model ?? undefined,
 });

 const cached = await cacheGetJSON<any>(cacheKey);
 if (cached) {
 return json(
 {
 ...cached,
 cached: true,
 cacheKey,
 latencyMs: Date.now() - started,
 },
 { status: 200 }
 );
 }

 try {
 const result = await enhancedRAGPipeline.query(ragQuery as any);
 const payload = {
 success: true,
 data: {
 answer: result.answer,
 sources: result.sources,
 confidence: result.confidence,
 metadata: {
 ...result.metadata,
 clientIp: getClientAddress(),
 },
 },
 cached: false,
 cacheKey,
 latencyMs: Date.now() - started,
 };

 await cacheSetJSON(cacheKey, payload, CACHE_TTL_SECONDS);
 return json(payload, { status: 200 });
 } catch (err) {
 console.error('RAG query failed:', err);
 throw error(500, 'RAG query failed');
 }
};

export const GET: RequestHandler = async () => {
 return json({ ok: true });
};
