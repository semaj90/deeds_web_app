/**
 * Retrieval Orchestrator — canonical retrieval pipeline entry point.
 *
 * Composes: embed → vector search → corrective RAG → DAG ordering →
 * graph context → authority chain → graph expansion → graph authority scoring.
 *
 * Callers: /api/rag/search, /api/kb/search, /api/codebase-index/search,
 * and eventually /api/sse/chat (which currently has its own inline pipeline).
 */

import { getCachedEmbedding, setCachedEmbedding } from '$lib/server/knowledge-cache.js';
import { getCachedDAG, setCachedDAG } from '$lib/server/cache/dag-cache.js';
import { loadCodebaseContext, type RankedChunk } from './codebase-context.js';
import {
	getGraphContext,
	getCaseGraphNeighborIds,
	buildGraphShouldFilter,
	applyGraphAuthorityScoring,
	type GraphNeighbor,
} from './graph-context.js';
import { graphExpandRetrieval, type ContextDoc } from './graph-informed-retrieval.js';
import { authorityChainExpansion, type EmbedFn } from './authority-chain.js';
import { orderByDependency, extractCitationRefs } from './document-dag.js';
import type { DAGDocument } from './document-dag.js';
import { extractLegalTags } from '$lib/server/rag/tag-extractor.js';
import { logInference } from '$lib/server/observability/inference-log.js';
import { ENV } from '$lib/server/env.server.js';
import { buildVectorPayload } from '$lib/server/config/vector-config.js';

// Re-export ContextDoc so callers don't need graph-informed-retrieval import
export type { ContextDoc };

// ── Config ──────────────────────────────────────────────────────────────────

const EMBEDDING_MODEL = 'embeddinggemma:latest';
const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const RAG_MAX_CHUNKS = 12;
const CORRECTIVE_RAG_THRESHOLD = 0.5;

const KB_COLLECTIONS = ['legal_canon_chunks', 'legal_documents', 'court_opinions'] as const;
const CASE_COLLECTIONS = ['case_chunks', 'evidence_vectors'] as const;
const CODEBASE_COLLECTIONS = ['codebase_chunks_768'] as const;

// ── Request / Result Types ──────────────────────────────────────────────────

export interface RetrievalRequest {
	query: string;
	caseId?: string;
	userId?: string;
	pipeline?: 'legal' | 'codebase' | 'kb';
	topK?: number;
	/** Skip graph context + authority scoring + expansion */
	skipGraph?: boolean;
	/** Skip DAG citation ordering */
	skipDag?: boolean;
	/** Skip corrective RAG reformulation */
	skipCorrectiveRag?: boolean;
	/** Skip authority chain drill-down */
	skipAuthority?: boolean;
	/** Qdrant filter to apply to case collections */
	graphFilter?: Record<string, unknown>;
	/** Timeout in ms for the entire retrieval */
	timeoutMs?: number;
}

export interface RetrievalResult {
	chunks: ContextDoc[];
	graphContext: string | null;
	graphNeighbors: GraphNeighbor[];
	codebaseChunks: RankedChunk[];
	authorities: { statutes: string[]; cases: string[] };
	latencyMs: Record<string, number>;
	reformulated: boolean;
	dagOrdered: boolean;
}

// ── Embedding ───────────────────────────────────────────────────────────────

async function embedQuery(query: string): Promise<number[] | null> {
	const cached = await getCachedEmbedding(query, EMBEDDING_MODEL).catch(() => null);
	if (cached) return cached;

	try {
		const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: EMBEDDING_MODEL,
				prompt: query,
				keep_alive: '24h',
			}),
			signal: AbortSignal.timeout(8000),
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { embedding?: number[] };
		const vec = data.embedding;
		if (!Array.isArray(vec) || vec.length !== 768) return null;
		setCachedEmbedding(query, EMBEDDING_MODEL, vec).catch(() => {});
		return vec;
	} catch {
		return null;
	}
}

/** Embed function compatible with authority-chain.ts */
const embedFn: EmbedFn = async (text: string) => embedQuery(text);

// ── Qdrant Search ───────────────────────────────────────────────────────────

