/**
 * LangGraph-style Concurrent Codebase Research Orchestrator
 *
 * Implements a supervisor → parallel-workers → synthesizer DAG for deep
 * codebase research. Designed to be ingested by the Claude Code VS Code
 * extension via MCP tool `codebase:concurrent_research`.
 *
 * Graph topology:
 *
 *   [START]
 *     ↓
 *   supervisor.plan()          — classifies query into research domains
 *     ↓   ↓   ↓   ↓   ↓
 *   W1  W2  W3  W4  WN        — workers run concurrently via Promise.allSettled
 *     ↓   ↓   ↓   ↓   ↓
 *   supervisor.merge()         — aggregates findings into final summary
 *     ↓
 *   [END] → ResearchGraph
 *
 * Each worker:
 *   1. Qdrant semantic search (content + signature, or error named vector)
 *   2. Neo4j SIMILAR_TOPOLOGY neighbor expansion (optional, caseId required)
 *   3. bifrostChat synthesis → structured WorkerFinding
 *
 * Cache strategy:
 *   - Worker results: Redis 10-min TTL keyed by (domain + queryHash)
 *   - Final graph: Redis 5-min TTL keyed by (allDomains + queryHash)
 *   - L1→L2→L3 via bifrostChat for all Ollama calls
 *
 * Cost: ZERO (Ollama local + Bifrost semantic cache — no Anthropic API calls)
 *
 * @module
 */

import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { getRedis } from '$lib/server/redis.js';
import { extractStructured } from '$lib/server/ai/lang-extract.js';
import {
  resolveRuntimeConfig,
  type InferenceRuntimeConfig,
} from '$lib/server/ai/inference-configs.js';

// ── Domain taxonomy ────────────────────────────────────────────────────────────
// Matches the karpathy semantic tag vocabulary in codebase_chunks_768.
// 'error-patterns' uses the new `error` named vector (searchByError()).

export type ResearchDomain =
	| 'api-routes'
	| 'state-machines'
	| 'database'
	| 'error-patterns'
	| 'ml-inference'
	| 'auth'
	| 'cache'
	| 'rag-pipeline'
	| 'ui-components'
	| 'graph-db'
	| 'general';

/** Karpathy tag → Qdrant filter tag mapping for each domain */
const DOMAIN_TAGS: Record<ResearchDomain, string[]> = {
	'api-routes':    ['api-route'],
	'state-machines':['state-machine'],
	'database':      ['database'],
	'error-patterns':[], // uses error named vector, no tag filter
	'ml-inference':  ['ml-inference', 'embedding'],
	'auth':          ['auth'],
	'cache':         ['cache'],
	'rag-pipeline':  ['rag-pipeline', 'vector-search'],
	'ui-components': ['ui-component', 'page-component'],
	'graph-db':      ['graph-db'],
	'general':       [],  // no filter — broad search
};

/**
 * Domain-aware query prefix for vector steering.
 * When tags are empty (current state: all 15K points are domain="utility"),
 * we augment the embedding query so the vector similarity naturally routes
 * to domain-relevant chunks without requiring pre-filter tags.
 */
const DOMAIN_QUERY_PREFIX: Record<ResearchDomain, string> = {
	'api-routes':     'SvelteKit API route handler endpoint server request response',
	'state-machines': 'XState state machine actor transition event',
	'database':       'Drizzle ORM PostgreSQL database query schema table migration',
	'error-patterns': 'error handling catch exception failure diagnostic',
	'ml-inference':   'ONNX embedding inference model GPU CUDA tensor',
	'auth':           'authentication authorization session user login token',
	'cache':          'Redis cache TTL LRU memoization Bifrost',
	'rag-pipeline':   'RAG retrieval augmented generation Qdrant vector search embedding',
	'ui-components':  'Svelte component UI button dialog form layout',
	'graph-db':       'Neo4j graph node relationship topology pagerank',
	'general':        '',
};

