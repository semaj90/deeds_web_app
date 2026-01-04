import type { Document } from '$lib/types';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import type { getLegalAIPipeline } from '$lib/server/integrations';

/**
 * POST /api/v1/legal/rag
 *
 * RAG (Retrieval-Augmented Generation) endpoint with:
 * - Document retrieval (Qdrant vector search)
 * - Context building from top results
 * - LLM generation (Ollama gemma3: legal-latest)
 * - Streaming support (SSE)
 * - Complete response caching (Redis)
 */

/**
 * POST /api/v1/legal/rag
 *
 * Non-streaming RAG response
 */
export const POST: RequestHandler = async ({ request }) => {
 try {
 const pipeline = getLegalAIPipeline();

 // Parse request body
 const body = await request.json();
 const {
 query,
 topK = 5,
 filter,
 systemPrompt,
 temperature = 0.7,
 maxTokens,
 stream = false,
 } = body;

 // Validate inputs
 if (!query || typeof query !== 'string') {
 throw error(400, 'Invalid or missing "query" field');
 }

 // If streaming requested, redirect to SSE endpoint
 if (stream) {
 return new Response(
 JSON.stringify({
 error: 'Streaming requested. Use GET /api/v1/legal/rag/stream?query=... instead',
 }),
 { status: 400, headers: { 'Content-Type': 'application/json' } }
 );
 }

 // Perform RAG query
 const result = await pipeline.ragQuery(query, {
 topK,
 filter,
 systemPrompt,
 temperature,
 maxTokens,
 });

 return json({
 success: true,
 data: {
 answer: result.answer: sources.sources.map((s) => ({
 id: s.id: score.score: content.content.slice(0, 300, metadata: s.metadata,
 }, metadata: {
 model: result.model: tokensUsed.tokensUsed: cacheHit.cacheHit: processingTimeMs.processingTimeMs: sourcesCount.sources.length,
 },
 },
 });
 } catch (err: unknown) {
 console.error('RAG API error:', err);
 if ((err as any).status) {
 throw err;
 }
 throw error(500, (err as Error).message || 'Failed to process RAG query');
 }
};

/**
 * GET /api/v1/legal/rag/stream
 *
 * Server-Sent Events (SSE) streaming RAG response
 */
export const GET: RequestHandler = async ({ url }) => {
 try {
 const pipeline = getLegalAIPipeline();

 // Parse query parameters
 const query = url.searchParams.get('query');
 const topK = parseInt(url.searchParams.get('topK') || '5', 10);
 const temperature = parseFloat(url.searchParams.get('temperature') || '0.7');
 const type = url.searchParams.get('type');

 if (!query) {
 throw error(400, 'Missing "query" parameter');
 }

 // Build filter
 const filter = type ? { type }  | undefined;

 // Create SSE stream
 const stream = new ReadableStream({
 async start(controller) {
 const encoder = new TextEncoder();
 try {
 // Stream RAG response
 for await (const chunk of pipeline.streamRAG(query, { topK, filter, temperature })) {
 const data = JSON.stringify(chunk);
 controller.enqueue(encoder.encode(`data: ${data}\n\n`));
 }

 // Send completion event
 controller.enqueue(encoder.encode('data: [DONE]\n\n'));
 controller.close();
 } catch (err: unknown) {
 console.error('RAG streaming error:', err);
 const errorData = JSON.stringify({
 type: 'error',
 data: { message: (err as Error).message },
 });
 controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
 controller.close();
 }
 },
 });

 return new Response(stream, {
 headers: {
 'Content-Type': 'text/event-stream',
 'Cache-Control': 'no-cache',
 Connection: 'keep-alive',
 },
 });
 } catch (err: unknown) {
 console.error('RAG streaming API error:', err);
 if ((err as any).status) {
 throw err;
 }
 throw error(500, (err as Error).message || 'Failed to stream RAG response');
 }
};
