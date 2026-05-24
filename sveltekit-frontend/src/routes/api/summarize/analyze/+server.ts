import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

const analyzeSchema = z.object({
	documentId: z.string().min(1),
	sections: z.array(
		z.object({
			title: z.string(),
			content: z.string(),
			importance: z.enum(['critical', 'high', 'medium', 'low']).optional(),
			wordCount: z.number().optional()
		})
	)
});

/** POST /api/summarize/analyze — Analyze document sections */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = analyzeSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { sections } = parsed.data;
		const combinedText = sections.map((s) => `${s.title}: ${s.content}`).join('\n\n');

		const { ollamaFetch } = await import('$lib/server/ollama.js');
		const { ENV } = await import('$lib/server/env.server.js');

		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma4-rotorquant:latest',
				prompt: `Analyze the following legal document sections. For each section, provide a relevance score (0-1) and brief explanation.

Sections:
${combinedText.slice(0, 15000)}

Return JSON: { "results": [{ "type": "section_title", "score": 0.0-1.0, "explanation": "...", "recommendations": ["..."] }] }`,
				stream: false,
				options: { temperature: 0.3 }
			}),
			signal: AbortSignal.timeout(90_000)
		});

		if (!res.ok) {
			return json({ results: [] });
		}

		const data = await res.json();
		try {
			const parsed = JSON.parse(data.response);
			return json({ results: Array.isArray(parsed.results) ? parsed.results : [] });
		} catch {
			return json({ results: [{ type: 'analysis', score: 0.5, explanation: data.response }] });
		}
	} catch (err) {
		console.error('[/api/summarize/analyze] error:', err);
		return json({ results: [] }, { status: 500 });
	}
};