/**
 * File-path heuristic filters per domain.
 * Used as a Qdrant payload filter when tags are empty — matches against
 * file_path substrings to steer retrieval toward relevant code areas.
 */
const DOMAIN_PATH_HINTS: Record<ResearchDomain, string[]> = {
	'api-routes':     ['routes/api/', '+server.ts'],
	'state-machines': ['machines/', 'xstate'],
	'database':       ['db/', 'drizzle', 'schema', 'migration'],
	'error-patterns': [],
	'ml-inference':   ['ai/', 'onnx/', 'gpu/', 'inference', 'embed'],
	'auth':           ['auth', 'session', 'login'],
	'cache':          ['cache/', 'redis', 'bifrost'],
	'rag-pipeline':   ['rag', 'retrieval', 'vector/', 'qdrant'],
	'ui-components':  ['components/', '.svelte'],
	'graph-db':       ['graph/', 'neo4j', 'topology'],
	'general':        [],
};

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WorkerChunk {
	path:       string;
	content:    string;
	score:      number;
	tags:       string[];
	gpuCluster?: number | null;
	pageRank?:   number | null;
}

export interface WorkerFinding {
	domain:        ResearchDomain;
	chunks:        WorkerChunk[];
	summary:       string;     // Ollama-generated synthesis of chunk evidence
	keyInsights:   string[];   // ≤5 bullet points for supervisor aggregation
	relevantPaths: string[];   // de-duped file paths (for Claude Code context)
	durationMs:    number;
	source:        'qdrant' | 'error-vector' | 'degraded';
	cached:        boolean;
}

export interface ResearchGraph {
  query: string;
  domains: ResearchDomain[];
  runtime: InferenceRuntimeConfig;
  workerFindings: WorkerFinding[];
  supervisorSummary: string;
  keyFindings: string[]; // cross-domain insights from supervisor
  actionItems: string[]; // concrete next steps for Claude Code
  totalChunks: number;
  totalDurationMs: number;
  cacheKey: string; // stable digest — expose for cache busting
  queryEmbedding?: number[]; // 768d vector used for initial Qdrant search
}

// ── Zod schemas for structured LLM outputs ────────────────────────────────────

const WorkerSynthesisSchema = z.object({
	summary:     z.string(),
	keyInsights: z.array(z.string()).max(5),
});

const SupervisorSynthesisSchema = z.object({
	summary:     z.string(),
	keyFindings: z.array(z.string()).max(8),
	actionItems: z.array(z.string()).max(5),
});

const DomainPlanSchema = z.object({
	domains: z.array(
		z.enum([
			'api-routes', 'state-machines', 'database', 'error-patterns',
			'ml-inference', 'auth', 'cache', 'rag-pipeline', 'ui-components',
			'graph-db', 'general',
		])
	).max(6),
	rationale: z.string(),
});

// ── FNV-1a hash (no crypto import — stays in L1 cache line) ──────────────────

function _ck(s: string): string {
	let h = 0x811c9dc5 >>> 0;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(36);
}

// ── Redis memoization ─────────────────────────────────────────────────────────

async function redisGet<T>(key: string): Promise<T | null> {
	try {
		const redis = getRedis();
		const hit = await redis.get(key);
		return hit ? (JSON.parse(hit) as T) : null;
	} catch { return null; }
}

async function redisSet(key: string, value: unknown, ttl: number): Promise<void> {
	try {
		const redis = getRedis();
		await redis.setex(key, ttl, JSON.stringify(value));
	} catch { /* Redis unavailable — degrade silently */ }
}

// ── Qdrant helpers ────────────────────────────────────────────────────────────

const QDRANT_URL  = ENV.QDRANT_URL;
const COLLECTION  = 'codebase_chunks_768';
const CHAT_MODEL  = ENV.OLLAMA_CHAT_MODEL;   // gemma4-legal-vlm (unified)

// ── Neo4j topology expansion ─────────────────────────────────────────────────

