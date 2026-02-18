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
 */
import Fuse from 'fuse.js';
import { ENV } from '$lib/server/env.server.js';
import { SERVER_EMBEDDING_MODEL } from '$lib/ai/model-ids.js';

// ── Types ──────────────────────────────────────────────────────────────────

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
}

// ── Module-level Fuse.js metadata cache ────────────────────────────────────

let metadataCache: ChunkMetadata[] = [];
let fuseIndex: Fuse<ChunkMetadata> | null = null;
let lastRefresh = 0;
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export async function refreshMetadataCache(): Promise<void> {
	const now = Date.now();
	if (fuseIndex && now - lastRefresh < REFRESH_INTERVAL) return;

	try {
		const res = await fetch(`${ENV.QDRANT_URL}/collections/codebase_chunks/points/scroll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ limit: 10000, with_payload: true, with_vector: false }),
			signal: AbortSignal.timeout(10_000)
		});

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

// ── Stage A: Fuse.js fuzzy recall ──────────────────────────────────────────

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

// ── Stage B: Qdrant dual-vector semantic rerank ────────────────────────────

const DEFAULT_PATH_BOOSTS: Record<string, number> = {
	'+server.ts': 1.3,
	'+page.server.ts': 1.2,
	'schema-postgres.ts': 1.2,
	'tests/': 1.1,
	'lib/server/': 1.15
};

async function embedQuery(text: string): Promise<number[]> {
	const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {
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

	const res = await fetch(`${ENV.QDRANT_URL}/collections/codebase_chunks/points/search`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(10_000)
	});

	if (!res.ok) return [];
	const data = await res.json();
	return data.result ?? [];
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
	timing: { embedMs: number; searchMs: number; totalMs: number };
	meta: { contentResults: number; signatureResults: number; merged: number; returned: number };
}

export async function rerankChunks(query: string, options: RerankOptions = {}): Promise<RerankResult> {
	const limit = Math.min(options.limit ?? 10, 50);
	const contentWeight = options.contentWeight ?? 0.6;
	const signatureWeight = options.signatureWeight ?? 0.4;
	const pathBoosts = options.pathBoosts ?? DEFAULT_PATH_BOOSTS;

	const start = performance.now();

	// Build Qdrant filter from candidate paths
	let filter: Record<string, unknown> | undefined;
	if (options.candidatePaths && options.candidatePaths.length > 0) {
		filter = {
			should: options.candidatePaths.slice(0, 200).map((p) => ({
				key: 'path',
				match: { value: p }
			}))
		};
	}

	// Embed query, search both vector spaces in parallel
	const queryVector = await embedQuery(query);
	const embedMs = performance.now() - start;

	const searchStart = performance.now();
	const [contentResults, signatureResults] = await Promise.all([
		searchQdrant('content', queryVector, limit * 3, filter),
		searchQdrant('signature', queryVector, limit * 3, filter)
	]);
	const searchMs = performance.now() - searchStart;

	// Merge scores from both vector spaces
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

	// Apply path-based boosting
	const merged = [...scoreMap.values()];
	for (const r of merged) {
		const path = (r.payload.relativePath as string) ?? '';
		for (const [pattern, multiplier] of Object.entries(pathBoosts)) {
			if (path.includes(pattern)) {
				r.score *= multiplier;
			}
		}
	}

	// Sort and take top N
	merged.sort((a, b) => b.score - a.score);
	const topResults = merged.slice(0, limit);

	const totalMs = performance.now() - start;

	const results: RankedChunk[] = topResults.map((r) => ({
		path: r.payload.path as string,
		relativePath: r.payload.relativePath as string,
		symbol: r.payload.symbol as string,
		kind: r.payload.kind as string,
		content: r.payload.content as string,
		signature: r.payload.signature as string,
		httpMethod: r.payload.httpMethod as string | undefined,
		routeId: r.payload.routeId as string | undefined,
		tags: (r.payload.tags as string[]) ?? [],
		score: Math.round(r.score * 1000) / 1000,
		lineStart: r.payload.lineStart as number,
		lineEnd: r.payload.lineEnd as number
	}));

	return {
		results,
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

// ── Combined: recall -> rerank -> format context string ────────────────────

const CODEBASE_CONTEXT_MAX_CHARS = 2000;
const MIN_RECALL_SCORE = 0.3;

/**
 * Full 2-stage codebase retrieval, returning a formatted context string
 * ready for injection into an LLM system prompt.
 *
 * Returns null if no relevant codebase context is found or if Qdrant is unavailable.
 */
export async function loadCodebaseContext(query: string): Promise<{
	context: string;
	chunks: RankedChunk[];
	timing: { recallMs: number; rerankMs: number };
} | null> {
	try {
		// Stage A: cheap fuzzy recall
		const recall = await recallChunks(query, 50);

		// Filter to candidates with decent fuzzy scores
		const goodCandidates = recall.candidates.filter((c) => c.fuseScore >= MIN_RECALL_SCORE);

		if (goodCandidates.length === 0) return null;

		// Stage B: semantic rerank on candidate paths
		const candidatePaths = goodCandidates.map((c) => c.path);
		const rerank = await rerankChunks(query, { candidatePaths, limit: 5 });

		if (rerank.results.length === 0) return null;

		// Format as context string
		let context = `## Codebase Context (${rerank.results.length} relevant chunks)\n`;
		for (const chunk of rerank.results) {
			const header = chunk.httpMethod
				? `${chunk.httpMethod} ${chunk.routeId ?? chunk.relativePath}`
				: `${chunk.kind}: ${chunk.symbol}`;
			const loc = `${chunk.relativePath}:${chunk.lineStart}-${chunk.lineEnd}`;

			context += `\n### [${header}] (${loc}, score: ${chunk.score})\n`;

			// Truncate individual chunks to keep total budget manageable
			const snippet = chunk.content.length > 400
				? chunk.content.slice(0, 400) + '...'
				: chunk.content;
			context += `\`\`\`typescript\n${snippet}\n\`\`\`\n`;
		}

		// Enforce total budget
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
