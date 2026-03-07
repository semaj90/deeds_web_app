import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';

/** POST /api/ai/ask — General-purpose legal AI Q&A */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const question = body.question || body.query || body.prompt || '';
		const context = typeof body.context === 'string' ? body.context : JSON.stringify(body.context ?? '');

		if (!question.trim()) {
			return json({ error: 'Question is required' }, { status: 400 });
		}

		const systemPrompt = context
			? `You are a legal AI assistant. Answer the question using this context:\n\n${context.slice(0, 8000)}`
			: 'You are a legal AI assistant. Provide concise, accurate legal analysis.';

		const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: question }
				],
				stream: false,
				options: { temperature: 0.5 }
			}),
			signal: AbortSignal.timeout(30_000)
		});

		if (!res.ok) return json({ error: `Ollama error: ${res.status}` }, { status: 502 });

		const data = await res.json();
		return json({
			answer: data.message?.content || data.response || '',
			model: data.model || 'gemma3-legal:latest',
		});
	} catch (err) {
		console.error('[ai/ask] Error:', err);
		return json({ error: 'AI service unavailable' }, { status: 503 });
	}
};