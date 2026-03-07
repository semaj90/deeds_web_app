import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';

/** POST /api/ai/contextual-chat — Case-context-aware chat */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const message = body.message || body.query || '';
		const caseId = body.caseId || '';
		const context = body.context || '';
		const history = body.history || [];

		if (!message.trim()) {
			return json({ error: 'Message is required' }, { status: 400 });
		}

		const systemPrompt = caseId
			? `You are a legal AI assistant working on case ${caseId}. ${context ? `Context: ${String(context).slice(0, 4000)}` : ''} Provide concise, professional legal analysis.`
			: 'You are a legal AI assistant. Provide concise, professional legal analysis.';

		const messages = [
			{ role: 'system', content: systemPrompt },
			...history.slice(-10).map((h: any) => ({ role: h.role, content: h.content })),
			{ role: 'user', content: message }
		];

		const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages,
				stream: false,
				options: { temperature: 0.6 }
			}),
			signal: AbortSignal.timeout(30_000)
		});

		if (!res.ok) return json({ error: `Ollama error: ${res.status}` }, { status: 502 });

		const data = await res.json();
		return json({
			response: data.message?.content || data.response || '',
			model: data.model || 'gemma3-legal:latest',
		});
	} catch (err) {
		console.error('[ai/contextual-chat] Error:', err);
		return json({ error: 'AI service unavailable' }, { status: 503 });
	}
};