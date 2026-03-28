import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';

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

	let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			try {
				const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model: 'gemma3-legal:latest',
						messages: [
							{
								role: 'system',
								content:
									'You are a legal AI assistant. Provide concise, professional legal analysis.'
							},
							...body.history,
							{ role: 'user', content: prompt }
						],
						stream: true,
						options: { temperature: body.temperature }
					}),
					signal: AbortSignal.timeout(120_000)
				});

				if (!res.ok || !res.body) {
					controller.enqueue(encoder.encode('Error: AI service unavailable'));
					controller.close();
					return;
				}

				const reader = res.body.getReader();
				activeReader = reader;
				const decoder = new TextDecoder();
				let buffer = '';

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split('\n');
					buffer = lines.pop() || '';

					for (const line of lines) {
						if (!line.trim()) continue;
						try {
							const chunk = JSON.parse(line);
							if (chunk.message?.content) {
								controller.enqueue(encoder.encode(chunk.message.content));
							}
						} catch {
							// Skip malformed JSON lines
						}
					}
				}

				controller.close();
			} catch (err) {
				controller.enqueue(
					encoder.encode(
						`\n\nError: Stream failed`
					)
				);
				controller.close();
			}
		},
		cancel() {
			activeReader?.cancel();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'no-cache',
			'Transfer-Encoding': 'chunked'
		}
	});
};
