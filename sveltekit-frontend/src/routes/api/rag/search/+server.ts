import { json } from '@sveltejs/kit';
import { getOllamaUrl, getQdrantUrl } from '$lib/config/env.server.js';
import type { RequestHandler } from './$types';
import type {
	RetrieveCandidatesRequest,
	RetrieveCandidatesResponse,
	RetrievedChunk,
	ConfidenceLevel
} from '$lib/types/rag-source-validation';
import type { RAGConfig } from '$lib/sdk/rag/index.js';
import { productionLogger } from '$lib/server/production-logger.js';
import { apiResponses } from '$lib/server/api/response-helper.js';
import { chatRateLimiter } from '$lib/server/middleware/rate-limiter.js';
import { computeTFIDF } from '$lib/server/retrieval/tfidf-scorer.js';
import { getVectorCache, setVectorCache, getEmbeddingCache, setEmbeddingCache } from '$lib/server/vector-cache.js';
import { embedText } from '$lib/server/embedding/embed.js';
import { z } from 'zod';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';

const SCORING_METHODS = ['hybrid', 'vector_only', 'tfidf_only'] as const;

const ragSearchSchema = z.object({
	query: z.string().min(1, 'query is required').max(5000),
	top_k: z.number().int().min(1).max(100).optional().default(10),
	min_score: z.number().min(0).max(1).optional().default(0.3),
	use_hybrid: z.boolean().optional().default(false),
	use_rerank: z.boolean().optional().default(false),
	scoring_method: z.enum(SCORING_METHODS).optional().default('hybrid'),
	userId: z.string().max(200).optional(),
	caseId: z.string().uuid().optional(),
	case_id: z.string().uuid().optional(),
	conversationId: z.string().max(200).optional(),
	enableACE: z.boolean().optional().default(false),
	precomputedEmbedding: z.array(z.number()).length(768).optional(),
	sectionTypes: z.array(z.enum([
		'facts', 'issues', 'reasoning', 'holding', 'citations',
		'parties', 'motions', 'bibliography', 'procedural_history',
		'sentencing', 'judgment'
	])).max(11).optional()
});

const QDRANT_URL = getQdrantUrl();
const OLLAMA_URL = getOllamaUrl();

function toConfidence(score: number): ConfidenceLevel {
	if (score >= 0.85) return 'high';
	if (score >= 0.70) return 'medium';
	if (score >= 0.50) return 'low';
	return 'marginal';
}

/**
 * Extract simple keyword tags from a query string.
 * Used for tag-based score boosting (ported from Python rag_search.py).
 */
function extractQueryTags(query: string): string[] {
	const stopWords = new Set([
		'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
		'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
		'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
		'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'between',
		'through', 'after', 'before', 'above', 'below', 'and', 'or', 'not',
		'but', 'if', 'then', 'than', 'so', 'no', 'nor', 'too', 'very',
		'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
		'how', 'when', 'where', 'why', 'all', 'each', 'every', 'both',
		'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own',
		'same', 'just', 'also', 'any', 'me', 'my', 'i', 'you', 'your',
		'he', 'she', 'it', 'we', 'they', 'them', 'his', 'her', 'its', 'our'
	]);
	return query
		.toLowerCase()
		.replace(/[^\w\s]/g, '')
		.split(/\s+/)
		.filter(w => w.length > 2 && !stopWords.has(w));
}

/**
 * Apply tag-based score boosting to search results.
 * Ported from Python rag_search.py — chunks whose payload tags/entities
 * overlap with query keywords get a multiplicative score boost.
 *
 * @param chunks - Search results with score and payload
 * @param queryTags - Extracted query keywords
 * @param boostFactor - Multiplier per matched tag (default 1.15 = 15% boost)
 * @param maxBoost - Cap on total boost multiplier (default 1.5 = 50% max)
 */
function applyTagBoost(
	chunks: RetrievedChunk[],
	queryTags: string[],
	boostFactor = 1.15,
	maxBoost = 1.5
): void {
	if (queryTags.length === 0) return;

	const tagSet = new Set(queryTags);

	for (const chunk of chunks) {
		// Collect tags from payload fields that might contain relevant keywords
		const chunkTags: string[] = [
			...(chunk.related_entities ?? []),
			...(chunk.section ? [chunk.section] : []),
			...(chunk.source_title ? chunk.source_title.toLowerCase().split(/\s+/) : [])
		].map(t => String(t).toLowerCase());

		// Count overlapping tags
		let matchCount = 0;
		for (const ct of chunkTags) {
			if (tagSet.has(ct)) matchCount++;
		}

		if (matchCount > 0) {
			const boost = Math.min(Math.pow(boostFactor, matchCount), maxBoost);
			chunk.score = Math.min(chunk.score * boost, 1.0);
			chunk.confidence = toConfidence(chunk.score);
		}
	}
}

