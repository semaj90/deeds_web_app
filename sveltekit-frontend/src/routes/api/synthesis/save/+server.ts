import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { synthesisRuns } from '$lib/server/db/schema-postgres.js';

const saveSchema = z.object({
	query: z.string().min(1).max(8000),
	answer: z.string().min(1),
	model: z.string().default('gemma4-legal:latest'),
	cacheHit: z.string().optional(),
	latencyMs: z.number().int().optional(),
	confidence: z.number().min(0).max(1).optional(),
	grpoRewardScore: z.number().optional(),
	policyTier: z.string().optional(),
	citations: z
		.array(
			z.object({
				index: z.number(),
				id: z.string(),
				title: z.string(),
				source: z.string(),
				score: z.number(),
				section: z.string(),
				text: z.string()
			})
		)
		.default([])
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ id: null, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const parsed = saveSchema.safeParse(body);

		if (!parsed.success) {
			return json({ id: null, error: 'Invalid synthesis data' }, { status: 400 });
		}

		const {
			query,
			answer,
			model,
			cacheHit,
			latencyMs,
			confidence,
			grpoRewardScore,
			policyTier,
			citations
		} = parsed.data;

		const inserted = await db
			.insert(synthesisRuns)
			.values({
				userId: Number(locals.user.id),
				query,
				answer,
				model,
				cacheHit: cacheHit ?? null,
				latencyMs: latencyMs ?? null,
				confidence: confidence ?? null,
				grpoRewardScore: grpoRewardScore ?? null,
				policyTier: policyTier ?? null,
				citations
			})
			.returning();

		return json({ id: inserted[0].id });
	} catch (err) {
		return json({ id: null, error: String(err) }, { status: 200 });
	}
};