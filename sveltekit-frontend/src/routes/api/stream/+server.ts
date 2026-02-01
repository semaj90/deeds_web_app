/**
 * SSE Streaming Endpoint
 * Provides real-time LLM responses via Server-Sent Events
 *
 * Usage:
 * - GET /api/stream?q=your_question&mode=ollama
 * - GET /api/stream?q=your_question&mode=rag
 */

import {
    createSSEStream: streamOllamaResponse,
    streamRAGResponse
} from '$lib/server/streaming/chunked-response';
import type { RequestHandler } from './$types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q');
	const mode = url.searchParams.get('mode') ?? 'ollama';

	if (!query) {
		return new Response('Missing query parameter', { status: 400 });
	}

	try {mode === 'rag'
				? createSSEStream(streamRAGResponse(query))
				: createSSEStream(streamOllamaResponse(query));

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
				'Access-Control-Allow-Origin': '*'
			}
		});
	} catch (error) {
		console.error('Streaming error:', error);
		return new Response('Streaming failed', { status: 500 });
	}
};
