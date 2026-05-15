import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { lookupErrorFingerprint, extractSymbols, findSimilarErrors } from './error-fingerprint.js';
import { multiTextRecall, type NgramHit } from './ngram-retrieval.js';
import { extractFilePaths } from './error-fingerprint.js';
import { aceTopkKey } from './cache-keys.js';
import { readLatestQdrantClusterTags, scoreClusterRelevance } from './cluster-tags-cache.js';
import { scoreCandidate } from '../kb/rerank-weight-loader.js';

export interface MultiLaneQuery {
	text: string;
	isError?: boolean;
	topK?: number;
	skipVectorLane?: boolean;
	filePath?: string;
	symbols?: string[];
}

export interface LaneResult {
	lane: 'hash' | 'sparse' | 'graph' | 'ace_cache' | 'symbol' | 'dense' | 'topology' | 'wiki' | 'error' | 'task' | 'research' | 'web_search' | 'cartridge' | 'summary';
	hits: MultiLaneHit[];
	latencyMs: number;
	cacheHit: boolean;
	skipped?: boolean;
	skipReason?: string;
}

export interface MultiLaneHit {
	id: string;
	text: string;
	filePath?: string;
	symbols?: string[];
	tags?: string[];
	score: number;
	lane: string;
	priorFix?: string;
	/** Karpathy blend score from Redis gpu:karpathy:scores (added by cartridge enrichment) */
	pagerank?: number;
}

export interface MultiLaneSynthesis {
	queryHash: string;
	lanes: LaneResult[];
	merged: MultiLaneHit[];
	topFiles: string[];
	topSymbols: string[];
	knownError: boolean;
	priorFix?: string;
	totalHits: number;
	durationMs: number;
	synthesisBlock: string;
}

function qHash(text: string): string {
	return createHash('sha256').update(text.slice(0, 512)).digest('hex').slice(0, 12);
}

function buildSynthesisBlock(result: Omit<MultiLaneSynthesis, 'synthesisBlock'>): string {
	const laneNames = result.lanes.map((l) => l.lane).join(', ');
	const knownLabel = result.knownError ? 'yes' : 'no';

	const lines: string[] = [
		'## Multi-Index Retrieval Summary',
		`**Query hash**: ${result.queryHash} | **Known error**: ${knownLabel}`,
	];

	if (result.priorFix) {
		lines.push(`**Prior fix**: ${result.priorFix}`);
	}

	if (result.topFiles.length > 0) {
		lines.push(`### Top files: ${result.topFiles.join(', ')}`);
	}

	if (result.topSymbols.length > 0) {
		lines.push(`### Top symbols: ${result.topSymbols.join(', ')}`);
	}

	lines.push(
		`### Relevant context (merged ${result.totalHits} hits across ${laneNames} lanes):`
	);

	for (const hit of result.merged.slice(0, 5)) {
		const loc = hit.filePath ? `\`${hit.filePath}\`` : '`(unknown)`';
		const snippet = hit.text.slice(0, 120).replace(/\n/g, ' ');
		lines.push(`- [${hit.lane}] ${loc} — ${snippet}`);
	}

	return lines.join('\n');
}

async function runHashLane(
	redis: Redis,
	pool: Pool,
	query: MultiLaneQuery
): Promise<LaneResult> {
	const t0 = Date.now();
	if (!query.isError) {
		return { lane: 'hash', hits: [], latencyMs: 0, cacheHit: false };
	}

	const fp = await lookupErrorFingerprint(redis, pool, query.text).catch(() => null);
	const latencyMs = Date.now() - t0;

	if (!fp) {
		return { lane: 'hash', hits: [], latencyMs, cacheHit: false };
	}

	const hit: MultiLaneHit = {
		id: fp.errorHash,
		text: fp.normalizedText,
		filePath: fp.topFiles[0],
		symbols: fp.topSymbols,
		score: 1.0,
		lane: 'hash',
		priorFix: fp.priorFix,
	};

	return { lane: 'hash', hits: [hit], latencyMs, cacheHit: true };
}

async function runSparseLane(pool: Pool, query: MultiLaneQuery): Promise<LaneResult> {
	const t0 = Date.now();
	const rawHits = await multiTextRecall(pool, query.text, query.topK ?? 10).catch(
		(): NgramHit[] => []
	);
	const latencyMs = Date.now() - t0;

	const hits: MultiLaneHit[] = rawHits.map((h) => ({
		id: h.id,
		text: h.text,
		filePath: h.filePath,
		symbols: h.symbols,
		tags: h.tags,
		score: h.similarity,
		lane: 'sparse',
	}));

	return { lane: 'sparse', hits, latencyMs, cacheHit: false };
}