/**
 * POST /api/rag/search
 * Step 1: Search knowledge base for relevant chunks via Qdrant + Ollama embeddings
 */
export const POST: RequestHandler = async ({ request, url }) => {
	// Rate limit: 30 requests/min per client
	const rateCheck = chatRateLimiter.check(request);
	if (!rateCheck.allowed) {
		return apiResponses.serviceUnavailable(
			`Rate limit exceeded. Try again in ${Math.ceil((rateCheck.resetTime - Date.now()) / 1000)}s`
		);
	}

	const startTime = performance.now();

	try {
		const raw = await request.json();
		const parsed = ragSearchSchema.safeParse(raw);
		if (!parsed.success) {
			return apiResponses.badRequest(parsed.error.issues[0]?.message ?? 'Invalid input');
		}
		const body = parsed.data;
		const {
			query,
			top_k,
			min_score,
			use_hybrid,
			use_rerank,
			scoring_method,
			userId,
			caseId,
			conversationId,
			enableACE,
			precomputedEmbedding,
			sectionTypes
		} = body;

		// 0. Check vector result cache (Memory → Redis) for identical query+options
		const cacheOptions = { limit: top_k, threshold: min_score, documentType: caseId };
		const { entry: cachedResult } = await getVectorCache(query, cacheOptions);
		if (cachedResult) {
			const cached = cachedResult.results[0] as Record<string, unknown>;
			return json({
				...cached,
				cache: { hit: true, source: 'vector-cache', age_ms: Date.now() - cachedResult.ts }
			});
		}

		// 1. Generate embedding (use precomputed from client if provided, else server-side)
		const embedStart = performance.now();
		let embedding: number[];
		let embeddingSource = 'server';

		if (precomputedEmbedding && Array.isArray(precomputedEmbedding) && precomputedEmbedding.length === 768) {
			embedding = precomputedEmbedding;
			embeddingSource = 'client-precomputed';
		} else {
			try {
				const embeddingArray = await embedText(query);
				embedding = Array.from(embeddingArray);

				// Also cache in vector-cache for backward compatibility
				setEmbeddingCache(query, embedding, 'embeddinggemma:latest').catch(() => {});
			} catch (err) {
				return apiResponses.badGateway('Embedding generation failed');
			}
		}

		const embeddingTime = performance.now() - embedStart;

		// 2. Search across Qdrant collections
		const collections = ['fastmcp_file_profiles', 'phase90_error_cards', 'legal_documents'];
		const allChunks: RetrievedChunk[] = [];

		for (const collection of collections) {
			try {
				const searchResp = await fetch(
					`${QDRANT_URL}/collections/${collection}/points/search`,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							vector: embedding,
							limit: top_k,
							with_payload: true,
							score_threshold: min_score
						}),
						signal: AbortSignal.timeout(5000)
					}
				);

				if (!searchResp.ok) continue;

				const searchData = await searchResp.json();
				const results = searchData?.result ?? [];

				for (const r of results) {
					const payload = r.payload ?? {};
					allChunks.push({
						chunk_id: `${collection}:${r.id}`,
						text: payload.content ?? payload.text ?? payload.summary ?? '',
						snippet: (payload.content ?? payload.text ?? '').slice(0, 300),
						score: r.score,
						dense_score: r.score,
						confidence: toConfidence(r.score),
						source_type: payload.source_type ?? 'document',
						source_id: String(r.id),
						source_title: payload.title ?? payload.file_path ?? payload.name ?? 'Unknown',
						source_url: payload.url ?? undefined,
						page_num: payload.page_num ?? undefined,
						section: payload.section ?? undefined,
						has_image: !!payload.has_image,
						has_table: !!payload.has_table,
						related_entities: payload.entities ?? [],
						graph_neighbors: []
					});
				}
			} catch {
				// Skip unavailable collections
			}
		}

		// 2b. Section-filtered evidence search (when sectionTypes provided)
		if (sectionTypes?.length) {
			try {
				const sectionResults = await qdrant.sectionFilteredSearch({
					query,
					queryEmbedding: embedding,
					sectionTypes,
					caseId: caseId || body.case_id,
					limit: top_k,
					scoreThreshold: min_score,
				});
				for (const r of sectionResults.results) {
					const payload = (r as any).payload ?? {};
					allChunks.push({
						chunk_id: `evidence_items:${r.id}`,
						text: payload.content_preview ?? payload.content ?? payload.text ?? '',
						snippet: (payload.content_preview ?? payload.content ?? '').slice(0, 300),
						score: r.score,
						dense_score: r.score,
						confidence: toConfidence(r.score),
						source_type: 'evidence',
						source_id: String(r.id),
						source_title: payload.title ?? payload.file_name ?? 'Evidence',
						section: payload.section_type ?? undefined,
						has_image: false,
						has_table: false,
						related_entities: [],
						graph_neighbors: []
					});
				}
			} catch {
				// Section-filtered search unavailable — non-fatal
			}
		}

		// Apply tag-based score boosting before final sort
		const queryTags = extractQueryTags(query);
		applyTagBoost(allChunks, queryTags);
		const tfidfMap = new Map();
		if (scoring_method !== "vector_only") {
			const tR = computeTFIDF(query, allChunks.map(ch => ({ id: ch.chunk_id, text: ch.text })));
			for (const t of tR) { tfidfMap.set(t.id, t.tfidfScore); }
		}

		// Sort by boosted score descending and limit
		// 4. Combine scores: hybrid = 0.7*vector + 0.3*tfidf
		for (const chunk of allChunks) {
			const vs = chunk.score;
			const ts = tfidfMap.get(chunk.chunk_id) || 0;
			chunk.vector_score = vs;
			chunk.tfidf_score = ts;
			if (scoring_method === "tfidf_only") { chunk.score = ts; }
			else if (scoring_method === "hybrid") { chunk.score = 0.7 * vs + 0.3 * ts; }
			chunk.confidence = toConfidence(chunk.score);
		}
		// ACE context enrichment (opt-in: boosts chunks matching legal entities)
		let aceMetadata: Record<string, unknown> | null = null;
		if (enableACE && query) {
			try {
				const { assembleACEContext } = await import('$lib/server/ace/context-assembler.js');
				const aceContext = await assembleACEContext({
					query,
					userId: userId || undefined,
					caseId: caseId || undefined,
					conversationId: conversationId || undefined
				});
				const aceEntityTags = [
					...(aceContext.entities?.statutes ?? []),
					...(aceContext.entities?.cases ?? []),
					...(aceContext.entities?.persons ?? [])
				].map((e: string) => e.toLowerCase());
				if (aceEntityTags.length > 0) {
					applyTagBoost(allChunks, aceEntityTags, 1.10, 1.3);
				}
				aceMetadata = {
					entityCount: aceEntityTags.length,
					kagNeighborCount: aceContext.kagNeighbors?.length ?? 0
				};
			} catch (err) {
				console.warn('[rag/search] ACE enrichment failed (non-fatal):', err);
			}
		}

		allChunks.sort((a, b) => b.score - a.score);
		let topChunks = allChunks.slice(0, top_k);

		// Optional DAG reordering: cited documents appear before citing documents
		const enableDAG = url.searchParams.get('dag') === 'true';
		if (enableDAG && topChunks.length > 1) {
			try {
				const { orderByDependency, extractCitationRefs } = await import(
					'$lib/server/retrieval/document-dag.js'
				);
				const knownIds = new Set(topChunks.map((c) => c.source_id));
				const dagDocs = topChunks.map((c) => ({
					id: c.source_id,
					title: c.source_title ?? '',
					score: c.score,
					citations: extractCitationRefs(c.text, knownIds)
				}));
				const dagResult = orderByDependency(dagDocs);
				const idOrder = dagResult.ordered.map((d) => d.id);
				topChunks = topChunks.sort(
					(a, b) => idOrder.indexOf(a.source_id) - idOrder.indexOf(b.source_id)
				);
			} catch (err) {
				console.warn('[rag/search] DAG reordering failed (non-fatal):', err);
			}
		}

		const response: RetrieveCandidatesResponse = {
			query_id: crypto.randomUUID(),
			query,
			case_id: body.case_id,
			chunks: topChunks,
			total_found: allChunks.length,
			search_time_ms: Math.round(performance.now() - startTime),
			embedding_time_ms: Math.round(embeddingTime),
			rerank_time_ms: use_rerank ? 0 : undefined,
			embedding_model: embeddingSource === 'client-precomputed' ? 'embeddinggemma-onnx-client' : 'embeddinggemma:latest',
			rerank_model: use_rerank ? 'none' : undefined,
			scoring_method: scoring_method,
			ace: aceMetadata ?? undefined,
			timestamp: new Date().toISOString()
		};

		// Cache the full response (fire-and-forget, 30min TTL via vector-cache config)
		setVectorCache(query, [response], {
			searchTime: response.search_time_ms,
			totalResults: response.total_found,
			model: 'embeddinggemma:latest',
			distanceMetric: 'cosine'
		}, cacheOptions).catch(() => {});

		return json(response);
	} catch (err) {
		console.error('[rag/search] Error:', err);
		return apiResponses.serverError('Search failed');
	}
};
