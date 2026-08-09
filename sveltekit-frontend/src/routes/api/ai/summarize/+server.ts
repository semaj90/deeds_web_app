import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { LLAMA_SERVER_BASE_URL, LOCAL_VLM_MODEL } from '$lib/server/ai/local-llama-provider.js';

const aiSummarizeSchema = z.object({
	text: z.string().max(50000).optional(),
	content: z.string().max(50000).optional(),
	maxLength: z.number().int().min(50).max(5000).optional().default(500)
}).refine(d => (d.text?.trim() || d.content?.trim()), {
	message: 'Text is required'
});

/** POST /api/ai/summarize — Summarize legal text */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = aiSummarizeSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const text = parsed.data.text || parsed.data.content || '';
		const maxLength = parsed.data.maxLength;

		const res = await fetch(`${LLAMA_SERVER_BASE_URL}/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: LOCAL_VLM_MODEL,
				messages: [
					{ role: 'system', content: `Summarize the following legal text in ${maxLength} words or fewer. Focus on key facts, legal issues, and conclusions.` },
					{ role: 'user', content: text.slice(0, 15_000) }
				],
				stream: false,
				temperature: 0.3,
				max_tokens: Math.min(2048, Math.max(128, maxLength * 2))
			}),
			signal: AbortSignal.timeout(30_000)
		});

		if (!res.ok) return json({ error: `Ollama error: ${res.status}` }, { status: 502 });

		const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
		return json({
			summary: data.choices?.[0]?.message?.content || '',
			model: LOCAL_VLM_MODEL,
		});
	} catch (err) {
		console.error('[ai/summarize] Error:', err);
		return json({ error: 'AI service unavailable' }, { status: 503 });
	}
};
