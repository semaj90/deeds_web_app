/**
 * GET /api/recommendations/[userId]
 * Returns personalized document recommendations using multi-modal ranking
 *
 * Query params:
 *   ?query=    — Optional search query for contextual recommendations
 *   ?caseId=   — Optional case ID for case-scoped recommendations
 *   ?topK=10   — Number of recommendations to return (default 10)
 *
 * Response:
 *   {
 *     success: true,
 *     userId: string,
 *     recommendations: RankedDocument[],
 *     userPreferences: UserTopicPreference[],
 *     metadata: { searchTimeMs, scoringMethod, topK, timestamp }
 *   }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { documentTopics, userInteractionHistory } from '$lib/server/db/schema-postgres.js';
import { eq, desc } from 'drizzle-orm';
import { MultiModalRanker, type DocumentCandidate, type RankedDocument } from '$lib/server/ml/multi-modal-ranker.js';
import { UserHistoryTracker } from '$lib/server/ml/user-history.js';
import { getOllamaUrl, getQdrantUrl } from '$lib/config/env.server.js';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';

// Zod schema validates POST body: interactionType enum, documentId, topicPreferences array
const userInteractionSchema = z.object({
	interactionType: z.enum(['view', 'click', 'save', 'share', 'dismiss']),
	documentId: z.string().min(1, 'documentId is required').max(500),
	recommendationId: z.string().max(500).optional(),
	caseId: z.string().max(500).optional(),
	durationSeconds: z.number().min(0).optional(),
	searchContext: z.string().max(5000).optional(),
	topicPreferences: z.array(z.object({
		topicId: z.number(),
		affinity: z.number().min(0).max(1),
	})).max(50).optional(),
});

const QDRANT_URL = getQdrantUrl();
const OLLAMA_URL = getOllamaUrl();

/**
 * Generate embedding for query via Ollama
 */
async function embedQuery(query: string): Promise<number[] | null> {
	try {
		const resp = await ollamaFetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: query }),
			signal: AbortSignal.timeout(10000)
		});
		if (!resp.ok) return null;
		const data = await resp.json();
		return data.embedding ?? null;
	} catch {
		return null;
	}
}

/**
 * Fetch candidate documents from Qdrant with embeddings
 */
async function fetchCandidates(
	queryEmbedding: number[],
	limit: number
): Promise<DocumentCandidate[]> {
	try {
		const searchResp = await fetch(
			`${QDRANT_URL}/collections/legal_documents/points/search`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					vector: queryEmbedding,
					limit: limit * 3, // Fetch 3x to allow re-ranking
					with_payload: true,
					with_vector: true,
					score_threshold: 0.3
				}),
				signal: AbortSignal.timeout(5000)
			}
		);

		if (!searchResp.ok) return [];

		const searchData = await searchResp.json();
		const results = searchData?.result ?? [];

		return results.map((r: any) => {
			const payload = r.payload ?? {};
			const vector = Array.isArray(r.vector)
				? r.vector
				: r.vector?.content ?? Object.values(r.vector ?? {})[0] ?? [];

			return {
				id: String(r.id),
				title: payload.title ?? payload.file_path ?? payload.name ?? 'Unknown',
				embedding: vector,
				tags: [
					...(payload.entities ?? []),
					...(payload.tags ?? []),
					...(payload.practice_area ? [payload.practice_area] : [])
				].map((t: any) => String(t).toLowerCase()),
				centrality: payload.centrality ?? 0,
				caseIds: payload.case_ids ?? []
			};
		});
	} catch (err) {
		console.error('[recommendations] Failed to fetch candidates:', err);
		return [];
	}
}

/**
 * Enrich candidates with topic memberships from document_topics table
 */
async function enrichWithTopicMemberships(
	candidates: DocumentCandidate[]
): Promise<DocumentCandidate[]> {
	if (candidates.length === 0) return candidates;

	try {
		// Fetch all topic memberships for candidate documents
		const allTopics = await db
			.select()
			.from(documentTopics)
			.limit(5000);

		// Build lookup map: documentId → [{topicId, probability}]
		const topicMap = new Map<string, Array<{ topicId: number; probability: number }>>();
		for (const t of allTopics) {
			if (!topicMap.has(t.documentId)) {
				topicMap.set(t.documentId, []);
			}
			topicMap.get(t.documentId)!.push({
				topicId: t.topicId,
				probability: t.membershipProbability
			});
		}

		// Attach topic memberships to candidates
		for (const candidate of candidates) {
			candidate.topicMemberships = topicMap.get(candidate.id) ?? [];
		}

		return candidates;
	} catch (err) {
		console.warn('[recommendations] Failed to enrich with topic memberships:', err);
		return candidates;
	}
}

/**
 * Extract query tags for tag overlap scoring
 */
