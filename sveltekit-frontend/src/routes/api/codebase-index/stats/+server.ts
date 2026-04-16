/**
 * Codebase Index Stats API
 * Endpoint: GET /api/codebase-index/stats
 * Purpose: Return codebase indexing statistics and error metrics
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getQdrantUrl, getCodebaseIndexUrl } from '$lib/config/env.server.js';
import { fastJsonParse, isSimdJsonAvailable } from '$lib/server/gpu/simdjson-bridge.js';

const QDRANT_URL = getQdrantUrl();
const FASTAPI_URL = getCodebaseIndexUrl();
const ERROR_CARDS_COLLECTION = 'phase90_error_cards';
const CLUSTER_COLLECTION = 'phase90_error_clusters';

export const GET: RequestHandler = async ({ fetch, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const requestStart = performance.now();
	try {
		// Try FastAPI backend first
		try {
			const backendResponse = await fetch(`${FASTAPI_URL}/api/codebase/stats`, {
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json'
				},
				signal: AbortSignal.timeout(5000)
			});

			if (backendResponse.ok) {
				const data = await backendResponse.json();
				return json(data);
			}
		} catch (backendError) {
			console.warn('FastAPI backend not available, falling back to Qdrant:', backendError);
		}

		// Fallback: Get error cards count and stats directly from Qdrant
		const errorCardsResponse = await fetch(
			`${QDRANT_URL}/collections/${ERROR_CARDS_COLLECTION}/points/scroll`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					limit: 10000,
					with_payload: true,
					with_vector: false
				}),
				signal: AbortSignal.timeout(15_000)
			}
		);

		let totalErrors = 0;
		let topErrorCodes: Array<{ code: string; count: number }> = [];
		let surfaceBreakdown: Record<string, number> = {};
		let techBreakdown: Record<string, number> = {};
		let lastIndexed: string | null = null;

		if (errorCardsResponse.ok) {
			const rawText = await errorCardsResponse.text();
			const parseStart = performance.now();
			const errorData = fastJsonParse<{ result?: { points?: Array<{ payload: Record<string, unknown> }> } }>(rawText);
			const parseMs = performance.now() - parseStart;
			const points = errorData.result?.points ?? [];
			totalErrors = points.length;

			// Calculate error code histogram
			const codeCount: Record<string, number> = {};
			points.forEach((p: { payload: { errorCode?: string; surface?: string[]; tech?: string[]; timestamp?: string } }) => {
				const code = p.payload?.errorCode ?? 'UNKNOWN';
				codeCount[code] = (codeCount[code] ?? 0) + 1;

				// Surface breakdown
				(p.payload?.surface ?? []).forEach((s: string) => {
					surfaceBreakdown[s] = (surfaceBreakdown[s] ?? 0) + 1;
				});

				(p.payload?.tech ?? []).forEach((t: string) => {
					techBreakdown[t] = (techBreakdown[t] ?? 0) + 1;
				});

				if (p.payload?.timestamp && (!lastIndexed || p.payload.timestamp > lastIndexed)) {
					lastIndexed = p.payload.timestamp;
				}
			});

			topErrorCodes = Object.entries(codeCount)
				.map(([code, count]) => ({ code, count }))
				.sort((a, b) => b.count - a.count);
		}

		// Get cluster count
		const clustersResponse = await fetch(
			`${QDRANT_URL}/collections/${CLUSTER_COLLECTION}/points/count`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({}),
				signal: AbortSignal.timeout(5_000)
			}
		);

		let errorClusters = 0;
		if (clustersResponse.ok) {
			const clusterData = await clustersResponse.json();
			errorClusters = clusterData.result?.count ?? 0;
		}

		// Get codebase indexing stats from codebase_chunks_768 collection
		let indexedFiles = 0;
		try {
			const codebaseResponse = await fetch(
				`${QDRANT_URL}/collections/codebase_chunks_768`,
				{
					headers: { 'Content-Type': 'application/json' },
					signal: AbortSignal.timeout(5_000)
				}
			);
			if (codebaseResponse.ok) {
				const codebaseData = await codebaseResponse.json();
				indexedFiles = codebaseData.result?.points_count ?? 0;
			}
		} catch (err) {
			console.warn('Failed to get codebase collection stats:', err);
		}

		return json({
			totalFiles: indexedFiles, // Total chunks in Qdrant
			indexedFiles,
			totalErrors,
			errorClusters,
			topErrorCodes,
			surfaceBreakdown,
			techBreakdown,
			lastIndexed,
			_perf: {
				totalMs: Math.round(performance.now() - requestStart),
				simdAvailable: isSimdJsonAvailable(),
				parser: isSimdJsonAvailable() && totalErrors > 0 ? 'simdjson' : 'v8',
			},
		});
	} catch (error) {
		console.error('Failed to get codebase stats:', error);
		return json({
      totalFiles: 0,
      indexedFiles: 0,
      totalErrors: 0,
      errorClusters: 0,
      topErrorCodes: [],
      surfaceBreakdown: {},
      techBreakdown: {},
      lastIndexed: null,
      _perf: { totalMs: 0, simdAvailable: false, parser: 'v8' },
    });
	}
};