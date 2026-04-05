import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { routeStreamingInference } from '$lib/server/inference/inference-router.js';
import { logInference } from '$lib/server/observability/inference-log.js';

const streamSchema = z.object({
	query: z.string().min(1).max(50000).optional(),
	message: z.string().min(1).max(50000).optional(),
	temperature: z.number().min(0).max(2).optional().default(0.7),
	history: z
		.array(z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string() }))
		.max(50)
		.optional()
		.default([])
}).refine((d) => d.query?.trim() || d.message?.trim(), { message: 'query or message required' });

/** POST /api/ai/chat/stream — Streaming chat via Ollama (ReadableStream, not SSE) */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	let body: z.infer<typeof streamSchema>;
	try {
		const raw = await request.json();
		const parsed = streamSchema.safeParse(raw);
		if (!parsed.success) {
			return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		body = parsed.data;
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const prompt = body.query || body.message || '';

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			const start = performance.now();
			let tokenCount = 0;
			let backend = 'ollama';

			try {
				const systemPrompt = 'You are a legal AI assistant. Provide concise, professional legal analysis.';
				const messages = [
					{ role: 'system', content: systemPrompt },
					...body.history,
					{ role: 'user', content: prompt },
				];

				for await (const chunk of routeStreamingInference({
					prompt,
					systemPrompt,
					messages,
					temperature: body.temperature,
				})) {
					if (chunk.done) break;
					if (chunk.content) {
						controller.enqueue(encoder.encode(chunk.content));
						tokenCount++;
						if (chunk.backend) backend = chunk.backend;
					}
				}

				logInference({
					type: 'llm',
					model: backend === 'ollama' ? 'gemma4-legal:latest' : backend,
					backend: backend as 'ollama' | 'tensorrt' | 'triton',
					latencyMs: Math.round(performance.now() - start),
					tokenCount,
					cacheHit: false,
				});

				controller.close();
			} catch {
				controller.enqueue(encoder.encode('\n\nError: Stream failed'));
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'no-cache',
			'Transfer-Encoding': 'chunked'
		}
	});
};
