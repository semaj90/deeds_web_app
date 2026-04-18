/**
 * MapReduce Matrix Analysis — Unified Pipeline Hit Query System
 *
 * Bridges MapReduce matrix operations, CouchDB glyph topology, cosine similarity
 * hits, and LangGraph-compatible synthesis for self-prompting deep research.
 *
 * Architecture:
 *   MAP phase   — Fan out to 5 data sources in parallel:
 *                 (1) chunk_hit_log → pipeline hit matrix (RAG/KAG/DAG/ACE)
 *                 (2) response_feedback → thumbs-up/down index
 *                 (3) CouchDB glyph_topology → manifold coordinates
 *                 (4) Redis cosine similarity cache → rerank scores
 *                 (5) qlora_examples → training signal quality tiers
 *
 *   REDUCE phase — Combine into a unified similarity matrix:
 *                  rows = unique chunk IDs
 *                  cols = [ragScore, kagScore, dagScore, aceScore, rerankScore,
 *                          feedbackScore, glyphConfidence, qloraQuality]
 *                  Reduce: weighted cosine similarity → ranked chunk list
 *
 *   SYNTHESIZE   — LangGraph-compatible output for Ollama deep research:
 *                  top research topics with self-prompts, pipeline hints,
 *                  and CouchDB topology context
 *
 * Data flow:
 *   chunk_hit_log ─┐
 *   response_feedback ─┤
 *   glyph_topology ─────┤─→ MAP → similarity matrix → REDUCE → ranked chunks
 *   Redis rerank cache ─┤                                 │
 *   qlora_examples ─────┘                                 ↓
 *                                              LangGraph synthesis prompt
 *                                                         │
 *                                                         ↓
 *                                              Ollama deep research topics
 *                                                         │
 *                                                         ↓
 *                                              FastMCP tool-callable output
 */

import { pool } from '$lib/server/db/client';
import { getRedis } from '$lib/server/redis.js';
import { bifrostChat } from '$lib/server/ollama.js';
import { queryHash } from './search-analytics.js';
import type { HitPipeline } from './search-analytics.js';

// ── Constants ──────────────────────────────────────────────────────────────

const COUCHDB_URL = process.env.COUCHDB_URL ?? 'http://localhost:5984';
const GLYPH_DB = 'glyph_topology';
const MATRIX_CACHE_KEY = 'mapreduce:matrix:';
const MATRIX_CACHE_TTL = 900; // 15 min
const MODEL = 'gemma4-legal:latest';

// Pipeline weight vector for cosine similarity aggregation
const PIPELINE_WEIGHTS: Record<string, number> = {
	rag:             0.25,
	kag:             0.20,
	dag:             0.15,
	ace:             0.20,
	reranker:        0.10,
	'reranker+qlora': 0.10,
};

// ── Types ──────────────────────────────────────────────────────────────────

export interface ChunkVector {
	chunkId:         string;
	filePath:        string | null;
	ragScore:        number;
	kagScore:        number;
	dagScore:        number;
	aceScore:        number;
	rerankScore:     number;
	feedbackScore:   number;  // normalized thumbs-up minus thumbs-down
	glyphConfidence: number;  // from CouchDB glyph topology
	qloraQuality:    number;  // 0.0–1.0 training signal quality
}

export interface MatrixRow {
	chunkId:     string;
	filePath:    string | null;
	scores:      Float64Array;  // 8 dimensions per chunk
	composite:   number;        // weighted aggregate
}

export interface MapReduceResult {
	matrix:       MatrixRow[];
	totalChunks:  number;
	pipelineCoverage: Record<string, number>;
	topChunks:    RankedChunk[];
	glyphTiles:   GlyphContext[];
	synthesis:    SynthesisOutput | null;
	cachedAt:     string | null;
	buildMs:      number;
}

export interface RankedChunk {
	chunkId:      string;
	filePath:     string | null;
	composite:    number;
	topPipeline:  string;
	feedback:     { up: number; down: number };
	qloraTier:    string | null;
}

