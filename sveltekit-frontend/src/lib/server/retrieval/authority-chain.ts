/**
 * Authority Chain Drill-Down (P4: Recursive Multi-Hop Retrieval)
 *
 * When top retrieval results cite specific statutes or cases,
 * this module embeds those citations and searches for their full text,
 * expanding the context with primary authority sources.
 *
 * Flow per hop:
 *   1. Extract statute/case citations from current docs
 *   2. Build a combined citation text and embed it
 *   3. Search statute collections (legal_canon_chunks, legal_documents)
 *   4. Search case collections (court_opinions, case_chunks)
 *   5. Merge + deduplicate + re-rank
 *
 * Max 2 hops. Results cached in Redis (15min TTL).
 */

import { buildVectorPayload } from '$lib/server/config/vector-config.js';
import { extractLegalTags } from '$lib/server/rag/tag-extractor.js';
import { setCache, getFromMemoryCache } from '$lib/server/cache.js';
import { logInference } from '$lib/server/observability/inference-log.js';
import { traceEmbedding, traceVectorSearch } from '$lib/server/observability/langfuse.js';
import { createHash } from 'crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ContextDoc {
	content: string;
	similarity: number;
	documentId: string;
	sourceId?: string;
	model?: string;
}

export interface AuthorityChainConfig {
	/** Qdrant REST URL */
	qdrantUrl: string;
	/** Max expansion hops (default 2) */
	maxHops?: number;
	/** Max chunks to add per hop (default 3) */
	maxPerHop?: number;
	/** Min Qdrant score (default 0.30) */
	scoreThreshold?: number;
	/** Max chars per chunk (default 600) */
	chunkMaxChars?: number;
	/** Timeout per Qdrant search (default 3000ms) */
	searchTimeoutMs?: number;
	/** Redis cache TTL in ms (default 15min) */
	cacheTtlMs?: number;
}

export interface AuthorityChainResult {
	docs: ContextDoc[];
	hops: number;
	expanded: number;
	authorities: { statutes: string[]; cases: string[] };
}

/** Embed a text string → 768-dim vector, or null on failure */
export type EmbedFn = (text: string) => Promise<number[] | null>;

// ── Constants ────────────────────────────────────────────────────────────────

/** Collections for statute/regulation full text */
const STATUTE_COLLECTIONS = ['legal_canon_chunks', 'legal_documents'] as const;
/** Collections for case precedent */
const CASE_PRECEDENT_COLLECTIONS = ['court_opinions', 'case_chunks'] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function md5Short(input: string): string {
	return createHash('md5').update(input).digest('hex').slice(0, 12);
}

function resolveSourceId(
	payload: Record<string, unknown> | undefined,
	fallback: string
): string {
	const c =
		payload?.document_id ??
		payload?.evidence_id ??
		payload?.source_id ??
		payload?.file_path;
	return typeof c === 'string' && c.length > 0 ? c : fallback;
}

/**
 * Extract NEW authority citations from docs that aren't already tracked.
 */
function extractNewAuthorities(
	docs: ContextDoc[],
	known: { statutes: Set<string>; cases: Set<string> }
): { statutes: string[]; cases: string[] } {
	const newStatutes = new Set<string>();
	const newCases = new Set<string>();

	for (const doc of docs) {
		const tags = extractLegalTags(doc.content);
		for (const s of tags.statutes ?? []) if (!known.statutes.has(s)) newStatutes.add(s);
		for (const ca of tags.caCodes ?? []) if (!known.statutes.has(ca)) newStatutes.add(ca);
		for (const c of tags.cases ?? []) if (!known.cases.has(c)) newCases.add(c);
	}

	return { statutes: [...newStatutes], cases: [...newCases] };
}

// Re-export for testing
export { extractNewAuthorities as _extractNewAuthorities };

/**
 * Search Qdrant collections with an authority-focused embedding.
 */
async function searchAuthorityCollections(
	vector: number[],
	collections: readonly string[],
	limit: number,
	scoreThreshold: number,
	qdrantUrl: string,
	timeoutMs: number,
	chunkMaxChars: number
): Promise<ContextDoc[]> {
	return traceVectorSearch(
		`authority-${collections.join('+')}`,
		{ collections: collections.join(','), limit, scoreThreshold },
		async () => {
			const promises = collections.map(async (collection) => {
				try {
					const vectorPayload = buildVectorPayload(collection, vector);
					const res = await fetch(
						`${qdrantUrl}/collections/${collection}/points/search`,
						{
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								vector: vectorPayload,
								limit,
								with_payload: true,
								score_threshold: scoreThreshold,
							}),
							signal: AbortSignal.timeout(timeoutMs),
						}
					);
					if (!res.ok) return [];
					const data = await res.json();
					return ((data.result ?? []) as Array<Record<string, unknown>>).map(
						(r) => {
							const payload = r.payload as Record<string, unknown> | undefined;
							const raw = String(
								payload?.text ??
									payload?.content_preview ??
									payload?.full_text ??
									payload?.content ??
									payload?.title ??
									''
							);
							return {
								content:
									raw.length > chunkMaxChars
										? raw.slice(0, chunkMaxChars) + '...'
										: raw,
								similarity: Number(r.score ?? 0),
								documentId: `${collection}:${r.id}`,
								sourceId: resolveSourceId(
									payload,
									`${collection}:${String(r.id ?? '')}`
								),
								model: payload?.embedding_model as string | undefined,
							};
						}
					);
				} catch {
					return [];
				}
			});

			const results = await Promise.allSettled(promises);
			const chunks: ContextDoc[] = [];
			for (const r of results) {
				if (r.status === 'fulfilled') chunks.push(...r.value);
			}
			chunks.sort((a, b) => b.similarity - a.similarity);
			return chunks.slice(0, limit);
		}
	);
}