async function runGraphLane(redis: Redis, query: MultiLaneQuery): Promise<LaneResult> {
	const t0 = Date.now();
	const paths = extractFilePaths(query.text);

	if (paths.length === 0) {
		return { lane: 'graph', hits: [], latencyMs: Date.now() - t0, cacheHit: false };
	}

	const lookups = paths.map(async (filePath) => {
		const nodeHash = createHash('sha1').update(filePath).digest('hex').slice(0, 12);
		const raw = await redis.get(`code:graph:node:${nodeHash}`).catch(() => null);
		if (!raw) return null;
		try {
			const node = JSON.parse(raw) as {
				id?: string;
				filePath?: string;
				symbols?: string[];
				tags?: string[];
				summary?: string;
			};
			const hit: MultiLaneHit = {
				id: node.id ?? nodeHash,
				text: node.summary ?? filePath,
				filePath: node.filePath ?? filePath,
				symbols: node.symbols,
				tags: node.tags,
				score: 0.7,
				lane: 'graph',
			};
			return hit;
		} catch {
			return null;
		}
	});

	const settled = await Promise.allSettled(lookups);
	const hits: MultiLaneHit[] = [];
	for (const r of settled) {
		if (r.status === 'fulfilled' && r.value !== null) {
			hits.push(r.value);
		}
	}

	return { lane: 'graph', hits, latencyMs: Date.now() - t0, cacheHit: hits.length > 0 };
}

async function runAceCacheLane(redis: Redis, queryHash: string): Promise<LaneResult> {
	const t0 = Date.now();
	const cacheKey = aceTopkKey(queryHash);
	const raw = await redis.get(cacheKey).catch(() => null);
	const latencyMs = Date.now() - t0;

	if (!raw) {
		return { lane: 'ace_cache', hits: [], latencyMs, cacheHit: false };
	}

	try {
		const parsed = JSON.parse(raw) as Array<{
			id?: string;
			text?: string;
			filePath?: string;
			symbols?: string[];
			tags?: string[];
			score?: number;
		}>;

		const hits: MultiLaneHit[] = parsed
			.filter((e) => e && e.id)
			.map((e) => ({
				id: e.id!,
				text: e.text ?? '',
				filePath: e.filePath,
				symbols: e.symbols,
				tags: e.tags,
				score: typeof e.score === 'number' ? e.score : 0.5,
				lane: 'ace_cache',
			}));

		return { lane: 'ace_cache', hits, latencyMs, cacheHit: true };
	} catch {
		return { lane: 'ace_cache', hits: [], latencyMs, cacheHit: false };
	}
}

async function runSymbolLane(redis: Redis, query: MultiLaneQuery): Promise<LaneResult> {
	const t0 = Date.now();
	const symbols = extractSymbols(query.text).slice(0, 5);

	if (symbols.length === 0) {
		return { lane: 'symbol', hits: [], latencyMs: Date.now() - t0, cacheHit: false };
	}

	const lookups = symbols.map(async (sym) => {
		const h = createHash('sha1').update(sym).digest('hex').slice(0, 12);
		const raw = await redis.get(`code:graph:node:${h}`).catch(() => null);
		if (!raw) return null;
		try {
			const node = JSON.parse(raw) as {
				id?: string;
				file_path?: string;
				symbols?: string[];
				tags?: string[];
				summary?: string;
				directFanIn?: number;
			};
			const hit: MultiLaneHit = {
				id: node.id ?? h,
				text: node.summary ?? sym,
				filePath: node.file_path,
				symbols: node.symbols,
				tags: node.tags,
				score: Math.min(0.5 + (node.directFanIn ?? 0) / 100, 0.95),
				lane: 'symbol',
			};
			return hit;
		} catch {
			return null;
		}
	});

	const settled = await Promise.allSettled(lookups);
	const hits: MultiLaneHit[] = [];
	for (const r of settled) {
		if (r.status === 'fulfilled' && r.value !== null) {
			hits.push(r.value);
		}
	}

	return { lane: 'symbol', hits, latencyMs: Date.now() - t0, cacheHit: hits.length > 0 };
}