/**
 * Expand chunks via SIMILAR_TOPOLOGY edges in Neo4j.
 * Given top-scoring chunks' clusters, finds neighboring files in the SOM grid
 * and returns additional Qdrant chunks from those neighbors.
 */
async function expandViaTopology(
	topChunks: WorkerChunk[],
	queryVector: number[],
	limit: number,
): Promise<WorkerChunk[]> {
	// Extract unique clusters from top chunks
	const clusters = [...new Set(
		topChunks.map(c => c.gpuCluster).filter((c): c is number => c != null)
	)].slice(0, 3);
	if (!clusters.length) return [];

	try {
		// Find topology neighbors via pgvector (faster than Neo4j for this use case)
		const { pool: pgPool } = await import('$lib/server/db/client');
		const neighborResult = await pgPool.query<{ relative_path: string; gpu_cluster: number }>(
			`SELECT DISTINCT relative_path, gpu_cluster
			 FROM codebase_chunk_index
			 WHERE gpu_cluster = ANY($1)
			   AND relative_path NOT IN (SELECT UNNEST($2::text[]))
			 ORDER BY COALESCE(page_rank_score, 0) DESC
			 LIMIT $3`,
			[clusters, topChunks.map(c => c.path), limit]
		);

		if (!neighborResult.rows.length) return [];

		// Search Qdrant for chunks from neighbor paths using same query vector
		const neighborPaths = neighborResult.rows.map(r => r.relative_path);
		const body = {
			vector: { name: 'content', vector: queryVector },
			limit: limit * 2,
			with_payload: true,
			filter: {
				must: [{ key: 'file_path', match: { any: neighborPaths } }],
			},
		};

		const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(10_000),
		}).catch(() => null);

		if (!res?.ok) return [];
		const data = await res.json() as { result?: Array<{
			score: number;
			payload?: Record<string, unknown>;
		}> };

		return (data.result ?? []).slice(0, limit).map(h => ({
			path:       (h.payload?.file_path ?? h.payload?.relativePath ?? '') as string,
			content:    ((h.payload?.content ?? '') as string).slice(0, 400),
			score:      h.score * 0.9, // slight penalty for topology-expanded results
			tags:       Array.isArray(h.payload?.tags) ? h.payload.tags as string[] : [],
			gpuCluster: (h.payload?.neo4j_gpuCluster ?? h.payload?.som_cluster) as number | null,
			pageRank:   (h.payload?.pagerank_score ?? h.payload?.neo4j_pageRankScore) as number | null,
		}));
	} catch {
		return []; // Non-fatal — degrade silently
	}
}

/** Check if a named vector exists on the collection (cached after first call). */
let _namedVecCache: Set<string> | null = null;
async function qdrantHasNamedVector(name: string): Promise<boolean> {
	if (_namedVecCache) return _namedVecCache.has(name);
	try {
		const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, { signal: AbortSignal.timeout(5_000) });
		if (!res.ok) return false;
		const data = await res.json() as { result?: { config?: { params?: { vectors?: Record<string, unknown> } } } };
		const vecs = data.result?.config?.params?.vectors;
		_namedVecCache = new Set(vecs ? Object.keys(vecs) : []);
		return _namedVecCache.has(name);
	} catch { return false; }
}

async function embedText(text: string): Promise<number[] | null> {
	try {
		const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {
			method:  'POST',
			headers: { 'Content-Type': 'application/json' },
			body:    JSON.stringify({ model: 'embeddinggemma:latest', input: text }),
			signal:  AbortSignal.timeout(30_000),
		});
		if (!res.ok) return null;
		const data = await res.json() as { embeddings?: number[][] };
		return data.embeddings?.[0] ?? null;
	} catch { return null; }
}

