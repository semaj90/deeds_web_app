import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';
import { ENV } from '$lib/server/env.server.js';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;

/**
 * POST /api/summarize
 * Generate a 1-2 sentence legal summary of selected text via Ollama.
 * Body: { text: string }
 * Returns: { summary, confidence, model }
 */
const summarizeSchema = z.object({
	text: z.string().trim().min(10, 'Text too short to summarize').max(50000)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = summarizeSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const text = parsed.data.text;

		const res = await ollamaFetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma4-rotorquant:latest',
				prompt: `Provide a concise 1-2 sentence legal summary of the following text. Focus on the key legal point or holding.\n\nText: "${text.slice(0, 2000)}"\n\nSummary:`,
				stream: false
			}),
			signal: AbortSignal.timeout(15000)
		});

		if (!res.ok) {
			console.error('[summarize] Ollama error:', res.status);
			return json({ error: 'Summarization service unavailable' }, { status: 502 });
		}

		const data = await res.json();
		const summary = data.response?.trim() ?? '';

		// Confidence heuristic: longer input + longer output = more confident
		const confidence = Math.min(
			0.95,
			0.5 + (text.length > 100 ? 0.2 : 0) + (summary.length > 20 ? 0.15 : 0) + (summary.length > 80 ? 0.1 : 0)
		);

		return json({ summary, confidence, model: 'gemma4-rotorquant:latest' });
	} catch (err) {
		console.error('[summarize] Error:', err);
		return json({ error: 'Summarization failed' }, { status: 500 });
	}
};
