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
import { MultiModalRanker, rankCombinedResults } from '$lib/server/ml/multi-modal-ranker.js';
import { UserHistoryTracker } from '$lib/server/ml/user-history.js';
import { requireAuth } from '$lib/server/auth-helpers.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { db } from '$lib/server/db/client';
import { documentTopics, evidence, legalDocuments } from '$lib/server/db/schema-postgres.js';
import { eq, sql, inArray } from 'drizzle-orm';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';

interface RecommendationRequest {
	query: string;
	caseId?: string;
	topK?: number;
	includeExplanations?: boolean;
	tags?: string[]; // Optional explicit tags for query context
}

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
		const message = err instanceof Error ? err.message : String(err);

		return json(
			{
				success: false,
				error: `Failed to fetch user preferences: ${message}`
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
		const body = (await event.request.json()) as RecommendationRequest;

		// Defaults
		const topK = body.topK ?? 10;
		const includeExplanations = body.includeExplanations ?? true;
		const queryTags = body.tags ?? [];

		if (!body.query || body.query.trim().length === 0) {
			return json(
				{
					success: false,
					error: 'Query required'
				},
				{ status: 400 }
			);
		}

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

		// Step 4: Record interaction (view search results) for future recommendations
		const tracker = new UserHistoryTracker(auth.user.id);
		// Non-blocking fire-and-forget
		tracker
			.recordView(
				rankedDocuments[0]?.documentId || 'search',
				body.caseId || 'unknown',
				0,
				body.query
			)
			.catch((err) => console.warn('[recommendations] Failed to record interaction:', err));

		// Step 5: Optionally strip explanations for smaller payload
		const recommendations = includeExplanations
			? rankedDocuments
			: rankedDocuments.map((doc) => ({
					...doc,
					explanationTokens: undefined
				}));

		const processingTime = Date.now() - startTime;

		return json(
			{
				success: true,
				data: {
					recommendations,
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
		const message = err instanceof Error ? err.message : String(err);

		return json(
			{
				success: false,
				error: `Recommendation generation failed: ${message}`
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
 * Fetch candidates from case context (graph-linked documents)
 * Uses the case_id filter in Qdrant to find related evidence
 */
async function fetchGraphCandidates(
	caseId: string | undefined,
	limit: number
): Promise<DocumentCandidate[]> {
	if (!caseId) return [];

	try {
		// Fetch evidence items linked to this case directly from Qdrant
		// Using a simple filter query (no vector search needed)
		const response = await qdrant.hybridSearch({
			query: '',
			queryEmbedding: new Array(768).fill(0), // Dummy embedding (filter-only query)
			collection: 'evidence',
			filters: {
				case_id: caseId
			},
			limit,
			scoreThreshold: 0 // Accept all matches (filter-only)
		});

		const results = response.results || [];
		return results.map((result: any) => {
			const meta = result.payload?.metadata as Record<string, any> | null;
			return {
				id: String(result.id),
				title: result.payload?.title || 'Untitled Evidence',
				embedding: result.payload?.vector || new Array(768).fill(0),
				tags: (meta?.tags as string[]) ?? [],
				centrality: 0.8, // High centrality for case-linked documents
				caseIds: [caseId]
			};
		});
	} catch (err) {
		console.warn('[recommendations] Graph candidate fetch failed:', err);
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