async function searchQdrant(
	vector:     number[],
	vectorName: 'content' | 'signature' | 'error',
	limit:      number,
	tagFilter?: string[],
	pathHints?: string[],
): Promise<WorkerChunk[]> {
	// When path hints are active but tags aren't, over-fetch and post-filter
	const fetchLimit = (pathHints?.length && !tagFilter?.length) ? limit * 3 : limit;

	const body: Record<string, unknown> = {
		vector:       { name: vectorName, vector },
		limit:        fetchLimit,
		with_payload: true,
	};

	// Use tag filter only when tags are populated in the collection
	if (tagFilter?.length) {
		body.filter = {
			must: [{ key: 'tags', match: { any: tagFilter } }],
		};
	}
	const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
		method:  'POST',
		headers: { 'Content-Type': 'application/json' },
		body:    JSON.stringify(body),
		signal:  AbortSignal.timeout(15_000),
	}).catch(() => null);

	if (!res?.ok) return [];
	const data = await res.json() as { result?: Array<{
		id: number | string;
		score: number;
		payload?: Record<string, unknown>;
	}> };

	return (data.result ?? []).map(h => ({
		path:       (h.payload?.file_path ?? h.payload?.relativePath ?? '') as string,
		content:    ((h.payload?.content ?? '') as string).slice(0, 400),
		score:      h.score,
		tags:       Array.isArray(h.payload?.tags) ? h.payload.tags as string[] : [],
		gpuCluster: (h.payload?.neo4j_gpuCluster ?? h.payload?.som_cluster) as number | null,
		pageRank:   (h.payload?.pagerank_score ?? h.payload?.neo4j_pageRankScore) as number | null,
	})).sort((a, b) => {
		// Post-retrieval path-hint boost: domain-relevant paths rank higher
		if (!pathHints?.length) return b.score - a.score;
		const aHit = pathHints.some(h => a.path.toLowerCase().includes(h.toLowerCase()));
		const bHit = pathHints.some(h => b.path.toLowerCase().includes(h.toLowerCase()));
		if (aHit !== bHit) return aHit ? -1 : 1;
		return b.score - a.score;
	}).slice(0, limit);
}

// ── Supervisor: plan ──────────────────────────────────────────────────────────
/**
 * Plans which research domains to activate for a given query.
 * Uses lang-extract structured output (Zod-validated) via L1→L2→L3 cache.
 * Falls back to ['general'] on any error.
 */
async function supervisorPlan(query: string): Promise<ResearchDomain[]> {
	const cacheKey = `lg:plan:${_ck(query)}`;
	const cached = await redisGet<ResearchDomain[]>(cacheKey);
	if (cached) return cached;

	const result = await extractStructured(
		DomainPlanSchema,
		[
			'Given this codebase research query, select 2-5 most relevant research domains from the list.',
			'Choose domains where the query is most likely to find useful code evidence.',
			`Query: "${query}"`,
		].join('\n'),
		`Available domains: api-routes, state-machines, database, error-patterns, ml-inference, ` +
		`auth, cache, rag-pipeline, ui-components, graph-db, general`,
		{
			model:      CHAT_MODEL,
			cacheKey:   `lg:plan-llm:${_ck(query)}`,
			entityTags: ['langgraph', 'research-plan'],
			temperature: 0,
			maxTokens:   200,
		}
	);

	const domains: ResearchDomain[] = result.valid && result.data
		? result.data.domains as ResearchDomain[]
		: ['general'];

	// Always include 'general' as a fallback safety net
	if (!domains.includes('general') && domains.length < 3) {
		domains.push('general');
	}

	await redisSet(cacheKey, domains, 600);
	return domains;
}

// ── Worker: run one domain ────────────────────────────────────────────────────
/**
 * Single research worker — handles one semantic domain.
 * Searches Qdrant, synthesizes findings via Ollama, returns WorkerFinding.
 * Results are Redis-cached for 10 minutes by (domain + queryHash).
 */
