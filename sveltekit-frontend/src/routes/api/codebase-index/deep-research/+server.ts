/**
 * POST /api/codebase-index/deep-research
 *
 * Standalone trigger for the agentic web-search deep-research indexer.
 * Calls runDeepResearchIndex() directly without running the full orchestrate pipeline.
 *
 * Body (JSON):
 *   { maxClusters?: number, resultsPerQuery?: number, skipQdrant?: boolean }
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';

const schema = z.object({
	maxClusters: z.number().int().min(1).max(20).default(20),
	resultsPerQuery: z.number().int().min(1).max(10).default(5),
	maxDepth: z.number().int().min(1).max(2).default(1),
	skipQdrant: z.boolean().default(false),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => ({}));
	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
	}

	const { maxClusters, resultsPerQuery, maxDepth, skipQdrant } = parsed.data;
	const runId = `dr-${Date.now()}`;

	const startedAt = Date.now();
	try {
		const { runDeepResearchIndex } = await import('$lib/server/indexer/web-search-indexer.js');
		const result = await runDeepResearchIndex({
			runId,
			maxClusters,
			resultsPerQuery,
			maxDepth,
			skipQdrant,
		});

		return json({
			ok: true,
			runId,
			durationMs: Date.now() - startedAt,
			...result,
		});
	} catch (err) {
		return json({
			ok: false,
			error: (err as Error).message,
			runId,
			durationMs: Date.now() - startedAt,
			queriesRun: 0,
			pagesIndexed: 0,
			pagesSkipped: 0,
			pagesFailed: 0,
			rowsInserted: 0,
			rowsUpdated: 0,
		});
	}
};
