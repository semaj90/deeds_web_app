import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import {
	runPhase101SummaryCache,
	type Phase101SummaryGeneration,
	type Phase101SummarySynthesis
} from '$lib/server/cache/phase101-summary-cache.js';

const synthesizeSchema = z.object({
	documentId: z.string().min(1),
	sections: z.array(
		z.object({
			title: z.string(),
			content: z.string()
		})
	),
	keyInsights: z.array(z.string()).default([]),
	sourceRefs: z.array(z.string().min(1)).default([]),
	featureIds: z.array(z.string().min(1)).default([]),
	intent: z.string().max(120).default('summary'),
	promptVersion: z.string().max(80).default('phase101-summary-v1'),
	model: z.string().max(120).default('gemma4-rotorquant:latest')
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

		const { sections, keyInsights, sourceRefs, featureIds, intent, promptVersion, model } = parsed.data;
		const { ollamaFetch, getOllamaGenerationEndpoint } = await import('$lib/server/ollama.js');
		const { ENV } = await import('$lib/server/env.server.js');

		const result = await runPhase101SummaryCache(
			{
				documentId: parsed.data.documentId,
				sections,
				keyInsights,
				sourceRefs,
				featureIds,
				intent,
				promptVersion,
				model
			},
			async (ctx): Promise<Phase101SummaryGeneration> => {
				const res = await ollamaFetch(`${getOllamaGenerationEndpoint()}/api/generate`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model: ctx.model,
						prompt: `Synthesize insights from the following legal document sections and key findings.

Document ID: ${parsed.data.documentId}
SourceRefs: ${(ctx.sourceRefs ?? []).join(', ') || parsed.data.documentId}
FeatureIds: ${(ctx.featureIds ?? []).join(', ') || 'none'}

${ctx.cacheText.slice(0, 15000)}

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
					throw new Error(`Ollama generate failed: ${res.status} ${res.statusText}`);
				}

				const data = await res.json();
				try {
					const parsedResponse = JSON.parse(data.response) as { synthesis?: Phase101SummarySynthesis };
					return {
						rawText: String(data.response ?? ''),
						synthesis:
							parsedResponse.synthesis ?? {
								mainThemes: [String(data.response ?? '').slice(0, 500)],
								supportingEvidence: [],
								gaps: [],
								contradictions: [],
								legalImplications: [],
								nextSteps: []
							}
					};
				} catch {
					return {
						rawText: String(data.response ?? ''),
						synthesis: {
							mainThemes: [String(data.response ?? '').slice(0, 500)],
							supportingEvidence: [],
							gaps: [],
							contradictions: [],
							legalImplications: [],
							nextSteps: []
						}
					};
				}
			}
		);

		return json({
			synthesis: result.packet.synthesis,
			summaryPacket: result.packet,
			cache: {
				state: result.cache,
				exactCacheKey: result.exactCacheKey,
				semanticCacheKey: result.semanticCacheKey ?? null
			}
		});
	} catch (err) {
		console.error('[/api/summarize/synthesize] error:', err);
		return json({ synthesis: null }, { status: 500 });
	}
};


