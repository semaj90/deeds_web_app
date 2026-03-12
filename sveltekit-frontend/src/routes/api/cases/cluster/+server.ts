/**
 * POST /api/cases/cluster
 * Cluster similar cases using k-means or SOM
 *
 * Algorithm Support:
 * - k-means: Using KMeansClusterer from topic-cluster.ts
 * - som: Using SOMClusterer (to be implemented)
 * - hierarchical: Not yet implemented
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { ApiResponse, ClusteringConfig, DocumentCluster, ClusterResult } from '$lib/types/api.js';
import { KMeansClusterer } from '$lib/server/ml/topic-cluster.js';
import { SOMClusterer } from '$lib/server/ml/som-cluster.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { requireAuth } from '$lib/server/auth-helpers.js';
import { z } from 'zod';

const clusterSchema = z.object({
	caseId: z.string().max(500).optional(),
	algorithm: z.enum(['kmeans', 'som', 'hierarchical']).optional().default('kmeans'),
	k: z.number().int().min(2, 'k must be between 2 and 50').max(50, 'k must be between 2 and 50').optional().default(5),
	includeEmbeddings: z.boolean().optional().default(false)
});

interface ClusterRequest {
	caseId?: string;
	algorithm?: 'kmeans' | 'som' | 'hierarchical';
	k?: number;
	includeEmbeddings?: boolean;
}

/**
 * POST /api/cases/cluster
 * Cluster similar legal cases based on embeddings
 */
export const POST: RequestHandler = async (event) => {
	const auth = await requireAuth(event);
	const startTime = Date.now();

	try {
		// Zod schema validates algorithm enum, k range (2-50), and applies defaults
		const parsed = clusterSchema.safeParse(await event.request.json());
		if (!parsed.success) {
			return json(
				{ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}
		const body = parsed.data;
		const { algorithm, k, includeEmbeddings } = body;

		console.log(
			`[cases-cluster] Starting clustering: algorithm=${algorithm}, k=${k}, caseId=${body.caseId || 'all'}`
		);

		// Step 1: Fetch embeddings from Qdrant
		let embeddings: number[][] = [];
		let documentIds: string[] = [];

		try {
			// Fetch from legal_documents collection
			const response = await fetch(
				`${process.env.QDRANT_URL || 'http://localhost:6333'}/collections/legal_documents/points/scroll`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						limit: 1000,
						with_vector: true,
						with_payload: false
					})
				}
			);

			if (!response.ok) {
				throw new Error(`Qdrant fetch failed: ${response.status}`);
			}

			const data = await response.json();
			const points = data.result?.points ?? [];

			for (const point of points) {
				const vectors = point.vector;
				let contentVector: number[] | null = null;

				if (Array.isArray(vectors)) {
					contentVector = vectors;
				} else if (vectors && typeof vectors === 'object') {
					contentVector = vectors.content || Object.values(vectors)[0];
				}

				if (contentVector && Array.isArray(contentVector) && contentVector.length === 768) {
					embeddings.push(contentVector);
					documentIds.push(String(point.id));
				}
			}

			console.log(`[cases-cluster] Fetched ${embeddings.length} embeddings from Qdrant`);
		} catch (qdrantError) {
			console.error('[cases-cluster] Qdrant fetch error:', qdrantError);
			return json(
				{
					success: false,
					error: 'Failed to fetch embeddings from Qdrant'
				},
				{ status: 500 }
			);
		}

		if (embeddings.length === 0) {
			return json(
				{
					success: true,
					data: {
						clusters: [],
						clusterId: `cluster-${Date.now()}`,
						silhouetteScore: 0,
						iterations: 0,
						converged: true
					},
					message: 'No documents found to cluster',
					metadata: {
						timestamp: new Date().toISOString(),
						version: '1.0',
						processing_time: Date.now() - startTime
					}
				},
				{ status: 200 }
			);
		}

		// Step 2: Run clustering based on algorithm
		let clusterResult: ClusterResult;

		if (algorithm === 'kmeans') {
			console.log(`[cases-cluster] Running k-means clustering with k=${k}...`);

			const clusterer = new KMeansClusterer(k, 100, 1e-4);
			const result = await clusterer.fit(embeddings);

			// Group documents by cluster
			const clusterMap = new Map<number, string[]>();
			const centroids: number[][] = result.centroids;

			for (let i = 0; i < result.clusters.length; i++) {
				const clusterId = result.clusters[i];
				const documentId = documentIds[i];

				if (!clusterMap.has(clusterId)) {
					clusterMap.set(clusterId, []);
				}
				clusterMap.get(clusterId)!.push(documentId);
			}

			// Build cluster array
			const clusters: DocumentCluster[] = [];
			for (let i = 0; i < k; i++) {
				const docs = clusterMap.get(i) ?? [];
				clusters.push({
					id: `cluster-${i}`,
					centroid: includeEmbeddings ? centroids[i] : [],
					documents: docs,
					size: docs.length,
					label: `Cluster ${i + 1}`
				});
			}

			clusterResult = {
				clusters,
				clusterId: `kmeans-${Date.now()}`,
				silhouetteScore: result.silhouetteScore,
				iterations: result.iterations,
				converged: result.iterations < 100
			};

			console.log(
				`[cases-cluster] k-means complete: silhouette=${result.silhouetteScore.toFixed(4)}, iterations=${result.iterations}`
			);
		} else if (algorithm === 'som') {
			console.log(`[cases-cluster] Running SOM clustering with grid size ${k}×${k}...`);

			// Determine grid dimensions from k (e.g., k=5 → 5×5 grid = 25 neurons)
			const gridSize = Math.ceil(Math.sqrt(k));
			const som = new SOMClusterer(
				gridSize,
				gridSize,
				768, // dimensions
				100, // iterations
				0.5, // learning rate
				undefined // radius (auto-calculated)
			);

			const somResult = await som.train(embeddings);
			clusterResult = SOMClusterer.toClusterResult(somResult, documentIds, includeEmbeddings);

			console.log(
				`[cases-cluster] SOM complete: quantizationError=${somResult.quantizationError.toFixed(4)}, topographicError=${(somResult.topographicError * 100).toFixed(2)}%`
			);
		} else {
			// hierarchical
			return json(
				{
					success: false,
					error: 'Hierarchical clustering not yet implemented. Use algorithm=kmeans for now.'
				},
				{ status: 501 }
			);
		}

		const processingTime = Date.now() - startTime;

		return json(
			{
				success: true,
				data: {
					...clusterResult,
					silhouetteScore: Math.round(clusterResult.silhouetteScore * 10000) / 10000
				},
				metadata: {
					timestamp: new Date().toISOString(),
					version: '1.0',
					processing_time: processingTime
				}
			},
			{ status: 200 }
		);
	} catch (err) {
		console.error('[cases-cluster] Request error:', err);
		const message = err instanceof Error ? err.message : String(err);

		return json(
			{
				success: false,
				error: `Clustering failed: ${message}`
			},
			{ status: 500 }
		);
	}
};
