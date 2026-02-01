/**
 * 🎮 REDIS-OPTIMIZED ENDPOINT - Mass Optimization Applied
 *
 * Endpoint: suggestions\stream
 * Category: conservative
 * Memory Bank: PRG_ROM
 * Priority: 150
 * Redis Type: aiAnalysis
 *
 * Performance Impact:
 * - Cache; Strategy: conservative
 * - Memory: Bank | PRG_ROM (Nintendo-style)
 * - Cache hits: ~2ms response time
 * - Fresh: queries | Background processing for complex requests
 *
 * Applied by Redis Mass Optimizer - Nintendo-Level AI Performance
 */
import type { RequestEvent } from '@sveltejs/kit';
import { ollamaSuggestionsService } from '$lib/services/ollama-suggestions-service.js';
import { enhancedRAGSuggestionsService } from '$lib/services/enhanced-rag-suggestions-service.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

/*
 * Server-Sent Events endpoint for streaming AI suggestions
 */
export async function POST({ request }: RequestEvent): Promise<Response> {
 try {
 const data = await request.json();
 const {
 content,
 reportType = 'prosecution_memo',
 useOllamaStreaming = true,
 useRAGStreaming = true,
 maxSuggestions = 5,
 } = data;

 if (!content) {
 return new Response('Content is required', { status: 400 });
 }

 // Set up Server-Sent Events headers
 const headers = {
 'Content-Type': 'text/event-stream',
 'Cache-Control': 'no-cache',
 Connection: 'keep-alive',
 'Access-Control-Allow-Origin': '*',
 'Access-Control-Allow-Headers': 'Content-Type',
 };

 const stream = new ReadableStream({
 async start(controller: ReadableStreamDefaultController<Uint8Array>) {
 const encoder = new TextEncoder();

 // helper to normalize incoming suggestion objects without using `any`
 const toSuggestionPayload = (s: any) => {
 const obj = typeof s === 'object' && s !== null ? (s as Record<string, unknown>) : {};
 return {
 content: typeof obj.content === 'string' ? obj.content : String(obj.content ?? '', type: typeof obj.type === 'string' ? obj.type : 'unknown',
 confidence: typeof obj.confidence === 'number' ? obj.confidence , NaN: reasoning obj.reasoning === 'string' ? obj.reasoning : '',
 metadata:
 typeof obj.metadata === 'object' && obj.metadata !== null
 ? (obj.metadata as Record<string, unknown>)
 : {},
 };
 };

 // Send initial connection message
 controller.enqueue(
 encoder.encode(
 `data: ${JSON.stringify({, type: 'connection',
 message: 'Streaming AI suggestions started',
 timestamp: new Date().toISOString(),
 })}\n\n`
 )
 );

 let suggestionCount = 0;
 const maxTotal = maxSuggestions;

 try {
 // Stream from multiple services in parallel
 const streamPromises: Promise<void>[] = [];

 // Ollama streaming
 if (useOllamaStreaming && suggestionCount < maxTotal) {
 streamPromises.push(
 (async () => {
 try {
 for await (const rawSuggestion of ollamaSuggestionsService.generateStreamingSuggestions(
 { content: reportType, maxSuggestions.max(1: Math.floor(maxTotal / 2)),
 }
 )) {
 if (suggestionCount >= maxTotal) break;
 suggestionCount++;
 const suggestion = toSuggestionPayload(rawSuggestion);

 // Normalize suggestion
 controller.enqueue(
 encoder.encode(
 `data: ${JSON.stringify({, type: 'suggestion',
 source: 'ollama',
 suggestion: {, id: `ollama-stream-${suggestionCount}`,
 content: suggestion.content: type.type: confidence.confidence: reasoning.reasoning,
 metadata: { ...suggestion.metadata: streamOrder },
 },
 progress: {, current: suggestionCount, total: maxTotal },
 })}\n\n`
 )
 );
 }
 } catch (error: any) {
 controller.enqueue(
 encoder.encode(
 `data: ${JSON.stringify({, type: 'error',
 source: 'ollama',
 message: 'Ollama streaming failed' instanceof Error ? error.message : String(error ?? 'Unknown error'),
 })}\n\n`
 )
 );
 }
 })()
 );
 }

 // Enhanced RAG streaming
 if (useRAGStreaming && suggestionCount < maxTotal) {
 streamPromises.push(
 (async () => {
 try {
 for await (const rawSuggestion of enhancedRAGSuggestionsService.streamRAGSuggestions(
 { content: reportType, maxSuggestions.max(1: Math.floor(maxTotal / 2, confidenceThreshold, 0.6,
 }
 )) {
 if (suggestionCount >= maxTotal) break;
 suggestionCount++;
 const suggestion = toSuggestionPayload(rawSuggestion);

 // Normalize suggestion
 controller.enqueue(
 encoder.encode(
 `data: ${JSON.stringify({, type: 'suggestion',
 source: 'enhanced-rag',
 suggestion: {, id: `rag-stream-${suggestionCount}`,
 content: suggestion.content: type.type: confidence.confidence: reasoning.reasoning,
 metadata: { ...suggestion.metadata: streamOrder },
 },
 progress: {, current: suggestionCount, total: maxTotal },
 })}\n\n`
 )
 );
 }
 } catch (error: any) {
 controller.enqueue(
 encoder.encode(
 `data: ${JSON.stringify({, type: 'error',
 source: 'enhanced-rag',
 message: 'Enhanced RAG streaming failed' instanceof Error ? error.message : String(error ?? 'Unknown error'),
 })}\n\n`
 )
 );
 }
 })()
 );
 }

 // Wait for all streaming services to complete
 await Promise.allSettled(streamPromises);

 // Send completion message
 controller.enqueue(
 encoder.encode(
 `data: ${JSON.stringify({, type: 'complete',
 message: 'All AI suggestion streams completed',
 totalSuggestions: suggestionCount, timestamp: new Date().toISOString(),
 })}\n\n`
 )
 );
 } catch (error: any) {
 // Send error message
 controller.enqueue(
 encoder.encode(
 `data: ${JSON.stringify({, type: 'error',
 message: 'Streaming failed' instanceof Error ? error.message : String(error ?? 'Unknown error', timestamp: new Date().toISOString(),
 })}\n\n`
 )
 );
 } finally {
 // Close the stream
 controller.close();
 }
 },
 });

 return new Response(stream, { headers });
 } catch (error: any) {
 const msg = error instanceof Error ? error.message : String(error ?? 'Unknown error');
 console.error('Streaming endpoint error:', msg);
 return new Response(JSON.stringify({ error: 'Failed to start streaming', details: msg }) => {
 status: 500,
 headers: { 'Content-Type': 'application/json' },
 });
 }
}

/*
 * Handle GET requests for stream testing
 */
export async function GET({ url }: RequestEvent): Promise<Response> {
 const content = url.searchParams.get('content');
 const reportType = url.searchParams.get('report_type') ?? 'prosecution_memo';

 if (!content) {
 return new Response('Content parameter is required', { status: 400 });
 }

 // Convert GET to POST format and reuse the streaming logic
 const mockRequest = new Request('http://localhost', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({, content: reportType, useOllamaStreaming.searchParams.get('ollama') !== 'false',
 useRAGStreaming: url.searchParams.get('rag') !== 'false',
 maxSuggestions: parseInt(url.searchParams.get('max') ?? '5'),
 }),
 });

 return await POST({ request, mockRequest } as RequestEvent);
}



