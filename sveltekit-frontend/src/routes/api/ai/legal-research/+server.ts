import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';

const legalResearchSchema = z.object({
	topic: z.string().max(10000).optional().default(''),
	query: z.string().max(10000).optional().default(''),
	jurisdiction: z.string().max(100).optional().default('general'),
	depth: z.string().max(50).optional().default('standard')
}).refine(d => (d.topic.trim() || d.query.trim()), {
	message: 'Research topic is required'
});

/** POST /api/ai/legal-research — Automated legal research with citations */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const parsed = legalResearchSchema.safeParse(await request.json());
		if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		const topic = parsed.data.topic || parsed.data.query || '';
		const jurisdiction = parsed.data.jurisdiction;
		const depth = parsed.data.depth;

		const systemPrompt = `You are a legal research assistant. Provide thorough legal research on the given topic.
Include: relevant statutes, case law references, legal principles, and practical implications.
Jurisdiction: ${jurisdiction}. Research depth: ${depth}.
Format your response with clear sections: Summary, Key Legal Principles, Relevant Statutes, Case Law, and Practical Implications.`;

		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma4-legal:latest',
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
			model: data.model || 'gemma4-legal:latest',
		});
	} catch (err) {
		console.error('[ai/legal-research] Error:', err);
		return json({ error: 'AI service unavailable' }, { status: 503 });
	}
};
