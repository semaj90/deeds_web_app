/**
 * GET/POST /api/retrieval/semantic-rerank — Test semantic vector reranker
 *
 * Query parameters:
 * - q: query string (embedded via Ollama)
 * - topK: how many results to rerank (default 50)
 * - verbose: enable debug output (default false)
 *
 * Body (POST):
 * - qdrantResults: array of {id, score, payload} from Qdrant ANN
 * - options: {topK?, blendWeights?, verbose?}
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { rerank, healthCheckReranker } from '$lib/server/retrieval/semantic-vector-reranker';
import { qdrantManager } from '$lib/server/vector/qdrant-manager';

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q');
	const topK = Math.max(1, Math.min(200, parseInt(url.searchParams.get('topK') || '50', 10)));
	const verbose = url.searchParams.get('verbose') === 'true';

	if (!query) {
		return json({ error: 'Missing query parameter: q' }, { status: 400 });
	}

	try {
		// Health check first
		const health = await healthCheckReranker();
		if (!health.operational) {
			return json(
				{
					error: 'Semantic reranker not operational',
					health,
				},
				{ status: 503 }
			);
		}

		// 1. Search Qdrant for the query
		const qdrantResults = await qdrantManager.search('codebase_chunks_768', query, topK, {
			// optional filters or advanced params
		});

		if (!qdrantResults || qdrantResults.length === 0) {
			return json({
				message: 'No results from Qdrant',
				qdrant: { count: 0 },
				semantic: { count: 0, candidates: [] },
			});
		}

		// 2. Rerank with semantic vector scores
		const startRerank = performance.now();
		const candidates = await rerank(qdrantResults, { topK, verbose });
		const rerankLatencyMs = Math.round(performance.now() - startRerank);

		// 3. Return results with diagnostics
		return json({
			query,
			timing: {
				qdrant_ms: 0, // Would need to track separately
				rerank_ms: rerankLatencyMs,
			},
			qdrant: {
				count: qdrantResults.length,
				top: qdrantResults.slice(0, 3).map((r) => ({
					id: r.id,
					score: r.score.toFixed(3),
				})),
			},
			semantic: {
				count: candidates.length,
				top: candidates.slice(0, 10).map((c) => ({
					packetKey: c.packetKey,
					sourceRef: c.sourceRef,
					compositeScore: c.compositeScore.toFixed(3),
					vector: c.vectorScore.toFixed(3),
					som: c.somScore.toFixed(3),
					domain: c.domainScore.toFixed(3),
					recency: c.recencyScore.toFixed(3),
					depth: c.depthScore.toFixed(3),
					diagnostics: c.diagnostics,
				})),
			},
			health,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('[Semantic Rerank] Error:', message);
		return json({ error: message }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	if (request.method !== 'POST') {
		return json({ error: 'POST required' }, { status: 405 });
	}

	try {
		const body = await request.json();
		const { qdrantResults, options = {} } = body;

		if (!Array.isArray(qdrantResults)) {
			return json(
				{ error: 'Body must contain qdrantResults array' },
				{ status: 400 }
			);
		}

		// Rerank
		const startRerank = performance.now();
		const candidates = await rerank(qdrantResults, { ...options, verbose: true });
		const rerankLatencyMs = Math.round(performance.now() - startRerank);

		return json({
			input_count: qdrantResults.length,
			output_count: candidates.length,
			rerank_latency_ms: rerankLatencyMs,
			candidates: candidates.slice(0, 20), // Limit response size
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('[Semantic Rerank POST] Error:', message);
		return json({ error: message }, { status: 500 });
	}
};
