/**
 * POST /api/recommendations
 * Multi-modal personalized document recommendations
 *
 * Combines 5 signals:
 *   1. Vector Similarity (0.35): Cosine similarity to query embedding
 *   2. Tag Overlap (0.20): Shared statute/entity/practice area tags
 *   3. Topic Affinity (0.20): Document membership in user-preferred topics
 *   4. Graph Centrality (0.15): Neo4j connection strength
 *   5. Profile Match (0.10): User role + practice area alignment
 *
 * Request:
 *   - query: string (search query)
 *   - caseId?: string (context case for graph walking)
 *   - topK?: number (default: 10)
 *   - includeExplanations?: boolean (default: true)
 *
 * Response:
 *   - recommendations: RankedDocument[] with scores + signals + explanations
 *   - metadata: processing_time, source counts, user preferences
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { ApiResponse } from '$lib/types/api.js';
import type { RankedDocument, DocumentCandidate } from '$lib/server/ml/multi-modal-ranker.js';
import { z } from 'zod';
import { MultiModalRanker, rankCombinedResults } from '$lib/server/ml/multi-modal-ranker.js';
import { UserHistoryTracker } from '$lib/server/ml/user-history.js';
import { requireAuth } from '$lib/server/auth-helpers.js';
import { recommendationMetrics } from '$lib/server/ml/recommendation-metrics.js';
import { encodeRecommendations, glyphsToBase64 } from '$lib/server/ml/recommendation-glyph.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { db } from '$lib/server/db/client';
import { documentTopics, evidence, legalDocuments } from '$lib/server/db/schema-postgres.js';
import { eq, sql, inArray } from 'drizzle-orm';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';
import {
	fetchGraphDocuments,
	computeCentralityForNodes
} from '$lib/server/graph/graph-centrality.js';

const recommendationRequestSchema = z.object({
	query: z.string().min(1, 'Query required').max(2000),
	caseId: z.string().uuid('Invalid case ID').optional(),
	topK: z.number().int().min(1).max(100).optional(),
	includeExplanations: z.boolean().optional(),
	tags: z.array(z.string().max(200)).max(50).optional()
});

/**
 * GET /api/recommendations
 * Get user's interaction history and topic preferences
 */
export const GET: RequestHandler = async (event) => {
	const auth = await requireAuth(event);
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
					topicPreferences: topicPreferences.slice(0, 10), // Top 10 topics
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
 * Multi-modal personalized recommendations
 */
export const POST: RequestHandler = async (event) => {
	const auth = await requireAuth(event);
	const startTime = Date.now();

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

		// Defaults
		const topK = body.topK ?? 10;
		const includeExplanations = body.includeExplanations ?? true;
		const queryTags = body.tags ?? [];

		console.log(
			`[recommendations] User ${auth.user.id}, query="${body.query}", caseId=${body.caseId}, topK=${topK}`
		);

		// Step 1: Generate query embedding
		const embeddingStartTime = Date.now();
		let queryEmbedding: number[] = [];

		try {
			const result = await generateEmbeddings([body.query]);
			if (result.vectors.length === 0) {
				throw new Error('No embedding returned');
			}
			queryEmbedding = result.vectors[0];
			console.log(
				`[recommendations] Query embedding generated in ${Date.now() - embeddingStartTime}ms`
			);
		} catch (embeddingError) {
			console.error('[recommendations] Embedding generation failed:', embeddingError);
			return json(
				{
					success: false,
					error: 'Failed to generate query embedding'
				},
				{ status: 500 }
			);
		}

		// Step 2: Fetch candidates from 3 parallel sources
		const fetchStartTime = Date.now();

		const [ragResults, graphResults, tagResults] = await Promise.all([
			fetchRAGCandidates(queryEmbedding, topK * 2),
			fetchGraphCandidates(body.caseId, topK),
			fetchTagCandidates(queryTags, topK)
		]);

		console.log(
			`[recommendations] Fetched candidates in ${Date.now() - fetchStartTime}ms: RAG=${ragResults.length}, graph=${graphResults.length}, tags=${tagResults.length}`
		);

		// Step 2b: Enrich RAG candidates with graph centrality from Neo4j
		// (non-blocking — if Neo4j is down, RAG candidates keep centrality=undefined)
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
				console.log(
					`[recommendations] Enriched ${centralityMap.size}/${ragResults.length} RAG candidates with graph centrality`
				);
			}
		}

		// Step 3: Rank combined results using multi-modal ranker
		const rankStartTime = Date.now();

		const rankedDocuments = await rankCombinedResults(
			auth.user.id,
			queryEmbedding,
			queryTags,
			ragResults,
			graphResults,
			tagResults,
			topK
		);

		console.log(
			`[recommendations] Ranking complete in ${Date.now() - rankStartTime}ms: top ${rankedDocuments.length} selected`
		);

		// Step 4: Record interaction + metrics (fire-and-forget)
		const tracker = new UserHistoryTracker(auth.user.id);
		tracker
			.recordView(
				rankedDocuments[0]?.documentId || 'search',
				body.caseId || 'unknown',
				0,
				body.query
			)
			.catch((err) => console.warn('[recommendations] Failed to record interaction:', err));

		// Record impression metrics for CTR/diversity tracking
		const docIds = rankedDocuments.map(d => d.documentId);
		const topicIds = rankedDocuments
			.map(d => (d as any).topicId as number | undefined)
			.filter((t): t is number => t !== undefined);
		recommendationMetrics
			.recordImpression(auth.user.id, docIds, topicIds)
			.catch((err) => console.warn('[recommendations] Metrics recording failed:', err));

		// Step 5: Optionally strip explanations for smaller payload
		const recommendations = includeExplanations
			? rankedDocuments
			: rankedDocuments.map((doc) => ({
					...doc,
					explanationTokens: undefined
				}));

		// Step 5b: Encode compact glyph representation (10 bytes per recommendation)
		const glyphs = encodeRecommendations(rankedDocuments);
		const glyphsCompact = glyphsToBase64(glyphs);

		const processingTime = Date.now() - startTime;

		return json(
			{
				success: true,
				data: {
					recommendations,
					glyphs: glyphsCompact,
					query: body.query,
					topK,
					totalCandidates: ragResults.length + graphResults.length + tagResults.length
				},
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
			},
			{ status: 200 }
		);
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

