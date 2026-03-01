/**
 * GET /api/cases/[id]/similar
 *
 * Find similar cases using multi-modal vector search + ACE context + Neo4j graph.
 *
 * Architecture:
 *   1. Embed case (description + evidence summaries) → 768-dim vector
 *   2. Dual search: Qdrant legal_cases + pgvector case_embeddings
 *   3. Rerank with multi-modal signals:
 *      - Vector similarity (40%)
 *      - Tag overlap (Jaccard, 20%)
 *      - Topic affinity (k-means cluster membership, 20%)
 *      - Graph centrality (Neo4j connection strength, 15%)
 *      - User history preferences (exponential decay, 5%)
 *   4. ACE context enrichment (7 parallel sources)
 *   5. Background: Trigger Neo4j graph analysis for self-prompting
 *   6. Cache synthesis in CouchDB for LLM retrieval
 *
 * Returns: Similar cases with confidence scores + ACE context + graph insights
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db/client.js';
import { cases, evidence } from '$lib/server/db/schema-postgres.js';
import { eq, sql, desc } from 'drizzle-orm';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { assembleACEContext } from '$lib/server/ace/context-assembler.js';
import { MultiModalRanker } from '$lib/server/ml/multi-modal-ranker.js';
import { UserHistoryTracker } from '$lib/server/ml/user-history.js';
import { ENV } from '$lib/server/env.server.js';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;

interface SimilarCase {
	caseId: string;
	title: string;
	description: string;
	jurisdiction: string;
	status: string;
	priority: string;
	practiceArea?: string;
	similarity: number;
	breakdown: {
		vector: number;
		tags: number;
		topic: number;
		centrality: number;
		userHistory: number;
	};
	sharedTags: string[];
	topicCluster?: number;
	graphConnections?: number;
}

interface SimilarityResponse {
	query: {
		caseId: string;
		title: string;
		embedding?: number[];
	};
	results: SimilarCase[];
	aceContext?: any;
	timing: {
		embedMs: number;
		searchMs: number;
		rerankMs: number;
		aceMs: number;
		totalMs: number;
	};
	graphJobId?: string;
}

/**
 * GET /api/cases/[id]/similar?limit=10&includeEmbedding=false&triggerGraph=true
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	const startTime = performance.now();
	const caseId = params.id;
	const limit = parseInt(url.searchParams.get('limit') || '10', 10);
	const includeEmbedding = url.searchParams.get('includeEmbedding') === 'true';
	const triggerGraph = url.searchParams.get('triggerGraph') !== 'false'; // default true
	const userId = (locals as any).user?.id ?? null;

	try {
		// Step 1: Load source case from database
		const [sourceCase] = await db
			.select()
			.from(cases)
			.where(eq(cases.id, caseId))
			.limit(1);

		if (!sourceCase) {
			return json({ error: 'Case not found' }, { status: 404 });
		}

		// Step 2: Generate case embedding (description + evidence summaries)
		const embedStart = performance.now();
		const caseEmbedding = await generateCaseEmbedding(caseId, sourceCase);
		if (!caseEmbedding || caseEmbedding.length !== 768) {
			return json({ error: 'Failed to generate case embedding' }, { status: 500 });
		}
		const embedMs = performance.now() - embedStart;

		// Step 3: Dual search (Qdrant + pgvector)
		const searchStart = performance.now();
		const candidates = await dualCaseSearch(caseEmbedding, caseId, limit * 3);
		const searchMs = performance.now() - searchStart;

		if (candidates.length === 0) {
			return json({
				query: { caseId, title: sourceCase.title },
				results: [],
				timing: {
					embedMs: Math.round(embedMs),
					searchMs: Math.round(searchMs),
					rerankMs: 0,
					aceMs: 0,
					totalMs: Math.round(performance.now() - startTime)
				}
			});
		}

		// Step 4: Multi-modal reranking (5 signals)
		const rerankStart = performance.now();

		// Convert SimilarCase[] to DocumentCandidate[] for ranker
		const docCandidates = candidates.map(c => ({
			id: c.caseId,
			title: c.title,
			embedding: [], // Embedding already used in search
			tags: c.sharedTags,
			topicMemberships: c.topicCluster !== undefined
				? [{ topicId: c.topicCluster, probability: 0.8 }]
				: [],
			centrality: c.graphConnections ? c.graphConnections / 100 : 0,
			caseIds: [c.caseId]
		}));

		// Multi-modal ranking with 5 signals
		let topResults = candidates;
		if (userId) {
			const ranker = new MultiModalRanker(userId);
			const ranked = await ranker.rankDocuments(
				caseEmbedding,
				[], // No query tags for case similarity
				docCandidates,
				limit
			);

			// Map ranked documents back to SimilarCase with signal breakdown
			topResults = ranked.map(r => {
				const original = candidates.find(c => c.caseId === r.documentId)!;
				return {
					...original,
					similarity: r.score,
					breakdown: {
						vector: r.signals.vectorSimilarity,
						tags: r.signals.tagOverlap,
						topic: r.signals.topicAffinity,
						centrality: r.signals.graphCentrality,
						userHistory: r.signals.profileMatch
					}
				};
			});
		} else {
			// No user context — sort by raw vector similarity
			topResults = candidates.slice(0, limit);
		}

		const rerankMs = performance.now() - rerankStart;

		// Step 5: ACE context enrichment (for top result)
		let aceContext = null;
		let aceMs = 0;
		if (topResults.length > 0) {
			const aceStart = performance.now();
			try {
				aceContext = await assembleACEContext({
					query: `Find cases similar to: ${sourceCase.title}`,
					userId: userId ?? undefined,
					caseId,
					maxTokens: 1500
				});
			} catch (err) {
				console.warn('[Case Similarity] ACE context failed (non-fatal):', err);
			}
			aceMs = performance.now() - aceStart;
		}

		// Step 6: Background Neo4j graph analysis (fire-and-forget)
		let graphJobId: string | undefined;
		if (triggerGraph && topResults.length > 0) {
			graphJobId = await triggerGraphAnalysis(caseId, topResults.map(r => r.caseId));
		}

		// Step 7: Store synthesis in CouchDB (fire-and-forget)
		storeSynthesisInCouchDB(caseId, topResults, aceContext).catch(() => {
			// Non-critical
		});

		// Step 8: Record user interaction (TODO: implement view tracking)
		// if (userId) {
		// 	const historyTracker = new UserHistoryTracker(userId);
		// 	await historyTracker.recordView(caseId, caseId, 0, `similar-cases-${caseId}`);
		// }

		const response: SimilarityResponse = {
			query: {
				caseId,
				title: sourceCase.title,
				...(includeEmbedding && { embedding: caseEmbedding })
			},
			results: topResults,
			...(aceContext && { aceContext }),
			timing: {
				embedMs: Math.round(embedMs),
				searchMs: Math.round(searchMs),
				rerankMs: Math.round(rerankMs),
				aceMs: Math.round(aceMs),
				totalMs: Math.round(performance.now() - startTime)
			},
			...(graphJobId && { graphJobId })
		};

		return json(response);
	} catch (err) {
		console.error('[Case Similarity] Error:', err);
		return json(
			{ error: 'Failed to find similar cases', details: err instanceof Error ? err.message : String(err) },
			{ status: 500 }
		);
	}
};

// ────────────────────────────────────────────────────────────────────────────
// Case Embedding Generation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generate a composite embedding for a case from:
 * - Case description (primary)
 * - Top 3 evidence summaries (secondary)
 * - Practice area + jurisdiction (tertiary)
 */
