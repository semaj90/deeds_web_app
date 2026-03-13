/**
 * Codebase Index Clusters API
 * Endpoint: GET /api/codebase-index/clusters
 * Purpose: List all error clusters from phase90_error_clusters
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getQdrantUrl, getCodebaseIndexUrl } from '$lib/config/env.server.js';

const QDRANT_URL = getQdrantUrl();
const FASTAPI_URL = getCodebaseIndexUrl();
const CLUSTER_COLLECTION = 'phase90_error_clusters';

export const GET: RequestHandler = async ({ url, fetch }) => {
	try {
		const limit = parseInt(url.searchParams.get('limit') ?? '20');

		// Try FastAPI backend first (Task 16.3 integration)
		try {
			const backendResponse = await fetch(`${FASTAPI_URL}/api/codebase/clusters?limit=${limit}`, {
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

		// Fallback: Query Qdrant directly
		const response = await fetch(
			`${QDRANT_URL}/collections/${CLUSTER_COLLECTION}/points/scroll`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					limit,
					with_payload: true,
					with_vector: false
				})
			}
		);

		if (!response.ok) {
			throw new Error(`Qdrant error: ${response.status}`);
		}

		const data = await response.json();
		const points = data.result?.points ?? [];

		// Sort by member_count descending
		const clusters = points
			.map((p: { id: string; payload: Record<string, unknown> }) => ({
				id: p.id,
				...p.payload
			}))
			.sort((a: { member_count?: number }, b: { member_count?: number }) =>
				(b?.member_count ?? 0) - (a?.member_count ?? 0)
			);

		return json({ clusters });
	} catch (error) {
		console.error('Failed to get clusters:', error);
		return json({ clusters: [], error: 'Failed to fetch clusters' }, { status: 500 });
	}
};