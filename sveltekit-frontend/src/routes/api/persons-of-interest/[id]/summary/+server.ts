import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { personsOfInterest } from '$lib/server/db/schema-postgres.js';
import { eq, sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { z } from 'zod';
import { isUuid } from '$lib/server/validation.js';

/** GBNF-constrained response schema for POI summary */
const poiSummaryResponseSchema = z.object({
	summary: z.string(),
	confidence: z.number(),
});
const poiSummaryResponseJsonSchema = z.toJSONSchema(poiSummaryResponseSchema);

/**
 * GET /api/persons-of-interest/[id]/summary
 * Return stored AI summary from personsOfInterest.aiProfile.summary
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	if (!isUuid(params.id)) return json({ error: 'Invalid ID format' }, { status: 400 });

	const poi = await db.select({
		aiProfile: personsOfInterest.aiProfile,
		name: personsOfInterest.name,
		threatLevel: personsOfInterest.threatLevel
	})
		.from(personsOfInterest)
		.where(eq(personsOfInterest.id, params.id))
		.limit(1)
		.then(r => r[0]);

	if (!poi) return json({ error: 'Person of interest not found' }, { status: 404 });

	const profile = poi.aiProfile as Record<string, unknown> | null;
	return json({
		poiId: params.id,
		name: poi.name,
		summary: (profile?.summary as string) ?? null,
		riskLevel: poi.threatLevel,
		generatedAt: (profile?.summaryGeneratedAt as string) ?? null
	});
};

/**
 * POST /api/persons-of-interest/[id]/summary
 * Generate AI summary for a POI via Ollama and store in aiProfile
 */
export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	if (!isUuid(params.id)) return json({ error: 'Invalid ID format' }, { status: 400 });

	const poi = await db.select().from(personsOfInterest)
		.where(eq(personsOfInterest.id, params.id))
		.limit(1)
		.then(r => r[0]);

	if (!poi) return json({ error: 'Person of interest not found' }, { status: 404 });

	const context = [
		`Name: ${poi.name}`,
		poi.aliases?.length ? `Aliases: ${(poi.aliases as string[]).join(', ')}` : null,
		`Role: ${poi.relationship ?? 'person_of_interest'}`,
		`Threat Level: ${poi.threatLevel ?? 'low'}`,
		`Status: ${poi.status ?? 'active'}`,
		poi.description ? `Description: ${poi.description}` : null,
		poi.who ? `Who: ${JSON.stringify(poi.who)}` : null,
		poi.what ? `What: ${JSON.stringify(poi.what)}` : null,
		poi.why ? `Why: ${JSON.stringify(poi.why)}` : null,
		poi.how ? `How: ${JSON.stringify(poi.how)}` : null,
		poi.caseIds?.length ? `Linked cases: ${(poi.caseIds as string[]).length}` : null
	].filter(Boolean).join('\n');

	const prompt = `Summarize this person of interest in 2-3 concise sentences covering:
- Their role and involvement in the case
- Key risk factors and concerns
- Recommended investigative actions

${context}

Respond with ONLY a JSON object:
{
  "summary": "2-3 sentence summary",
  "confidence": 0.0-1.0
}`;

	let summary = '';
	let confidence = 0.7;

	try {
		const ollamaRes = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				prompt,
				format: poiSummaryResponseJsonSchema,
				stream: false,
				options: { temperature: 0.3, num_predict: 512 }
			}),
			signal: AbortSignal.timeout(30000)
		});

		if (!ollamaRes.ok) {
			return json({ error: 'AI service unavailable' }, { status: 502 });
		}

		const data = await ollamaRes.json();
		const result = JSON.parse(data.response);

		summary = String(result.summary || '').trim();
		confidence = Math.min(Math.max(Number(result.confidence) || 0.7, 0), 1);

		if (!summary) {
			return json({ error: 'AI returned empty summary' }, { status: 502 });
		}
	} catch {
		return json({ error: 'Summary generation failed' }, { status: 503 });
	}

	// Store in aiProfile via JSONB merge
	const generatedAt = new Date().toISOString();
	try {
		await db.execute(sql`
			UPDATE persons_of_interest
			SET ai_profile = COALESCE(ai_profile, '{}'::jsonb) || ${JSON.stringify({
				summary,
				summaryConfidence: confidence,
				summaryGeneratedAt: generatedAt
			})}::jsonb,
			updated_at = NOW()
			WHERE id = ${params.id}
		`);
	} catch {
		return json({ error: 'Failed to store summary' }, { status: 500 });
	}

	return json({
		poiId: params.id,
		name: poi.name,
		summary,
		confidence,
		riskLevel: poi.threatLevel,
		generatedAt
	});
};
