/**
 * Shared codebase retrieval module: recall (Fuse.js) -> rerank (Qdrant dual-vector).
 *
 * Provides a single-call `loadCodebaseContext(query)` that returns a formatted
 * context string suitable for injection into LLM system prompts.
 *
 * Used by:
 * - /api/sse/chat — injects codebase context alongside legal RAG context
 * - /api/codebase/recall — exposes Stage A as an API
 * - /api/codebase/rerank — exposes Stage B as an API
 *
 * Step 1 fix: collection changed from 'codebase_chunks' -> 'codebase_chunks_768'
 * Step 2 fix: RankedChunk carries neo4j graph enrichment fields (gpuCluster,
 *             pageRankScore, routeType, hasAuthGuard) with Colab-preferred fallback.
 *             PageRank priority: Colab bare key > CouchDB power-iteration > local LibTorch.
 */
import Fuse from 'fuse.js';
import { ENV } from '$lib/server/env.server.js';
import { SERVER_EMBEDDING_MODEL } from '$lib/ai/model-ids.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { pool } from '$lib/server/db/client';

// -- Collection name -----------------------------------------------------------

const QDRANT_COLLECTION = 'codebase_chunks_768';

// -- Types --------------------------------------------------------------------

export interface ChunkMetadata {
	path: string;
	relativePath: string;
	symbol: string;
	kind: string;
	httpMethod?: string;
	routeId?: string;
	tags: string[];
	signature: string;
	lineStart: number;
	lineEnd: number;
}

export interface RankedChunk {
	path: string;
	relativePath: string;
	symbol: string;
	kind: string;
	content: string;
	signature: string;
	httpMethod?: string;
	routeId?: string;
	tags: string[];
	score: number;
	lineStart: number;
	lineEnd: number;
	// Graph enrichment fields (Step 2)
	gpuCluster?: number | null;
	pageRankScore?: number | null;
	routeType?: string | null;
	hasAuthGuard?: boolean | null;
}

// -- Module-level Fuse.js metadata cache -------------------------------------

let metadataCache: ChunkMetadata[] = [];
let fuseIndex: Fuse<ChunkMetadata> | null = null;
let lastRefresh = 0;
const REFRESH_INTERVAL = 5 * 60 * 1000;

export async function refreshMetadataCache(): Promise<void> {
	const now = Date.now();
	if (fuseIndex && now - lastRefresh < REFRESH_INTERVAL) return;

	try {
		const res = await fetch(
			`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ limit: 10000, with_payload: true, with_vector: false }),
				signal: AbortSignal.timeout(10_000)
			}
		);

		if (!res.ok) {
			console.warn('[codebase-context] Qdrant scroll failed, using stale cache');
			return;
		}

		const data = await res.json();
		const points = data.result?.points ?? [];

		metadataCache = points.map((p: { payload: Record<string, unknown> }) => ({
			path: p.payload.path as string,
			relativePath: p.payload.relativePath as string,
			symbol: p.payload.symbol as string,
			kind: p.payload.kind as string,
			httpMethod: p.payload.httpMethod as string | undefined,
			routeId: p.payload.routeId as string | undefined,
			tags: (p.payload.tags as string[]) ?? [],
			signature: (p.payload.signature as string) ?? '',
			lineStart: p.payload.lineStart as number,
			lineEnd: p.payload.lineEnd as number
		}));

		fuseIndex = new Fuse(metadataCache, {
			keys: [
				{ name: 'symbol', weight: 0.35 },
				{ name: 'signature', weight: 0.25 },
				{ name: 'relativePath', weight: 0.2 },
				{ name: 'tags', weight: 0.1 },
				{ name: 'routeId', weight: 0.1 }
			],
			threshold: 0.45,
			includeScore: true,
			minMatchCharLength: 2
		});

		lastRefresh = now;
	} catch (err) {
		console.error('[codebase-context] Failed to refresh metadata cache:', err);
	}
}

// -- Stage A: Fuse.js fuzzy recall -------------------------------------------

export interface RecallResult {
	candidates: Array<ChunkMetadata & { fuseScore: number }>;
	total: number;
	recallMs: number;
}

export async function recallChunks(query: string, limit = 100): Promise<RecallResult> {
	await refreshMetadataCache();

	if (!fuseIndex || metadataCache.length === 0) {
		return { candidates: [], total: 0, recallMs: 0 };
	}

	const start = performance.now();
	const results = fuseIndex.search(query, { limit: Math.min(limit, 200) });

	const candidates = results.map((r) => ({
		...r.item,
		fuseScore: 1 - (r.score ?? 1)
	}));

	return {
		candidates,
		total: metadataCache.length,
		recallMs: Math.round(performance.now() - start)
	};
}

export function getMetadataCacheSize(): number {
	return metadataCache.length;
}

// -- Stage B: Qdrant dual-vector semantic rerank ------------------------------

const DEFAULT_PATH_BOOSTS: Record<string, number> = {
	'+server.ts': 1.3,
	'+page.server.ts': 1.2,
	'schema-postgres.ts': 1.2,
	'tests/': 1.1,
	'lib/server/': 1.15
};

async function embedQuery(text: string): Promise<number[]> {
	const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: SERVER_EMBEDDING_MODEL, prompt: text }),
		signal: AbortSignal.timeout(15_000)
	});

	if (!res.ok) throw new Error(`Embedding failed: ${res.status}`);
	const data = await res.json();
	return data.embedding;
}

async function searchQdrant(
	vectorName: string,
	vector: number[],
	limit: number,
	filter?: Record<string, unknown>
): Promise<Array<{ id: number | string; score: number; payload: Record<string, unknown> }>> {
	const body: Record<string, unknown> = {
		vector: { name: vectorName, vector },
		limit,
		with_payload: true
	};
	if (filter) body.filter = filter;

	const res = await fetch(
		`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(10_000)
		}
	);

	if (!res.ok) return [];
	const data = await res.json();
	return data.result ?? [];
}

