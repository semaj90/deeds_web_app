/**
 * Topic Clustering Background Worker
 * Orchestrates daily k-means clustering job using XState v5
 *
 * Flow:
 *   idle → fetching_embeddings → clustering → persisting → invalidating_cache → idle
 *
 * Triggered by:
 *   1. Daily cron job (3am UTC)
 *   2. RabbitMQ 'clustering.trigger' message
 *   3. Manual API POST /api/ml/cluster-status
 *
 * Success metrics:
 *   - Silhouette score ≥ 0.6
 *   - Clustering completes in < 5 minutes
 *   - All document_topics records persisted
 */

import { setup, assign, fromPromise } from 'xstate';
import { KMeansClusterer } from './topic-cluster.js';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

import { db } from '$lib/server/db/client';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { documentTopics } from '$lib/server/db/schema-postgres.js';
import { eq, sql } from 'drizzle-orm';

export interface ClusteringContext {
	jobId: string;
	startTime: number;
	endTime?: number;
	status: 'idle' | 'fetching' | 'clustering' | 'persisting' | 'invalidating' | 'done' | 'failed';
	embeddings?: number[][];
	documentIds?: string[];
	clusterAssignments?: number[];
	silhouetteScore?: number;
	centroidCount: number;
	documentsProcessed: number;
	error?: string; // Store error message as string
	cacheInvalidated: boolean;
}

export interface ClusteringEvent {
	type: 'START' | 'FETCH_SUCCESS' | 'FETCH_FAILURE' | 'CLUSTER_SUCCESS' | 'CLUSTER_FAILURE' | 'PERSIST_SUCCESS' | 'PERSIST_FAILURE' | 'INVALIDATE_SUCCESS' | 'INVALIDATE_FAILURE' | 'RESET';
	error?: Error;
	embeddings?: number[][];
	documentIds?: string[];
	clusterAssignments?: number[];
	silhouetteScore?: number;
}

/**
 * Fetch all document embeddings from Qdrant legal_documents collection
 */
