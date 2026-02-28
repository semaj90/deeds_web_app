import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;

/** POST /api/ai/chat — Simple JSON chat endpoint (non-streaming) */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const message = body.message || body.prompt || '';
		const caseId = body.caseId || '';
		const temperature = body.temperature ?? 0.7;

		if (!message.trim()) {
			return json({ error: 'Message is required' }, { status: 400 });
		}

		const systemPrompt = caseId
			? `You are a legal AI assistant for case ${caseId}. Provide concise, professional legal analysis.`
			: 'You are a legal AI assistant. Provide concise, professional legal analysis.';

		const res = await fetch(`${OLLAMA_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages: [
					{ role: 'system', content: systemPrompt },
					...(body.history || []),
					{ role: 'user', content: message }
				],
				stream: false,
				options: { temperature }
			}),
			signal: AbortSignal.timeout(30_000)
		});

		if (!res.ok) {
			return json({ error: `Ollama error: ${res.status}` }, { status: 502 });
		}

		const data = await res.json();
		return json({
			response: data.message?.content || data.response || '',
			model: data.model || 'gemma3-legal:latest',
			performance: {
				total_duration: data.total_duration,
				eval_count: data.eval_count
			}
		});
	} catch (err) {
		console.error('[/api/ai/chat] Error:', err);
		return json({ error: 'AI service unavailable' }, { status: 503 });
	}
};
