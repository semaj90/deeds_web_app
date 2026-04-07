// API endpoint: /api/agentic-loop
// Trigger CUDA-accelerated clustering pipeline via TypeScript k-means + Qdrant
// Uses existing topic-clustering-worker.ts (XState v5 orchestration)

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { startClusteringJob, getClusteringStatus } from '$lib/server/ml/topic-clustering-worker.js';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const { iterations = 1 } = body as { iterations?: number };

		// Start the clustering pipeline (XState: idle → fetch → cluster → persist → cache)
		const jobId = await startClusteringJob();

		return json({
			success: true,
			jobId,
			message: `Started k-means clustering pipeline (k=15, ${iterations} iteration${iterations > 1 ? 's' : ''})`,
			architecture: 'XState v5 + K-Means++ + Qdrant legal_documents + pgvector',
			status: getClusteringStatus()
		});
	} catch (error) {
		console.error('[agentic-loop] Failed to start pipeline:', error);
		return json({ error: 'Pipeline start failed' }, { status: 500 });
	}
};

export const GET: RequestHandler = async () => {
	return json({
		status: getClusteringStatus(),
		pipeline: {
			name: 'Topic Clustering Worker',
			algorithm: 'k-means++ (k=15, 768-dim embeddings)',
			source: 'Qdrant legal_documents collection',
			persistence: 'PostgreSQL document_topics table',
			orchestration: 'XState v5 state machine',
			stages: ['idle', 'fetching_embeddings', 'clustering', 'persisting', 'invalidating_cache', 'done']
		}
	});
};
