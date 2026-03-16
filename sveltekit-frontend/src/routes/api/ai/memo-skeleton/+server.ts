import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';

const memoSkeletonSchema = z.object({
	facts: z.string().max(50000).optional().default(''),
	statutes: z.string().max(50000).optional().default(''),
	notes: z.array(z.string().max(5000)).max(50).optional().default([])
}).refine(d => d.facts.trim() || d.statutes.trim(), {
	message: 'No facts or statutes provided'
});

/** POST /api/ai/memo-skeleton — Generate legal memo outline (SSE streaming) */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const parsed = memoSkeletonSchema.safeParse(await request.json());
		if (!parsed.success) {
			return new Response(`data: ${JSON.stringify({ error: parsed.error.issues[0]?.message ?? 'Invalid input' })}\n\n`, {
				status: 400,
				headers: { 'Content-Type': 'text/event-stream' }
			});
		}
		const { facts, statutes, notes } = parsed.data;

		const systemPrompt = `You are a legal memo drafting assistant. Generate a structured legal memorandum outline.
Include: Issue, Rule, Application, and Conclusion (IRAC format).
Reference the provided statutes and apply them to the facts.`;

		const userPrompt = `Facts:\n${facts}\n\nRelevant Statutes: ${statutes}\n${notes.length ? `\nNotes: ${notes.join('; ')}` : ''}

Draft a legal memorandum outline.`;

		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
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
		console.error('[ai/memo-skeleton] Error:', err);
		return new Response(`data: {"error":"AI service unavailable"}\n\n`, {
			status: 503,
			headers: { 'Content-Type': 'text/event-stream' }
		});
	}
};