async function runDenseLane(query: MultiLaneQuery, embedding: number[] | null): Promise<LaneResult> {
	const t0 = Date.now();

	// skipVectorLane=true means the caller (context-assembler) already ran Qdrant.
	// Return a stable skipped object so the lane still appears in the trace.
	if (query.skipVectorLane) {
		return {
			lane: 'dense',
			hits: [],
			latencyMs: 0,
			cacheHit: false,
			skipped: true,
			skipReason: 'skipVectorLane=true — Qdrant already ran in fetchRAGChunks',
		};
	}

	try {
		const { qdrant } = await import('../vector/qdrant-manager.js');
		if (!embedding) return { lane: 'dense', hits: [], latencyMs: Date.now() - t0, cacheHit: false };
		const searchResult = await qdrant._denseSearch({
			query: query.text,
			collection: 'codebase_chunks_768',
			queryEmbedding: embedding,
			limit: query.topK ?? 10,
		}).catch(() => null);
		const rawChunks = searchResult?.results ?? [];

		const hits: MultiLaneHit[] = rawChunks.map((c) => ({
			id: String(c.id ?? ''),
			text: String(c.payload?.content_preview ?? c.payload?.content ?? '').slice(0, 200),
			filePath: c.payload?.file_path as string | undefined,
			symbols: c.payload?.tags as string[] | undefined,
			tags: c.payload?.tags as string[] | undefined,
			score: c.score ?? 0.5,
			lane: 'dense' as const,
		})).filter((h) => h.id);

		return { lane: 'dense', hits, latencyMs: Date.now() - t0, cacheHit: false };
	} catch {
		return { lane: 'dense', hits: [], latencyMs: Date.now() - t0, cacheHit: false };
	}
}

/**
 * Lane 7 — glyph_cluster: score every cluster in the latest qdrant_cluster_tags artifact
 * against the query terms.  Top-3 clusters with score ≥ 0.05 become hits.
 * Non-fatal: returns empty lane if the artifact is absent or stale.
 */
function runTopologyLane(query: MultiLaneQuery): LaneResult {
	const t0 = Date.now();
	const entries = readLatestQdrantClusterTags();
	if (!entries.length) {
		return { lane: 'topology', hits: [], latencyMs: Date.now() - t0, cacheHit: false };
	}

	const queryLower = query.text.toLowerCase();
	const queryTerms = new Set(queryLower.split(/\W+/).filter((t) => t.length > 2));

	const scored = entries
		.map((e) => ({ entry: e, score: scoreClusterRelevance(e, queryLower, queryTerms) }))
		.filter(({ score }) => score >= 0.05)
		.sort((a, b) => b.score - a.score)
		.slice(0, 3);

	const hits: MultiLaneHit[] = scored.map(({ entry, score }) => {
		const repFile = (entry.topFiles as (string | null)[]).find((f): f is string => f != null) ?? undefined;
		return {
			id:       entry.clusterKey,
			text:     `${entry.topoClasses.slice(0, 3).join(', ')}: ${entry.topTags.slice(0, 4).map((t) => t.tag).join(', ')}`,
			filePath: repFile,
			tags:     entry.topTags.slice(0, 6).map((t) => t.tag),
			score,
			lane:     'topology' as const,
		};
	});

	return { lane: 'topology', hits, latencyMs: Date.now() - t0, cacheHit: hits.length > 0 };
}

const LANE_WEIGHT: Record<string, number> = {
	hash:       1.00,
	error:      0.95,
	ace_cache:  0.90,
	symbol:     0.80,
	summary:    0.85,
	dense:      0.75,
	topology:   0.70,
	wiki:       0.65,
	cartridge:  0.65,
	sparse:     0.60,
	graph:      0.55,
	task:       0.50,
	research:   0.50,
	web_search: 0.40,
};

/**
 * RRF (Reciprocal Rank Fusion) — Cormack et al. 2009.
 *   rrf_score(d) = Σ_lanes (lane_weight / (k + rank_lane(d)))
 *
 * Replaces the prior weighted-sum merge (which was labeled "RRF-style" but
 * actually summed `lane_score × lane_weight`). True RRF only uses the rank
 * within each lane, sidestepping the score-normalisation problem when lanes
 * produce non-comparable scores (cosine ∈ [0,1] vs ts_rank ∈ ℝ⁺ vs Redis
 * substring score ∈ {0.5, 1.0}).
 *
 * Drop-in per master_LLMS.md §6.3. k=60 is the standard from the original
 * paper and matches Elasticsearch / Solr / Qdrant hybrid search defaults.
 */
const RRF_K = 60;

function mergeAndRank(lanes: LaneResult[]): MultiLaneHit[] {
	const scoreAcc = new Map<string, number>();
	const best = new Map<string, MultiLaneHit>();

	for (const lane of lanes) {
		const weight = LANE_WEIGHT[lane.lane] ?? 0.5;
		// Lane hits are already in best-first order coming from each lane.
		// rank is 1-based: index 0 → rank 1.
		lane.hits.forEach((hit, idx) => {
			const rank = idx + 1;
			const contribution = weight / (RRF_K + rank);
			scoreAcc.set(hit.id, (scoreAcc.get(hit.id) ?? 0) + contribution);
			const existing = best.get(hit.id);
			if (!existing || hit.score > existing.score) {
				best.set(hit.id, hit);
			}
		});
	}

	return Array.from(best.values())
		.map((hit) => ({ ...hit, score: scoreAcc.get(hit.id) ?? hit.score }))
		.sort((a, b) => b.score - a.score);
}

