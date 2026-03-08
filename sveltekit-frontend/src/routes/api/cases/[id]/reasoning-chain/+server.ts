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

export const POST: RequestHandler = async (event) => {
	await requireAuth(event);
	const caseId = event.params.id;
	const startTime = Date.now();

	try {
		const body = await event.request.json();

		if (!body.summary || typeof body.summary !== 'string' || body.summary.trim().length < 10) {
			return json(
				{ success: false, error: 'summary is required (minimum 10 characters)' },
				{ status: 400 }
			);
		}

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
		const message = err instanceof Error ? err.message : String(err);
		return json(
			{ success: false, error: `Reasoning chain failed: ${message}` },
			{ status: 500 }
		);
	}
};
