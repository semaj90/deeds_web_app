/**
 * Web Research Crawler — Search → Summarize → Tag → Cosine Rank → Index
 *
 * Pipeline for each selfPrompt query:
 *   1. webSearch() → top-N results (SearXNG → Google → DuckDuckGo fallback)
 *   2. Embed query + title+snippet → 768-dim embeddinggemma vectors
 *   3. batchCosineSimilarity() (GPU LibTorch) → relevance-rank results
 *   4. Summarize top-3 with Ollama gemma4-legal (ACE-style)
 *   5. Extract entity tags (regex legal terms + LLM extraction)
 *   6. Store in Redis web:research:sum:{urlHash} (2h TTL)
 *   7. Add to Redis ZSET web:research:idx:{pipeline} (relevanceScore)
 *   8. Add to research-cache ZSET so research-topics picks them up
 *
 * Data never touches Postgres — web results are ephemeral (Redis only).
 * Summaries surface in: research-topics, deep-research, MCP analytics:web_research.
 *
 * Redis schema:
 *   web:research:sum:{urlHash}   STRING  JSON WebResearchSummary  TTL 2h
 *   web:research:idx:{pipeline}  ZSET    urlHash → relevanceScore TTL 2h
 *   web:research:built_at        STRING  ISO timestamp             TTL 2h
 */

import { webSearch } from '$lib/server/retrieval/web-search.js';
import { bifrostChat } from '$lib/server/ollama.js';
import { getRedis } from '$lib/server/redis.js';

// ── Constants ──────────────────────────────────────────────────────────────

const WEB_TTL_S      = 2 * 60 * 60;          // 2h
const MAX_SUMMARIZE  = 3;                      // top-N results to fully summarize
const MAX_TAGS       = 8;
const WEB_SUM_KEY    = (h: string) => `web:research:sum:${h}`;
const WEB_IDX_KEY    = (pl: string) => `web:research:idx:${pl}`;
const BUILT_AT_KEY   = 'web:research:built_at';
const MODEL          = 'gemma4-legal:latest';

// ── Types ──────────────────────────────────────────────────────────────────

export interface WebResearchSummary {
	urlHash:        string;   // 8-char FNV-1a of URL
	url:            string;
	title:          string;
	query:          string;
	queryHash:      string;   // 8-char FNV-1a of query
	summary:        string;   // ACE Ollama summarization
	entityTags:     string[];
	pipeline:       string;   // ace|rag|kag|dag|codebase
	provider:       string;   // google|duckduckgo|searxng
	relevanceScore: number;   // cosine vs query embedding [0,1]
	snippetOnly:    boolean;  // true = no Ollama call, snippet used as summary
	createdAt:      string;
}

export interface WebResearchBatch {
	query:       string;
	queryHash:   string;
	summaries:   WebResearchSummary[];
	provider:    string;
	searchMs:    number;
	indexedAt:   string;
}

// ── Hash helpers ────────────────────────────────────────────────────────────