/**
 * Cross-encoder rerank pass — wraps `rerankWithGemma4` with the
 * MultiLaneHit ↔ RerankCandidate adapter shape.
 *
 * Phase 1 wire-up per docs/audit/2026-05-11-feature-spec-implementation-audit.md
 * action #2. Gated behind `MULTILANE_CROSS_ENCODER_ENABLED` env flag (canary):
 * when off, returns input unchanged. When on, top-N candidates are rescored
 * by Gemma4 cross-encoder (with L0/L1 cache layers per cross-encoder-reranker.ts).
 *
 * Returns `null` on rerank failure so caller falls back to RRF order — never
 * throws, never blocks the synthesis lane.
 */
async function maybeCrossEncoderRerank(
	queryText: string,
	merged: MultiLaneHit[],
	opts: { topN?: number; returnTopK?: number; userId?: string } = {}
): Promise<MultiLaneHit[] | null> {
	if (process.env.MULTILANE_CROSS_ENCODER_ENABLED !== 'true') return null;
	if (merged.length === 0 || !queryText.trim()) return null;

	try {
		const { rerankWithGemma4 } = await import('../retrieval/cross-encoder-reranker.js');
		const candidates = merged.slice(0, opts.topN ?? 40).map((hit) => ({
			documentId: hit.id,
			content: hit.text ?? '',
			retrievalScore: hit.score,
			__hit: hit, // round-trip the original MultiLaneHit
		}));
		const { results } = await rerankWithGemma4(queryText, candidates, {
			topN: opts.topN ?? 40,
			returnTopK: opts.returnTopK ?? merged.length,
			userId: opts.userId,
		});
		// Map back, preserving lane provenance + adopting rerank score
		return results.map((r) => ({
			...(r.doc as { __hit: MultiLaneHit }).__hit,
			score: r.rerankScore,
		}));
	} catch (err) {
		console.warn('[multi-lane] cross-encoder rerank failed, falling back to RRF order:', err);
		return null;
	}
}

/**
 * Wiki lane — scans Redis `wiki:note:dir:*` for notes whose body or title
 * matches the query (case-insensitive substring). Bounded SCAN to avoid
 * blocking. Each match becomes a hit with the dir path as filePath.
 */
async function runWikiLane(redis: Redis, query: MultiLaneQuery): Promise<LaneResult> {
	const t0 = Date.now();
	const topK = query.topK ?? 5;
	const needle = (query.text ?? '').toLowerCase().trim();
	if (!needle || needle.length < 3) {
		return { lane: 'wiki', hits: [], latencyMs: Date.now() - t0, cacheHit: false, skipped: true, skipReason: 'query too short' };
	}
	try {
		const keys: string[] = [];
		let cursor = '0';
		// Bounded SCAN — max 20 iterations or 600 keys, COUNT 1000 per pass.
		// Wiki notes are sparse in the keyspace (~417 keys mixed among ~30k+
		// total), so a small COUNT misses most of them in 4 iterations.
		for (let i = 0; i < 20 && keys.length < 600; i++) {
			const r = await redis.scan(cursor, 'MATCH', 'wiki:note:dir:*', 'COUNT', '1000');
			cursor = r[0];
			keys.push(...r[1]);
			if (cursor === '0') break;
		}
		if (keys.length === 0) {
			return { lane: 'wiki', hits: [], latencyMs: Date.now() - t0, cacheHit: false };
		}
		const values = await redis.mget(...keys);
		const hits: MultiLaneHit[] = [];
		for (let i = 0; i < keys.length && hits.length < topK; i++) {
			const v = values[i];
			if (!v) continue;
			const lower = v.toLowerCase();
			if (!lower.includes(needle)) continue;
			const dirPath = keys[i].replace(/^wiki:note:dir:/, '').replace(/_/g, '/');
			// Score: 1.0 if needle appears in first 200 chars (likely title/intro), else 0.5
			const score = lower.indexOf(needle) < 200 ? 1.0 : 0.5;
			hits.push({
				id: keys[i],
				text: v.slice(0, 400),
				filePath: dirPath,
				tags: ['wiki', 'directory-card'],
				score,
				lane: 'wiki',
			});
		}
		hits.sort((a, b) => b.score - a.score);
		return { lane: 'wiki', hits, latencyMs: Date.now() - t0, cacheHit: hits.length > 0 };
	} catch {
		return { lane: 'wiki', hits: [], latencyMs: Date.now() - t0, cacheHit: false };
	}
}