async function runWorker(domain: ResearchDomain, query: string, limit: number, queryVector?: number[]): Promise<WorkerFinding> {
	const t0      = performance.now();
	const qHash   = _ck(query);
	const cacheKey = `lg:worker:${domain}:${qHash}:${limit}`;

	const cached = await redisGet<WorkerFinding>(cacheKey);
	if (cached) return { ...cached, cached: true };

	const tags    = DOMAIN_TAGS[domain];
	const pathHints = DOMAIN_PATH_HINTS[domain];
	const queryPrefix = DOMAIN_QUERY_PREFIX[domain];
	const useErrorVector = domain === 'error-patterns';
	// 'error' named vector only exists if Stage 2.5 enrichment has run;
	// fall back to 'content' vector for error-patterns domain
	const vecName = (useErrorVector && await qdrantHasNamedVector('error')) ? 'error' : 'content';

	// 1. Embed domain-augmented query (vector steering for domain relevance)
	// If queryVector is provided, use it (possibly skipping augmented embedding for now)
	// or re-embed if domain prefix is present.
	let vector = queryVector;
	if (queryPrefix || !vector) {
		const augmentedQuery = queryPrefix ? `${queryPrefix} — ${query}` : query;
		vector = await embedText(augmentedQuery) ?? undefined;
	}

	if (!vector) {
		return { domain, chunks: [], summary: 'Embedding failed', keyInsights: [], relevantPaths: [], durationMs: performance.now() - t0, source: 'degraded', cached: false };
	}

	// 2. Search Qdrant — 2-stage: tag filter first → fallback unfiltered
	// Path-hint rerank is always applied for domain-relevant boosting.
	const tagFilter = tags.length ? tags : undefined;
	const pathFilter = pathHints.length ? pathHints : undefined;

	let chunks = tagFilter
		? await searchQdrant(vector, vecName, limit, tagFilter, pathFilter)
		: [];

	// Fallback: if tag filter returned nothing (tags unpopulated or too narrow),
	// retry without tags — query augmentation + path-hint rerank still provide steering.
	if (!chunks.length) {
		chunks = await searchQdrant(vector, vecName, limit, undefined, pathFilter);
	}

	// 2b. Expand via topology neighbors (SIMILAR_TOPOLOGY graph adjacency)
	if (chunks.length > 0 && vector) {
		const topoChunks = await expandViaTopology(chunks, vector, Math.max(3, Math.floor(limit / 2)));
		if (topoChunks.length) {
			const existingPaths = new Set(chunks.map(c => c.path));
			const novel = topoChunks.filter(c => !existingPaths.has(c.path));
			chunks = [...chunks, ...novel].sort((a, b) => b.score - a.score).slice(0, limit);
		}
	}

	if (!chunks.length) {
		return { domain, chunks: [], summary: 'No relevant chunks found', keyInsights: [], relevantPaths: [], durationMs: performance.now() - t0, source: 'degraded', cached: false };
	}

	// 3. Synthesize via Ollama (L1→L2→L3 cache)
	const chunkContext = chunks.slice(0, 8).map(c =>
		`[score=${c.score.toFixed(3)}] ${c.path}\n${c.content}`
	).join('\n\n---\n\n');

	const synthesis = await extractStructured(
		WorkerSynthesisSchema,
		[
			`Research domain: ${domain}`,
			`Query: "${query}"`,
			'Synthesize the key findings from these code chunks.',
			'summary: 2-3 sentences describing what you found.',
			'keyInsights: up to 5 concrete bullet points.',
		].join('\n'),
		chunkContext,
		{
			model:      CHAT_MODEL,
			cacheKey:   `lg:synth:${domain}:${qHash}`,
			entityTags: ['langgraph', domain, 'worker-synthesis'],
			temperature: 0.1,
			maxTokens:   400,
		}
	);

	const finding: WorkerFinding = {
		domain,
		chunks,
		summary:       synthesis.valid ? (synthesis.data?.summary ?? '') : '',
		keyInsights:   synthesis.valid ? (synthesis.data?.keyInsights ?? []) : [],
		relevantPaths: [...new Set(chunks.map(c => c.path).filter(Boolean))].slice(0, 15),
		durationMs:    performance.now() - t0,
		source:        useErrorVector ? 'error-vector' : 'qdrant',
		cached:        false,
	};

	// Only cache if synthesis produced real content — skip-caching empty results prevents
	// stale "all-blank" entries from poisoning future runs.
	if (finding.summary || finding.keyInsights.length > 0) {
		await redisSet(cacheKey, finding, 600);
	}
	return finding;
}

