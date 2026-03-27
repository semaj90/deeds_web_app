import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { TIMEOUTS } from '$lib/server/timeouts.js';

const suggestionsSchema = z.object({
	caseId: z.string().uuid(),
	evidenceData: z.unknown().optional(),
	canvasData: z.unknown().optional()
});

/** POST /api/v1/ai/canvas-suggestions — AI-generated canvas layout suggestions */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = suggestionsSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message }, { status: 400 });
		}

		const prompt = `Given evidence data for a legal case, suggest how to organize and group related evidence items on an investigation board. Respond with a JSON array of suggestions, each with: { "type": "group"|"link"|"highlight", "description": string, "targetIds": string[] }`;

		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages: [
					{ role: 'system', content: prompt },
					{ role: 'user', content: JSON.stringify(parsed.data.evidenceData ?? {}).slice(0, 5000) }
				],
				stream: false,
				options: { temperature: 0.4 }
			}),
			signal: AbortSignal.timeout(TIMEOUTS.USER_FACING)
		});

		if (!res.ok) {
			return json({ suggestions: [] }, { status: 503 });
		}

		const data = await res.json();
		const content = data.message?.content || '[]';

		// Try to parse as JSON array, fallback to text suggestion
		let suggestions: unknown[];
		try {
			const jsonMatch = content.match(/\[[\s\S]*\]/);
			suggestions = jsonMatch ? JSON.parse(jsonMatch[0]) : [{ type: 'text', description: content }];
		} catch {
			suggestions = [{ type: 'text', description: content }];
		}

		return json({ suggestions });
	} catch (err) {
		console.error('[/api/v1/ai/canvas-suggestions] error:', err);
		return json({ suggestions: [] }, { status: 500 });
	}
};