/**
 * Error lane — pg_trgm similarity over error_fingerprints. Surfaces prior
 * fixes for queries that look like error messages or that fuzzy-match a
 * historical stack trace. Closes the loop with kag.recall_similar_fix:
 * any synth:loop run that touches a known error gets the prior fix as
 * a multi-lane hit (priorFix field populated).
 */
async function runErrorLane(pool: Pool, query: MultiLaneQuery): Promise<LaneResult> {
	const t0 = Date.now();
	const topK = Math.min(query.topK ?? 5, 5);
	try {
		const matches = await findSimilarErrors(pool, query.text, topK);
		const hits: MultiLaneHit[] = matches.map(m => ({
			id: m.errorHash,
			text: (m.normalizedText ?? '').slice(0, 400),
			filePath: m.topFiles?.[0],
			symbols: m.topSymbols ?? [],
			tags: ['error-fingerprint', m.priorFix ? 'has-prior-fix' : 'no-prior-fix'],
			score: typeof m.confidence === 'number' ? m.confidence : 0.5,
			lane: 'error',
			priorFix: m.priorFix,
		}));
		return { lane: 'error', hits, latencyMs: Date.now() - t0, cacheHit: hits.length > 0 };
	} catch {
		return { lane: 'error', hits: [], latencyMs: Date.now() - t0, cacheHit: false };
	}
}

/**
 * Task lane — surfaces historical KAG/DAG run outcomes.
 * Scans kag_dag_nodes for similar intents or node keys.
 */
async function runTaskLane(pool: Pool, query: MultiLaneQuery): Promise<LaneResult> {
	const t0 = Date.now();
	const topK = Math.min(query.topK ?? 5, 5);
	try {
		const { rows } = await pool.query(
			`SELECT node_key, node_type, status, duration_ms,
			        similarity(node_key || ' ' || node_type, $1) as score
			 FROM kag_dag_nodes
			 WHERE similarity(node_key || ' ' || node_type, $1) > 0.2
			 ORDER BY score DESC LIMIT $2`,
			[query.text, topK]
		);
		const hits: MultiLaneHit[] = rows.map(r => ({
			id: `task:${r.node_key}`,
			text: `Task: ${r.node_key} (${r.node_type}) - Status: ${r.status} (${r.duration_ms}ms)`,
			score: r.score,
			lane: 'task',
			tags: ['kag-dag', r.status],
		}));
		return { lane: 'task', hits, latencyMs: Date.now() - t0, cacheHit: hits.length > 0 };
	} catch {
		return { lane: 'task', hits: [], latencyMs: Date.now() - t0, cacheHit: false };
	}
}

/**
 * Research lane — surfaces findings from prior autonomous research missions.
 * Scans research_summaries table (vector-backed but supports trigram).
 */
async function runResearchLane(pool: Pool, query: MultiLaneQuery): Promise<LaneResult> {
	const t0 = Date.now();
	const topK = Math.min(query.topK ?? 5, 5);
	try {
		const { rows } = await pool.query(
			`SELECT id::text, summary, pipeline, relevance_score,
			        similarity(summary, $1) as trigram_score
			 FROM research_summaries
			 WHERE similarity(summary, $1) > 0.2
			 ORDER BY trigram_score DESC LIMIT $2`,
			[query.text, topK]
		);
		const hits: MultiLaneHit[] = rows.map(r => ({
			id: `res:${r.id}`,
			text: r.summary.slice(0, 400),
			score: r.trigram_score,
			lane: 'research',
			tags: ['research', r.pipeline],
		}));
		return { lane: 'research', hits, latencyMs: Date.now() - t0, cacheHit: hits.length > 0 };
	} catch {
		return { lane: 'research', hits: [], latencyMs: Date.now() - t0, cacheHit: false };
	}
}

// Patterns that indicate a query needs external web context vs. pure code lookup
const WEB_SEARCH_TRIGGERS = /\b(what is|what are|how does|how to|explain|definition of|overview of|documentation for|latest|news|recent|2024|2025|2026|legal precedent|case law|statute|regulation)\b/i;
const CODE_ONLY_PATTERNS  = /\b(function|class|import|export|const|let|var|interface|type|async|await|return|throw|error:|Error:|TypeError:|undefined|null|undefined is not)\b/;

