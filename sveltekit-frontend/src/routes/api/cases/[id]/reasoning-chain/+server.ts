/**
 * POST /api/cases/[id]/reasoning-chain
 * Generate a 4-step legal reasoning chain for a case
 *
 * Input: { summary, keyFacts?, charges?, jurisdiction? }
 * Output: { success, chain: { steps[], overallConfidence }, timing }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateReasoningChain } from '$lib/server/ai/legal-reasoning-chain.js';
import { requireAuth } from '$lib/server/auth-helpers.js';
import { db } from '$lib/server/db/client';
import { cases } from '$lib/server/db/schema-postgres.js';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { isUuid } from '$lib/server/validation.js';

const reasoningChainSchema = z.object({
	summary: z.string().trim().min(10, 'summary is required (minimum 10 characters)').max(50000),
	keyFacts: z.array(z.string().max(5000)).max(100).optional(),
	charges: z.array(z.string().max(500)).max(100).optional(),
	jurisdiction: z.string().max(200).optional()
});

export const POST: RequestHandler = async (event) => {
	if (!event.locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	await requireAuth(event);
	const caseId = event.params.id;
	if (!isUuid(caseId)) {
		return json({ error: 'Invalid case ID format' }, { status: 400 });
	}
	const [targetCase] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.userId, event.locals.user.id)))
    .limit(1);
  if (!targetCase) {
    return json({ error: 'Case not found' }, { status: 404 });
  }
	const startTime = Date.now();

	try {
		const parsed = reasoningChainSchema.safeParse(await event.request.json());
		if (!parsed.success) {
			return json(
				{ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}
		const body = parsed.data;

		console.log(`[reasoning-chain] Starting 4-step analysis for case ${caseId}`);

		const chain = await generateReasoningChain({
			summary: body.summary,
			keyFacts: Array.isArray(body.keyFacts) ? body.keyFacts : undefined,
			charges: Array.isArray(body.charges) ? body.charges : undefined,
			jurisdiction: typeof body.jurisdiction === 'string' ? body.jurisdiction : undefined
		});

		const processingTime = Date.now() - startTime;

		console.log(
			`[reasoning-chain] Complete for case ${caseId}: confidence=${(chain.overallConfidence * 100).toFixed(1)}%, ${processingTime}ms`
		);

		return json({
			success: true,
			caseId,
			chain: {
				steps: chain.steps,
				overallConfidence: Math.round(chain.overallConfidence * 1000) / 1000
			},
			timing: {
				totalMs: processingTime,
				stepTimings: chain.steps.map(s => ({ name: s.name, ms: s.durationMs }))
			},
			metadata: {
				timestamp: new Date().toISOString(),
				model: 'gemma3-legal:latest',
				stepsCompleted: chain.steps.length
			}
		});
	} catch (err) {
		console.error(`[reasoning-chain] Error for case ${caseId}:`, err);
		return json(
			{ success: false, error: 'Reasoning chain generation failed' },
			{ status: 500 }
		);
	}
};