function numPayload(p: Record<string, unknown>, key: string): number | null {
	const v = p[key];
	return typeof v === 'number' && isFinite(v) ? v : null;
}

export interface RerankOptions {
	candidatePaths?: string[];
	limit?: number;
	contentWeight?: number;
	signatureWeight?: number;
	pathBoosts?: Record<string, number>;
}

export interface RerankResult {
	results: RankedChunk[];
	queryVector: number[];
	timing: { embedMs: number; searchMs: number; totalMs: number };
	meta: { contentResults: number; signatureResults: number; merged: number; returned: number };
}

export async function rerankChunks(
	query: string,
	options: RerankOptions = {}
): Promise<RerankResult> {
	const limit = Math.min(options.limit ?? 10, 50);
	const contentWeight = options.contentWeight ?? 0.6;
	const signatureWeight = options.signatureWeight ?? 0.4;
	const pathBoosts = options.pathBoosts ?? DEFAULT_PATH_BOOSTS;

	const start = performance.now();

	let filter: Record<string, unknown> | undefined;
	if (options.candidatePaths && options.candidatePaths.length > 0) {
		filter = {
			should: options.candidatePaths.slice(0, 200).map((p) => ({
				key: 'path',
				match: { value: p }
			}))
		};
	}

	const queryVector = await embedQuery(query);
	const embedMs = performance.now() - start;

	const searchStart = performance.now();
	const [contentResults, signatureResults] = await Promise.all([
		searchQdrant('content', queryVector, limit * 3, filter),
		searchQdrant('signature', queryVector, limit * 3, filter)
	]);
	const searchMs = performance.now() - searchStart;

	const scoreMap = new Map<string, { payload: Record<string, unknown>; score: number }>();

	for (const r of contentResults) {
		const key = String(r.id);
		scoreMap.set(key, { payload: r.payload, score: r.score * contentWeight });
	}

	for (const r of signatureResults) {
		const key = String(r.id);
		const existing = scoreMap.get(key);
		if (existing) {
			existing.score += r.score * signatureWeight;
		} else {
			scoreMap.set(key, { payload: r.payload, score: r.score * signatureWeight });
		}
	}

	const merged = [...scoreMap.values()];
	for (const r of merged) {
		const path = (r.payload.relativePath as string) ?? '';
		for (const [pattern, multiplier] of Object.entries(pathBoosts)) {
			if (path.includes(pattern)) {
				r.score *= multiplier;
			}
		}
	}

	merged.sort((a, b) => b.score - a.score);
	const topResults = merged.slice(0, limit);

	const totalMs = performance.now() - start;

	const results: RankedChunk[] = topResults.map((r) => {
		const p = r.payload;
		const pageRankScore =
			numPayload(p, 'pagerank_score') ??
			numPayload(p, 'pagerank_score_couchdb') ??
			numPayload(p, 'neo4j_pageRankScore') ??
			null;
		const gpuCluster =
			numPayload(p, 'som_cluster') ??
			numPayload(p, 'neo4j_gpuCluster') ??
			null;

		return {
			path: p.path as string,
			relativePath: p.relativePath as string,
			symbol: p.symbol as string,
			kind: p.kind as string,
			content: p.content as string,
			signature: p.signature as string,
			httpMethod: p.httpMethod as string | undefined,
			routeId: p.routeId as string | undefined,
			tags: (p.tags as string[]) ?? [],
			score: Math.round(r.score * 1000) / 1000,
			lineStart: p.lineStart as number,
			lineEnd: p.lineEnd as number,
			gpuCluster,
			pageRankScore,
			routeType: (p.routeType as string | null) ?? null,
			hasAuthGuard: (p.hasAuthGuard as boolean | null) ?? null
		};
	});

	return {
		results,
		queryVector,
		timing: {
			embedMs: Math.round(embedMs),
			searchMs: Math.round(searchMs),
			totalMs: Math.round(totalMs)
		},
		meta: {
			contentResults: contentResults.length,
			signatureResults: signatureResults.length,
			merged: scoreMap.size,
			returned: results.length
		}
	};
}

// -- Combined: recall -> rerank -> format context string ---------------------