async function searchCollection(
	collection: string,
	vector: number[],
	limit: number,
	filter?: Record<string, unknown>,
): Promise<Array<{ id: string | number; score: number; payload?: Record<string, unknown>; _collection: string }>> {
	try {
		const vectorPayload = buildVectorPayload(collection, vector);
		const body: Record<string, unknown> = {
			vector: vectorPayload,
			limit,
			with_payload: true,
		};
		if (filter) body.filter = filter;
		const res = await fetch(`${ENV.QDRANT_URL}/collections/${collection}/points/search`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) return [];
		const data = (await res.json()) as { result?: Array<{ id: string | number; score: number; payload?: Record<string, unknown> }> };
		return (data.result ?? []).map((r) => ({ ...r, _collection: collection }));
	} catch {
		return [];
	}
}

function pointToContextDoc(
	r: { id: string | number; score: number; payload?: Record<string, unknown>; _collection: string },
): ContextDoc | null {
	const payload = r.payload;
	const rawContent = String(
		payload?.text ?? payload?.content_preview ?? payload?.full_text ??
		payload?.content ?? payload?.title ?? ''
	);
	if (!rawContent) return null;
	const content = rawContent.length > 2000 ? rawContent.slice(0, 2000) + '...' : rawContent;
	const sourceId = String(
		payload?.document_id ?? payload?.evidence_id ?? payload?.source_id ??
		payload?.file_path ?? `${r._collection}:${r.id}`
	);
	return {
		content,
		similarity: Number(r.score ?? 0),
		documentId: `${r._collection}:${r.id}`,
		sourceId,
	};
}

// ── Corrective RAG ──────────────────────────────────────────────────────────

async function correctiveRetrieval(
	query: string,
	docs: ContextDoc[],
	topK: number,
): Promise<{ docs: ContextDoc[]; reformulated: boolean; newQuery?: string }> {
	if (!docs.length) return { docs, reformulated: false };
	const topScore = Math.max(...docs.map((d) => d.similarity));
	if (topScore >= CORRECTIVE_RAG_THRESHOLD) return { docs, reformulated: false };

	try {
		const res = await fetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma4-legal:latest',
				prompt: `Rephrase this legal search query to improve retrieval results. Return ONLY the rephrased query, no explanation.\n\nOriginal query: "${query}"`,
				stream: false,
				keep_alive: '2m',
				options: { temperature: 0.3, num_predict: 100 },
			}),
			signal: AbortSignal.timeout(15_000),
		});
		if (!res.ok) return { docs, reformulated: false };
		const data = (await res.json()) as { response?: string };
		const newQuery = String(data.response ?? '').trim().replace(/^["']|["']$/g, '');
		if (!newQuery || newQuery.length < 5) return { docs, reformulated: false };

		const newVector = await embedQuery(newQuery);
		if (!newVector) return { docs, reformulated: false };

		const newHits = await searchLegalCollections(newVector, topK);
		const newTopScore = newHits.length ? Math.max(...newHits.map((d) => d.similarity)) : 0;
		if (newTopScore > topScore) return { docs: newHits, reformulated: true, newQuery };

		// Merge both sets
		const seen = new Set<string>();
		const merged = [...docs, ...newHits].filter((d) => {
			if (seen.has(d.documentId)) return false;
			seen.add(d.documentId);
			return true;
		});
		merged.sort((a, b) => b.similarity - a.similarity);
		return { docs: merged.slice(0, topK), reformulated: true, newQuery };
	} catch {
		return { docs, reformulated: false };
	}
}

// ── DAG Ordering ────────────────────────────────────────────────────────────