export interface GlyphContext {
	caseId:       string;
	tileCount:    number;
	avgConfidence: number;
	topEntities:  string[];
	manifold4:    [number, number, number, number] | null;
}

export interface SynthesisOutput {
	topics:        SynthesisTopic[];
	matrixInsight: string;
	pipelineGaps:  string[];
	selfPrompts:   string[];
}

export interface SynthesisTopic {
	title:        string;
	description:  string;
	pipeline:     string;
	confidence:   number;
	selfPrompt:   string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAP PHASE — parallel data source extraction
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map: Extract pipeline hit vectors from chunk_hit_log.
 * Groups by chunk_id, computes per-pipeline average score.
 */
async function mapPipelineHits(days: number): Promise<Map<string, ChunkVector>> {
	const chunks = new Map<string, ChunkVector>();

	try {
		const { rows } = await pool.query<{
			chunk_id: string;
			pipeline: HitPipeline;
			avg_score: string;
			avg_rerank: string | null;
			hit_count: string;
			file_path: string | null;
		}>(`
			SELECT
				chunk_id,
				pipeline,
				AVG(score)::float       AS avg_score,
				AVG(rerank_score)::float AS avg_rerank,
				COUNT(*)                 AS hit_count,
				MAX(context_source)      AS file_path
			FROM chunk_hit_log
			WHERE created_at > NOW() - INTERVAL '1 day' * $1
			GROUP BY chunk_id, pipeline
		`, [days]);

		for (const row of rows) {
			const id = row.chunk_id;
			if (!chunks.has(id)) {
				chunks.set(id, {
					chunkId:         id,
					filePath:        row.file_path,
					ragScore:        0,
					kagScore:        0,
					dagScore:        0,
					aceScore:        0,
					rerankScore:     0,
					feedbackScore:   0,
					glyphConfidence: 0,
					qloraQuality:    0,
				});
			}
			const vec = chunks.get(id)!;
			const score = parseFloat(row.avg_score) || 0;
			const rerank = parseFloat(row.avg_rerank ?? '0') || 0;

			switch (row.pipeline) {
				case 'rag':             vec.ragScore  = score; break;
				case 'kag':             vec.kagScore  = score; break;
				case 'dag':             vec.dagScore  = score; break;
				case 'ace':             vec.aceScore  = score; break;
				case 'reranker':
				case 'reranker+qlora':  vec.rerankScore = Math.max(vec.rerankScore, rerank || score); break;
			}
			if (!vec.filePath && row.file_path) vec.filePath = row.file_path;
		}
	} catch {
		// DB unavailable — return empty map
	}

	return chunks;
}

/**
 * Map: Extract feedback scores from response_feedback.
 * Returns map of queryHash → { up, down, normalized }.
 */
async function mapFeedbackIndex(days: number): Promise<Map<string, { up: number; down: number; norm: number }>> {
	const feedback = new Map<string, { up: number; down: number; norm: number }>();

	try {
		const { rows } = await pool.query<{
			query_hash: string;
			thumbs_up: string;
			thumbs_down: string;
		}>(`
			SELECT
				query_hash,
				COUNT(*) FILTER (WHERE helpful = true)  AS thumbs_up,
				COUNT(*) FILTER (WHERE helpful = false) AS thumbs_down
			FROM response_feedback
			WHERE created_at > NOW() - INTERVAL '1 day' * $1
			GROUP BY query_hash
		`, [days]);

		for (const row of rows) {
			const up = parseInt(row.thumbs_up) || 0;
			const down = parseInt(row.thumbs_down) || 0;
			const total = up + down;
			feedback.set(row.query_hash, {
				up,
				down,
				norm: total > 0 ? (up - down) / total : 0,
			});
		}
	} catch {
		// DB unavailable
	}

	return feedback;
}

/**
 * Map: Extract glyph topology context from CouchDB.
 * Loads tile atlas metadata for available cases.
 */
async function mapGlyphTopology(): Promise<GlyphContext[]> {
	const contexts: GlyphContext[] = [];

	try {
		const res = await fetch(
			`${COUCHDB_URL}/${GLYPH_DB}/_all_docs?include_docs=true&limit=20`,
			{
				headers: { Accept: 'application/json' },
				signal: AbortSignal.timeout(5_000),
			}
		);

		if (!res.ok) return contexts;

		const data = await res.json() as {
			rows: Array<{ doc: {
				caseId?: string;
				tiles?: Array<{
					confidence?: number;
					entities?: string[];
					manifold4?: [number, number, number, number];
				}>;
			} }>;
		};

		for (const row of data.rows) {
			const doc = row.doc;
			if (!doc?.caseId || !doc?.tiles?.length) continue;

			const tiles = doc.tiles;
			const avgConf = tiles.reduce((s, t) => s + (t.confidence ?? 0), 0) / tiles.length;
			const entities = new Set<string>();
			let manifold: [number, number, number, number] | null = null;

			for (const t of tiles.slice(0, 10)) {
				(t.entities ?? []).forEach((e) => entities.add(e));
				if (!manifold && t.manifold4) manifold = t.manifold4;
			}

			contexts.push({
				caseId: doc.caseId,
				tileCount: tiles.length,
				avgConfidence: avgConf,
				topEntities: [...entities].slice(0, 12),
				manifold4: manifold,
			});
		}
	} catch {
		// CouchDB unavailable
	}

	return contexts;
}

/**
 * Map: Extract QLoRA quality tiers from qlora_examples.
 * Returns map of queryHash → quality (0.0–1.0).
 */
async function mapQloraQuality(days: number): Promise<Map<string, number>> {
	const quality = new Map<string, number>();

	try {
		const { rows } = await pool.query<{
			query_hash: string;
			quality_tier: string;
		}>(`
			SELECT query_hash, quality_tier
			FROM qlora_examples
			WHERE created_at > NOW() - INTERVAL '1 day' * $1
		`, [days]);

		for (const row of rows) {
			const tierScore = row.quality_tier === 'gold' ? 1.0
				: row.quality_tier === 'silver' ? 0.7
				: row.quality_tier === 'bronze' ? 0.4
				: 0.1;
			quality.set(row.query_hash, Math.max(quality.get(row.query_hash) ?? 0, tierScore));
		}
	} catch {
		// DB unavailable
	}

	return quality;
}

/**
 * Map: Extract cached cosine similarity scores from Redis.
 * These are rerank cache hits from the L1/L2 tiered cache.
 */
async function mapRerankCache(): Promise<Map<string, number>> {
	const scores = new Map<string, number>();

	try {
		const redis = getRedis();
		const keys = await redis.keys('rerank:score:*');
		if (keys.length === 0) return scores;

		const pipeline = redis.pipeline();
		for (const k of keys.slice(0, 200)) {
			pipeline.get(k);
		}
		const results = await pipeline.exec();

		for (let i = 0; i < (results?.length ?? 0); i++) {
			const [err, val] = results![i]!;
			if (err || !val) continue;
			const chunkId = keys[i]!.replace('rerank:score:', '');
			scores.set(chunkId, parseFloat(val as string) || 0);
		}
	} catch {
		// Redis unavailable
	}

	return scores;
}

// ═══════════════════════════════════════════════════════════════════════════
// REDUCE PHASE — combine into similarity matrix
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Reduce: Merge all map outputs into a unified 8-dimensional matrix.
 * Each row = chunk, each column = signal dimension.
 * Compute weighted composite score for ranking.
 */
function reduceToMatrix(
	chunks:   Map<string, ChunkVector>,
	feedback: Map<string, { up: number; down: number; norm: number }>,
	glyphs:   GlyphContext[],
	qlora:    Map<string, number>,
	rerank:   Map<string, number>,
): MatrixRow[] {
	// Merge feedback into chunk vectors
	for (const [hash, fb] of feedback) {
		// Match feedback to chunks via hash prefix overlap
		for (const [, vec] of chunks) {
			if (vec.chunkId.startsWith(hash.slice(0, 8))) {
				vec.feedbackScore = fb.norm;
			}
		}
	}

	// Merge QLoRA quality into chunk vectors
	for (const [hash, q] of qlora) {
		for (const [, vec] of chunks) {
			if (vec.chunkId.startsWith(hash.slice(0, 8))) {
				vec.qloraQuality = q;
			}
		}
	}

	// Merge rerank cache scores
	for (const [chunkId, score] of rerank) {
		const vec = chunks.get(chunkId);
		if (vec) vec.rerankScore = Math.max(vec.rerankScore, score);
	}

	// Merge glyph confidence (average across all glyph contexts)
	const avgGlyphConf = glyphs.length > 0
		? glyphs.reduce((s, g) => s + g.avgConfidence, 0) / glyphs.length
		: 0;
	for (const [, vec] of chunks) {
		vec.glyphConfidence = avgGlyphConf;
	}

	// Build matrix rows
	const rows: MatrixRow[] = [];
	for (const [, vec] of chunks) {
		const scores = new Float64Array([
			vec.ragScore,
			vec.kagScore,
			vec.dagScore,
			vec.aceScore,
			vec.rerankScore,
			vec.feedbackScore,
			vec.glyphConfidence,
			vec.qloraQuality,
		]);

		// Weighted composite: pipeline weights + bonus for feedback + qlora
		const composite =
			vec.ragScore        * 0.20 +
			vec.kagScore        * 0.15 +
			vec.dagScore        * 0.10 +
			vec.aceScore        * 0.20 +
			vec.rerankScore     * 0.15 +
			vec.feedbackScore   * 0.10 +
			vec.glyphConfidence * 0.05 +
			vec.qloraQuality    * 0.05;

		rows.push({
			chunkId: vec.chunkId,
			filePath: vec.filePath,
			scores,
			composite,
		});
	}

	// Sort descending by composite
	rows.sort((a, b) => b.composite - a.composite);

	return rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// SYNTHESIZE PHASE — LangGraph-compatible deep research output
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a ranked chunk list from the matrix for API output.
 */
function buildRankedChunks(
	matrix:   MatrixRow[],
	feedback: Map<string, { up: number; down: number; norm: number }>,
	qlora:    Map<string, number>,
	topK:     number,
): RankedChunk[] {
	return matrix.slice(0, topK).map((row) => {
		// Find which pipeline scored highest
		const pipelineNames = ['rag', 'kag', 'dag', 'ace', 'reranker', 'feedback', 'glyph', 'qlora'];
		let topIdx = 0;
		for (let i = 1; i < row.scores.length; i++) {
			if (row.scores[i]! > row.scores[topIdx]!) topIdx = i;
		}

		// Find feedback for this chunk
		let fb = { up: 0, down: 0 };
		for (const [hash, f] of feedback) {
			if (row.chunkId.startsWith(hash.slice(0, 8))) {
				fb = { up: f.up, down: f.down };
				break;
			}
		}

		// Find qlora tier
		let qloraTier: string | null = null;
		for (const [hash, q] of qlora) {
			if (row.chunkId.startsWith(hash.slice(0, 8))) {
				qloraTier = q >= 0.9 ? 'gold' : q >= 0.6 ? 'silver' : q >= 0.3 ? 'bronze' : null;
				break;
			}
		}

		return {
			chunkId: row.chunkId,
			filePath: row.filePath,
			composite: row.composite,
			topPipeline: pipelineNames[topIdx] ?? 'unknown',
			feedback: fb,
			qloraTier,
		};
	});
}

/**
 * Compute pipeline coverage — what % of chunks each pipeline contributed to.
 */
function computePipelineCoverage(chunks: Map<string, ChunkVector>): Record<string, number> {
	const total = chunks.size || 1;
	const counts: Record<string, number> = {
		rag: 0, kag: 0, dag: 0, ace: 0, reranker: 0, feedback: 0,
	};

	for (const [, vec] of chunks) {
		if (vec.ragScore > 0) counts.rag!++;
		if (vec.kagScore > 0) counts.kag!++;
		if (vec.dagScore > 0) counts.dag!++;
		if (vec.aceScore > 0) counts.ace!++;
		if (vec.rerankScore > 0) counts.reranker!++;
		if (vec.feedbackScore !== 0) counts.feedback!++;
	}

	return Object.fromEntries(
		Object.entries(counts).map(([k, v]) => [k, Math.round((v / total) * 100)])
	);
}

/**
 * Generate LangGraph-compatible synthesis via Ollama deep research.
 * Produces self-prompting topics based on matrix analysis gaps.
 */
async function synthesizeResearch(
	matrix:   MatrixRow[],
	coverage: Record<string, number>,
	glyphs:   GlyphContext[],
	topChunks: RankedChunk[],
): Promise<SynthesisOutput> {
	// Identify pipeline gaps (low coverage)
	const pipelineGaps = Object.entries(coverage)
		.filter(([, pct]) => pct < 20)
		.map(([name, pct]) => `${name}: ${pct}% coverage`);

	// Build synthesis prompt for Ollama
	const prompt = `You are a legal AI research analyst. Analyze the following retrieval pipeline matrix analysis and generate 5 advanced research topics for self-prompting improvement.

## Pipeline Coverage
${Object.entries(coverage).map(([k, v]) => `- ${k.toUpperCase()}: ${v}%`).join('\n')}

## Pipeline Gaps
${pipelineGaps.length > 0 ? pipelineGaps.join('\n') : 'No significant gaps detected.'}

## Top Performing Chunks (${topChunks.length})
${topChunks.slice(0, 5).map((c, i) => `${i + 1}. [${c.topPipeline}] ${c.filePath ?? c.chunkId} (score: ${c.composite.toFixed(3)}, feedback: +${c.feedback.up}/-${c.feedback.down}${c.qloraTier ? `, qlora: ${c.qloraTier}` : ''})`).join('\n')}

## Glyph Topology Context
${glyphs.length > 0
	? glyphs.slice(0, 3).map((g) => `- Case ${g.caseId}: ${g.tileCount} tiles, confidence: ${g.avgConfidence.toFixed(3)}, entities: ${g.topEntities.slice(0, 5).join(', ')}`).join('\n')
	: 'No glyph topology data available.'}

## Matrix Summary
- Total chunks analyzed: ${matrix.length}
- Score distribution: min=${matrix.length > 0 ? matrix[matrix.length - 1]!.composite.toFixed(3) : '0'}, max=${matrix.length > 0 ? matrix[0]!.composite.toFixed(3) : '0'}

Return a JSON array of exactly 5 research topics:
[
  {
    "title": "...",
    "description": "...",
    "pipeline": "rag|kag|dag|ace|cross-pipeline",
    "confidence": 0.0-1.0,
    "selfPrompt": "A specific question to ask the system to improve this area"
  }
]

Return ONLY the JSON array, no other text.`;

	try {
		const raw = await bifrostChat(
			[{ role: 'user', content: prompt }],
			MODEL,
			{ temperature: 0.4, maxTokens: 1500, timeoutMs: 30_000 }
		);

		const topics = parseSynthesisTopics(raw);

		return {
			topics,
			matrixInsight: `Analyzed ${matrix.length} chunks across ${Object.keys(coverage).length} pipelines. ${pipelineGaps.length} gaps detected.`,
			pipelineGaps,
			selfPrompts: topics.map((t) => t.selfPrompt),
		};
	} catch {
		// Ollama unavailable — return deterministic fallback
		return buildFallbackSynthesis(coverage, pipelineGaps, topChunks);
	}
}

/**
 * Parse LLM JSON output into typed SynthesisTopics.
 */
function parseSynthesisTopics(raw: string): SynthesisTopic[] {
	try {
		// Extract JSON array from LLM response
		const jsonMatch = raw.match(/\[[\s\S]*\]/);
		if (!jsonMatch) return [];

		const parsed = JSON.parse(jsonMatch[0]) as unknown[];
		if (!Array.isArray(parsed)) return [];

		return parsed.slice(0, 5).map((item: unknown, i: number) => {
			const t = item as Record<string, unknown>;
			return {
				title:       String(t.title ?? `Topic ${i + 1}`),
				description: String(t.description ?? ''),
				pipeline:    String(t.pipeline ?? 'cross-pipeline'),
				confidence:  Math.max(0, Math.min(1, Number(t.confidence) || 0.5)),
				selfPrompt:  String(t.selfPrompt ?? ''),
			};
		});
	} catch {
		return [];
	}
}

/**
 * Deterministic fallback when Ollama is unavailable.
 */
function buildFallbackSynthesis(
	coverage:     Record<string, number>,
	pipelineGaps: string[],
	topChunks:    RankedChunk[],
): SynthesisOutput {
	const topics: SynthesisTopic[] = [];

	// Generate topics from gaps
	for (const gap of pipelineGaps.slice(0, 3)) {
		const pipeline = gap.split(':')[0] ?? 'cross-pipeline';
		topics.push({
			title:       `Improve ${pipeline.toUpperCase()} coverage`,
			description: `${gap} — this pipeline is underrepresented in retrieval hits`,
			pipeline,
			confidence:  0.6,
			selfPrompt:  `What legal documents are being missed by the ${pipeline} pipeline?`,
		});
	}

	// Generate topic from top performing chunk
	if (topChunks.length > 0) {
		const top = topChunks[0]!;
		topics.push({
			title:       `Amplify ${top.topPipeline} signal`,
			description: `Top chunk scores ${top.composite.toFixed(3)} — investigate why this pipeline excels`,
			pipeline:    top.topPipeline,
			confidence:  0.8,
			selfPrompt:  `Why does ${top.filePath ?? top.chunkId} rank so high in ${top.topPipeline}?`,
		});
	}

	// Generate cross-pipeline topic
	topics.push({
		title:       'Cross-pipeline reranking audit',
		description: `Coverage: ${Object.entries(coverage).map(([k, v]) => `${k}=${v}%`).join(', ')}`,
		pipeline:    'cross-pipeline',
		confidence:  0.5,
		selfPrompt:  'Which queries benefit most from multi-pipeline retrieval?',
	});

	return {
		topics: topics.slice(0, 5),
		matrixInsight: `Fallback analysis: ${pipelineGaps.length} pipeline gaps detected.`,
		pipelineGaps,
		selfPrompts: topics.map((t) => t.selfPrompt),
	};
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

export interface MapReduceOptions {
	days?:          number;  // lookback window (default 7)
	topK?:          number;  // top chunks to return (default 20)
	synthesize?:    boolean; // run Ollama synthesis (default true)
	cacheResults?:  boolean; // cache in Redis (default true)
}

/**
 * Execute the full MapReduce matrix analysis pipeline.
 *
 * MAP:       5 parallel data source extractions
 * REDUCE:    8-dimensional similarity matrix
 * SYNTHESIZE: LangGraph-compatible Ollama deep research
 *
 * Results cached in Redis for 15 minutes per user.
 */
export async function executeMapReduceAnalysis(
	userId:  string,
	options: MapReduceOptions = {},
): Promise<MapReduceResult> {
	const start = Date.now();
	const days = Math.min(options.days ?? 7, 30);
	const topK = Math.min(options.topK ?? 20, 100);
	const synthesize = options.synthesize ?? true;
	const cacheResults = options.cacheResults ?? true;

	// Check Redis cache
	if (cacheResults) {
		try {
			const redis = getRedis();
			const cached = await redis.get(`${MATRIX_CACHE_KEY}${userId}`);
			if (cached) {
				const result = JSON.parse(cached) as MapReduceResult;
				result.cachedAt = result.cachedAt ?? new Date().toISOString();
				return result;
			}
		} catch {
			// Redis unavailable
		}
	}

	// ── MAP PHASE: parallel extraction ────────────────────────────────────

	const [chunks, feedback, glyphs, qlora, rerank] = await Promise.all([
		mapPipelineHits(days),
		mapFeedbackIndex(days),
		mapGlyphTopology(),
		mapQloraQuality(days),
		mapRerankCache(),
	]);

	// ── REDUCE PHASE: similarity matrix ──────────────────────────────────

	const matrix = reduceToMatrix(chunks, feedback, glyphs, qlora, rerank);
	const coverage = computePipelineCoverage(chunks);
	const topChunks = buildRankedChunks(matrix, feedback, qlora, topK);

	// ── SYNTHESIZE PHASE: Ollama deep research ───────────────────────────

	let synthesis: SynthesisOutput | null = null;
	if (synthesize) {
		synthesis = await synthesizeResearch(matrix, coverage, glyphs, topChunks);
	}

	const result: MapReduceResult = {
		matrix:           matrix.slice(0, topK),
		totalChunks:      chunks.size,
		pipelineCoverage: coverage,
		topChunks,
		glyphTiles:       glyphs,
		synthesis,
		cachedAt:         null,
		buildMs:          Date.now() - start,
	};

	// Cache result
	if (cacheResults) {
		try {
			const redis = getRedis();
			result.cachedAt = new Date().toISOString();
			await redis.set(
				`${MATRIX_CACHE_KEY}${userId}`,
				JSON.stringify(result, (_, v) => v instanceof Float64Array ? Array.from(v) : v),
				'EX', MATRIX_CACHE_TTL,
			);
		} catch {
			// Redis unavailable
		}
	}

	return result;
}

/**
 * Invalidate cached MapReduce results for a user.
 */
export async function invalidateMatrixCache(userId: string): Promise<void> {
	try {
		const redis = getRedis();
		await redis.del(`${MATRIX_CACHE_KEY}${userId}`);
	} catch {
		// Redis unavailable
	}
}

/**
 * Execute a self-prompt from a synthesis topic.
 * Routes through the appropriate pipeline (RAG/KAG/DAG/ACE).
 * Returns the LLM response for the self-prompt.
 */
export async function executeSelfPrompt(
	selfPrompt: string,
	pipeline:   string,
): Promise<{ answer: string; pipeline: string; durationMs: number }> {
	const start = Date.now();

	const systemPrompts: Record<string, string> = {
		rag:   'You are a RAG retrieval expert. Answer based on retrieved evidence chunks and legal documents.',
		kag:   'You are a KAG knowledge graph expert. Answer based on entity relationships and graph topology.',
		dag:   'You are a DAG dependency analyst. Answer based on directed acyclic graph analysis of code and document dependencies.',
		ace:   'You are an ACE context assembler. Answer based on multi-source context assembly across all pipelines.',
		'cross-pipeline': 'You are a cross-pipeline analyst. Synthesize insights from RAG, KAG, DAG, and ACE pipelines.',
	};

	const systemPrompt = systemPrompts[pipeline] ?? systemPrompts['cross-pipeline']!;

	try {
		const answer = await bifrostChat(
			[
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: selfPrompt },
			],
			MODEL,
			{ temperature: 0.3, maxTokens: 800, timeoutMs: 30_000 }
		);

		return { answer, pipeline, durationMs: Date.now() - start };
	} catch {
		return {
			answer: `[Ollama unavailable] Self-prompt for ${pipeline}: ${selfPrompt}`,
			pipeline,
			durationMs: Date.now() - start,
		};
	}
}
