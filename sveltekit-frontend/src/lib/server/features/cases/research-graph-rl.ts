/**
 * research-graph-rl.ts
 *
 * PyTorch-backed knowledge graph + RL policy over `research_summaries`.
 *
 * Four public APIs:
 *   buildResearchGraph()       — cluster summaries with GPU k-means, compute
 *                                PageRank over cosine adjacency, write results
 *                                to Redis + optional Neo4j
 *   computeRlPolicy()          — derive per-pipeline reward weights from
 *                                feedback + QLoRA examples via rewardScoreGPU
 *   searchWithTagEmbedding()   — attentionScoreGPU-weighted cosine+tag search
 *   runResearchRlLoop()        — LangGraph StateGraph:
 *                                Retrieve → Rerank → Generate → Evaluate → Update
 *
 * Execution path (GPU functions from graph-ml-client):
 *   runKMeans       — RTX 3060 Ti CUDA → gRPC → CPU JS fallback
 *   runPageRank     — same cascade
 *   scoreAttention  — same cascade
 *   scoreGRPOReward — same cascade
 */

import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { getRedis, setJsonWithTtl, getJson } from '$lib/server/redis.js';
import {
	runKMeans,
	runPageRank,
	scoreAttention,
	scoreGRPOReward,
	rewardScoreGPU,
} from '$lib/server/grpc/graph-ml-client.js';
import type { ResearchSummary } from '$lib/server/db/schema-postgres.js';
import { contextTimeline }     from '$lib/server/db/schema-postgres.js';

// ── Constants ───────────────────────────────────────────────────────────────

const GRAPH_CLUSTERS    = 20;           // k for k-means clustering
const ADJACENCY_SIM     = 0.70;         // cosine threshold for edge creation
const PAGERANK_DAMPING  = 0.85;
const PAGERANK_ITERS    = 100;
const REDIS_GRAPH_KEY   = 'ace:research:graph';
const REDIS_POLICY_KEY  = 'ace:research:policy';
const REDIS_GRAPH_TTL   = 6 * 60 * 60; // 6 h
const REDIS_POLICY_TTL  = 2 * 60 * 60; // 2 h
const MAX_GRAPH_ROWS    = 5_000;        // cap DB fetch for large tables
const DIM               = 768;

// ── Shared types ────────────────────────────────────────────────────────────

export interface GraphCluster {
	id:         number;
	centroid:   number[];       // 768-dim
	memberIds:  string[];       // research_summary UUIDs
	pageRank:   number;         // authority score for this cluster
}

export interface GraphBuildResult {
	clusters:       GraphCluster[];
	totalSummaries: number;
	edgeCount:      number;
	durationMs:     number;
	source:         string;     // 'gpu' | 'cpu' (from runKMeans)
}

export interface RlPolicyWeights {
	ace:       number;
	kag:       number;
	dag:       number;
	rag:       number;
	codebase:  number;
	updatedAt: string;
}