async function fetchDocumentEmbeddings(): Promise<{
	embeddings: number[][];
	documentIds: string[];
}> {
	try {
		console.info('[TopicClusteringWorker] Fetching embeddings from Qdrant...');
		const startMs = Date.now();

		// Use Qdrant scroll API to fetch all points with their embeddings
		const response = await fetch(`${process.env.QDRANT_URL || 'http://localhost:6333'}/collections/legal_documents/points?limit=10000&with_vectors=true`, {
			method: 'GET',
			headers: { 'Content-Type': 'application/json' }
		});

		if (!response.ok) {
			throw new Error(`Qdrant fetch failed: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		const points = data.result?.points ?? [];

		const embeddings: number[][] = [];
		const documentIds: string[] = [];

		// Extract content vector from multi-vector storage
		for (const point of points) {
			const vectors = point.vector;
			let contentVector: number[] | null = null;

			if (Array.isArray(vectors)) {
				// Single vector format
				contentVector = vectors;
			} else if (vectors && typeof vectors === 'object') {
				// Named vector format: { content: [...], summary: [...] }
				contentVector = vectors.content || Object.values(vectors)[0];
			}

			if (contentVector && Array.isArray(contentVector) && contentVector.length === 768) {
				embeddings.push(contentVector);
				documentIds.push(String(point.id));
			}
		}

		const elapsedMs = Date.now() - startMs;
		console.info(
			`[TopicClusteringWorker] Fetched ${embeddings.length} embeddings in ${elapsedMs}ms`
		);

		return { embeddings, documentIds };
	} catch (err) {
		console.error('[TopicClusteringWorker] Fetch failed:', err);
		throw err;
	}
}

/**
 * Run k-means clustering on embeddings
 */
async function runClustering(embeddings: number[][]): Promise<{
	clusterAssignments: number[];
	silhouetteScore: number;
}> {
	try {
		console.info('[TopicClusteringWorker] Starting k-means clustering...');
		const startMs = Date.now();

		const clusterer = new KMeansClusterer(15, 100, 1e-4);
		const result = await clusterer.fit(embeddings);

		const elapsedMs = Date.now() - startMs;
		console.info(
			`[TopicClusteringWorker] Clustering complete in ${elapsedMs}ms (iterations=${result.iterations}, silhouette=${result.silhouetteScore.toFixed(4)})`
		);

		if (result.silhouetteScore < 0.6) {
			console.warn(
				`[TopicClusteringWorker] Low silhouette score: ${result.silhouetteScore.toFixed(4)} (target: ≥ 0.6)`
			);
		}

		return {
			clusterAssignments: result.clusters,
			silhouetteScore: result.silhouetteScore
		};
	} catch (err) {
		console.error('[TopicClusteringWorker] Clustering failed:', err);
		throw err;
	}
}

/**
 * Persist cluster assignments to database
 */
async function persistClusterAssignments(
	documentIds: string[],
	clusterAssignments: number[],
	embeddings: number[][]
): Promise<{ persisted: number }> {
	try {
		console.info('[TopicClusteringWorker] Persisting cluster assignments...');

		// Clear old document_topics records
		await db.delete(documentTopics).where(eq(documentTopics.documentId, sql`uuid '00000000-0000-0000-0000-000000000000'`));

		// Insert new assignments
		const records = [];
		for (let i = 0; i < documentIds.length; i++) {
			const documentId = documentIds[i];
			const topicId = clusterAssignments[i];
			const embedding = embeddings[i];

			// Compute membership probability and centroid distance
			// (simplified: use silhouette-like scoring)
			const membershipProbability = 0.8; // Placeholder: would compute from cluster density
			const centroidDistance = 0.5; // Placeholder: would compute from k-means result

			records.push({
				documentId,
				topicId,
				membershipProbability,
				centroidDistance
			});
		}

		// Batch insert
		const batchSize = 100;
		let inserted = 0;
		for (let i = 0; i < records.length; i += batchSize) {
			const batch = records.slice(i, i + batchSize);
			try {
				await db.insert(documentTopics).values(batch);
				inserted += batch.length;
			} catch (err) {
				console.warn(`[TopicClusteringWorker] Batch insert failed (offset=${i}):`, err);
			}
		}

		console.info(`[TopicClusteringWorker] Persisted ${inserted}/${records.length} assignments`);
		return { persisted: inserted };
	} catch (err) {
		console.error('[TopicClusteringWorker] Persistence failed:', err);
		throw err;
	}
}

/**
 * Invalidate recommendation cache via RabbitMQ
 */
async function invalidateCache(jobId: string): Promise<{ invalidated: boolean }> {
	try {
		console.info('[TopicClusteringWorker] Invalidating recommendation cache...');

		// Publish cache invalidation message to RabbitMQ
		// This triggers all recommendation API responses to be refreshed
		const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

		// Dynamic import to avoid server-side dependency issues
		const amqpMod = (await import('amqplib')) as unknown as {
      connect(
        url: string
      ): Promise<{
        createChannel(): Promise<{
          assertExchange(n: string, t: string, o: object): Promise<unknown>;
          publish(e: string, r: string, b: Buffer, o?: object): boolean;
          close(): Promise<void>;
        }>;
        close(): Promise<void>;
      }>;
    };
    const amqp = amqpMod;
		const connection = await amqp.connect(rabbitmqUrl);
		const channel = await connection.createChannel();

		const exchangeName = 'deeds.cache';
		const routingKey = 'cache.invalidate.recommendations';

		await channel.assertExchange(exchangeName, 'topic', { durable: true });
		await channel.publish(
			exchangeName,
			routingKey,
			Buffer.from(
				JSON.stringify({
					jobId,
					timestamp: new Date().toISOString(),
					cacheKey: 'recommendations:*'
				})
			),
			{ persistent: true }
		);

		await channel.close();
		await connection.close();

		console.info('[TopicClusteringWorker] Cache invalidation published');
		return { invalidated: true };
	} catch (err) {
		console.warn('[TopicClusteringWorker] Cache invalidation failed (non-fatal):', err);
		// Non-fatal: recommendations will be stale but service continues
		return { invalidated: false };
	}
}

/**
 * XState v5 machine for clustering workflow
 */
export const clusteringMachine = setup({
  actors: {
    fetchEmbeddings: fromPromise(async () => fetchDocumentEmbeddings()),
    runClustering: fromPromise(async ({ input }: { input: number[][] }) => runClustering(input)),
    persistAssignments: fromPromise(
      async ({
        input,
      }: {
        input: {
          documentIds: string[];
          clusterAssignments: number[];
          embeddings: number[][];
        };
      }) => persistClusterAssignments(input.documentIds, input.clusterAssignments, input.embeddings)
    ),
    invalidateCache: fromPromise(async ({ input }: { input: string }) => invalidateCache(input)),
  },
  guards: {
    silhouetteQualityOk: ({ context }: { context: ClusteringContext }) =>
      (context.silhouetteScore ?? 0) >= 0.6,
    timeoutNotExceeded: ({ context }: { context: ClusteringContext }) =>
      Date.now() - context.startTime < 5 * 60 * 1000, // 5 minute timeout
  },
}).createMachine({
  id: 'clustering-worker',
  initial: 'idle',
  context: {
    jobId: '',
    startTime: Date.now(),
    status: 'idle',
    centroidCount: 15,
    documentsProcessed: 0,
    cacheInvalidated: false,
  },
  states: {
    idle: {
      on: {
        START: {
          target: 'fetching_embeddings',
          actions: assign({
            jobId: () => `clustering-${Date.now()}`,
            startTime: () => Date.now(),
            status: () => 'fetching',
          }),
        },
      },
    },

    fetching_embeddings: {
      invoke: {
        src: 'fetchEmbeddings',
        onDone: {
          target: 'clustering',
          actions: assign({
            embeddings: ({ event }) => event.output.embeddings,
            documentIds: ({ event }) => event.output.documentIds,
            documentsProcessed: ({ event }) => event.output.embeddings.length,
            status: () => 'clustering',
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => getErrorMessage(event.error),
            status: () => 'failed',
          }),
        },
      },
    },

    clustering: {
      invoke: {
        src: 'runClustering',
        input: ({ context }) => context.embeddings!,
        onDone: {
          target: 'persisting',
          actions: assign({
            clusterAssignments: ({ event }) => event.output.clusterAssignments,
            silhouetteScore: ({ event }) => event.output.silhouetteScore,
            status: () => 'persisting',
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => getErrorMessage(event.error),
            status: () => 'failed',
          }),
        },
      },
    },

    persisting: {
      invoke: {
        src: 'persistAssignments',
        input: ({ context }) => ({
          documentIds: context.documentIds!,
          clusterAssignments: context.clusterAssignments!,
          embeddings: context.embeddings!,
        }),
        onDone: {
          target: 'invalidating_cache',
          actions: assign({
            status: () => 'invalidating',
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => getErrorMessage(event.error),
            status: () => 'failed',
          }),
        },
      },
    },

    invalidating_cache: {
      invoke: {
        src: 'invalidateCache',
        input: ({ context }) => context.jobId,
        onDone: {
          target: 'done',
          actions: assign({
            cacheInvalidated: ({ event }) => event.output.invalidated,
            status: () => 'done',
            endTime: () => Date.now(),
          }),
        },
        onError: {
          // Cache invalidation failure is non-fatal
          target: 'done',
          actions: assign({
            status: () => 'done',
            endTime: () => Date.now(),
          }),
        },
      },
    },

    done: {
      type: 'final',
    },

    failed: {
      on: {
        RESET: 'idle',
      },
    },
  },
});

/**
 * Global clustering worker actor (singleton)
 */
let clusteringActor: any = null;

/**
 * Start the clustering job
 */
export async function startClusteringJob(): Promise<string> {
	if (!clusteringActor) {
		const { createActor } = await import('xstate');
		clusteringActor = createActor(clusteringMachine);
		clusteringActor.start();
	}

	const jobId = `clustering-${Date.now()}`;
	clusteringActor.send({ type: 'START', jobId });

	return jobId;
}

/**
 * Get current clustering status
 */
export function getClusteringStatus(): ClusteringContext {
	if (!clusteringActor) {
		return {
			jobId: 'none',
			startTime: 0,
			status: 'idle',
			centroidCount: 15,
			documentsProcessed: 0,
			cacheInvalidated: false
		};
	}

	const state = clusteringActor.getSnapshot();
	return state.context;
}