function extractQueryTags(query: string): string[] {
	const stopWords = new Set([
		'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
		'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
		'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
		'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'between',
		'through', 'after', 'before', 'above', 'below', 'and', 'or', 'not',
		'but', 'if', 'then', 'than', 'so', 'what', 'which', 'who', 'whom',
		'how', 'when', 'where', 'why', 'all', 'each', 'every', 'both'
	]);
	return query
		.toLowerCase()
		.replace(/[^\w\s]/g, '')
		.split(/\s+/)
		.filter(w => w.length > 2 && !stopWords.has(w));
}

/**
 * GET /api/recommendations/[userId]
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	const startTime = performance.now();

	try {
		const { userId } = params;
		const query = url.searchParams.get('query') || '';
		const caseId = url.searchParams.get('caseId') || undefined;
		const topK = Math.min(parseInt(url.searchParams.get('topK') || '10'), 50);

		// Auth check: user can only access own recommendations (or admin)
		if (locals.user && locals.user.id !== userId) {
			const userRole = (locals.user as any).role;
			if (userRole !== 'admin') {
				return json({ error: 'Forbidden' }, { status: 403 });
			}
		}

		let recommendations: RankedDocument[] = [];
		let queryEmbedding: number[] | null = null;
		let queryTags: string[] = [];

		if (query.trim()) {
			// Query-based recommendations
			queryEmbedding = await embedQuery(query);
			queryTags = extractQueryTags(query);

			if (!queryEmbedding) {
				return json({
					success: false,
					error: 'Embedding generation failed — Ollama may be unavailable'
				}, { status: 502 });
			}
		} else {
			// No query — use a zero vector and rely on topic affinity + profile
			queryEmbedding = new Array(768).fill(0);
		}

		// 1. Fetch candidate documents from Qdrant
		let candidates = await fetchCandidates(queryEmbedding, topK);

		// 2. Enrich with topic memberships
		candidates = await enrichWithTopicMemberships(candidates);

		// 3. Run multi-modal ranking
		const ranker = new MultiModalRanker(userId);
		recommendations = await ranker.rankDocuments(
			queryEmbedding,
			queryTags,
			candidates,
			topK
		);

		// 4. Get user preferences for response metadata
		const tracker = new UserHistoryTracker(userId);
		const userPreferences = await tracker.getUserTopicPreferences();

		const searchTimeMs = Math.round(performance.now() - startTime);

		return json({
			success: true,
			userId,
			recommendations,
			userPreferences: userPreferences.slice(0, 10), // Top 10 preferences
			metadata: {
				searchTimeMs,
				scoringMethod: 'multi-modal-5-signal',
				topK,
				candidatesEvaluated: candidates.length,
				queryProvided: !!query.trim(),
				caseId: caseId ?? null,
				timestamp: new Date().toISOString()
			}
		});
	} catch (err) {
		console.error('[recommendations] GET error:', err);
		return json(
			{ success: false, error: 'Failed to generate recommendations' },
			{ status: 500 }
		);
	}
};

/**
 * POST /api/recommendations/[userId]
 * Record a user interaction with a recommendation
 *
 * Body:
 *   {
 *     interactionType: 'view' | 'click' | 'save' | 'share' | 'dismiss',
 *     documentId: string,
 *     recommendationId?: string,
 *     caseId?: string,
 *     durationSeconds?: number,
 *     searchContext?: string,
 *     topicPreferences?: Array<{ topicId: number, affinity: number }>
 *   }
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	try {
		const { userId } = params;

		// Auth check
		if (!locals.user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}
		if (locals.user.id !== userId) {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		// Zod schema validates interactionType enum (view|click|save|share|dismiss), documentId, topicPreferences
		const parsed = userInteractionSchema.safeParse(await request.json());
		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid request' },
				{ status: 400 }
			);
		}
		const {
			interactionType,
			documentId,
			recommendationId,
			caseId,
			durationSeconds,
			searchContext,
			topicPreferences
		} = parsed.data;

		const tracker = new UserHistoryTracker(userId);

		switch (interactionType) {
			case 'view':
				await tracker.recordView(
					documentId,
					caseId || '',
					durationSeconds || 0,
					searchContext,
					topicPreferences
				);
				break;
			case 'click':
				await tracker.recordClick(
					recommendationId || '',
					documentId,
					caseId,
					topicPreferences
				);
				break;
			case 'save':
				await tracker.recordSave(documentId, caseId || '', topicPreferences);
				break;
			case 'share':
				await tracker.recordShare(documentId, 'link', caseId, topicPreferences);
				break;
			case 'dismiss':
				await tracker.recordDismiss(recommendationId || '', documentId);
				break;
		}

		return json({ success: true, interactionType, documentId }, { status: 201 });
	} catch (err) {
		console.error('[recommendations] POST error:', err);
		return json(
			{ success: false, error: 'Failed to record interaction' },
			{ status: 500 }
		);
	}
};