import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';

/** POST /api/ai/legal-research — Automated legal research with citations */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const topic = body.topic || body.query || '';
		const jurisdiction = body.jurisdiction || 'general';
		const depth = body.depth || 'standard';

		if (!topic.trim()) {
			return json({ error: 'Research topic is required' }, { status: 400 });
		}

		const systemPrompt = `You are a legal research assistant. Provide thorough legal research on the given topic.
Include: relevant statutes, case law references, legal principles, and practical implications.
Jurisdiction: ${jurisdiction}. Research depth: ${depth}.
Format your response with clear sections: Summary, Key Legal Principles, Relevant Statutes, Case Law, and Practical Implications.`;

		const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: topic }
				],
				stream: false,
				options: { temperature: 0.4 }
			}),
			signal: AbortSignal.timeout(60_000)
		});

		if (!res.ok) return json({ error: `Ollama error: ${res.status}` }, { status: 502 });

		const data = await res.json();
		return json({
			research: data.message?.content || data.response || '',
			topic,
			jurisdiction,
			model: data.model || 'gemma3-legal:latest',
		});
	} catch (err) {
		console.error('[ai/legal-research] Error:', err);
		return json({ error: 'AI service unavailable' }, { status: 503 });
	}
};
