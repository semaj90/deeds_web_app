/**
 * POST /api/codebase/rerank
 *
 * Stage B of the 2-stage retrieval pipeline.
 * Semantic re-rank: embed query → Qdrant tri-vector search → path boosting.
 * Returns top 5–20 ranked chunks with full content.
 *
 * Uses three named vectors (content + signature + optional error) with configurable weights.
 * Path-based boosting: +server.ts files, schema files, tests get priority.
 *
 * Optional errorQuery activates the `error` named vector lane (additive weight 0.15).
 * Chunks semantically close to the error description are promoted in ranking.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { logCodebaseSearch } from '$lib/server/analytics/event-logger.js';
import { rerankChunks } from '$lib/server/features/rag/index.js';

// Zod schema validates query, candidatePaths, weights, pathBoosts, errorQuery
const rerankSchema = z.object({
	query: z.string().min(1, 'Missing query string').max(5000),
	candidatePaths: z.array(z.string().max(1000)).max(200).optional(),
	limit: z.number().int().min(1).max(50).optional().default(10),
	contentWeight: z.number().min(0).max(1).optional().default(0.6),
	signatureWeight: z.number().min(0).max(1).optional().default(0.4),
	errorWeight: z.number().min(0).max(1).optional().default(0.15),
	pathBoosts: z.record(z.string(), z.number()).optional(),
	/** Optional error description to activate the error named vector search lane. */
	errorQuery: z.string().max(1000).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = rerankSchema.safeParse(await request.json());
	if (!parsed.success) {
		throw error(400, parsed.error.issues[0]?.message ?? 'Invalid request');
	}
	const body = parsed.data;

	try {
		const rerank = await rerankChunks(body.query, {
      candidatePaths: body.candidatePaths,
      limit: body.limit,
      contentWeight: body.contentWeight,
      signatureWeight: body.signatureWeight,
      errorWeight: body.errorWeight,
      pathBoosts: body.pathBoosts,
      errorQuery: body.errorQuery,
      caller: 'api-rerank',
    });

		// -- Stage C: Gemma4 Pointwise Rerank (Optional/Default) ---------------
		let finalResults = rerank.results;
		let stageCStats = null;

		const useGemma = request.headers.get('x-rerank-stage') === 'C' || true;
		if (useGemma && rerank.results.length > 0) {
			const { rerankWithCrossEncoder } = await import('$lib/server/retrieval/cross-encoder-reranker.js');
			const pool = rerank.results.map(c => ({
				documentId: `${c.relativePath}:${c.lineStart}`,
				content: c.content,
				retrievalScore: c.score,
				chunk: c
			}));

			const gemmas = await rerankWithCrossEncoder(body.query, pool, {
				returnTopK: body.limit,
				noFallback: false
			});

			finalResults = gemmas.results.map(r => r.doc.chunk);
			stageCStats = gemmas.stats;
		}

		// Fire-and-forget analytics
		logCodebaseSearch({
			userId: locals.user?.id,
			query: body.query,
			recallCount: body.candidatePaths?.length ?? 0,
			rerankCount: finalResults.length,
			recallMs: 0,
			rerankMs: rerank.timing.searchMs,
			totalMs: rerank.timing.totalMs,
			topHits: finalResults.map((r) => r.relativePath),
		});

		return json({
			results: finalResults,
			timing: rerank.timing,
			meta: {
				...rerank.meta,
				stageC: stageCStats
			},
		});
	} catch (err) {
		console.error('[rerank-endpoint] Rerank failed:', err);
		return json({
			results: [],
			error: (err as Error).message,
			meta: { error: true }
		}, { status: 207 });
	}
};
