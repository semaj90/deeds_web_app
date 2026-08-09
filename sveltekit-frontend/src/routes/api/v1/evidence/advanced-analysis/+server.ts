import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { LLAMA_SERVER_BASE_URL, LOCAL_VLM_MODEL } from '$lib/server/ai/local-llama-provider.js';

const analysisSchema = z.object({
	evidenceId: z.string().min(1),
	analysisTypes: z.array(z.enum(['summary', 'entities', 'sentiment'])).min(1),
	caseId: z.string().optional()
});

/** POST /api/v1/evidence/advanced-analysis — Multi-type analysis of evidence via the local model server */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = analysisSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { evidenceId, analysisTypes } = parsed.data;

		// Fetch evidence text from DB
		const { db } = await import('$lib/server/db/client');
		const { evidence } = await import('$lib/server/db/schema.js');
		const { eq } = await import('drizzle-orm');

		const rows = await db
			.select({ id: evidence.id, title: evidence.title, description: evidence.description })
			.from(evidence)
			.where(eq(evidence.id, evidenceId))
			.limit(1);

		const item = rows[0];
		if (!item) {
			return json({ error: 'Evidence not found' }, { status: 404 });
		}

		const text = item.description || item.title || '';
		const results: Record<string, unknown> = {};

		for (const type of analysisTypes) {
			const systemPrompts: Record<string, string> = {
				summary:
					'You are a legal analyst. Provide a concise summary of the following evidence. Return JSON: { "summary": "..." }',
				entities:
					'You are a legal analyst. Extract named entities (people, organizations, dates, locations, legal references) from the following text. Return JSON: { "entities": [{ "text": "...", "type": "..." }] }',
				sentiment:
					'You are a legal analyst. Analyze the sentiment and tone of the following evidence text. Return JSON: { "sentiment": "positive|negative|neutral", "confidence": 0.0-1.0, "tone": "..." }'
			};

			try {
				const res = await fetch(`${LLAMA_SERVER_BASE_URL}/chat/completions`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model: LOCAL_VLM_MODEL,
						messages: [
							{ role: 'system', content: systemPrompts[type] },
							{ role: 'user', content: `Evidence text:\n${text.slice(0, 8000)}` },
						],
						stream: false,
						temperature: 0.3,
						max_tokens: 1024,
					}),
					signal: AbortSignal.timeout(60_000)
				});

				if (res.ok) {
					const data = await res.json();
					try {
						results[type] = JSON.parse(data.choices?.[0]?.message?.content ?? '');
					} catch {
						results[type] = { raw: data.choices?.[0]?.message?.content ?? '' };
					}
				} else {
					results[type] = { error: `LLM returned ${res.status}` };
				}
			} catch {
				results[type] = { error: 'Analysis timed out' };
			}
		}

		return json({ results });
	} catch (err) {
		console.error('[/api/v1/evidence/advanced-analysis] error:', err);
		return json({ error: 'Analysis failed' }, { status: 500 });
	}
};


