/**
 * POST /api/recommendations
 * Async multi-modal personalized document recommendations
 *
 * Returns a jobId immediately. Client polls GET /api/recommendations/jobs/[jobId] for results.
 *
 * Pipeline (runs in background):
 *   1. Generate query embedding via gRPC/Ollama
 *   2. Fetch candidates from 3 parallel sources (Qdrant RAG, Neo4j graph, PostgreSQL tags)
 *   3. Enrich RAG candidates with Neo4j centrality
 *   4. Rank combined results with 5-signal multi-modal ranker
 *   5. Store results in Redis (5min TTL)
 *
 * GET /api/recommendations — user interaction history + topic preferences
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { DocumentCandidate } from '$lib/server/ml/multi-modal-ranker.js';
import { z } from 'zod';
import { rankCombinedResults } from '$lib/server/ml/multi-modal-ranker.js';
import { UserHistoryTracker } from '$lib/server/ml/user-history.js';
import { requireAuth } from '$lib/server/auth-helpers.js';
import { recommendationMetrics } from '$lib/server/ml/recommendation-metrics.js';
import { encodeRecommendations, glyphsToBase64 } from '$lib/server/ml/recommendation-glyph.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { db } from '$lib/server/db/client';
import { legalDocuments } from '$lib/server/db/schema-postgres.js';
import { sql } from 'drizzle-orm';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';
import {
	fetchGraphDocuments,
	computeCentralityForNodes
} from '$lib/server/graph/graph-centrality.js';
import { getRedis } from '$lib/server/redis.js';

const recommendationRequestSchema = z.object({
	query: z.string().min(1, 'Query required').max(2000),
	caseId: z.string().uuid('Invalid case ID').optional(),
	topK: z.number().int().min(1).max(100).optional(),
	includeExplanations: z.boolean().optional(),
	tags: z.array(z.string().max(200)).max(50).optional()
});

const JOB_TTL = 300; // 5 minutes

/**
 * GET /api/recommendations
 * Get user's interaction history and topic preferences
 */