const CODEBASE_CONTEXT_MAX_CHARS = 2000;
const MIN_RECALL_SCORE = 0.3;

export async function loadCodebaseContext(query: string): Promise<{
	context: string;
	chunks: RankedChunk[];
	timing: { recallMs: number; rerankMs: number };
} | null> {
	try {
		const recall = await recallChunks(query, 50);
		const goodCandidates = recall.candidates.filter((c) => c.fuseScore >= MIN_RECALL_SCORE);

		if (goodCandidates.length === 0) return null;

		const candidatePaths = goodCandidates.map((c) => c.path);
		const rerank = await rerankChunks(query, { candidatePaths, limit: 5 });

		if (rerank.results.length === 0) return null;

		let context = `## Codebase Context (${rerank.results.length} relevant chunks)\n`;
		for (const chunk of rerank.results) {
			const header = chunk.httpMethod
				? `${chunk.httpMethod} ${chunk.routeId ?? chunk.relativePath}`
				: `${chunk.kind}: ${chunk.symbol}`;
			const loc = `${chunk.relativePath}:${chunk.lineStart}-${chunk.lineEnd}`;

			const meta = [
				chunk.routeType ? `type:${chunk.routeType}` : '',
				chunk.gpuCluster != null ? `cluster:${chunk.gpuCluster}` : '',
				chunk.pageRankScore != null ? `rank:${chunk.pageRankScore.toFixed(2)}` : '',
				chunk.hasAuthGuard ? 'auth-guarded' : ''
			]
				.filter(Boolean)
				.join(' ');

			context += `\n### [${header}] (${loc}, score: ${chunk.score}${meta ? `, ${meta}` : ''})\n`;

			const snippet =
				chunk.content.length > 400 ? chunk.content.slice(0, 400) + '...' : chunk.content;
			context += `\`\`\`typescript\n${snippet}\n\`\`\`\n`;
		}

		if (context.length > CODEBASE_CONTEXT_MAX_CHARS) {
			context = context.slice(0, CODEBASE_CONTEXT_MAX_CHARS) + '\n...(truncated)';
		}

		return {
			context,
			chunks: rerank.results,
			timing: {
				recallMs: recall.recallMs,
				rerankMs: rerank.timing.totalMs
			}
		};
	} catch (err) {
		console.warn('[codebase-context] Retrieval failed (non-fatal):', err);
		return null;
	}
}

// -- pgvector fallback retrieval ---------------------------------------------

export async function searchCodebasePgVector(
	queryEmbedding: number[],
	limit = 10,
	minScore = 0.5
): Promise<RankedChunk[]> {
	try {
		const result = await pool.query<{
			id: string;
			relative_path: string;
			content: string;
			signature: string | null;
			gpu_cluster: number | null;
			som_cluster: number | null;
			page_rank_score: number | null;
			pagerank_score_couchdb: number | null;
			route_type: string | null;
			has_auth_guard: boolean | null;
			cosine_score: number;
		}>(
			`SELECT id, relative_path, content, signature,
			        gpu_cluster, som_cluster, page_rank_score, pagerank_score_couchdb,
			        route_type, has_auth_guard,
			        1 - (embedding <=> $1::halfvec) AS cosine_score
			 FROM   codebase_chunk_index
			 WHERE  1 - (embedding <=> $1::halfvec) > $2
			 ORDER  BY cosine_score DESC
			 LIMIT  $3`,
			[JSON.stringify(queryEmbedding), minScore, limit]
		);

		return result.rows.map((r) => ({
			path: r.id,
			relativePath: r.relative_path,
			symbol: '',
			kind: 'chunk',
			content: r.content,
			signature: r.signature ?? '',
			tags: [],
			score: r.cosine_score,
			lineStart: 0,
			lineEnd: 0,
			gpuCluster: r.som_cluster ?? r.gpu_cluster ?? null,
			pageRankScore: r.page_rank_score ?? r.pagerank_score_couchdb ?? null,
			routeType: r.route_type,
			hasAuthGuard: r.has_auth_guard
		}));
	} catch (err) {
		console.warn('[codebase-context] pgvector fallback failed:', err);
		return [];
	}
}

// -- Cluster-aware retrieval -------------------------------------------------

export async function searchCodebaseByCluster(
	clusterId: number,
	limit = 20
): Promise<Array<{ id: string | number; score: number; payload: Record<string, unknown> }>> {
	const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			filter: {
				should: [
					{ key: 'som_cluster', match: { value: clusterId } },
					{ key: 'neo4j_gpuCluster', match: { value: clusterId } }
				]
			},
			limit,
			with_payload: true,
			with_vector: false
		}),
		signal: AbortSignal.timeout(8_000)
	});

	if (!res.ok) return [];
	const data = await res.json();
	return (data.result?.points ?? []).map(
		(p: { id: string | number; payload: Record<string, unknown> }) => ({
			id: p.id,
			score: 0,
			payload: p.payload
		})
	);
}

// -- Eager pre-warm on first import ------------------------------------------
refreshMetadataCache().catch(() => {
	/* Qdrant may not be ready at startup -- first search will retry */
});