// ── Main Export ──────────────────────────────────────────────────────────────

/**
 * Multi-hop authority chain expansion.
 *
 * Extracts statute/case citations from retrieval results, embeds them,
 * and searches statute/case collections for the cited authority's full text.
 * Runs up to `maxHops` rounds (default 2) — each hop discovers new
 * authorities from the expanded set.
 *
 * @param queryVector  Original query embedding (768-dim)
 * @param contextDocs  Current retrieval results (after DAG ordering)
 * @param embedFn      Function to embed text → vector (Ollama wrapper)
 * @param config       Qdrant URL + optional overrides
 */
export async function authorityChainExpansion(
	queryVector: number[],
	contextDocs: ContextDoc[],
	embedFn: EmbedFn,
	config: AuthorityChainConfig
): Promise<AuthorityChainResult> {
	const maxHops = config.maxHops ?? 2;
	const maxPerHop = config.maxPerHop ?? 6;
	const scoreThreshold = config.scoreThreshold ?? 0.3;
	const chunkMaxChars = config.chunkMaxChars ?? 1500;
	const searchTimeoutMs = config.searchTimeoutMs ?? 3000;
	const cacheTtlMs = config.cacheTtlMs ?? 15 * 60 * 1000;
	const startTime = performance.now();

	const empty: AuthorityChainResult = {
		docs: contextDocs,
		hops: 0,
		expanded: 0,
		authorities: { statutes: [], cases: [] },
	};

	if (contextDocs.length === 0 || queryVector.length === 0) return empty;

	// ── Cache check ──────────────────────────────────────────────────────
	const qHash = md5Short(queryVector.slice(0, 8).join(','));
	const dHash = md5Short(
		contextDocs
			.map((d) => d.documentId)
			.sort()
			.join(',')
	);
	const cacheKey = `authority:chain:${qHash}:${dHash}`;

	const cached = getFromMemoryCache(cacheKey);
	if (cached.found && Array.isArray((cached.value as any)?.docs)) {
		logInference({
			type: 'vector_search',
			backend: 'qdrant',
			latencyMs: Math.round(performance.now() - startTime),
			cacheHit: true,
			resultCount: (cached.value as any).expanded ?? 0,
			collection: 'authority_chain',
		});
		return cached.value as AuthorityChainResult;
	}

	// ── Multi-hop expansion ──────────────────────────────────────────────
	const allDocs = [...contextDocs];
	const seenIds = new Set(allDocs.map((d) => d.documentId));
	const knownStatutes = new Set<string>();
	const knownCases = new Set<string>();
	let totalExpanded = 0;
	let hop = 0;

	for (hop = 0; hop < maxHops; hop++) {
		const newAuth = extractNewAuthorities(allDocs, {
			statutes: knownStatutes,
			cases: knownCases,
		});

		if (newAuth.statutes.length === 0 && newAuth.cases.length === 0) break;

		// Track so we don't re-expand on next hop
		for (const s of newAuth.statutes) knownStatutes.add(s);
		for (const c of newAuth.cases) knownCases.add(c);

		console.log(
			`[Authority Chain] Hop ${hop + 1}: ` +
				`${newAuth.statutes.length} statutes, ${newAuth.cases.length} cases`
		);

		// Embed the combined authority citation text
		const authText = [...newAuth.statutes, ...newAuth.cases].join('; ');
		const authVector = await traceEmbedding(
			'authority-chain',
			{ hop: hop + 1, textLength: authText.length, statuteCount: newAuth.statutes.length, caseCount: newAuth.cases.length },
			async () => embedFn(authText)
		);
		if (!authVector) {
			console.warn(
				'[Authority Chain] Embedding failed — skipping hop'
			);
			break;
		}

		// Search statute + case collections in parallel
		const [statuteHits, caseHits] = await Promise.all([
			newAuth.statutes.length > 0
				? searchAuthorityCollections(
						authVector,
						STATUTE_COLLECTIONS,
						maxPerHop,
						scoreThreshold,
						config.qdrantUrl,
						searchTimeoutMs,
						chunkMaxChars
					)
				: Promise.resolve([]),
			newAuth.cases.length > 0
				? searchAuthorityCollections(
						authVector,
						CASE_PRECEDENT_COLLECTIONS,
						maxPerHop,
						scoreThreshold,
						config.qdrantUrl,
						searchTimeoutMs,
						chunkMaxChars
					)
				: Promise.resolve([]),
		]);

		// Deduplicate and merge
		const hopChunks = [...statuteHits, ...caseHits].filter((c) => {
			if (seenIds.has(c.documentId)) return false;
			seenIds.add(c.documentId);
			return c.content.length > 0;
		});

		if (hopChunks.length === 0) break;

		allDocs.push(...hopChunks);
		totalExpanded += hopChunks.length;
	}

	// Re-sort by similarity
	allDocs.sort((a, b) => b.similarity - a.similarity);

	const result: AuthorityChainResult = {
		docs: allDocs,
		hops: hop,
		expanded: totalExpanded,
		authorities: {
			statutes: [...knownStatutes],
			cases: [...knownCases],
		},
	};

	// Cache (fire-and-forget)
	setCache(cacheKey, result, cacheTtlMs).catch(() => {});

	logInference({
		type: 'vector_search',
		backend: 'qdrant',
		latencyMs: Math.round(performance.now() - startTime),
		cacheHit: false,
		resultCount: totalExpanded,
		collection: 'authority_chain',
	});

	if (totalExpanded > 0) {
		console.log(
			`[Authority Chain] ${hop} hop(s), +${totalExpanded} chunks ` +
				`in ${Math.round(performance.now() - startTime)}ms`
		);
	}

	return result;
}