// ── Supervisor: merge ─────────────────────────────────────────────────────────
/**
 * Merges all worker findings into a final coherent research report.
 * Uses L1→L2→L3 Ollama cache — repeated merges of same findings are free.
 */
async function supervisorMerge(
	query:          string,
	workerFindings: WorkerFinding[],
): Promise<{ supervisorSummary: string; keyFindings: string[]; actionItems: string[] }> {
	const successfulWorkers = workerFindings.filter(w => w.chunks.length > 0);

	if (!successfulWorkers.length) {
		return {
			supervisorSummary: 'No codebase evidence found across any research domain.',
			keyFindings:       [],
			actionItems:       ['Re-index the codebase via /api/codebase-index', 'Broaden the query'],
		};
	}

	const mergedContext = successfulWorkers.map(w =>
		`### ${w.domain} (${w.chunks.length} chunks)\n${w.summary}\nInsights:\n${w.keyInsights.map(i => `- ${i}`).join('\n')}`
	).join('\n\n');

	// Stable content hash: use top chunk paths (not summary text, which may be empty on first run)
	const contentHash = _ck(
		workerFindings.map(w =>
			`${w.domain}:${w.chunks.length}:${w.chunks.slice(0, 3).map(c => c.path).join(',')}`
		).join('|')
	);

	const synthesis = await extractStructured(
		SupervisorSynthesisSchema,
		[
			`Research query: "${query}"`,
			`You received findings from ${successfulWorkers.length} concurrent research workers.`,
			'Synthesize these into a unified research report.',
			'summary: 3-4 sentences, cross-domain perspective.',
			'keyFindings: up to 8 cross-domain insights.',
			'actionItems: up to 5 concrete next steps (for a developer reading this).',
		].join('\n'),
		mergedContext,
		{
			model:      CHAT_MODEL,
			cacheKey:   `lg:supervisor:${_ck(query)}:${contentHash}`,
			entityTags: ['langgraph', 'supervisor-merge'],
			temperature: 0.15,
			maxTokens:   600,
		}
	);

	return {
		supervisorSummary: synthesis.valid ? (synthesis.data?.summary ?? '') : mergedContext.slice(0, 800),
		keyFindings:       synthesis.valid ? (synthesis.data?.keyFindings ?? []) : [],
		actionItems:       synthesis.valid ? (synthesis.data?.actionItems ?? []) : [],
	};
}

// ── Exported internals (needed by SSE stream endpoint) ────────────────────────
export { supervisorPlan, runWorker, supervisorMerge };

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Run a concurrent LangGraph-style deep research session over the codebase index.
 *
 * Steps:
 *   1. supervisor.plan() — classify query into research domains
 *   2. Run all domain workers concurrently (Promise.allSettled)
 *   3. supervisor.merge() — synthesize findings into final report
 *
 * @param query      - Natural language research question
 * @param options    - Limit per worker, explicit domains, Qdrant filter
 */