/**
 * L10 — Web search lane (T4 trust, external content).
 * Fires only for information-seeking queries; skips for pure code debugging.
 * Results are sanitized and scored based on URL authority.
 */
async function runWebSearchLane(query: MultiLaneQuery): Promise<LaneResult> {
	const t0 = Date.now();
	const topK = Math.min(query.topK ?? 5, 5);

	// Skip for code-only queries (error messages, symbol lookups, import paths)
	const isCodeQuery = CODE_ONLY_PATTERNS.test(query.text) && !WEB_SEARCH_TRIGGERS.test(query.text);
	if (isCodeQuery || query.isError) {
		return {
			lane: 'web_search',
			hits: [],
			latencyMs: 0,
			cacheHit: false,
			skipped: true,
			skipReason: 'code/error query — web search skipped',
		};
	}

	try {
		const { webSearch } = await import('$lib/server/retrieval/web-search.js');
		const response = await webSearch(query.text, topK);
		const results = response?.results ?? [];
		if (!results.length) return { lane: 'web_search', hits: [], latencyMs: Date.now() - t0, cacheHit: false };

		const hits: MultiLaneHit[] = results.map((r) => ({
			id: `web:${encodeURIComponent(r.url).slice(0, 64)}`,
			text: `${r.title}: ${r.snippet.slice(0, 300)}`,
			filePath: r.url,
			score: 0.4,
			lane: 'web_search',
			tags: ['external', 'web'],
		}));
		return { lane: 'web_search', hits, latencyMs: Date.now() - t0, cacheHit: false };
	} catch {
		return { lane: 'web_search', hits: [], latencyMs: Date.now() - t0, cacheHit: false };
	}
}

async function runCartridgeLane(redis: Redis, query: MultiLaneQuery): Promise<LaneResult> {
	const t0 = Date.now();
	const topK = query.topK ?? 5;

	// Extract candidate file paths from query context or known symbols
	const candidatePaths: string[] = [];
	if (query.filePath) candidatePaths.push(query.filePath);
	if (query.symbols?.length) {
		// symbol → stable_key lookup via idx
		for (const sym of query.symbols.slice(0, 8)) {
			candidatePaths.push(sym);
		}
	}

	if (!candidatePaths.length) {
		return { lane: 'cartridge', hits: [], latencyMs: Date.now() - t0, cacheHit: false };
	}

	try {
		const pipeline = redis.pipeline();
		for (const p of candidatePaths) {
			pipeline.get(`ace:module:cartridge:${p}`);
		}
		const results = await pipeline.exec();
		if (!results) return { lane: 'cartridge', hits: [], latencyMs: Date.now() - t0, cacheHit: false };

		const queryWords = new Set(query.text.toLowerCase().split(/\W+/).filter(w => w.length > 2));
		const hits: MultiLaneHit[] = [];

		for (let i = 0; i < results.length; i++) {
			const [err, raw] = results[i] as [Error | null, string | null];
			if (err || !raw) continue;
			const c = JSON.parse(raw) as { p: string; t: string; e: string[]; tg: string[]; pr?: number; h: string };
			const tagOverlap = (c.tg ?? []).filter((tag: string) => queryWords.has(tag.toLowerCase())).length;
			const exportOverlap = (c.e ?? []).filter((ex: string) => queryWords.has(ex.toLowerCase())).length;
			const score = scoreCandidate({
				pagerank: c.pr,
				tag_matches: tagOverlap,
				export_matches: exportOverlap,
			});
			if (score < 0.05) continue;
			hits.push({
				id: `cartridge:${c.p}`,
				text: `[${c.t}] ${c.p} — exports: ${(c.e ?? []).slice(0, 6).join(', ')}`,
				filePath: c.p,
				score,
				lane: 'cartridge',
				tags: c.tg ?? [],
				pagerank: c.pr,
			});
		}

		hits.sort((a, b) => b.score - a.score);
		return { lane: 'cartridge', hits: hits.slice(0, topK), latencyMs: Date.now() - t0, cacheHit: false };
	} catch {
		return { lane: 'cartridge', hits: [], latencyMs: Date.now() - t0, cacheHit: false };
	}
}

