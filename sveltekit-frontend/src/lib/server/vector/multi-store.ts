/**
 * MultiVectorStore — Dual-write coordinator for Qdrant + pgvector
 * Qdrant is PRIMARY. pgvector is secondary (error-isolated, non-blocking).
 * Provides dual-write, read-fastest, and batch operations.
 */

import { qdrant, deterministicPointId } from '$lib/server/vector/qdrant-manager.js';
import { pgVectorService, type PgVectorSearchResult } from './PgVectorService.js';
import { qdrantBreaker } from '$lib/server/circuit-breaker.js';
import { retry, retryPredicates } from '$lib/server/utils/retry.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MultiStoreDocument {
	id: string;
	content: string;
	embedding: number[];
	source?: string;
	metadata?: Record<string, unknown>;
	collection?: string;
}

export interface MultiStoreSearchResult {
	id: string;
	score: number;
	content: string;
	source: string;
	metadata: Record<string, unknown>;
	provider: 'qdrant' | 'pgvector';
}

export interface DualWriteResult {
	qdrant: { ok: boolean; error?: string };
	pgvector: { ok: boolean; error?: string };
}

export interface ReadFastestResult {
	results: MultiStoreSearchResult[];
	provider: 'qdrant' | 'pgvector';
	latencyMs: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MultiVectorStore {
	/**
	 * Write to both Qdrant (primary) + pgvector (secondary).
	 * Qdrant must succeed. pgvector failure is logged, not thrown.
	 */
	async dualWrite(doc: MultiStoreDocument): Promise<DualWriteResult> {
		const collection = doc.collection ?? qdrant.collections.evidence;

		// Primary: Qdrant (must succeed) — circuit breaker + retry
		let qdrantResult: { ok: boolean; error?: string };
		try {
			const pointId = deterministicPointId(doc.id);
			await qdrantBreaker.call(() =>
				retry(
					() => qdrant.client.upsert(collection, {
						wait: true,
						points: [
							{
								id: pointId,
								vector: { content: doc.embedding },
								payload: {
									document_id: doc.id,
									content: doc.content,
									source: doc.source ?? 'unknown',
									...(doc.metadata ?? {})
								}
							}
						]
					}),
					{ maxAttempts: 2, baseDelayMs: 300, isRetryable: retryPredicates.networkOrServer }
				)
			);
			qdrantResult = { ok: true };
		} catch (error) {
			qdrantResult = { ok: false, error: (error as Error).message };
		}

		// Secondary: pgvector (non-blocking, error-isolated)
		let pgResult: { ok: boolean; error?: string };
		try {
			pgResult = await pgVectorService.upsert({
				id: doc.id,
				embedding: doc.embedding,
				content: doc.content,
				source: doc.source,
				metadata: doc.metadata
			});
		} catch (error) {
			pgResult = { ok: false, error: (error as Error).message };
			console.warn(`[MultiStore] pgvector secondary write failed for ${doc.id}:`, pgResult.error);
		}

		return { qdrant: qdrantResult, pgvector: pgResult };
	}

	/**
	 * Race both providers. Return whichever responds first.
	 * Includes provider metadata so caller can detect inconsistency.
	 */
	async readFastest(
		embedding: number[],
		topK = 10,
		collection?: string
	): Promise<ReadFastestResult> {
		const coll = collection ?? qdrant.collections.evidence;
		const start = Date.now();

		const qdrantPromise = this.searchQdrant(embedding, topK, coll).then((results) => ({
			results,
			provider: 'qdrant' as const
		}));

		const pgPromise = pgVectorService
			.search(embedding, topK)
			.then((results) => ({
				results: results.map(
					(r: PgVectorSearchResult): MultiStoreSearchResult => ({
						id: r.id,
						score: r.score,
						content: r.content,
						source: r.source,
						metadata: r.metadata,
						provider: 'pgvector' as const
					})
				),
				provider: 'pgvector' as const
			}));

		try {
			const winner = await Promise.race([qdrantPromise, pgPromise]);
			return {
				results: winner.results,
				provider: winner.provider,
				latencyMs: Date.now() - start
			};
		} catch {
			// If first-to-respond fails, wait for the other
			try {
				const fallback = await Promise.any([qdrantPromise, pgPromise]);
				return {
					results: fallback.results,
					provider: fallback.provider,
					latencyMs: Date.now() - start
				};
			} catch {
				return { results: [], provider: 'qdrant', latencyMs: Date.now() - start };
			}
		}
	}

	/**
	 * Batch dual-write with parallelism control.
	 * Returns aggregate stats.
	 */
	async batchDualWrite(
		docs: MultiStoreDocument[],
		parallelism = 4
	): Promise<{
		total: number;
		qdrantOk: number;
		pgvectorOk: number;
		errors: string[];
	}> {
		let qdrantOk = 0;
		let pgvectorOk = 0;
		const errors: string[] = [];

		for (let i = 0; i < docs.length; i += parallelism) {
			const batch = docs.slice(i, i + parallelism);
			const results = await Promise.allSettled(batch.map((doc) => this.dualWrite(doc)));

			for (const result of results) {
				if (result.status === 'fulfilled') {
					if (result.value.qdrant.ok) qdrantOk++;
					if (result.value.pgvector.ok) pgvectorOk++;
					if (!result.value.qdrant.ok && result.value.qdrant.error) {
						if (errors.length < 10) errors.push(`qdrant: ${result.value.qdrant.error}`);
					}
				} else {
					if (errors.length < 10) errors.push((result.reason as Error).message);
				}
			}
		}

		return { total: docs.length, qdrantOk, pgvectorOk, errors };
	}

	/**
	 * Health check across both providers
	 */
	async healthCheck(): Promise<{
		qdrant: { healthy: boolean; error?: string };
		pgvector: { healthy: boolean; error?: string };
	}> {
		const [qdrantHealth, pgHealth] = await Promise.allSettled([
			qdrant.healthCheck(),
			pgVectorService.healthCheck()
		]);

		return {
			qdrant:
				qdrantHealth.status === 'fulfilled'
					? { healthy: true }
					: { healthy: false, error: (qdrantHealth.reason as Error).message },
			pgvector:
				pgHealth.status === 'fulfilled' && pgHealth.value.healthy
					? { healthy: true }
					: {
							healthy: false,
							error:
								pgHealth.status === 'rejected'
									? (pgHealth.reason as Error).message
									: pgHealth.value.error ?? 'Unknown'
						}
		};
	}

	// ---------------------------------------------------------------------------
	// Private helpers
	// ---------------------------------------------------------------------------

	private async searchQdrant(
		embedding: number[],
		topK: number,
		collection: string
	): Promise<MultiStoreSearchResult[]> {
		const results = await qdrantBreaker.call(() =>
			retry(
				() => qdrant.client.search(collection, {
					vector: { name: 'content', vector: embedding },
					limit: topK,
					with_payload: true
				}),
				{ maxAttempts: 2, baseDelayMs: 200, isRetryable: retryPredicates.networkOrServer }
			)
		);

		return results.map((r) => ({
			id: (r.payload?.document_id as string) ?? String(r.id),
			score: r.score,
			content: (r.payload?.content as string) ?? '',
			source: (r.payload?.source as string) ?? 'unknown',
			metadata: (r.payload ?? {}) as Record<string, unknown>,
			provider: 'qdrant' as const
		}));
	}

	// FAISS-GPU: TODO — requires Python bindings (faiss-gpu via subprocess or gRPC)
	// Kept as explicit future extension point, not a silent no-op
}

// Singleton
export const multiStore = new MultiVectorStore();