export const GET: RequestHandler = async (event) => {
	let auth: Awaited<ReturnType<typeof requireAuth>>;
	try {
		auth = await requireAuth(event);
	} catch {
		return json({ success: true, data: { topicPreferences: [], recentInteractions: [], stats: null } });
	}
	const startTime = Date.now();

	try {
		const tracker = new UserHistoryTracker(auth.user.id);

		const [topicPreferences, recentInteractions, interactionStats] = await Promise.all([
			tracker.getUserTopicPreferences(),
			tracker.getRecentInteractions(20),
			tracker.getInteractionStats()
		]);

		const processingTime = Date.now() - startTime;

		return json(
			{
				success: true,
				data: {
					topicPreferences: topicPreferences.slice(0, 10),
					recentInteractions,
					stats: interactionStats
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
		console.error('[recommendations] GET request error:', err);

		return json(
			{
				success: false,
				error: 'Failed to fetch user preferences'
			},
			{ status: 500 }
		);
	}
};

/**
 * POST /api/recommendations
 * Non-blocking — enqueues job and returns jobId immediately.
 * Pipeline executes in background; client polls /api/recommendations/jobs/[jobId].
 */
export const POST: RequestHandler = async (event) => {
	let auth: Awaited<ReturnType<typeof requireAuth>>;
	try {
		auth = await requireAuth(event);
	} catch {
		return json({ success: true, data: { recommendations: [], jobId: null } });
	}

	try {
		const raw = await event.request.json();
		const parsed = recommendationRequestSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{
					success: false,
					error: parsed.error.issues[0]?.message ?? 'Invalid input'
				},
				{ status: 400 }
			);
		}
		const body = parsed.data;
		const topK = body.topK ?? 10;
		const includeExplanations = body.includeExplanations ?? true;
		const queryTags = body.tags ?? [];

		// Generate job ID
		const jobId = crypto.randomUUID();
		const redis = getRedis();

		// Store job metadata in Redis
		await redis.setex(
			`rec:job:${jobId}`,
			JOB_TTL,
			JSON.stringify({
				status: 'processing',
				userId: auth.user.id,
				query: body.query,
				caseId: body.caseId,
				topK,
				includeExplanations,
				tags: queryTags,
				createdAt: Date.now()
			})
		);

		console.log(
			`[recommendations] Job ${jobId} enqueued: user=${auth.user.id}, query="${body.query}", topK=${topK}`
		);

		// Fire-and-forget: run pipeline in background
		processRecommendationJob(
			jobId,
			auth.user.id,
			body.query,
			body.caseId,
			topK,
			includeExplanations,
			queryTags
		).catch((err) => {
			console.error(`[recommendations] Job ${jobId} failed:`, err);
			// Mark job as failed in Redis
			redis
				.setex(
					`rec:job:${jobId}`,
					JOB_TTL,
					JSON.stringify({ status: 'failed', error: String(err) })
				)
				.catch(() => {});
		});

		// Return immediately with jobId
		return json({
			success: true,
			data: {
				jobId,
				status: 'processing'
			}
		});
	} catch (err) {
		console.error('[recommendations] Request error:', err);

		return json(
			{
				success: false,
				error: 'Recommendation generation failed'
			},
			{ status: 500 }
		);
	}
};

// ── Background Pipeline ──

async function processRecommendationJob(
	jobId: string,
	userId: string,
	query: string,
	caseId: string | undefined,
	topK: number,
	includeExplanations: boolean,
	queryTags: string[]
): Promise<void> {
	const startTime = Date.now();
	const redis = getRedis();

	// Step 1: Generate query embedding (with 15s timeout — background, no rush)
	let queryEmbedding: number[] = [];

	try {
		const embeddingPromise = generateEmbeddings([query]);
		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error('Embedding timeout (15s)')), 15000)
		);
		const result = await Promise.race([embeddingPromise, timeoutPromise]);
		if (result.vectors.length === 0) {
			throw new Error('No embedding returned');
		}
		queryEmbedding = result.vectors[0];
		console.log(
			`[recommendations] Job ${jobId}: embedding in ${Date.now() - startTime}ms`
		);
	} catch (embeddingError) {
		console.warn(`[recommendations] Job ${jobId}: embedding failed:`, embeddingError);
		// Store empty result (embedding unavailable)
		await redis.setex(
			`rec:result:${jobId}`,
			JOB_TTL,
			JSON.stringify({
				recommendations: [],
				query,
				topK,
				totalCandidates: 0,
				metadata: {
					timestamp: new Date().toISOString(),
					processing_time: Date.now() - startTime,
					error: 'Embedding generation unavailable'
				}
			})
		);
		await redis.setex(
			`rec:job:${jobId}`,
			JOB_TTL,
			JSON.stringify({ status: 'complete', completedAt: Date.now() })
		);
		return;
	}

	// Step 2: Fetch candidates from 3 parallel sources
	const [ragResults, graphResults, tagResults] = await Promise.all([
		fetchRAGCandidates(queryEmbedding, topK * 2),
		fetchGraphCandidates(caseId, topK),
		fetchTagCandidates(queryTags, topK)
	]);

	console.log(
		`[recommendations] Job ${jobId}: candidates RAG=${ragResults.length}, graph=${graphResults.length}, tags=${tagResults.length}`
	);

	// Step 2b: Enrich RAG candidates with graph centrality
	if (ragResults.length > 0) {
		const ragIds = ragResults.map((r) => r.id);
		const centralityMap = await computeCentralityForNodes(ragIds).catch(() => new Map());
		if (centralityMap.size > 0) {
			for (const candidate of ragResults) {
				const c = centralityMap.get(candidate.id);
				if (c !== undefined) {
					candidate.centrality = c;
				}
			}
		}
	}

	// Step 3: Rank combined results
	const rankedDocuments = await rankCombinedResults(
		userId,
		queryEmbedding,
		queryTags,
		ragResults,
		graphResults,
		tagResults,
		topK
	);

	// Step 4: Record interaction + metrics (fire-and-forget)
	const tracker = new UserHistoryTracker(userId);
	tracker
		.recordView(rankedDocuments[0]?.documentId || 'search', caseId || 'unknown', 0, query)
		.catch(() => {});

	const docIds = rankedDocuments.map((d) => d.documentId);
	const topicIds = rankedDocuments
		.map((d) => (d as any).topicId as number | undefined)
		.filter((t): t is number => t !== undefined);
	recommendationMetrics.recordImpression(userId, docIds, topicIds).catch(() => {});

	// Step 5: Prepare results
	const recommendations = includeExplanations
		? rankedDocuments
		: rankedDocuments.map((doc) => ({ ...doc, explanationTokens: undefined }));

	const glyphs = encodeRecommendations(rankedDocuments);
	const glyphsCompact = glyphsToBase64(glyphs);

	const processingTime = Date.now() - startTime;

	// Store results in Redis
	const resultPayload = {
		recommendations,
		glyphs: glyphsCompact,
		query,
		topK,
		totalCandidates: ragResults.length + graphResults.length + tagResults.length,
		metadata: {
			timestamp: new Date().toISOString(),
			version: '1.0',
			processing_time: processingTime,
			source_counts: {
				rag: ragResults.length,
				graph: graphResults.length,
				tags: tagResults.length
			}
		}
	};

	await redis.setex(`rec:result:${jobId}`, JOB_TTL, JSON.stringify(resultPayload));
	await redis.setex(
		`rec:job:${jobId}`,
		JOB_TTL,
		JSON.stringify({ status: 'complete', completedAt: Date.now() })
	);

	console.log(
		`[recommendations] Job ${jobId} complete in ${processingTime}ms: ${rankedDocuments.length} results`
	);
}