async function generateCaseEmbedding(
	caseId: string,
	caseData: any
): Promise<number[] | null> {
	// Build composite text representation
	let compositeText = caseData.title || '';

	if (caseData.description) {
		compositeText += `\n\n${caseData.description}`;
	}

	if (caseData.practiceArea) {
		compositeText += `\nPractice Area: ${caseData.practiceArea}`;
	}

	if (caseData.jurisdiction) {
		compositeText += `\nJurisdiction: ${caseData.jurisdiction}`;
	}

	// Add top 3 evidence items for richer context
	try {
		const evidenceSummaries = await db
			.select({
				description: evidence.description,
				title: evidence.title
			})
			.from(evidence)
			.where(eq(evidence.caseId, caseId))
			.orderBy(desc(evidence.createdAt))
			.limit(3);

		for (const ev of evidenceSummaries) {
			if (ev.description) {
				compositeText += `\n\nEvidence: ${ev.title}\n${ev.description.slice(0, 200)}`;
			}
		}
	} catch {
		// Evidence fetch failed — continue with case data only
	}

	// Truncate to ~2000 chars to fit embedding model context
	if (compositeText.length > 2000) {
		compositeText = compositeText.slice(0, 2000);
	}

	// Generate embedding via gRPC → Ollama fallback
	try {
		const embedding = await generateSingleEmbedding(compositeText);
		if (embedding && embedding.length === 768) {
			return embedding;
		}
	} catch {
		// Fall through to Ollama HTTP
	}

	// Fallback: Ollama HTTP API
	try {
		const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'embeddinggemma:latest',
				prompt: compositeText
			}),
			signal: AbortSignal.timeout(15000)
		});

		if (!res.ok) {
			throw new Error(`Ollama embeddings failed: ${res.status}`);
		}

		const data = await res.json();
		return data.embedding;
	} catch (err) {
		console.error('[Case Similarity] Embedding generation failed:', err);
		return null;
	}
}

// ────────────────────────────────────────────────────────────────────────────
// Dual Vector Search (Qdrant + pgvector)
// ────────────────────────────────────────────────────────────────────────────

async function dualCaseSearch(
	embedding: number[],
	excludeCaseId: string,
	limit: number
): Promise<SimilarCase[]> {
	const [qdrantResults, pgResults] = await Promise.all([
		searchQdrantCases(embedding, excludeCaseId, limit).catch((err) => {
			console.warn('[Case Similarity] Qdrant unavailable:', err instanceof Error ? err.message : err);
			return [] as SimilarCase[];
		}),
		searchPgvectorCases(embedding, excludeCaseId, limit)
	]);

	// Merge and deduplicate by caseId
	const seen = new Set<string>();
	const merged: SimilarCase[] = [];

	for (const result of [...pgResults, ...qdrantResults]) {
		if (!seen.has(result.caseId)) {
			seen.add(result.caseId);
			merged.push(result);
		}
	}

	// Sort by raw vector similarity descending
	return merged.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}