async function enrichWithCartridgeData(redis: Redis, hits: MultiLaneHit[], queryText: string): Promise<MultiLaneHit[]> {
	const filePaths = [...new Set(hits.map(h => h.filePath).filter(Boolean))] as string[];
	if (!filePaths.length) return hits;

	const queryWords = new Set(queryText.toLowerCase().split(/\W+/).filter(w => w.length > 2));

	const pipeline = redis.pipeline();
	for (const fp of filePaths) {
		pipeline.get(`ace:module:cartridge:${fp}`);
	}
	const results = await pipeline.exec().catch(() => null);
	if (!results) return hits;

	const cartridgeMap = new Map<string, { pr?: number; tg?: string[]; e?: string[] }>();
	for (let i = 0; i < results.length; i++) {
		const [err, raw] = results[i] as [Error | null, string | null];
		if (err || !raw) continue;
		const c = JSON.parse(raw);
		cartridgeMap.set(filePaths[i], { pr: c.pr, tg: c.tg, e: c.e });
	}

	return hits.map(hit => {
		if (!hit.filePath) return hit;
		const c = cartridgeMap.get(hit.filePath);
		if (!c) return hit;
		const tagOverlap = (c.tg ?? []).filter(tag => queryWords.has(tag.toLowerCase())).length;
		const prBoost = Math.min((c.pr ?? 0) / 10, 1) * 0.10;
		const tagBoost = Math.min(tagOverlap / 5, 1) * 0.10;
		return { ...hit, score: Math.min(hit.score + prBoost + tagBoost, 1.0), pagerank: c.pr ?? hit.pagerank, tags: hit.tags?.length ? hit.tags : (c.tg ?? []) };
	});
}

/**
 * Summary lane — targets summary_lenses_768 for synthesized topological context.
 */
async function runSummaryLane(query: MultiLaneQuery, embedding: number[] | null): Promise<LaneResult> {
	const t0 = Date.now();
	if (!embedding) return { lane: 'summary', hits: [], latencyMs: 0, cacheHit: false };
	try {
		const { qdrant } = await import('../vector/qdrant-manager.js');
		const searchResult = await qdrant.hybridSearch({
			collection: 'summary_lenses_768',
			query: query.text,
			queryEmbedding: embedding,
			limit: query.topK ?? 10,
		}).catch(() => null);

		const rawChunks = searchResult?.results ?? [];
		const hits: MultiLaneHit[] = rawChunks.map((c) => ({
			id: String(c.id ?? ''),
			text: String(c.payload?.summary ?? c.payload?.content ?? '').slice(0, 400),
			filePath: c.payload?.file_path as string | undefined,
			symbols: c.payload?.tags as string[] | undefined,
			tags: c.payload?.tags as string[] | undefined,
			score: c.score ?? 0.5,
			lane: 'summary',
		})).filter((h) => h.id);

		return { lane: 'summary', hits, latencyMs: Date.now() - t0, cacheHit: false };
	} catch {
		return { lane: 'summary', hits: [], latencyMs: Date.now() - t0, cacheHit: false };
	}
}