/**
 * Fetch candidates from Qdrant vector search (RAG path)
 */
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
			embedding: queryEmbedding, // Use query embedding as proxy (exact doc vector not needed for ranking)
			tags: (result.payload?.metadata?.tags as string[]) ?? [],
			topicMemberships: undefined, // Will be enriched by ranker if needed
			centrality: undefined,
			caseIds: result.payload?.case_id ? [String(result.payload.case_id)] : undefined
		}));
	} catch (err) {
		console.warn('[recommendations] RAG candidate fetch failed:', err);
		return [];
	}
}

/**
 * Fetch candidates from Neo4j graph walking.
 * Walks 1-2 hops from the case node to find related evidence, persons, statutes.
 * Computes real degree centrality (# of relationships / max).
 * Falls back to Qdrant filter-only search when Neo4j is unavailable.
 */
async function fetchGraphCandidates(
	id: string | undefined,
	limit: number
): Promise<DocumentCandidate[]> {
	if (!id) return [];

	try {
		// Primary: Neo4j graph walking with real centrality
		const graphResult = await fetchGraphDocuments(id, limit);

		if (graphResult.documents.length > 0) {
			console.log(
				`[recommendations] Neo4j graph: ${graphResult.totalNodes} nodes, ${graphResult.totalRelationships} rels, maxDegree=${graphResult.maxDegree}, ${graphResult.durationMs}ms`
			);

			return graphResult.documents.map((doc) => ({
				id: doc.id,
				title: doc.title,
				embedding: new Array(768).fill(0), // Graph candidates don't need embeddings for vector signal
				tags: [], // Tags come from metadata, not graph
				centrality: doc.centrality, // Real degree centrality [0, 1]
				caseIds: doc.caseIds
			}));
		}

		// Fallback: Qdrant filter-only search when Neo4j has no data
		console.log('[recommendations] Neo4j returned 0 docs, falling back to Qdrant filter');
		return await fetchGraphCandidatesFromQdrant(id, limit);
	} catch (err) {
		console.warn('[recommendations] Graph candidate fetch failed, using Qdrant fallback:', err);
		return await fetchGraphCandidatesFromQdrant(id, limit);
	}
}

/**
 * Qdrant fallback for graph candidates when Neo4j is unavailable.
 * Uses case_id filter to find linked evidence with heuristic centrality.
 */
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
				centrality: 0.5, // Heuristic fallback (lower than hardcoded 0.8 to reflect uncertainty)
				caseIds: [id]
			};
		});
	} catch (err) {
		console.warn('[recommendations] Qdrant fallback also failed:', err);
		return [];
	}
}

/**
 * Fetch candidates by tag overlap
 * Note: Tag filtering happens in the ranker (tagOverlap signal)
 * This just returns a diverse set of documents to compare against
 */
async function fetchTagCandidates(
	queryTags: string[],
	limit: number
): Promise<DocumentCandidate[]> {
	if (queryTags.length === 0) return [];

	try {
		// Fetch documents from PostgreSQL with tag metadata
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

		// Map to candidates (dummy embeddings - ranker will use tagOverlap signal primarily)
		return docs.map((doc) => {
			const meta = doc.metadata as Record<string, any> | null;
			return {
				id: doc.id,
				title: doc.title || 'Untitled Document',
				embedding: new Array(768).fill(0), // Dummy - not used for tag-based ranking
				tags: (meta?.tags as string[]) ?? [],
				caseIds: doc.caseId ? [doc.caseId] : []
			};
		});
	} catch (err) {
		console.warn('[recommendations] Tag candidate fetch failed:', err);
		return [];
	}
}
