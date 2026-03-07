import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';

/** POST /api/ai/summarize — Summarize legal text */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const text = body.text || body.content || '';
		const maxLength = body.maxLength || 500;

		if (!text.trim()) {
			return json({ error: 'Text is required' }, { status: 400 });
		}

		const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages: [
					{ role: 'system', content: `Summarize the following legal text in ${maxLength} words or fewer. Focus on key facts, legal issues, and conclusions.` },
					{ role: 'user', content: text.slice(0, 15_000) }
				],
				stream: false,
				options: { temperature: 0.3 }
			}),
			signal: AbortSignal.timeout(30_000)
		});

		if (!res.ok) return json({ error: `Ollama error: ${res.status}` }, { status: 502 });

		const data = await res.json();
		return json({
			summary: data.message?.content || data.response || '',
			model: data.model || 'gemma3-legal:latest',
		});
	} catch (err) {
		console.error('[ai/summarize] Error:', err);
		return json({ error: 'AI service unavailable' }, { status: 503 });
	}
};
