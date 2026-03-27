import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

const analyzeSchema = z.object({
	node: z.object({
		id: z.string().min(1),
		title: z.string().optional(),
		type: z.string().optional(),
		description: z.string().optional(),
		confidence: z.number().optional(),
		metadata: z.record(z.string(), z.unknown()).optional()
	})
});

/** POST /api/evidence/ai/analyze — AI analysis of an evidence node */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = analyzeSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { node } = parsed.data;
		const text = node.description || node.title || '';

		const { ollamaFetch } = await import('$lib/server/ollama.js');
		const { ENV } = await import('$lib/server/env.server.js');

		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				prompt: `Analyze this evidence item and provide: 1) A brief analysis of its legal significance, 2) Suggestions for further investigation.

Evidence type: ${node.type ?? 'unknown'}
Title: ${node.title ?? 'untitled'}
Description: ${text.slice(0, 5000)}

Return JSON: { "analysis": "...", "suggestions": ["...", "..."] }`,
				stream: false,
				options: { temperature: 0.4 }
			}),
			signal: AbortSignal.timeout(60_000)
		});

		if (!res.ok) {
			return json({ analysis: 'Analysis unavailable', suggestions: [] });
		}

		const data = await res.json();
		try {
			const parsed = JSON.parse(data.response);
			return json({
				analysis: parsed.analysis ?? data.response,
				suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
			});
		} catch {
			return json({ analysis: data.response, suggestions: [] });
		}
	} catch (err) {
		console.error('[/api/evidence/ai/analyze] error:', err);
		return json({ analysis: 'Analysis failed', suggestions: [] }, { status: 500 });
	}
};