export async function runConcurrentResearch(
	query: string,
	options?: {
		domains?:    ResearchDomain[];   // override auto-plan
		limitPerWorker?: number;          // chunks per domain (default 12)
		timeoutMs?:  number;              // per-worker timeout (default 45s)
	}
): Promise<ResearchGraph> {
	const t0 = performance.now();
	const limit = Math.min(options?.limitPerWorker ?? 12, 30);

	// Step 1: Plan
	const domains = options?.domains?.length
		? options.domains
		: await supervisorPlan(query);

	// Step 1.5: Embed base query
	const queryEmbedding = await embedText(query);

	// Step 2: Concurrent workers
	const settled = await Promise.allSettled(
	  domains.map(domain =>
	    Promise.race([
	      runWorker(domain, query, limit, queryEmbedding ?? undefined),
	      // Per-worker timeout — degraded finding on timeout
	      new Promise<WorkerFinding>((_, reject) =>
	        setTimeout(() => reject(new Error('worker timeout')), options?.timeoutMs ?? 45_000)
	      ),
	    ])
	  )
	);

	const workerFindings: WorkerFinding[] = settled.map((r, i) =>
		r.status === 'fulfilled'
			? r.value
			: ({
				domain:        domains[i],
				chunks:        [],
				summary:       `Worker timeout or error: ${(r as PromiseRejectedResult).reason?.message ?? 'unknown'}`,
				keyInsights:   [],
				relevantPaths: [],
				durationMs:    0,
				source:        'degraded' as const,
				cached:        false,
			})
	);

	// Step 3: Merge
	const { supervisorSummary, keyFindings, actionItems } = await supervisorMerge(query, workerFindings);

	const totalChunks = workerFindings.reduce((sum, w) => sum + w.chunks.length, 0);
	const graphCacheKey = `lg:graph:${_ck(query)}:${_ck(domains.join(','))}`;

	const graph: ResearchGraph = {
		query,
		domains,
		runtime:         resolveRuntimeConfig(),
		workerFindings,
		supervisorSummary,
		keyFindings,
		actionItems,
		totalChunks,
		totalDurationMs: Math.round(performance.now() - t0),
		cacheKey:        graphCacheKey.slice(-16),
		queryEmbedding:  queryEmbedding ?? undefined,
	};

	// Cache the full graph result (5 min) for repeated MCP calls with same query
	await redisSet(graphCacheKey, graph, 300);

	return graph;
}

/**
 * Format a ResearchGraph as a concise Markdown summary suitable for
 * injection into a Claude Code VS Code extension context window.
 *
 * Produces a structured document that Claude Code can:
 *   - Ingest as project context
 *   - Navigate via the relevantPaths list
 *   - Act on via actionItems
 */
export function formatGraphForClaudeCode(graph: ResearchGraph): string {
	const lines: string[] = [
		`# Codebase Research: ${graph.query}`,
		``,
		`> Domains: ${graph.domains.join(', ')} | Chunks: ${graph.totalChunks} | ${graph.totalDurationMs}ms`,
		`> Runtime: ${graph.runtime.profile} | backend=${graph.runtime.backend} | turboQuant=${graph.runtime.turboQuant} | rotorQuantKv=${graph.runtime.rotorQuantKv}`,
		``,
		`## Summary`,
		graph.supervisorSummary,
		``,
	];

	if (graph.keyFindings.length) {
		lines.push(`## Key Findings`, ...graph.keyFindings.map(f => `- ${f}`), ``);
	}

	if (graph.actionItems.length) {
		lines.push(`## Action Items`, ...graph.actionItems.map(a => `- [ ] ${a}`), ``);
	}

	// Per-domain breakdown
	lines.push(`## Domain Findings`);
	for (const w of graph.workerFindings) {
		if (!w.chunks.length) continue;
		lines.push(``, `### ${w.domain} (${w.chunks.length} chunks, ${Math.round(w.durationMs)}ms)`);
		if (w.summary) lines.push(w.summary);
		if (w.keyInsights.length) lines.push(...w.keyInsights.map(i => `- ${i}`));
		if (w.relevantPaths.length) {
			lines.push(`**Files:**`);
			lines.push(...w.relevantPaths.slice(0, 8).map(p => `  - \`${p}\``));
		}
	}

	// All unique relevant paths (for Claude Code context injection)
	const allPaths = [...new Set(
		graph.workerFindings.flatMap(w => w.relevantPaths)
	)].slice(0, 30);

	if (allPaths.length) {
		lines.push(``, `## Relevant Files (${allPaths.length})`, ...allPaths.map(p => `- \`${p}\``));
	}

	return lines.join('\n');
}
