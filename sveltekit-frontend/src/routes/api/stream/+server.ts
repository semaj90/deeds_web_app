import { json } from '@sveltejs/kit';
/**
 * SSE Streaming Endpoint
 * Provides real-time LLM responses via Server-Sent Events
 *
 * Usage:
 * - GET /api/stream?q=your_question&mode=ollama
 * - GET /api/stream?q=your_question&mode=rag
 */

import {
	createSSEStream,
	streamOllamaResponse,
	streamRAGResponse
} from '$lib/server/streaming/chunked-response';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const querySchema = z.object({
	q: z.string().min(1, 'Missing query parameter').max(5000),
	mode: z.enum(['ollama', 'rag']).default('ollama')
});

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return new Response(parsed.error.issues[0]?.message ?? 'Missing query parameter', { status: 400 });
	}
	const { q: query, mode } = parsed.data;

	try {
		const stream = mode === 'rag'
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