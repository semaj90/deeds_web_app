/**
 * POST /api/test/cache-demo
 *
 * Test endpoint to demonstrate Redis L1 + Bifrost L2 cache performance.
 * Makes LLM requests via bifrostChat() to test cache tiers.
 *
 * NO AUTH REQUIRED - for testing only.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { bifrostChat } from '$lib/server/ollama.js';
import { getExactMatchStats } from '$lib/server/cache/redis-exact-match.js';

interface CacheDemoRequest {
	query: string;
	runs?: number; // How many times to run the same query (default: 3)
	model?: string; // Model to use (default: gemma3:270m for fast testing)
}

export const POST: RequestHandler = async ({ request }) => {
	const startTime = performance.now();

	try {
		const body = await request.json() as CacheDemoRequest;
		const query = body.query || 'What is hearsay evidence in criminal law?';
		const runs = body.runs || 3;
		const model = body.model || 'gemma3:270m'; // Default to fast model for testing

		// Get cache stats before
		const statsBefore = await getExactMatchStats();

		const results = [];

		// Run the same query multiple times to test cache tiers
		for (let i = 0; i < runs; i++) {
			const runStart = performance.now();

			const response = await bifrostChat(
				[{ role: 'user', content: query }],
				model,
				{
					temperature: 0.3,
					maxTokens: 200,
					timeoutMs: 60_000,
				}
			);

			const runEnd = performance.now();
			const latency = Math.round(runEnd - runStart);

			results.push({
				run: i + 1,
				latencyMs: latency,
				responsePreview: response.slice(0, 150) + '...',
				expectedTier: i === 0 ? 'L3 (Cold/Ollama)' : i === 1 ? 'L2 (Bifrost/Qdrant)' : 'L1 (Redis)',
			});

			// Small delay between runs
			if (i < runs - 1) {
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		}

		// Get cache stats after
		const statsAfter = await getExactMatchStats();

		// Calculate speedup
		const baseline = results[0].latencyMs;
		const fastest = Math.min(...results.map(r => r.latencyMs));
		const speedup = Math.round(baseline / fastest);

		return json({
			success: true,
			query,
			runs,
			results,
			cacheStats: {
				before: {
					totalKeys: statsBefore.totalKeys,
					memoryMB: (statsBefore.memoryUsedBytes / (1024 * 1024)).toFixed(2),
				},
				after: {
					totalKeys: statsAfter.totalKeys,
					memoryMB: (statsAfter.memoryUsedBytes / (1024 * 1024)).toFixed(2),
				},
			},
			performance: {
				baselineMs: baseline,
				fastestMs: fastest,
				speedup: `${speedup}×`,
				totalDurationMs: Math.round(performance.now() - startTime),
			},
		});
	} catch (err) {
		console.error('[/api/test/cache-demo] Error:', err);
		return json(
			{
				success: false,
				error: (err as Error)?.message ?? 'Cache demo failed',
			},
			{ status: 500 }
		);
	}
};