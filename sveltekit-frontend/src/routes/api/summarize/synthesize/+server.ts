import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

const synthesizeSchema = z.object({
	documentId: z.string().min(1),
	sections: z.array(
		z.object({
			title: z.string(),
			content: z.string()
		})
	),
	keyInsights: z.array(z.string()).default([])
});

/** POST /api/summarize/synthesize — Synthesize insights from document sections */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = synthesizeSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { sections, keyInsights } = parsed.data;
		const sectionText = sections.map((s) => `${s.title}: ${s.content}`).join('\n\n');
		const insightsText = keyInsights.length > 0 ? `Key insights: ${keyInsights.join('; ')}` : '';

		const { ollamaFetch } = await import('$lib/server/ollama.js');
		const { ENV } = await import('$lib/server/env.server.js');

		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma4-legal:latest',
				prompt: `Synthesize insights from the following legal document sections and key findings.

${sectionText.slice(0, 15000)}

${insightsText}

Return JSON: {
  "synthesis": {
    "mainThemes": ["..."],
    "supportingEvidence": ["..."],
    "gaps": ["..."],
    "contradictions": ["..."],
    "legalImplications": ["..."],
    "nextSteps": ["..."]
  }
}`,
				stream: false,
				options: { temperature: 0.3 }
			}),
			signal: AbortSignal.timeout(90_000)
		});

		if (!res.ok) {
			return json({ synthesis: null });
		}

		const data = await res.json();
		try {
			const parsed = JSON.parse(data.response);
			return json({ synthesis: parsed.synthesis ?? parsed });
		} catch {
			return json({
				synthesis: {
					mainThemes: [data.response.slice(0, 500)],
					supportingEvidence: [],
					gaps: [],
					contradictions: [],
					legalImplications: [],
					nextSteps: []
				}
			});
		}
	} catch (err) {
		console.error('[/api/summarize/synthesize] error:', err);
		return json({ synthesis: null }, { status: 500 });
	}
};