// ── Candidate Fetchers ──

async function fetchRAGCandidates(
	queryEmbedding: number[],
	limit: number
): Promise<DocumentCandidate[]> {
	try {
		const response = await qdrant.hybridSearch({
			query: '',
			queryEmbedding,
			collection: 'documents',
			limit,
			scoreThreshold: 0.5
		});

		const results = response.results || [];
		return results.map((result: any) => ({
			id: String(result.id),
			title: result.payload?.title || result.payload?.filename || 'Untitled',
			embedding: queryEmbedding,
			tags: (result.payload?.metadata?.tags as string[]) ?? [],
			topicMemberships: undefined,
			centrality: undefined,
			caseIds: result.payload?.case_id ? [String(result.payload.case_id)] : undefined
		}));
	} catch (err) {
		console.warn('[recommendations] RAG candidate fetch failed:', err);
		return [];
	}
}

async function fetchGraphCandidates(
	id: string | undefined,
	limit: number
): Promise<DocumentCandidate[]> {
	if (!id) return [];

	try {
		const graphResult = await fetchGraphDocuments(id, limit);

		if (graphResult.documents.length > 0) {
			return graphResult.documents.map((doc) => ({
				id: doc.id,
				title: doc.title,
				embedding: new Array(768).fill(0),
				tags: [],
				centrality: doc.centrality,
				caseIds: doc.caseIds
			}));
		}

		return await fetchGraphCandidatesFromQdrant(id, limit);
	} catch (err) {
		console.warn('[recommendations] Graph candidate fetch failed:', err);
		return await fetchGraphCandidatesFromQdrant(id, limit);
	}
}

async function fetchGraphCandidatesFromQdrant(
	id: string,
	limit: number
): Promise<DocumentCandidate[]> {
	try {
		const response = await qdrant.hybridSearch({
			query: '',
			queryEmbedding: new Array(768).fill(0),
			collection: 'evidence',
			filters: { case_id: id },
			limit,
			scoreThreshold: 0
		});

		const results = response.results || [];
		return results.map((result: any) => {
			const meta = result.payload?.metadata as Record<string, any> | null;
			return {
				id: String(result.id),
				title: result.payload?.title || 'Untitled Evidence',
				embedding: result.payload?.vector || new Array(768).fill(0),
				tags: (meta?.tags as string[]) ?? [],
				centrality: 0.5,
				caseIds: [id]
			};
		});
	} catch (err) {
		console.warn('[recommendations] Qdrant fallback also failed:', err);
		return [];
	}
}

async function fetchTagCandidates(
	queryTags: string[],
	limit: number
): Promise<DocumentCandidate[]> {
	if (queryTags.length === 0) return [];

	try {
		const docs = await db
			.select({
				id: legalDocuments.id,
				title: legalDocuments.title,
				metadata: legalDocuments.metadata,
				caseId: legalDocuments.caseId
			})
			.from(legalDocuments)
			.where(sql`${legalDocuments.metadata}->>'tags' IS NOT NULL`)
			.limit(limit);

		return docs.map((doc) => {
			const meta = doc.metadata as Record<string, any> | null;
			return {
				id: doc.id,
				title: doc.title || 'Untitled Document',
				embedding: new Array(768).fill(0),
				tags: (meta?.tags as string[]) ?? [],
				caseIds: doc.caseId ? [doc.caseId] : []
			};
		});
	} catch (err) {
		console.warn('[recommendations] Tag candidate fetch failed:', err);
		return [];
	}
}