async function dagOrder(docs: ContextDoc[], caseId?: string): Promise<ContextDoc[]> {
	if (docs.length <= 1) return docs;
	const docIds = docs.map((d) => d.documentId);
	const start = performance.now();

	// Check cache
	const cached = await getCachedDAG(docIds).catch(() => null);
	if (cached) {
		const docMap = new Map(docs.map((d) => [d.documentId, d]));
		const reordered = cached.orderedIds
			.map((id) => docMap.get(id))
			.filter((d): d is ContextDoc => d !== undefined);
		for (const doc of docs) {
			if (!cached.orderedIds.includes(doc.documentId)) reordered.push(doc);
		}
		logInference({ type: 'dag_ordering', backend: 'couchdb', latencyMs: Math.round(performance.now() - start), cacheHit: true, resultCount: reordered.length });
		return reordered;
	}

	const knownIds = new Set(docIds);
	const dagDocs: DAGDocument[] = docs.map((d) => ({
		id: d.documentId,
		title: d.documentId,
		score: d.similarity,
		citations: extractCitationRefs(d.content, knownIds),
		content: d.content,
	}));

	const { ordered, cycles, edgesDropped } = orderByDependency(dagDocs);
	const docMap = new Map(docs.map((d) => [d.documentId, d]));
	const result = ordered
		.map((dagDoc) => docMap.get(dagDoc.id))
		.filter((d): d is ContextDoc => d !== undefined);

	setCachedDAG(docIds, ordered.map((d) => d.id), cycles, edgesDropped, caseId).catch(() => {});
	logInference({ type: 'dag_ordering', latencyMs: Math.round(performance.now() - start), cacheHit: false, resultCount: result.length });
	return result;
}

// ── Collection-Level Search ─────────────────────────────────────────────────

async function searchLegalCollections(
	vector: number[],
	topK: number,
	graphFilter?: Record<string, unknown>,
): Promise<ContextDoc[]> {
	const [kbHits, caseHits] = await Promise.all([
		Promise.all(KB_COLLECTIONS.map((col) => searchCollection(col, vector, topK))),
		Promise.all(CASE_COLLECTIONS.map((col) => searchCollection(col, vector, topK, graphFilter))),
	]);
	const merged = [...kbHits.flat(), ...caseHits.flat()];
	merged.sort((a, b) => b.score - a.score);
	return merged.slice(0, topK)
		.map(pointToContextDoc)
		.filter((d): d is ContextDoc => d !== null && d.content.length > 0);
}

async function searchCodebaseCollections(
	vector: number[],
	topK: number,
): Promise<ContextDoc[]> {
	const hits = await Promise.all(
		CODEBASE_COLLECTIONS.map((col) => searchCollection(col, vector, topK))
	);
	return hits.flat()
		.sort((a, b) => b.score - a.score)
		.slice(0, topK)
		.map(pointToContextDoc)
		.filter((d): d is ContextDoc => d !== null && d.content.length > 0);
}

// ── Main Orchestrator ───────────────────────────────────────────────────────