export interface TagSearchResult {
	id:             string;
	summary:        string;
	title:          string | null;
	relevanceScore: number;
	entityTags:     string[];
	cluster:        number | null;
	pageRank:       number;
	attentionScore: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Dot-product cosine similarity for two equal-length Float32Array vectors.
 * Assumes inputs are L2-normalised (unit length).
 */
function cosineSim(a: Float32Array, b: Float32Array): number {
	let dot = 0;
	for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
	return dot;
}

/** L2-normalise a Float32Array in place, returns the same array. */
function l2Norm(v: Float32Array): Float32Array {
	let sq = 0;
	for (let i = 0; i < v.length; i++) sq += v[i] * v[i];
	const len = Math.sqrt(sq) || 1;
	for (let i = 0; i < v.length; i++) v[i] /= len;
	return v;
}

/** Build a flat Float32Array matrix (N × DIM) from row embeddings. */
function buildEmbeddingMatrix(rows: ResearchSummary[]): Float32Array {
	const n = rows.length;
	const mat = new Float32Array(n * DIM);
	for (let i = 0; i < n; i++) {
		// node-postgres returns pgvector as a string "[v1,v2,...]" — parse it
		let raw = rows[i].embedding as unknown as number[] | string | null;
		if (typeof raw === 'string') {
			try { raw = JSON.parse(raw) as number[]; } catch { raw = null; }
		}
		if (Array.isArray(raw) && raw.length === DIM) {
			const vec = l2Norm(new Float32Array(raw));
			mat.set(vec, i * DIM);
		}
		// rows with no embedding leave zeros → they cluster around origin
	}
	return mat;
}

// ── Build Research Graph ─────────────────────────────────────────────────────

/**
 * Load research_summaries with embeddings, cluster via GPU k-means, compute
 * PageRank over a cosine-similarity adjacency matrix, then write cluster
 * assignments + centroids + pagerank scores to Redis.
 *
 * Optionally also writes SIMILAR_RESEARCH edges to Neo4j when the driver is
 * available (fire-and-forget, non-fatal).
 */
export async function buildResearchGraph(): Promise<GraphBuildResult> {
	const t0 = Date.now();

	// 1. Fetch summaries that have an embedding
	const rows = await db.execute(sql`
		SELECT id, source, pipeline, entity_type, query, query_hash,
		       title, url, entity_tags, relevance_score, embedding,
		       created_at
		FROM   research_summaries
		WHERE  embedding IS NOT NULL
		LIMIT  ${MAX_GRAPH_ROWS}
	`);
	const summaries = (rows as unknown as { rows: ResearchSummary[] }).rows;
	if (!summaries.length) {
		return {
			clusters: [], totalSummaries: 0, edgeCount: 0,
			durationMs: Date.now() - t0, source: 'noop',
		};
	}

	// 2. Build embedding matrix
	const matrix = buildEmbeddingMatrix(summaries);
	const n      = summaries.length;

	// 3. GPU k-means (async — RTX 3060 Ti CUDA → gRPC → CPU JS fallback)
	const k  = Math.min(GRAPH_CLUSTERS, Math.floor(n / 2) || 1);
	const km = await runKMeans(matrix, n, DIM, k);

	// 4. Build sparse cosine adjacency for PageRank
	const adjEdges: { from: number; to: number }[] = [];
	const adjFlat = new Float32Array(n * n);
	for (let i = 0; i < n; i++) {
		const vi = new Float32Array(matrix.buffer, i * DIM * 4, DIM);
		for (let j = i + 1; j < n; j++) {
			const vj = new Float32Array(matrix.buffer, j * DIM * 4, DIM);
			const sim = cosineSim(vi, vj);
			if (sim >= ADJACENCY_SIM) {
				adjFlat[i * n + j] = sim;
				adjFlat[j * n + i] = sim;
				adjEdges.push({ from: i, to: j });
			}
		}
	}

	// 5. GPU PageRank (async)
	const pr = await runPageRank(adjFlat, n, PAGERANK_DAMPING, PAGERANK_ITERS);

	// 6. Assemble clusters with member IDs + centroid + cluster-level pagerank
	const clusterMap: Map<number, { memberIds: string[]; pageRankSum: number }> = new Map();
	for (let i = 0; i < n; i++) {
		const cid = km.assignments[i];
		if (!clusterMap.has(cid)) clusterMap.set(cid, { memberIds: [], pageRankSum: 0 });
		const entry = clusterMap.get(cid)!;
		entry.memberIds.push(summaries[i].id);
		entry.pageRankSum += pr.scores[i] ?? 0;
	}

	const clusters: GraphCluster[] = [];
	for (const [cid, entry] of clusterMap) {
		const centroid = Array.from(km.centroids.slice(cid * DIM, (cid + 1) * DIM));
		clusters.push({
			id:        cid,
			centroid,
			memberIds: entry.memberIds,
			pageRank:  entry.memberIds.length > 0
				? entry.pageRankSum / entry.memberIds.length
				: 0,
		});
	}
	clusters.sort((a, b) => b.pageRank - a.pageRank);

	// 7. Persist to Redis (omit centroid vectors to keep slim)
	const slimClusters = clusters.map(c => ({
		id:        c.id,
		memberIds: c.memberIds,
		pageRank:  c.pageRank,
		size:      c.memberIds.length,
	}));
	await setJsonWithTtl(
		REDIS_GRAPH_KEY,
		{ clusters: slimClusters, totalSummaries: n, builtAt: new Date().toISOString() },
		REDIS_GRAPH_TTL
	);

	// 8. Write per-summary cluster assignment to Neo4j (fire-and-forget)
	syncToNeo4j(summaries, km.assignments, pr.scores).catch(() => { /* ignore */ });

	return {
		clusters,
		totalSummaries: n,
		edgeCount:       adjEdges.length,
		durationMs:      Date.now() - t0,
		source:          km.source,
	};
}

/** Fire-and-forget: write cluster assignments + SIMILAR_RESEARCH edges to Neo4j. */
async function syncToNeo4j(
	summaries: ResearchSummary[],
	assignments: Int32Array,
	pageRanks: Float32Array,
): Promise<void> {
	try {
		const { ensureNeo4jDriver } = await import('$lib/server/connections/connection-pool.js');
		const driver = ensureNeo4jDriver();
		if (!driver) return;
		const session = driver.session();
		try {
			// 1. Upsert ResearchSummary nodes with cluster metadata
			const batch = summaries.map((s, i) => ({
				id:       s.id,
				query:    s.query,
				cluster:  assignments[i],
				pageRank: pageRanks[i] ?? 0,
				pipeline: s.pipeline,
				source:   s.source,
			}));
			await session.run(`
				UNWIND $batch AS row
				MERGE (n:ResearchSummary { id: row.id })
				SET   n.query    = row.query,
				      n.cluster  = row.cluster,
				      n.pageRank = row.pageRank,
				      n.pipeline = row.pipeline,
				      n.source   = row.source
			`, { batch });

			// 2. Build SIMILAR_RESEARCH edges: connect adjacent members within each
			//    cluster (chain topology — O(n) edges, not O(n²)).
			//    Cap at 6 members per cluster to keep edge count bounded.
			const clusterMembers: Map<number, string[]> = new Map();
			for (let i = 0; i < summaries.length; i++) {
				const cid = assignments[i];
				if (!clusterMembers.has(cid)) clusterMembers.set(cid, []);
				const members = clusterMembers.get(cid)!;
				if (members.length < 6) members.push(summaries[i].id);
			}
			const edges: { fromId: string; toId: string; cluster: number }[] = [];
			for (const [cid, members] of clusterMembers) {
				for (let j = 0; j < members.length - 1; j++) {
					edges.push({ fromId: members[j], toId: members[j + 1], cluster: cid });
				}
			}
			if (edges.length > 0) {
				await session.run(`
					UNWIND $edges AS e
					MATCH (a:ResearchSummary { id: e.fromId })
					MATCH (b:ResearchSummary { id: e.toId   })
					MERGE (a)-[r:SIMILAR_RESEARCH]->(b)
					SET   r.cluster = e.cluster
				`, { edges });

				// RL audit trail — one graph_edge event per sync batch
				db.insert(contextTimeline).values({
					sessionId:  '',
					eventType:  'graph_edge',
					pipeline:   'ace',
					payload:    {
						edgesCreated:  edges.length,
						clusters:      clusterMembers.size,
						summariesSync: summaries.length,
						relationship:  'SIMILAR_RESEARCH',
					} as Record<string, unknown>,
				}).catch(() => { /* non-fatal */ });
			}
		} finally {
			await session.close();
		}
	} catch { /* driver not available — skip */ }
}

// ── RL Policy ───────────────────────────────────────────────────────────────

/**
 * Compute per-pipeline reward weights from thumbs-up/down feedback and
 * QLoRA quality scores. Uses scoreGRPOReward to compute cosine-based reward
 * between response embeddings and feedback signals.
 *
 * Result is written to Redis and returned.
 */
export async function computeRlPolicy(): Promise<RlPolicyWeights> {
	// Load response_feedback counts per pipeline
	const feedbackRows = await db.execute(sql`
		SELECT pipeline,
		       COUNT(*) FILTER (WHERE rating = 'up')   AS ups,
		       COUNT(*) FILTER (WHERE rating = 'down') AS downs
		FROM   response_feedback
		WHERE  pipeline IS NOT NULL
		GROUP  BY pipeline
	`);
	const feedbackMap: Map<string, { ups: number; downs: number }> = new Map();
	for (const row of (feedbackRows as unknown as { rows: { pipeline: string; ups: string; downs: string }[] }).rows) {
		feedbackMap.set(row.pipeline, {
			ups:   parseInt(row.ups   || '0', 10),
			downs: parseInt(row.downs || '0', 10),
		});
	}

	// Load QLoRA example quality scores per pipeline
	const qloraRows = await db.execute(sql`
		SELECT pipeline_hits ->> 'pipeline' AS pipeline,
		       AVG(response_score)::text    AS avg_score,
		       COUNT(*)::text               AS count
		FROM   qlora_examples
		WHERE  response_score IS NOT NULL
		GROUP  BY pipeline_hits ->> 'pipeline'
	`);
	const qloraMap: Map<string, number> = new Map();
	for (const row of (qloraRows as unknown as { rows: { pipeline: string; avg_score: string; count: string }[] }).rows) {
		if (row.pipeline) qloraMap.set(row.pipeline, parseFloat(row.avg_score || '0.5'));
	}

	// Compute reward weight per known pipeline
	const pipelines: Array<keyof Omit<RlPolicyWeights, 'updatedAt'>> = ['ace', 'kag', 'dag', 'rag', 'codebase'];
	const weights: Partial<Record<string, number>> = {};

	for (const pipeline of pipelines) {
		const fb     = feedbackMap.get(pipeline) ?? { ups: 0, downs: 0 };
		const total  = fb.ups + fb.downs || 1;
		const fbRate = fb.ups / total;                   // 0–1
		const qlora  = qloraMap.get(pipeline) ?? 0.5;   // 0–1

		// Combine as a reward signal vector (query + generated pseudo-response)
		const queryVec = new Float32Array(DIM).fill(fbRate);
		const respVec  = new Float32Array(DIM).fill(qlora);
		const { reward } = await scoreGRPOReward(queryVec, respVec, DIM);

		// Clamp to [0.05, 2.0] so no pipeline is completely suppressed
		weights[pipeline] = Math.min(2.0, Math.max(0.05, (reward + fbRate + qlora) / 3 * 2));
	}

	const policy: RlPolicyWeights = {
		ace:       weights['ace']      ?? 1.0,
		kag:       weights['kag']      ?? 1.0,
		dag:       weights['dag']      ?? 1.0,
		rag:       weights['rag']      ?? 1.0,
		codebase:  weights['codebase'] ?? 1.0,
		updatedAt: new Date().toISOString(),
	};

	await setJsonWithTtl(REDIS_POLICY_KEY, policy, REDIS_POLICY_TTL);

	return policy;
}

/** Read cached RL policy weights (fast path for route handlers). */
export async function getCachedPolicy(): Promise<RlPolicyWeights | null> {
	return await getJson<RlPolicyWeights>(REDIS_POLICY_KEY);
}

// ── Tag-Aware Embedding Search ───────────────────────────────────────────────

/**
 * Hybrid search over research_summaries:
 *   1. Fetch candidate rows whose entity_tags overlap OR embedding is closest
 *      (up to `candidateLimit` rows via Postgres ORDER BY vector <-> query).
 *   2. Fuse cosine + tag-overlap scores using scoreAttention (GPU).
 *   3. Return top-K sorted by fused attention score.
 *
 * Returned rows are enriched with cluster + pageRank from Redis when available.
 */
export async function searchWithTagEmbedding(
	_queryText:      string,    // reserved for future FTS fallback
	queryEmbedding:  number[],  // 768-dim; caller embeds via generateEmbeddingsWithTags
	tags:            string[],  // optional entity_tags filter (AND semantics)
	topK:            number = 10,
	candidateLimit:  number = 100,
): Promise<TagSearchResult[]> {
	if (!queryEmbedding.length) return [];

	// 1. Fetch candidates from Postgres (vector ANN + optional tag filter)
	const tagFilter = tags.length
		? sql` AND entity_tags @> ARRAY[${sql.join(tags.map(t => sql`${t}`), sql`, `)}]::text[]`
		: sql``;

	const embLiteral = `[${queryEmbedding.join(',')}]`;
	const rows = await db.execute(sql`
		SELECT id, title, query, summary, entity_tags, relevance_score, embedding
		FROM   research_summaries
		WHERE  embedding IS NOT NULL
		${tagFilter}
		ORDER  BY embedding <-> ${sql.raw(`'${embLiteral}'::vector`)}
		LIMIT  ${candidateLimit}
	`);
	const candidates = (rows as unknown as { rows: ResearchSummary[] }).rows;
	if (!candidates.length) return [];

	// 2. Build candidate embedding matrix for attention scoring
	const n   = candidates.length;
	const mat = new Float32Array(n * DIM);
	for (let i = 0; i < n; i++) {
		const emb = candidates[i].embedding as unknown as number[] | null;
		if (emb && emb.length === DIM) {
			const vec = l2Norm(new Float32Array(emb));
			mat.set(vec, i * DIM);
		}
	}

	// 3. scoreAttention: query vector vs candidate matrix (async)
	const queryVec = l2Norm(new Float32Array(queryEmbedding));
	const attn     = await scoreAttention(queryVec, DIM, mat, n);

	// 4. Load graph metadata from Redis (optional enrichment)
	const clusterById: Map<string, { cluster: number; pageRank: number }> = new Map();
	const graphData = await getJson<{
		clusters: Array<{ id: number; memberIds: string[]; pageRank: number }>;
	}>(REDIS_GRAPH_KEY);

	if (graphData?.clusters) {
		for (const c of graphData.clusters) {
			for (const mid of c.memberIds) {
				clusterById.set(mid, { cluster: c.id, pageRank: c.pageRank });
			}
		}
	}

	// 5. Build scored results and take top-K
	const scored = candidates.map((row, i): TagSearchResult => {
		const graph = clusterById.get(row.id);
		return {
			id:             row.id,
			summary:        row.summary,
			title:          row.title ?? null,
			relevanceScore: row.relevanceScore,
			entityTags:     row.entityTags ?? [],
			cluster:        graph?.cluster ?? null,
			pageRank:       graph?.pageRank ?? 0,
			attentionScore: attn.scores[i] ?? 0,
		};
	});

	scored.sort((a, b) => b.attentionScore - a.attentionScore);
	return scored.slice(0, topK);
}

// ── LangGraph RL Loop ────────────────────────────────────────────────────────

/**
 * LangGraph StateGraph that implements:
 *   Retrieve → Rerank → Generate → Evaluate → Update
 *
 * On each call `runResearchRlLoop()` runs ONE full iteration:
 *   1. Retrieve:  tag-embedding search for `query`
 *   2. Rerank:    apply RL policy weights per pipeline
 *   3. Generate:  pass reranked context to Ollama via bifrostChat
 *   4. Evaluate:  scoreGRPOReward between query embed + response embed
 *   5. Update:    write new policy weights if reward improved
 */

// ── State Schema ──────────────────────────────────────────────────────────────

const ResearchRlState = Annotation.Root({
	query:           Annotation<string>,
	queryEmbedding:  Annotation<number[]>,
	tags:            Annotation<string[]>,
	pipeline:        Annotation<string>,
	candidates:      Annotation<TagSearchResult[]>,
	reranked:        Annotation<TagSearchResult[]>,
	contextText:     Annotation<string>,
	answer:          Annotation<string>,
	answerEmbedding: Annotation<number[]>,
	rewardScore:     Annotation<number>,
	policyUpdated:   Annotation<boolean>,
	error:           Annotation<string | null>,
});

type ResearchRlStateType = typeof ResearchRlState.State;

// ── Node implementations ──────────────────────────────────────────────────────

async function nodeRetrieve(state: ResearchRlStateType): Promise<Partial<ResearchRlStateType>> {
	try {
		const candidates = await searchWithTagEmbedding(
			state.query,
			state.queryEmbedding,
			state.tags,
			20,    // over-fetch for reranker
			100,
		);
		return { candidates, error: null };
	} catch (e) {
		return { candidates: [], error: String(e) };
	}
}

async function nodeRerank(state: ResearchRlStateType): Promise<Partial<ResearchRlStateType>> {
	if (!state.candidates.length) return { reranked: [] };
	const policy = (await getCachedPolicy()) ?? {
		ace: 1, kag: 1, dag: 1, rag: 1, codebase: 1, updatedAt: '',
	};
	const policyRecord = policy as unknown as Record<string, number>;
	const weight = policyRecord[state.pipeline] ?? 1.0;

	// Apply policy weight + pageRank boost to attention scores
	const reranked = state.candidates
		.map(c => ({ ...c, attentionScore: c.attentionScore * weight + c.pageRank * 0.1 }))
		.sort((a, b) => b.attentionScore - a.attentionScore)
		.slice(0, 10);

	return { reranked };
}

async function nodeGenerate(state: ResearchRlStateType): Promise<Partial<ResearchRlStateType>> {
	if (!state.reranked.length) {
		return { answer: 'No relevant research summaries found.', answerEmbedding: [] };
	}

	const contextText = state.reranked
		.map((r, i) => `[${i + 1}] ${r.title ?? r.summary.slice(0, 80)}\n${r.summary}`)
		.join('\n\n');

	try {
		const { bifrostChat } = await import('$lib/server/ollama.js');
		const answer = await bifrostChat(
			[
				{ role: 'system', content: 'You are a legal research assistant. Synthesize the context below to answer the query.' },
				{ role: 'user',   content: `Context:\n${contextText}\n\nQuery: ${state.query}` },
			],
			'gemma4-rotorquant:latest',
			{ temperature: 0.3, maxTokens: 400 },
		);

		// Embed the answer for reward scoring
		let answerEmbedding: number[] = [];
		try {
			const { generateEmbeddingsWithTags } = await import('$lib/server/grpc/embedding-client.js');
			const { result } = await generateEmbeddingsWithTags([answer], state.pipeline);
			answerEmbedding = result.vectors[0] ?? [];
		} catch { /* non-fatal */ }

		return { answer, contextText, answerEmbedding, error: null };
	} catch (e) {
		return { answer: '', contextText, answerEmbedding: [], error: String(e) };
	}
}

async function nodeEvaluate(state: ResearchRlStateType): Promise<Partial<ResearchRlStateType>> {
	if (!state.queryEmbedding.length || !state.answerEmbedding.length) {
		return { rewardScore: 0 };
	}
	try {
		const qv  = new Float32Array(state.queryEmbedding);
		const av  = new Float32Array(state.answerEmbedding);
		const { reward } = await scoreGRPOReward(av, qv, DIM);
		return { rewardScore: reward };
	} catch {
		return { rewardScore: 0 };
	}
}

async function nodeUpdate(state: ResearchRlStateType): Promise<Partial<ResearchRlStateType>> {
	// Re-compute RL policy if reward improved — lazy update (non-blocking)
	if (state.rewardScore > 0.6) {
		computeRlPolicy().catch(() => { /* background */ });
		return { policyUpdated: true };
	}
	return { policyUpdated: false };
}

// ── Graph assembly ────────────────────────────────────────────────────────────

function buildResearchRlGraph() {
	const graph = new StateGraph(ResearchRlState)
		.addNode('retrieve', nodeRetrieve)
		.addNode('rerank',   nodeRerank)
		.addNode('generate', nodeGenerate)
		.addNode('evaluate', nodeEvaluate)
		.addNode('update',   nodeUpdate)
		.addEdge(START,      'retrieve')
		.addEdge('retrieve', 'rerank')
		.addEdge('rerank',   'generate')
		.addEdge('generate', 'evaluate')
		.addEdge('evaluate', 'update')
		.addEdge('update',   END);

	return graph.compile();
}

// Lazy singleton — compiled once per process
let _compiled: ReturnType<typeof buildResearchRlGraph> | null = null;
function getCompiledGraph() {
	if (!_compiled) _compiled = buildResearchRlGraph();
	return _compiled;
}

// ── Public entry point ────────────────────────────────────────────────────────

export interface RlLoopInput {
	query:          string;
	queryEmbedding: number[];   // 768-dim; embed before calling
	tags?:          string[];
	pipeline?:      string;     // 'ace' | 'kag' | 'dag' | 'rag' | 'codebase'
}

export interface RlLoopResult {
	answer:        string;
	rewardScore:   number;
	policyUpdated: boolean;
	candidates:    TagSearchResult[];
	durationMs:    number;
	error:         string | null;
}

export async function runResearchRlLoop(input: RlLoopInput): Promise<RlLoopResult> {
	const t0 = Date.now();
	try {
		const compiled = getCompiledGraph();
		const result = await compiled.invoke({
			query:           input.query,
			queryEmbedding:  input.queryEmbedding,
			tags:            input.tags ?? [],
			pipeline:        input.pipeline ?? 'ace',
			candidates:      [],
			reranked:        [],
			contextText:     '',
			answer:          '',
			answerEmbedding: [],
			rewardScore:     0,
			policyUpdated:   false,
			error:           null,
		} satisfies ResearchRlStateType);

		return {
			answer:        result.answer        ?? '',
			rewardScore:   result.rewardScore   ?? 0,
			policyUpdated: result.policyUpdated ?? false,
			candidates:    result.reranked      ?? [],
			durationMs:    Date.now() - t0,
			error:         result.error         ?? null,
		};
	} catch (e) {
		return {
			answer: '', rewardScore: 0, policyUpdated: false,
			candidates: [], durationMs: Date.now() - t0, error: String(e),
		};
	}
}