/**
 * Search Qdrant legal_cases collection
 */
async function searchQdrantCases(
	embedding: number[],
	excludeCaseId: string,
	limit: number
): Promise<SimilarCase[]> {
	const { results } = await qdrant.hybridSearch({
		query: '',
		queryEmbedding: embedding,
		collection: 'legal_cases',
		limit,
		scoreThreshold: 0.3
	});

	return results
		.filter((r: any) => r.payload?.case_id !== excludeCaseId)
		.map((r: any) => ({
			caseId: r.payload?.case_id ?? '',
			title: r.payload?.title ?? '',
			description: r.payload?.description ?? '',
			jurisdiction: r.payload?.jurisdiction ?? '',
			status: r.payload?.status ?? '',
			priority: r.payload?.priority ?? '',
			practiceArea: r.payload?.practice_area,
			similarity: r.score ?? 0,
			breakdown: {
				vector: r.score ?? 0,
				tags: 0,
				topic: 0,
				centrality: 0,
				userHistory: 0
			},
			sharedTags: r.payload?.tags ?? [],
			topicCluster: r.payload?.topic_cluster
		}));
}

/**
 * Search pgvector case_embeddings table
 */
async function searchPgvectorCases(
	embedding: number[],
	excludeCaseId: string,
	limit: number
): Promise<SimilarCase[]> {
	const vectorStr = `[${embedding.join(',')}]`;

	// Use raw SQL for vector operations
	const query = `
		SELECT
			c.id, c.title, c.description, c.jurisdiction, c.status, c.priority, c.practice_area,
			1 - (ce.embedding <=> '${vectorStr}'::vector) AS similarity
		FROM case_embeddings ce
		JOIN cases c ON c.id = ce.case_id
		WHERE ce.case_id != '${excludeCaseId}'
		ORDER BY ce.embedding <=> '${vectorStr}'::vector
		LIMIT ${limit}
	`;

	const result = await db.execute(sql.raw(query));
	const rows = (result as any).rows ?? result;

	return rows.map((row: any) => ({
		caseId: row.id,
		title: row.title ?? '',
		description: row.description ?? '',
		jurisdiction: row.jurisdiction ?? '',
		status: row.status ?? '',
		priority: row.priority ?? '',
		practiceArea: row.practice_area,
		similarity: parseFloat(row.similarity) || 0,
		breakdown: {
			vector: parseFloat(row.similarity) || 0,
			tags: 0,
			topic: 0,
			centrality: 0,
			userHistory: 0
		},
		sharedTags: [],
		topicCluster: undefined
	}));
}

// ────────────────────────────────────────────────────────────────────────────
// Neo4j Graph Analysis (Background Job)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Trigger background Neo4j graph analysis job for self-prompting.
 * Returns job ID for client polling.
 */
async function triggerGraphAnalysis(
	sourceCaseId: string,
	similarCaseIds: string[]
): Promise<string> {
	const jobId = `graph-analysis-${sourceCaseId}-${Date.now()}`;

	// Fire-and-forget: POST to Neo4j sync endpoint
	fetch('/api/graph/sync', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			jobId,
			sourceCaseId,
			similarCaseIds,
			analysisType: 'case-similarity-graph',
			priority: 'low'
		})
	}).catch((err) => {
		console.warn('[Case Similarity] Neo4j graph trigger failed (non-fatal):', err);
	});

	return jobId;
}

// ────────────────────────────────────────────────────────────────────────────
// CouchDB Synthesis Storage
// ────────────────────────────────────────────────────────────────────────────

/**
 * Store similarity synthesis in CouchDB for LLM retrieval.
 * Schema: { _id, type: 'case-similarity', caseId, results, aceContext, timestamp }
 */
async function storeSynthesisInCouchDB(
	caseId: string,
	results: SimilarCase[],
	aceContext: any
): Promise<void> {
	if (!ENV.COUCHDB_URL) {
		console.warn('[Case Similarity] CouchDB URL not configured — skipping synthesis storage');
		return;
	}

	const docId = `case-similarity:${caseId}:${Date.now()}`;
	const synthesis = {
		_id: docId,
		type: 'case-similarity',
		caseId,
		results: results.slice(0, 5), // Top 5 for LLM context
		aceContext,
		timestamp: new Date().toISOString()
	};

	try {
		const res = await fetch(`${ENV.COUCHDB_URL}/ace_synthesis`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(synthesis)
		});

		if (!res.ok) {
			throw new Error(`CouchDB store failed: ${res.status}`);
		}

		console.log(`[Case Similarity] Stored synthesis in CouchDB: ${docId}`);
	} catch (err) {
		console.warn('[Case Similarity] CouchDB storage failed:', err);
	}
}
