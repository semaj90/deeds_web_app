import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { lookupErrorFingerprint, extractSymbols } from './error-fingerprint.js';
import { multiTextRecall, type NgramHit } from './ngram-retrieval.js';
import { extractFilePaths } from './error-fingerprint.js';
import { aceTopkKey } from './cache-keys.js';
import { readLatestQdrantClusterTags, scoreClusterRelevance } from './cluster-tags-cache.js';

export interface MultiLaneQuery {
	text: string;
	isError?: boolean;
	topK?: number;
	skipVectorLane?: boolean;
}

export interface LaneResult {
	lane: 'hash' | 'ngram' | 'graph' | 'ace_cache' | 'symbol' | 'vector' | 'glyph_cluster';
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

async function runNgramLane(pool: Pool, query: MultiLaneQuery): Promise<LaneResult> {
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
		lane: 'ngram',
	}));

	return { lane: 'ngram', hits, latencyMs, cacheHit: false };
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

async function runVectorLane(query: MultiLaneQuery): Promise<LaneResult> {
	const t0 = Date.now();

	// skipVectorLane=true means the caller (context-assembler) already ran Qdrant.
	// Return a stable skipped object so the lane still appears in the trace.
	if (query.skipVectorLane) {
		return {
			lane: 'vector',
			hits: [],
			latencyMs: 0,
			cacheHit: false,
			skipped: true,
			skipReason: 'skipVectorLane=true — Qdrant already ran in fetchRAGChunks',
		};
	}

	try {
		const { qdrant } = await import('../vector/qdrant-manager.js');
		const { generateSingleEmbedding } = await import('../grpc/embedding-client.js');
		const embedding = await generateSingleEmbedding(query.text).catch(() => null);
		if (!embedding) return { lane: 'vector', hits: [], latencyMs: Date.now() - t0, cacheHit: false };
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
			lane: 'vector' as const,
		})).filter((h) => h.id);

		return { lane: 'vector', hits, latencyMs: Date.now() - t0, cacheHit: false };
	} catch {
		return { lane: 'vector', hits: [], latencyMs: Date.now() - t0, cacheHit: false };
	}
}

/**
 * Lane 7 — glyph_cluster: score every cluster in the latest qdrant_cluster_tags artifact
 * against the query terms.  Top-3 clusters with score ≥ 0.05 become hits.
 * Non-fatal: returns empty lane if the artifact is absent or stale.
 */
function runGlyphClusterLane(query: MultiLaneQuery): LaneResult {
	const t0 = Date.now();
	const entries = readLatestQdrantClusterTags();
	if (!entries.length) {
		return { lane: 'glyph_cluster', hits: [], latencyMs: Date.now() - t0, cacheHit: false };
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
			lane:     'glyph_cluster' as const,
		};
	});

	return { lane: 'glyph_cluster', hits, latencyMs: Date.now() - t0, cacheHit: hits.length > 0 };
}

const LANE_WEIGHT: Record<string, number> = {
	hash:          1.00,
	ace_cache:     0.90,
	symbol:        0.80,
	vector:        0.75,
	glyph_cluster: 0.70,
	ngram:         0.60,
	graph:         0.55,
	wiki_note:     0.65,
};

function mergeAndRank(lanes: LaneResult[]): MultiLaneHit[] {
	// RRF-style: accumulate blended scores across lanes; a chunk in N lanes ranks higher.
	const scoreAcc = new Map<string, number>();
	const best = new Map<string, MultiLaneHit>();

	for (const lane of lanes) {
		const weight = LANE_WEIGHT[lane.lane] ?? 0.5;
		for (const hit of lane.hits) {
			const blended = hit.score * weight;
			scoreAcc.set(hit.id, (scoreAcc.get(hit.id) ?? 0) + blended);
			const existing = best.get(hit.id);
			if (!existing || hit.score > existing.score) {
				best.set(hit.id, hit);
			}
		}
	}

	return Array.from(best.values())
		.map((hit) => ({ ...hit, score: scoreAcc.get(hit.id) ?? hit.score }))
		.sort((a, b) => b.score - a.score);
}

export async function multiLaneSearch(
	redis: Redis,
	pool: Pool,
	query: MultiLaneQuery
): Promise<MultiLaneSynthesis> {
	const t0 = Date.now();
	const queryHash = qHash(query.text);

	const [hashResult, ngramResult, graphResult, aceCacheResult, symbolResult, vectorResult, glyphClusterResult] = await Promise.allSettled([
		runHashLane(redis, pool, query),
		runNgramLane(pool, query),
		runGraphLane(redis, query),
		runAceCacheLane(redis, queryHash),
		runSymbolLane(redis, query),
		runVectorLane(query),
		Promise.resolve(runGlyphClusterLane(query)),
	]);

	const lanes: LaneResult[] = [];

	const resolvedHash =
		hashResult.status === 'fulfilled'
			? hashResult.value
			: { lane: 'hash' as const, hits: [], latencyMs: 0, cacheHit: false };
	const resolvedNgram =
		ngramResult.status === 'fulfilled'
			? ngramResult.value
			: { lane: 'ngram' as const, hits: [], latencyMs: 0, cacheHit: false };
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
	const resolvedVector =
		vectorResult.status === 'fulfilled'
			? vectorResult.value
			: { lane: 'vector' as const, hits: [], latencyMs: 0, cacheHit: false };
	const resolvedGlyphCluster =
		glyphClusterResult.status === 'fulfilled'
			? glyphClusterResult.value
			: { lane: 'glyph_cluster' as const, hits: [], latencyMs: 0, cacheHit: false };

	lanes.push(resolvedHash, resolvedNgram, resolvedGraph, resolvedAceCache, resolvedSymbol, resolvedVector, resolvedGlyphCluster);

	const merged = mergeAndRank(lanes);

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