export async function multiLaneSearch(
	redis: Redis,
	pool: Pool,
	query: MultiLaneQuery
): Promise<MultiLaneSynthesis> {
	const t0 = Date.now();
	const queryHash = qHash(query.text);

	const { generateSingleEmbedding } = await import('../grpc/embedding-client.js');
	const embedding = await generateSingleEmbedding(query.text).catch(() => null);

	const [hashResult, sparseResult, graphResult, aceCacheResult, symbolResult, denseResult, topologyResult, wikiResult, errorResult, taskResult, researchResult, webSearchResult, summaryResult] =
		await Promise.allSettled([
			runHashLane(redis, pool, query),
			runSparseLane(pool, query),
			runGraphLane(redis, query),
			runAceCacheLane(redis, queryHash),
			runSymbolLane(pool, query),
			runDenseLane(query, embedding),
			runTopologyLane(redis, query),
			runWikiLane(pool, query),
			runErrorLane(pool, query),
			runTaskLane(pool, query),
			runResearchLane(pool, query),
			runWebSearchLane(query),
			runSummaryLane(query, embedding),
		]);

	const lanes: LaneResult[] = [];

	const resolvedHash =
		hashResult.status === 'fulfilled'
			? hashResult.value
			: { lane: 'hash' as const, hits: [], latencyMs: 0, cacheHit: false };
	const resolvedSparse =
		sparseResult.status === 'fulfilled'
			? sparseResult.value
			: { lane: 'sparse' as const, hits: [], latencyMs: 0, cacheHit: false };
	const resolvedGraph =
		graphResult.status === 'fulfilled'
			? graphResult.value
			: { lane: 'graph' as const, hits: [], latencyMs: 0, cacheHit: false };
	const resolvedAceCache =
		aceCacheResult.status === 'fulfilled'
			? aceCacheResult.value
			: { lane: 'ace_cache' as const, hits: [], latencyMs: 0, cacheHit: false };
	const resolvedSymbol =
		symbolResult.status === 'fulfilled'
			? symbolResult.value
			: { lane: 'symbol' as const, hits: [], latencyMs: 0, cacheHit: false };
	const resolvedDense =
		denseResult.status === 'fulfilled'
			? denseResult.value
			: { lane: 'dense' as const, hits: [], latencyMs: 0, cacheHit: false };
	const resolvedTopology =
		topologyResult.status === 'fulfilled'
			? topologyResult.value
			: { lane: 'topology' as const, hits: [], latencyMs: 0, cacheHit: false };
	const resolvedWiki =
		wikiResult.status === 'fulfilled'
			? wikiResult.value
			: { lane: 'wiki' as const, hits: [], latencyMs: 0, cacheHit: false };
	const resolvedError =
		errorResult.status === 'fulfilled'
			? errorResult.value
			: { lane: 'error' as const, hits: [], latencyMs: 0, cacheHit: false };
	const resolvedTask =
		taskResult.status === 'fulfilled'
			? taskResult.value
			: { lane: 'task' as const, hits: [], latencyMs: 0, cacheHit: false };
	const resolvedResearch =
		researchResult.status === 'fulfilled'
			? researchResult.value
			: { lane: 'research' as const, hits: [], latencyMs: 0, cacheHit: false };
	const resolvedWebSearch =
		webSearchResult.status === 'fulfilled'
			? webSearchResult.value
			: { lane: 'web_search' as const, hits: [], latencyMs: 0, cacheHit: false };

	const resolvedSummary =
		summaryResult.status === 'fulfilled'
			? summaryResult.value
			: { lane: 'summary' as const, hits: [], latencyMs: 0, cacheHit: false };

	lanes.push(resolvedHash, resolvedSparse, resolvedGraph, resolvedAceCache, resolvedSymbol, resolvedDense, resolvedTopology, resolvedWiki, resolvedError, resolvedTask, resolvedResearch, resolvedWebSearch, resolvedSummary);

	const rrfMerged = mergeAndRank(lanes);
	// Optional cross-encoder rerank pass (gated behind MULTILANE_CROSS_ENCODER_ENABLED).
	// Returns null on flag-off OR rerank failure → fall back to RRF order.
	const reranked = await maybeCrossEncoderRerank(query.text, rrfMerged, {
		topN: 40,
		returnTopK: rrfMerged.length,
	});
	const merged = reranked ?? rrfMerged;

	const fileFreq = new Map<string, number>();
	const symbolFreq = new Map<string, number>();

	for (const hit of merged) {
		if (hit.filePath) {
			fileFreq.set(hit.filePath, (fileFreq.get(hit.filePath) ?? 0) + 1);
		}
		for (const sym of hit.symbols ?? []) {
			symbolFreq.set(sym, (symbolFreq.get(sym) ?? 0) + 1);
		}
	}

	const topFiles = Array.from(fileFreq.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([f]) => f);

	const topSymbols = Array.from(symbolFreq.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([s]) => s);

	const hashHit = resolvedHash.hits[0];
	const knownError = resolvedHash.cacheHit && resolvedHash.hits.length > 0;
	const priorFix = hashHit?.priorFix;

	const partial: Omit<MultiLaneSynthesis, 'synthesisBlock'> = {
		queryHash,
		lanes,
		merged,
		topFiles,
		topSymbols,
		knownError,
		priorFix,
		totalHits: merged.length,
		durationMs: Date.now() - t0,
	};

	const synthesisBlock = buildSynthesisBlock(partial);

	const result: MultiLaneSynthesis = { ...partial, synthesisBlock };

	// Fire-and-forget — guard with Promise.resolve so mocks/stubs that don't return a Promise don't throw.
	Promise.resolve(
		redis.setex(
			`ace:query:${queryHash}`,
			300,
			JSON.stringify({
				merged: merged.slice(0, 10),
				topFiles,
				topSymbols,
				knownError,
			})
		)
	).catch(() => {});

	// P4-A: Record lane hit distribution in context_timeline (fire-and-forget).
	const lanesHit = lanes.filter((l) => l.hits.length > 0 && !l.skipped).map((l) => l.lane);
	const lanesSkipped = lanes.filter((l) => l.skipped).map((l) => l.lane);
	pool
		.query(
			`INSERT INTO context_timeline (event_type, pipeline, payload)
			 VALUES ('multi_lane_retrieval', 'ace', $1::jsonb)
			 ON CONFLICT DO NOTHING`,
			[
				JSON.stringify({
					queryHash,
					knownError,
					priorFix: priorFix ? true : false,
					lanesHit,
					lanesSkipped,
					totalHits: merged.length,
					durationMs: result.durationMs,
					topFiles,
				}),
			]
		)
		.catch(() => {});

	return result;
}