function fnv1a(text: string): string {
	let h = 2166136261;
	for (let i = 0; i < Math.min(text.length, 512); i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	return h.toString(16).padStart(8, '0');
}

// ── Legal entity tag extraction ─────────────────────────────────────────────

const LEGAL_TAG_RE = /\b(?:statute|section\s*\d+|§\s*\d+|f\.r\.e\.|u\.s\.c\.|hearsay|negligence|tort|contract|discovery|injunction|habeas|certiorari|mandamus|res judicata|stare decisis|mens rea|actus reus|brady|voir dire|subpoena|affidavit|deposition|motion|plaintiff|defendant|appellant|appellee|precedent|jurisdiction)\b/gi;

function extractLegalTags(text: string): string[] {
	const matches = new Set<string>();
	for (const m of text.matchAll(LEGAL_TAG_RE)) {
		matches.add(m[0].toLowerCase().replace(/\s+/g, '-'));
	}
	return [...matches].slice(0, MAX_TAGS);
}

async function extractTagsWithLLM(
	summary: string,
	fallbackTags: string[],
): Promise<string[]> {
	if (fallbackTags.length >= 4) return fallbackTags; // good enough
	try {
		const raw = await bifrostChat(
			[{
				role: 'user',
				content:
					`Extract 3-6 concise legal/topic tags from this text. ` +
					`Return ONLY a JSON string array. No explanation.\n\n${summary.slice(0, 800)}`,
			}],
			MODEL,
			{ temperature: 0.1, maxTokens: 80, cacheKey: `web-tags-${fnv1a(summary)}` },
		);
		const match = raw.match(/\[[\s\S]*?\]/);
		if (match) {
			const parsed = JSON.parse(match[0]) as string[];
			return [...new Set([...fallbackTags, ...parsed.map(String)])].slice(0, MAX_TAGS);
		}
	} catch { /* non-fatal */ }
	return fallbackTags;
}

// ── Cosine similarity ranking via LibTorch GPU ──────────────────────────────

async function rankByEmbedding(
	query: string,
	snippets: string[],
): Promise<number[]> {
	try {
		const { generateEmbeddings } = await import('$lib/server/grpc/embedding-client.js');
		const texts = [query, ...snippets];
		const embResult = await generateEmbeddings(texts);
    if (embResult.vectors.length < 2) return snippets.map((_, i) => 1 / (i + 1));

		const queryVec = embResult.vectors[0];
    const resultVecs = embResult.vectors.slice(1);

		// Try GPU cosine similarity (LibTorch N-API)
		const { batchCosineSimilarity } = await import('$lib/server/gpu/libtorch-bridge.js');
		const result = await batchCosineSimilarity(queryVec, resultVecs);
		return result.scores;
	} catch {
		// CPU fallback: simple dot product (embeddings are L2-normalised)
		return snippets.map((_, i) => 1 / (i + 1));
	}
}

// ── ACE summarization via Ollama ────────────────────────────────────────────

async function summarizeResult(
	title: string,
	snippet: string,
	url: string,
	query: string,
): Promise<string> {
	try {
		const raw = await bifrostChat(
			[
				{
					role: 'system',
					content:
						'You are a legal research summarizer. Given a web search result, provide a ' +
						'concise 2-4 sentence summary of its legal significance for the research query. ' +
						'Focus on actionable legal insights, cited authorities, and relevance.',
				},
				{
					role: 'user',
					content:
						`Research query: "${query.slice(0, 200)}"\n\n` +
						`Source: ${title}\nURL: ${url}\n\nContent snippet:\n${snippet.slice(0, 1200)}`,
				},
			],
			MODEL,
			{ temperature: 0.2, maxTokens: 256, cacheKey: `web-sum-${fnv1a(url + query)}` },
		);
		return raw.trim().slice(0, 800);
	} catch {
		return snippet.slice(0, 400); // fallback to snippet
	}
}

// ── Main crawl function ─────────────────────────────────────────────────────

/**
 * Run web research for a query: search → rank → summarize → tag → cache.
 *
 * @param query       The research selfPrompt to search
 * @param pipeline    Pipeline label for ZSET routing (ace/rag/kag/dag/codebase)
 * @param maxResults  How many web results to fetch (default 5)
 */
export async function crawlWebResearch(
	query:      string,
	pipeline:   string = 'ace',
	maxResults: number = 5,
): Promise<WebResearchBatch> {
	const qHash  = fnv1a(query);
	const redis  = getRedis();

	// 1. Web search
	const searchRes = await webSearch(query, maxResults);
	if (!searchRes.results.length) {
		return { query, queryHash: qHash, summaries: [], provider: 'none', searchMs: searchRes.searchMs, indexedAt: new Date().toISOString() };
	}

	// 2. Rank by embedding cosine similarity
	const snippets   = searchRes.results.map(r => `${r.title}. ${r.snippet}`);
	const scores     = await rankByEmbedding(query, snippets);

	// Attach scores and sort descending
	const ranked = searchRes.results
		.map((r, i) => ({ ...r, score: scores[i] ?? 1 / (i + 1) }))
		.sort((a, b) => b.score - a.score);

	// 3. Summarize top-N with Ollama; rest use snippet only
	const summaries: WebResearchSummary[] = await Promise.all(
		ranked.map(async (r, idx): Promise<WebResearchSummary> => {
			const urlHash     = fnv1a(r.url);
			const summarize   = idx < MAX_SUMMARIZE;
			const summaryText = summarize
				? await summarizeResult(r.title, r.snippet, r.url, query)
				: r.snippet.slice(0, 400);

			// 4. Extract entity tags
			const regexTags = extractLegalTags(`${r.title} ${summaryText}`);
			const entityTags = summarize
				? await extractTagsWithLLM(summaryText, regexTags)
				: regexTags;

			const summary: WebResearchSummary = {
				urlHash,
				url:            r.url,
				title:          r.title,
				query,
				queryHash:      qHash,
				summary:        summaryText,
				entityTags,
				pipeline,
				provider:       r.source,
				relevanceScore: r.score,
				snippetOnly:    !summarize,
				createdAt:      new Date().toISOString(),
			};

			// 5. Store summary in Redis
			redis.set(WEB_SUM_KEY(urlHash), JSON.stringify(summary), 'EX', WEB_TTL_S).catch(() => {});

			// 6. Add to per-pipeline ZSET
			redis.zadd(WEB_IDX_KEY(pipeline), r.score, urlHash).catch(() => {});
			redis.expire(WEB_IDX_KEY(pipeline), WEB_TTL_S).catch(() => {});
			redis.zadd(WEB_IDX_KEY('all'), r.score, urlHash).catch(() => {});
			redis.expire(WEB_IDX_KEY('all'), WEB_TTL_S).catch(() => {});

			return summary;
		})
	);

	redis.set(BUILT_AT_KEY, new Date().toISOString(), 'EX', WEB_TTL_S).catch(() => {});

	return {
		query,
		queryHash:  qHash,
		summaries,
		provider:   searchRes.provider,
		searchMs:   searchRes.searchMs,
		indexedAt:  new Date().toISOString(),
	};
}

// ── Query cached summaries ──────────────────────────────────────────────────

/**
 * Return top-N cached web research summaries for a pipeline.
 * Does NOT trigger new crawls.
 */
export async function queryWebResearchIndex(
	pipeline: string = 'all',
	limit:    number = 20,
): Promise<WebResearchSummary[]> {
	const redis = getRedis();
	const hashes = await redis
		.zrevrange(WEB_IDX_KEY(pipeline), 0, limit - 1)
		.catch(() => [] as string[]);

	if (!hashes.length) return [];

	const raw = await redis
		.mget(hashes.map(h => WEB_SUM_KEY(h)))
		.catch(() => [] as (string | null)[]);

	const out: WebResearchSummary[] = [];
	for (const r of raw) {
		if (!r) continue;
		try { out.push(JSON.parse(r) as WebResearchSummary); } catch { /* */ }
	}
	return out;
}

/** Stats for web research index. */
export async function getWebResearchStats(): Promise<{
	builtAt:        string | null;
	totalByPipeline: Record<string, number>;
}> {
	const redis = getRedis();
	const PIPELINES = ['ace', 'rag', 'kag', 'dag', 'codebase', 'all'];
	const [builtAt, ...counts] = await Promise.all([
		redis.get(BUILT_AT_KEY).catch(() => null),
		...PIPELINES.map(p => redis.zcard(WEB_IDX_KEY(p)).catch(() => 0)),
	]);
	const totalByPipeline: Record<string, number> = {};
	PIPELINES.forEach((p, i) => { totalByPipeline[p] = Number(counts[i]); });
	return { builtAt, totalByPipeline };
}

/** Invalidate all web research cache keys. */
export async function invalidateWebResearchCache(): Promise<void> {
	const redis = getRedis();
	const keys = await redis.keys('web:research:*').catch(() => [] as string[]);
	if (keys.length) await redis.del(...keys).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════
// LEGAL CORPUS SEARCH — search local Qdrant collections with gemma4-legal
//
// Searches `legal_canon_chunks`, `court_opinions`, and `legal_documents`
// (768-dim embeddinggemma vectors) and summarises top chunks via the same
// gemma4-legal bifrostChat pipeline used for web results.  Data stored in
// Redis alongside web results so research-topics surfaces both sources.
//
// Redis schema:
//   corpus:sum:{pointId}   STRING  JSON CorpusChunkSummary  TTL 4h
//   corpus:idx:{pipeline}  ZSET    pointId → relevanceScore TTL 4h
//   corpus:built_at        STRING  ISO timestamp             TTL 4h
// ═══════════════════════════════════════════════════════════════════════════

const CORPUS_TTL_S   = 4 * 60 * 60;      // 4h (authoritative — longer than web 2h)
const CORPUS_SUM_KEY = (id: string) => `corpus:sum:${id}`;
const CORPUS_IDX_KEY = (pl: string) => `corpus:idx:${pl}`;
const CORPUS_BUILT_AT = 'corpus:built_at';

// Collections to search in priority order (alias names from qdrant-manager)
const CORPUS_COLLECTIONS = [
	{ alias: 'legal_canon_chunks', label: 'Legal Canon' },
	{ alias: 'court_opinions',     label: 'Court Opinions' },
	{ alias: 'documents',          label: 'Legal Documents' },
] as const;

export interface CorpusChunkSummary {
	pointId:        string;
	collection:     string;
	collectionLabel: string;
	query:          string;
	queryHash:      string;
	chunkText:      string;
	summary:        string;
	entityTags:     string[];
	pipeline:       string;
	jurisdiction:   string | null;
	corpusType:     string | null;
	citationLabel:  string | null;
	sectionPath:    string | null;
	relevanceScore: number;
	createdAt:      string;
}

export interface CorpusSearchBatch {
	query:       string;
	queryHash:   string;
	summaries:   CorpusChunkSummary[];
	collections: string[];
	searchMs:    number;
	indexedAt:   string;
}

async function summarizeCorpusChunk(
	chunkText: string,
	citationLabel: string | null,
	query: string,
): Promise<string> {
	try {
		const raw = await bifrostChat(
			[
				{
					role: 'system',
					content:
						'You are a legal corpus analyst. Given a chunk from a legal document, ' +
						'provide a concise 2-3 sentence summary of its legal significance relative ' +
						'to the research query. Cite any statutes, provisions, or holdings mentioned.',
				},
				{
					role: 'user',
					content:
						`Research query: "${query.slice(0, 200)}"\n\n` +
						(citationLabel ? `Source: ${citationLabel}\n\n` : '') +
						`Text:\n${chunkText.slice(0, 1500)}`,
				},
			],
			MODEL,
			{ temperature: 0.15, maxTokens: 200, cacheKey: `corpus-sum-${fnv1a(chunkText.slice(0, 200) + query)}` },
		);
		return raw.trim().slice(0, 600);
	} catch {
		return chunkText.slice(0, 400);
	}
}

/**
 * Search the local legal Qdrant corpus for a query and summarise top chunks.
 *
 * @param query       Research query
 * @param pipeline    Pipeline label for ZSET routing
 * @param maxResults  Max chunks to retrieve per collection (default 4)
 */
export async function crawlLegalCorpus(
	query:      string,
	pipeline:   string = 'ace',
	maxResults: number = 4,
): Promise<CorpusSearchBatch> {
	const t0     = Date.now();
	const qHash  = fnv1a(query);
	const redis  = getRedis();

	// 1. Embed query
	let queryEmbedding: number[] = [];
	try {
		const { generateEmbeddings } = await import('$lib/server/grpc/embedding-client.js');
		const vecs = await generateEmbeddings([query]);
		queryEmbedding = vecs[0] ?? [];
	} catch { /* fallback to empty — hybridSearch handles it */ }

	// 2. Search each corpus collection in parallel
	const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');

	const collectionResults = await Promise.all(
		CORPUS_COLLECTIONS.map(async ({ alias, label }) => {
			try {
				const res = await qdrant.hybridSearch({
					query,
					queryEmbedding,
					collection: alias,
					limit:          maxResults,
					scoreThreshold: 0.4,
				});
				return res.results.map((r: { id: string; score: number; payload: Record<string, unknown> }) => ({
					...r,
					_collection: alias,
					_label:      label,
				}));
			} catch {
				return [];
			}
		})
	);

	// 3. Merge + sort by score descending, keep top maxResults*2 overall
	const allHits = collectionResults
		.flat()
		.sort((a, b) => b.score - a.score)
		.slice(0, maxResults * 2);

	// 4. Summarise top-3 with gemma4-legal; rest use chunk text directly
	const summaries: CorpusChunkSummary[] = await Promise.all(
		allHits.map(async (hit, idx): Promise<CorpusChunkSummary> => {
			const payload       = hit.payload ?? {};
			const chunkText     = String(payload.chunk_text ?? payload.text ?? payload.content ?? '').trim();
			const citationLabel = String(payload.citation_label ?? payload.citation ?? '').trim() || null;
			const sectionPath   = String(payload.section_path ?? payload.section ?? '').trim() || null;
			const jurisdiction  = String(payload.jurisdiction ?? payload.state_code ?? '').trim() || null;
			const corpusType    = String(payload.corpus_type ?? payload.doc_type ?? '').trim() || null;
			const pointId       = String(hit.id);

			const doSummarize  = idx < MAX_SUMMARIZE && chunkText.length > 80;
			const summaryText  = doSummarize
				? await summarizeCorpusChunk(chunkText, citationLabel, query)
				: chunkText.slice(0, 400);

			const regexTags  = extractLegalTags(`${citationLabel ?? ''} ${summaryText}`);
			const entityTags = doSummarize
				? await extractTagsWithLLM(summaryText, regexTags)
				: regexTags;

			const entry: CorpusChunkSummary = {
				pointId,
				collection:      hit._collection,
				collectionLabel: hit._label,
				query,
				queryHash:       qHash,
				chunkText:       chunkText.slice(0, 800),
				summary:         summaryText,
				entityTags,
				pipeline,
				jurisdiction,
				corpusType,
				citationLabel,
				sectionPath,
				relevanceScore:  hit.score,
				createdAt:       new Date().toISOString(),
			};

			// 5. Cache in Redis
			redis.set(CORPUS_SUM_KEY(pointId), JSON.stringify(entry), 'EX', CORPUS_TTL_S).catch(() => {});
			redis.zadd(CORPUS_IDX_KEY(pipeline),  hit.score, pointId).catch(() => {});
			redis.expire(CORPUS_IDX_KEY(pipeline), CORPUS_TTL_S).catch(() => {});
			redis.zadd(CORPUS_IDX_KEY('all'),       hit.score, pointId).catch(() => {});
			redis.expire(CORPUS_IDX_KEY('all'),     CORPUS_TTL_S).catch(() => {});

			return entry;
		})
	);

	redis.set(CORPUS_BUILT_AT, new Date().toISOString(), 'EX', CORPUS_TTL_S).catch(() => {});

	return {
		query,
		queryHash:   qHash,
		summaries,
		collections: [...new Set(allHits.map(h => h._collection))],
		searchMs:    Date.now() - t0,
		indexedAt:   new Date().toISOString(),
	};
}

/** Return top-N cached corpus chunk summaries for a pipeline. */
export async function queryCorpusIndex(
	pipeline: string = 'all',
	limit:    number = 20,
): Promise<CorpusChunkSummary[]> {
	const redis  = getRedis();
	const ids    = await redis.zrevrange(CORPUS_IDX_KEY(pipeline), 0, limit - 1).catch(() => [] as string[]);
	if (!ids.length) return [];

	const raw = await redis.mget(ids.map(id => CORPUS_SUM_KEY(id))).catch(() => [] as (string | null)[]);
	const out: CorpusChunkSummary[] = [];
	for (const r of raw) {
		if (!r) continue;
		try { out.push(JSON.parse(r) as CorpusChunkSummary); } catch { /* */ }
	}
	return out;
}

/** Stats for corpus search index. */
export async function getCorpusSearchStats(): Promise<{
	builtAt:         string | null;
	totalByPipeline: Record<string, number>;
}> {
	const redis     = getRedis();
	const PIPELINES = ['ace', 'rag', 'kag', 'dag', 'codebase', 'all'];
	const [builtAt, ...counts] = await Promise.all([
		redis.get(CORPUS_BUILT_AT).catch(() => null),
		...PIPELINES.map(p => redis.zcard(CORPUS_IDX_KEY(p)).catch(() => 0)),
	]);
	const totalByPipeline: Record<string, number> = {};
	PIPELINES.forEach((p, i) => { totalByPipeline[p] = Number(counts[i]); });
	return { builtAt, totalByPipeline };
}

/** Invalidate all corpus search cache keys. */
export async function invalidateCorpusCache(): Promise<void> {
	const redis = getRedis();
	const keys  = await redis.keys('corpus:*').catch(() => [] as string[]);
	if (keys.length) await redis.del(...keys).catch(() => {});
}
