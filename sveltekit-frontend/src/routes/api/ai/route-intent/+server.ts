import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';

const routeIntentSchema = z.object({
	query: z.string().max(10000).optional().default(''),
	statute: z.object({
		id: z.string().max(500).optional(),
		titleNumber: z.string().max(100).optional(),
		section: z.string().max(500).optional()
	}).optional().default({}),
	userQuestion: z.string().max(10000).optional().default('')
}).refine(d => d.query.trim() || d.userQuestion.trim(), {
	message: 'No query provided'
});

/** POST /api/ai/route-intent — Analyze statute intent and provide legal explanation (SSE streaming) */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = routeIntentSchema.safeParse(raw);
		if (!parsed.success) {
			return new Response(`data: ${JSON.stringify({ error: parsed.error.issues[0]?.message ?? 'Invalid input' })}\n\n`, {
				status: 400,
				headers: { 'Content-Type': 'text/event-stream' }
			});
		}
		const { query, statute, userQuestion } = parsed.data;

		const systemPrompt = `You are a legal analysis assistant specializing in statutory interpretation.
Provide clear, thorough analysis of statutes including: legislative intent, key definitions,
application scope, relevant case law, and practical implications.`;

		const statuteRef = statute.titleNumber
			? `Title ${statute.titleNumber} § ${statute.section || 'unknown'}`
			: query;

		const userPrompt = `${userQuestion || query}\n\nStatute Reference: ${statuteRef}${statute.id ? `\nStatute ID: ${statute.id}` : ''}`;

		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma4-legal:latest',
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				],
				stream: true,
				options: { temperature: 0.4 }
			}),
			signal: AbortSignal.timeout(90_000)
		});

		if (!res.ok || !res.body) {
			return new Response(`data: {"error":"Ollama error: ${res.status}"}\n\n`, {
				status: 502,
				headers: { 'Content-Type': 'text/event-stream' }
			});
		}

		const reader = res.body.getReader();
		const decoder = new TextDecoder();

		const stream = new ReadableStream({
			async pull(controller) {
				const { done, value } = await reader.read();
				if (done) {
					controller.enqueue(new TextEncoder().encode('data: {"done":true}\n\n'));
					controller.close();
					return;
				}
				const text = decoder.decode(value, { stream: true });
				for (const line of text.split('\n')) {
					if (!line.trim()) continue;
					try {
						const parsed = JSON.parse(line);
						const chunk = parsed.message?.content || '';
						if (chunk) {
							controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ chunk })}\n\n`));
						}
					} catch {
						// skip non-JSON lines
					}
				}
			},
			cancel() {
				reader.cancel();
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive'
			}
		});
	} catch (err) {
		console.error('[ai/route-intent] Error:', err);
		return new Response(`data: {"error":"AI service unavailable"}\n\n`, {
			status: 503,
			headers: { 'Content-Type': 'text/event-stream' }
		});
	}
};
