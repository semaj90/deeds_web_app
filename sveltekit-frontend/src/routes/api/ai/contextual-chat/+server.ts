import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';

const contextualChatSchema = z.object({
	message: z.string().max(50000).optional(),
	query: z.string().max(50000).optional(),
	caseId: z.string().max(500).optional().default(''),
	context: z.string().max(10000).optional().default(''),
	history: z.array(z.object({
		role: z.string().max(50),
		content: z.string().max(50000)
	})).max(50).optional().default([])
}).refine(d => (d.message?.trim() || d.query?.trim()), {
	message: 'Message is required'
});

/** POST /api/ai/contextual-chat — Case-context-aware chat */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = contextualChatSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const message = parsed.data.message || parsed.data.query || '';
		const caseId = parsed.data.caseId;
		const context = parsed.data.context;
		const history = parsed.data.history;

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