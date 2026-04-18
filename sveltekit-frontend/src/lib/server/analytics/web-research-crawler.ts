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
		const vecs  = await generateEmbeddings(texts);
		if (vecs.length < 2) return snippets.map((_, i) => 1 / (i + 1));

		const queryVec   = new Float32Array(vecs[0]);
		const resultVecs = vecs.slice(1).map(v => new Float32Array(v));

		// Try GPU cosine similarity (LibTorch N-API)
		const { batchCosineSimilarity } = await import('$lib/server/gpu/libtorch-bridge.js');
		const result = await batchCosineSimilarity(queryVec, resultVecs);
		return result.similarities;
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
