import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';

const agentChatSchema = z.object({
	prompt: z.string().max(10000).optional(),
	message: z.string().max(10000).optional()
}).refine(d => (d.prompt?.trim() || d.message?.trim()), {
	message: 'Either prompt or message is required'
});

/** POST /api/agents/chat — Agent chat endpoint with tool-use context */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = agentChatSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const prompt = parsed.data.prompt || parsed.data.message || '';

		const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages: [
					{
						role: 'system',
						content: `You are an AI agent assistant for a legal platform. You can help with:
- Evidence analysis and cross-referencing
- Legal research and citation lookup
- Case strategy recommendations
- Document drafting assistance
Provide structured, actionable responses.`
					},
					{ role: 'user', content: prompt }
				],
				stream: false,
				options: { temperature: 0.5 }
			}),
			signal: AbortSignal.timeout(30_000)
		});

		if (!res.ok) {
			return json({ error: 'Agent service unavailable' }, { status: 502 });
		}

		const data = await res.json();
		return json({
			response: data.message?.content || '',
			toolResults: [],
			model: 'gemma3-legal:latest'
		});
	} catch (err) {
		console.error('[/api/agents/chat]', err);
		return json({ error: 'Agent chat failed' }, { status: 503 });
	}
};