export async function orchestrateRetrieval(req: RetrievalRequest): Promise<RetrievalResult> {
	const topK = req.topK ?? RAG_MAX_CHUNKS;
	const timings: Record<string, number> = {};
	const totalStart = performance.now();

	// 1. Embed the query
	const t0 = performance.now();
	const vector = await embedQuery(req.query);
	timings.embed = Math.round(performance.now() - t0);
	if (!vector) {
		return emptyResult(timings);
	}

	// 2. Pre-retrieval graph filter (for legal pipeline with case context)
	let graphFilter = req.graphFilter;
	let preRetrievalNeighbors: GraphNeighbor[] = [];
	if (!req.skipGraph && req.caseId && req.pipeline !== 'codebase') {
		const t1 = performance.now();
		preRetrievalNeighbors = await getCaseGraphNeighborIds(req.caseId).catch(() => []);
		if (preRetrievalNeighbors.length) {
			graphFilter = buildGraphShouldFilter(preRetrievalNeighbors) ?? graphFilter;
		}
		timings.preGraph = Math.round(performance.now() - t1);
	}

	// 3. Vector search (collection set determined by pipeline)
	const t2 = performance.now();
	let chunks: ContextDoc[];
	let codebaseChunks: RankedChunk[] = [];

	if (req.pipeline === 'codebase') {
		const [codeDocs, codeRanked] = await Promise.all([
			searchCodebaseCollections(vector, topK),
			loadCodebaseContext(req.query).catch(() => null),
		]);
		chunks = codeDocs;
		codebaseChunks = codeRanked?.chunks ?? [];
	} else if (req.pipeline === 'kb') {
		chunks = await searchLegalCollections(vector, topK);
	} else {
		// 'legal' or default: full legal pipeline
		chunks = await searchLegalCollections(vector, topK, graphFilter);
	}
	timings.search = Math.round(performance.now() - t2);

	// 4. Corrective RAG (reformulate on low scores)
	let reformulated = false;
	if (!req.skipCorrectiveRag && chunks.length > 0) {
		const t3 = performance.now();
		const corrective = await correctiveRetrieval(req.query, chunks, topK);
		chunks = corrective.docs;
		reformulated = corrective.reformulated;
		timings.correctiveRag = Math.round(performance.now() - t3);
	}

	// 5. DAG ordering (citation dependency sorting)
	let dagOrdered = false;
	if (!req.skipDag && chunks.length > 1) {
		const t4 = performance.now();
		chunks = await dagOrder(chunks, req.caseId);
		dagOrdered = true;
		timings.dag = Math.round(performance.now() - t4);
	}

	// 6. Authority chain expansion (multi-hop statute/case drill-down)
	let authorities: { statutes: string[]; cases: string[] } = { statutes: [], cases: [] };
	if (!req.skipAuthority && chunks.length > 0 && req.pipeline !== 'codebase') {
		const t5 = performance.now();
		const authResult = await authorityChainExpansion(vector, chunks, embedFn, {
			qdrantUrl: ENV.QDRANT_URL,
		}).catch(() => null);
		if (authResult) {
			// Convert UnifiedRetrievalResult back to ContextDoc
			chunks = authResult.docs.map((d) => ({
				content: d.content,
				similarity: d.score,
				documentId: d.id,
				sourceId: d.sourceId,
			}));
			authorities = authResult.authorities;
		}
		timings.authority = Math.round(performance.now() - t5);
	}

	// 7. Post-retrieval graph context + expansion + authority scoring
	let graphContextStr: string | null = null;
	let allGraphNeighbors = [...preRetrievalNeighbors];
	if (!req.skipGraph && chunks.length > 0 && req.pipeline !== 'codebase') {
		const evidenceIds = chunks
			.map((d) => d.sourceId ?? d.documentId.split(':').pop())
			.filter((id): id is string => !!id);

		const t6 = performance.now();
		const gc = await getGraphContext(evidenceIds, req.caseId).catch(() => null);
		timings.graphContext = Math.round(performance.now() - t6);

		if (gc) {
			graphContextStr = gc.context;
			allGraphNeighbors = [...allGraphNeighbors, ...gc.neighbors];

			// Graph-informed retrieval expansion
			if (gc.neighbors.length) {
				const t7 = performance.now();
				const expandInput = chunks.map((d) => ({
					id: d.documentId,
					content: d.content,
					score: d.similarity,
					kind: 'legal_doc' as const,
					source: 'qdrant' as const,
					tags: [],
				}));
				const expanded = await graphExpandRetrieval(
					vector,
					expandInput,
					gc.neighbors,
					{ qdrantUrl: ENV.QDRANT_URL, maxExpansionChunks: 4, scoreThreshold: 0.3 },
				).catch(() => null);
				if (expanded) {
					chunks = expanded.map((d) => ({
						content: d.content,
						similarity: d.score,
						documentId: d.id,
						sourceId: d.sourceId,
					}));
				}
				timings.graphExpand = Math.round(performance.now() - t7);
			}

			// Graph authority scoring (re-rank by connection strength)
			if (allGraphNeighbors.length) {
				const t8 = performance.now();
				chunks = applyGraphAuthorityScoring(chunks, allGraphNeighbors);
				timings.graphAuthority = Math.round(performance.now() - t8);
			}
		}
	}

	timings.total = Math.round(performance.now() - totalStart);

	return {
		chunks,
		graphContext: graphContextStr,
		graphNeighbors: allGraphNeighbors,
		codebaseChunks,
		authorities,
		latencyMs: timings,
		reformulated,
		dagOrdered,
	};
}

function emptyResult(latencyMs: Record<string, number>): RetrievalResult {
	return {
		chunks: [],
		graphContext: null,
		graphNeighbors: [],
		codebaseChunks: [],
		authorities: { statutes: [], cases: [] },
		latencyMs,
		reformulated: false,
		dagOrdered: false,
	};
}
