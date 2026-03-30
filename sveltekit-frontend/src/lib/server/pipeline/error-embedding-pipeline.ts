/**
 * Error Embedding Pipeline
 *
 * Converts error events into 768-dim embeddings and stores them in Qdrant
 * for semantic similarity search during diagnosis.
 *
 * Pipeline: error event → text assembly → embed → Qdrant upsert → cluster match
 */
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { qdrant, deterministicPointId } from '$lib/server/vector/qdrant-manager.js';
import { VECTOR_CONFIG } from '$lib/server/config/vector-config.js';

const COLLECTION = VECTOR_CONFIG.COLLECTIONS.error_embeddings;
const CLUSTER_SIMILARITY_THRESHOLD = 0.85;

export interface ErrorEmbeddingInput {
	errorMessage: string;
	filePath?: string;
	routePath?: string;
	stackTrace?: string;
	severity?: 'info' | 'warn' | 'error' | 'fatal';
	tsCode?: string;
	clusterId?: string;
}

export interface ErrorEmbeddingResult {
	pointId: number;
	collection: string;
	matchedCluster: string | null;
	clusterScore: number;
	totalMs: number;
}

/**
 * Assemble a text representation of the error for embedding.
 * Structured to maximize semantic similarity with related errors.
 */
function assembleErrorText(input: ErrorEmbeddingInput): string {
	const parts: string[] = [];
	if (input.routePath) parts.push(`Route: ${input.routePath}`);
	if (input.filePath) parts.push(`File: ${input.filePath}`);
	if (input.tsCode) parts.push(`Code: ${input.tsCode}`);
	parts.push(input.errorMessage.slice(0, 500));
	if (input.stackTrace) {
		// Include first 3 stack frames for context
		const frames = input.stackTrace.split('\n').slice(0, 4).join('\n');
		parts.push(frames);
	}
	return parts.join('\n');
}

/**
 * Ensure the error_embeddings collection exists in Qdrant.
 * Idempotent — silently succeeds if collection already exists.
 */
let collectionEnsured = false;
async function ensureCollection(): Promise<void> {
	if (collectionEnsured) return;
	try {
		await qdrant.client.getCollection(COLLECTION);
		collectionEnsured = true;
	} catch {
		try {
			await qdrant.client.createCollection(COLLECTION, {
				vectors: {
					error: { size: VECTOR_CONFIG.DIMENSIONS, distance: 'Cosine' },
				},
				on_disk_payload: true,
				hnsw_config: VECTOR_CONFIG.QDRANT_HNSW,
				quantization_config: VECTOR_CONFIG.QDRANT_QUANTIZATION,
			});
			collectionEnsured = true;
		} catch (err) {
			// Collection may have been created by another worker
			const msg = String(err);
			if (msg.includes('already exists')) {
				collectionEnsured = true;
			} else {
				throw err;
			}
		}
	}
}

/**
 * Search for similar existing errors to find cluster matches.
 */
async function findSimilarCluster(
	embedding: number[],
): Promise<{ clusterId: string | null; score: number }> {
	try {
		const results = await qdrant.client.search(COLLECTION, {
			vector: { name: 'error', vector: embedding },
			limit: 1,
			score_threshold: CLUSTER_SIMILARITY_THRESHOLD,
			with_payload: ['clusterId'],
		});

		if (results.length > 0 && results[0].score >= CLUSTER_SIMILARITY_THRESHOLD) {
			const payload = results[0].payload as Record<string, unknown> | undefined;
			const clusterId = (payload?.clusterId as string) || null;
			return { clusterId, score: results[0].score };
		}
	} catch {
		// Collection empty or search failed — no cluster match
	}
	return { clusterId: null, score: 0 };
}

/**
 * Main pipeline entry point.
 * Embeds an error event and stores it in Qdrant for future similarity search.
 */
export async function embedErrorEvent(
	input: ErrorEmbeddingInput,
): Promise<ErrorEmbeddingResult> {
	const startMs = Date.now();

	await ensureCollection();

	// 1. Assemble text and generate embedding
	const text = assembleErrorText(input);
	const embedding = await generateSingleEmbedding(text);

	// 2. Check for existing cluster match
	const clusterMatch = await findSimilarCluster(embedding);

	// 3. Generate deterministic point ID from error content
	const pointKey = `${input.routePath || ''}:${input.filePath || ''}:${input.errorMessage.slice(0, 100)}`;
	const pointId = deterministicPointId(pointKey);

	// 4. Upsert to Qdrant
	await qdrant.client.upsert(COLLECTION, {
		wait: false,
		points: [
			{
				id: pointId,
				vector: { error: embedding },
				payload: {
					routePath: input.routePath || '',
					filePath: input.filePath || '',
					clusterId: input.clusterId || clusterMatch.clusterId || '',
					severity: input.severity || 'error',
					tsCode: input.tsCode || '',
					message: input.errorMessage.slice(0, 500),
					stackTrace: (input.stackTrace || '').slice(0, 1000),
					createdAt: new Date().toISOString(),
				},
			},
		],
	});

	return {
		pointId,
		collection: COLLECTION,
		matchedCluster: clusterMatch.clusterId,
		clusterScore: clusterMatch.score,
		totalMs: Date.now() - startMs,
	};
}

/**
 * Search for errors similar to a given query.
 * Used by the diagnosis endpoint for "similar past errors" retrieval.
 */
export async function searchSimilarErrors(
	query: string,
	limit = 5,
	scoreThreshold = 0.3,
): Promise<
	{
		id: string | number;
		score: number;
		message: string;
		filePath: string;
		routePath: string;
		clusterId: string;
		severity: string;
		createdAt: string;
	}[]
> {
	try {
		await ensureCollection();
		const embedding = await generateSingleEmbedding(query);

		const results = await qdrant.client.search(COLLECTION, {
			vector: { name: 'error', vector: embedding },
			limit,
			score_threshold: scoreThreshold,
			with_payload: true,
		});

		return results.map((hit) => {
			const p = (hit.payload ?? {}) as Record<string, unknown>;
			return {
				id: hit.id,
				score: hit.score,
				message: (p.message as string) || '',
				filePath: (p.filePath as string) || '',
				routePath: (p.routePath as string) || '',
				clusterId: (p.clusterId as string) || '',
				severity: (p.severity as string) || 'error',
				createdAt: (p.createdAt as string) || '',
			};
		});
	} catch (err) {
		console.warn('[error-embedding] Search failed:', err);
		return [];
	}
}
