/**
 * Cache Warm-Up API Endpoint (Async Background Processing)
 *
 * POST /api/cache/warm-up — Trigger cache warm-up with common legal queries
 *
 * This endpoint returns immediately and processes queries in the background
 * to avoid SvelteKit's 30-second request timeout.
 *
 * Request body (all optional):
 *   {
 *     "batchSize": 5,          // Queries per batch (default: 5)
 *     "delayMs": 1000,         // Delay between batches (default: 1000ms)
 *     "model": "gemma4-rotorquant:latest", // LLM model to use
 *     "domain": "evidence",    // Specific domain (evidence, civil-procedure, torts, contracts, criminal)
 *     "dryRun": false          // If true, only log queries without calling LLM
 *   }
 *
 * Response (immediate):
 *   {
 *     "success": true,
 *     "message": "Warm-up started",
 *     "config": {
 *       "batchSize": 5,
 *       "delayMs": 1000,
 *       "model": "gemma4-rotorquant:latest",
 *       "domain": "evidence",
 *       "totalQueries": 20
 *     }
 *   }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { warmUpCache, warmUpDomain } from '$lib/server/cache/warm-up.js';

const WarmUpSchema = z.object({
	batchSize: z.number().int().positive().optional().default(5),
	delayMs: z.number().int().nonnegative().optional().default(1000),
	model: z.string().optional().default('gemma4-rotorquant:latest'),
	domain: z
		.enum(['evidence', 'civil-procedure', 'torts', 'contracts', 'criminal', 'evidence-analysis'])
		.optional(),
	dryRun: z.boolean().optional().default(false),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	// Auth check — only admins or dev mode can trigger warm-up
	if (!locals.user?.id) {
		if (process.env.DEV_BYPASS_AUTH !== 'true') {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		body = {}; // Use defaults if no body provided
	}

	// Validate request body
	const parseResult = WarmUpSchema.safeParse(body);
	if (!parseResult.success) {
		return json(
			{
				success: false,
				error: 'Invalid request body',
				details: parseResult.error.issues,
			},
			{ status: 400 }
		);
	}

	const { batchSize, delayMs, model, domain, dryRun } = parseResult.data;

	console.log('[API warm-up] Starting background warm-up:', {
		batchSize,
		delayMs,
		model,
		domain,
		dryRun,
		userId: locals.user?.id || 'dev-mode',
	});

	// Calculate total queries
	const totalQueries = domain ? 20 : 120;

	// Start warm-up in background (fire-and-forget)
	// Don't await - return immediately to avoid timeout
	const warmUpPromise = domain
		? warmUpDomain(domain, { batchSize, delayMs, model, dryRun })
		: warmUpCache({ batchSize, delayMs, model, dryRun });

	// Handle completion in background (no blocking)
	warmUpPromise
		.then((report) => {
			console.log('[API warm-up] Background warm-up completed:', {
				totalQueries: report.totalQueries,
				successful: report.successful,
				failed: report.failed,
				durationMs: report.durationMs,
				successRate: ((report.successful / report.totalQueries) * 100).toFixed(1) + '%',
			});
		})
		.catch((err) => {
			console.error('[API warm-up] Background warm-up failed:', err);
		});

	// Return immediately with config
	return json({
		success: true,
		message: 'Warm-up started in background',
		config: {
			batchSize,
			delayMs,
			model,
			domain: domain || 'all',
			totalQueries,
			estimatedDurationSeconds: Math.ceil((totalQueries * 8 + (totalQueries / batchSize) * (delayMs / 1000))),
		},
		note: 'Monitor cache stats at /api/cache/stats to see keys being added',
	});
};
