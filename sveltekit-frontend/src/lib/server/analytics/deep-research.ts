/**
 * Deep Research — Self-Prompting Research Topic Generator
 *
 * Queries the simulated JSONL feedback index (Redis) for RAG/KAG/DAG/ACE
 * hit patterns, combines with thumbs-up/down signals, graph analysis,
 * and user analytics to generate advanced self-prompting research topics
 * via Ollama deep research.
 *
 * Pipeline:
 *   1. Gather feedback index: thumbs-up/down votes + chunk quality from Redis
 *   2. Fetch pipeline memory: RAG/KAG/DAG/ACE hit breakdown
 *   3. Fetch graph analysis: centrality scores, connected cases
 *   4. Fetch user analytics: recent queries, practice areas, similar queries
 *   5. Generate research topics: Ollama self-prompting via gemma4-legal
 *   6. Cache results in Redis with per-user key (30-min TTL)
 *
 * Data sources:
 *   Redis   — feedback:rating:*         (thumbs-up/down counts)
 *           — analytics:hot_queries     (top queries sorted set)
 *           — analytics:query_vecs      (query sketch + metadata)
 *           — typing:prompt:clicks      (prompt leaderboard)
 *           — deep-research:{userId}    (cached research output, 30-min TTL)
 *   Postgres — chunk_hit_log            (RAG/KAG/DAG/ACE retrieval hits)
 *            — rag_query_log            (per-query stats + pipeline metadata)
 *            — response_feedback        (thumbs-up/down per query hash)
 *            — qlora_examples           (gold/silver/bronze training examples)
 *   Neo4j   — graph centrality          (connected cases, authority ranking)
 *   Ollama  — gemma4-legal:latest       (deep research topic generation)
 */

import { getRedis } from '$lib/server/redis.js';
import { db, pool } from '$lib/server/db/client';
import { contextTimeline } from '$lib/server/db/schema-postgres.js';
import { bifrostChat } from '$lib/server/ollama.js';
import { ENV } from '$lib/server/env.server.js';
import { fetchTopQueryTags } from '$lib/server/ace/user-analytics-context.js';
import type { HitPipeline } from './search-analytics.js';

// ── Constants ──────────────────────────────────────────────────────────────

const RESEARCH_CACHE_TTL = 1800; // 30 min
const RESEARCH_MODEL = ENV.OLLAMA_CHAT_MODEL;
const MAX_TOPICS = 8;
const HOT_QUERY_KEY = 'analytics:hot_queries';
const QUERY_VEC_KEY = 'analytics:query_vecs';
const LEADERBOARD_KEY = 'typing:prompt:clicks';

// ── Types ──────────────────────────────────────────────────────────────────

export interface FeedbackSignal {
	queryHash:  string;
	query:      string;
	thumbsUp:   number;
	thumbsDown: number;
	pipeline:   HitPipeline | string;
	avgRerank:  number | null;
}

export interface PipelineHitSummary {
	pipeline:      string;
	totalHits:     number;
	uniqueChunks:  number;
	uniqueQueries: number;
	avgRerank:     number | null;
	topChunkPath:  string | null;
}

export interface GraphInsight {
	caseId:     string;
	title:      string;
	centrality: number;
	sharedTypes: string[];
}

export interface ResearchTopic {
	id:          string;
	title:       string;
	description: string;
	reasoning:   string;
	priority:    'high' | 'medium' | 'low';
	sources:     string[];
	selfPrompt:  string;
	tags:        string[];
	pipelineHint: string;
	validated?:  boolean;
	evidenceScore?: number;
}

export interface DeepResearchResult {
	topics:            ResearchTopic[];
	feedbackSignals:   FeedbackSignal[];
	pipelineSummary:   PipelineHitSummary[];
	graphInsights:     GraphInsight[];
	hotQueryTags:      string[];
	topPrompts:        string[];
	generatedAt:       string;
	modelUsed:         string;
	cachedUntil:       string;
}

// ── 1. Gather Feedback Index ───────────────────────────────────────────────

async function gatherFeedbackSignals(userId: string, limit = 20): Promise<FeedbackSignal[]> {
	try {
		const result = await pool.query<{
			query_hash: string;
			rating:     string;
			pipeline:   string | null;
			up_count:   string;
			down_count: string;
		}>(`
			SELECT
				rf.query_hash,
				rf.rating,
				rf.pipeline,
				COUNT(*) FILTER (WHERE rf.rating = 'up')   AS up_count,
				COUNT(*) FILTER (WHERE rf.rating = 'down') AS down_count
			FROM response_feedback rf
			WHERE rf.created_at > NOW() - INTERVAL '30 days'
			GROUP BY rf.query_hash, rf.rating, rf.pipeline
			ORDER BY (COUNT(*) FILTER (WHERE rf.rating = 'up') + COUNT(*) FILTER (WHERE rf.rating = 'down')) DESC
			LIMIT $1
		`, [limit]);

		// Enrich with query text from Redis
		const redis = getRedis();
		const signals: FeedbackSignal[] = [];
		const hashes = [...new Set(result.rows.map(r => r.query_hash))];

		const queryMetas = hashes.length > 0
			? await redis.hmget(QUERY_VEC_KEY, ...hashes)
			: [];

		const hashQueryMap = new Map<string, string>();
		hashes.forEach((h, i) => {
			if (queryMetas[i]) {
				try {
					const meta = JSON.parse(queryMetas[i]!) as { query?: string };
					if (meta.query) hashQueryMap.set(h, meta.query);
				} catch { /* ignore */ }
			}
		});

		// Deduplicate by hash
		const seen = new Set<string>();
		for (const row of result.rows) {
			if (seen.has(row.query_hash)) continue;
			seen.add(row.query_hash);
			signals.push({
				queryHash:  row.query_hash,
				query:      hashQueryMap.get(row.query_hash) ?? row.query_hash.slice(0, 8) + '…',
				thumbsUp:   parseInt(row.up_count, 10),
				thumbsDown: parseInt(row.down_count, 10),
				pipeline:   row.pipeline ?? 'unknown',
				avgRerank:  null,
			});
		}

		return signals;
	} catch {
		return [];
	}
}

// ── 2. Fetch Pipeline Memory ───────────────────────────────────────────────

async function fetchPipelineMemory(): Promise<PipelineHitSummary[]> {
	try {
		const result = await pool.query<{
			pipeline:       string;
			total_hits:     string;
			unique_chunks:  string;
			unique_queries: string;
			avg_rerank:     number | null;
			top_chunk_path: string | null;
		}>(`
			SELECT
				pipeline,
				COUNT(*)::text                        AS total_hits,
				COUNT(DISTINCT chunk_id)::text         AS unique_chunks,
				COUNT(DISTINCT query_hash)::text        AS unique_queries,
				AVG(rerank_score)                      AS avg_rerank,
				(ARRAY_AGG(relative_path ORDER BY rerank_score DESC NULLS LAST))[1] AS top_chunk_path
			FROM chunk_hit_log
			WHERE created_at > NOW() - INTERVAL '7 days'
			GROUP BY pipeline
			ORDER BY COUNT(*) DESC
		`);

		return result.rows.map(r => ({
			pipeline:      r.pipeline,
			totalHits:     parseInt(r.total_hits, 10),
			uniqueChunks:  parseInt(r.unique_chunks, 10),
			uniqueQueries: parseInt(r.unique_queries, 10),
			avgRerank:     r.avg_rerank ? +r.avg_rerank.toFixed(4) : null,
			topChunkPath:  r.top_chunk_path,
		}));
	} catch {
		return [];
	}
}

// ── 3. Fetch Graph Insights ────────────────────────────────────────────────

async function fetchGraphInsights(userId: string): Promise<GraphInsight[]> {
	try {
		// Get user's recent case IDs from query log
		const caseResult = await pool.query<{ case_id: string }>(`
			SELECT DISTINCT case_id
			FROM rag_query_log
			WHERE user_id = $1 AND case_id IS NOT NULL
			  AND created_at > NOW() - INTERVAL '14 days'
			LIMIT 5
		`, [userId]);

		if (caseResult.rows.length === 0) return [];

		const { findConnectedCases } = await import('$lib/server/graph/graph-centrality.js');

		const allInsights: GraphInsight[] = [];
		for (const row of caseResult.rows.slice(0, 3)) {
			const connected = await findConnectedCases(row.case_id, 3).catch(() => []);
			for (const c of connected) {
				allInsights.push({
					caseId:     c.caseId,
					title:      c.title,
					centrality: c.strength,
					sharedTypes: c.sharedTypes,
				});
			}
		}

		// Deduplicate by caseId
		const seen = new Set<string>();
		return allInsights.filter(i => {
			if (seen.has(i.caseId)) return false;
			seen.add(i.caseId);
			return true;
		}).slice(0, 10);
	} catch {
		return [];
	}
}

// ── 4. Fetch Top Prompts ───────────────────────────────────────────────────

async function fetchTopPrompts(limit = 10): Promise<string[]> {
	try {
		const redis = getRedis();
		const raw: string[] = await redis.zrevrange(LEADERBOARD_KEY, 0, limit - 1, 'WITHSCORES');

		const prompts: string[] = [];
		for (let i = 0; i < raw.length; i += 2) {
			const member = raw[i];
			const secondSep = member.indexOf('::', member.indexOf('::') + 2);
			if (secondSep !== -1) {
				prompts.push(member.slice(secondSep + 2).slice(0, 100));
			}
		}
		return prompts;
	} catch {
		return [];
	}
}

// ── 5. Ollama Deep Research Generation ─────────────────────────────────────

function buildResearchPrompt(
	feedbackSignals: FeedbackSignal[],
	pipelineSummary: PipelineHitSummary[],
	graphInsights:   GraphInsight[],
	hotQueryTags:    string[],
	topPrompts:      string[],
): string {
	const feedbackBlock = feedbackSignals.slice(0, 10).map(s =>
		`- "${s.query}" (👍${s.thumbsUp} 👎${s.thumbsDown}, pipeline: ${s.pipeline})`
	).join('\n');

	const pipelineBlock = pipelineSummary.map(p =>
		`- ${p.pipeline}: ${p.totalHits} hits, ${p.uniqueChunks} unique chunks, avg rerank: ${p.avgRerank?.toFixed(3) ?? 'N/A'}`
	).join('\n');

	const graphBlock = graphInsights.slice(0, 5).map(g =>
		`- Case "${g.title}" (centrality: ${g.centrality.toFixed(2)}, shared: ${g.sharedTypes.join(', ')})`
	).join('\n');

	const queryTagsBlock = hotQueryTags.slice(0, 5).join(', ');
	const promptsBlock = topPrompts.slice(0, 5).map(p => `- "${p}"`).join('\n');

	return `You are a legal AI research advisor. Based on the analytics data below, generate ${MAX_TOPICS} advanced research topics that would deepen the user's legal research.

## User Feedback Signals (thumbs up/down on search results)
${feedbackBlock || 'No feedback data available yet.'}

## Retrieval Pipeline Performance (RAG/KAG/DAG/ACE hits, last 7 days)
${pipelineBlock || 'No pipeline data available yet.'}

## Graph Analysis (connected cases and centrality)
${graphBlock || 'No graph connections found.'}

## Hot Query Topics
${queryTagsBlock || 'No trending queries.'}

## Most-Clicked Research Prompts
${promptsBlock || 'No prompt clicks recorded.'}

## Instructions
Generate exactly ${MAX_TOPICS} research topics as a JSON array. Each topic should:
1. Build on patterns in the feedback data (highly upvoted queries indicate user interest)
2. Explore gaps where thumbs-down signals suggest knowledge weaknesses
3. Leverage graph connections to suggest cross-case legal analysis
4. Include a "selfPrompt" field — the exact query the user should submit to the legal AI for deep analysis
5. Tag each topic with relevant legal domains and retrieval pipelines (rag/kag/dag/ace)

Return ONLY a valid JSON array of objects with these fields:
[{
  "title": "short topic title",
  "description": "2-3 sentence description of what to research",
  "reasoning": "why this topic is recommended based on the data",
  "priority": "high|medium|low",
  "sources": ["feedback", "graph", "pipeline", etc.],
  "selfPrompt": "the exact query to submit for deep research",
  "tags": ["contract-law", "evidence", etc.],
  "pipelineHint": "rag|kag|dag|ace"
}]`;
}

function parseResearchTopics(raw: string): ResearchTopic[] {
	try {
		// Find JSON array in response
		const match = raw.match(/\[[\s\S]*\]/);
		if (!match) return [];

		const parsed = JSON.parse(match[0]) as Array<{
			title?: string;
			description?: string;
			reasoning?: string;
			priority?: string;
			sources?: string[];
			selfPrompt?: string;
			tags?: string[];
			pipelineHint?: string;
		}>;

		if (!Array.isArray(parsed)) return [];

		return parsed.slice(0, MAX_TOPICS).map((t, i) => ({
			id:           `dr-${Date.now()}-${i}`,
			title:        String(t.title ?? `Research Topic ${i + 1}`).slice(0, 120),
			description:  String(t.description ?? '').slice(0, 500),
			reasoning:    String(t.reasoning ?? '').slice(0, 300),
			priority:     (['high', 'medium', 'low'].includes(t.priority ?? '') ? t.priority : 'medium') as 'high' | 'medium' | 'low',
			sources:      Array.isArray(t.sources) ? t.sources.map(String).slice(0, 5) : [],
			selfPrompt:   String(t.selfPrompt ?? t.title ?? '').slice(0, 300),
			tags:         Array.isArray(t.tags) ? t.tags.map(String).slice(0, 6) : [],
			pipelineHint: String(t.pipelineHint ?? 'rag').slice(0, 10),
		}));
	} catch {
		return [];
	}
}

// ── Main Entry Point ───────────────────────────────────────────────────────

export async function generateDeepResearch(
	userId: string,
	opts?: { skipCache?: boolean; maxTopics?: number }
): Promise<DeepResearchResult> {
	const redis = getRedis();
	const cacheKey = `deep-research:${userId}`;

	// Check cache first
	if (!opts?.skipCache) {
		try {
			const cached = await redis.get(cacheKey);
			if (cached) return JSON.parse(cached) as DeepResearchResult;
		} catch { /* cache miss — proceed */ }
	}

	// Gather all data sources in parallel
	const [feedbackSignals, pipelineSummary, graphInsights, hotQueryTags, topPrompts] =
		await Promise.all([
			gatherFeedbackSignals(userId),
			fetchPipelineMemory(),
			fetchGraphInsights(userId),
			fetchTopQueryTags(5),
			fetchTopPrompts(10),
		]);

	// 5. Ollama Deep Research Generation
	// Request 10 candidates initially to allow for pruning down to 6 after validation
	const CANDIDATE_LIMIT = 10;
	let topics: ResearchTopic[] = [];
	try {
		const prompt = buildResearchPrompt(
			feedbackSignals,
			pipelineSummary,
			graphInsights,
			hotQueryTags,
			topPrompts,
		);

		const response = await bifrostChat(
			[{ role: 'user', content: prompt }],
			RESEARCH_MODEL,
			{
				temperature: 0.7,
				maxTokens: 2048,
				timeoutMs: 60_000,
				cacheKey: `deep-research-gen:${userId}`,
			},
		);

		topics = parseResearchTopics(response);
		if (topics.length > CANDIDATE_LIMIT) topics = topics.slice(0, CANDIDATE_LIMIT);
	} catch (err) {
		console.warn('[deep-research] Ollama generation failed:', (err as Error).message);
	}

	// 6. Autonomous Refinement Cycle (PHASE 12)
	try {
		const { validateTopicsWithTriton, refineTopicPrompts } = await import('$lib/server/analytics/research-refiner.js');
		
		const validations = await validateTopicsWithTriton(topics);
		const refinedTopics = await refineTopicPrompts(topics, validations);

		// Distribute topics: 4 Grounded + 2 Speculative (Nice to have)
		const grounded = refinedTopics
			.filter(t => t.validated && (t.evidenceScore ?? 0) >= 0.3)
			.sort((a, b) => (b.evidenceScore ?? 0) - (a.evidenceScore ?? 0))
			.slice(0, 4);

		const speculative = refinedTopics
			.filter(t => !grounded.some(g => g.id === t.id))
			.sort((a, b) => (b.evidenceScore ?? 0) - (a.evidenceScore ?? 0))
			.slice(0, 2);

		topics = [...grounded, ...speculative];
	} catch (err) {
		console.warn('[deep-research] Refinement cycle failed:', err);
		// Fallback to original top 6 if refinement failed
		if (topics.length > 6) topics = topics.slice(0, 6);
	}

	// If Ollama failed or returned nothing, generate fallback topics from data
	if (topics.length === 0) {
		topics = generateFallbackTopics(feedbackSignals, pipelineSummary, graphInsights, hotQueryTags);
	}

	const now = new Date();
	const cachedUntil = new Date(now.getTime() + RESEARCH_CACHE_TTL * 1000);

	const result: DeepResearchResult = {
		topics,
		feedbackSignals: feedbackSignals.slice(0, 10),
		pipelineSummary,
		graphInsights:   graphInsights.slice(0, 10),
		hotQueryTags,
		topPrompts:      topPrompts.slice(0, 5),
		generatedAt:     now.toISOString(),
		modelUsed:       RESEARCH_MODEL,
		cachedUntil:     cachedUntil.toISOString(),
	};

	// Cache in Redis (non-blocking)
	redis.set(cacheKey, JSON.stringify(result), 'EX', RESEARCH_CACHE_TTL).catch(() => {});

	// RL audit: record generation event to context_timeline (non-blocking)
	const dominantPipeline = [...pipelineSummary]
		.sort((a, b) => b.totalHits - a.totalHits)[0]?.pipeline ?? 'ace';
	db.insert(contextTimeline).values({
		userId:      Number(userId),
		sessionId:  '',
		eventType:  'research',
		pipeline:   dominantPipeline,
		payload:    {
			source:              'deep-research',
			topicCount:          topics.length,
			highPriorityCount:   topics.filter(t => t.priority === 'high').length,
			modelUsed:           topics.length > 0 ? RESEARCH_MODEL : 'fallback',
			feedbackSignalCount: feedbackSignals.length,
		} as Record<string, unknown>,
	}).catch(() => {});

	// Kick off web research for high-priority topics (fire-and-forget)
	const highPriority = topics.filter(t => t.priority === 'high').slice(0, 3);
	if (highPriority.length) {
		import('$lib/server/analytics/web-research-crawler.js')
			.then(({ crawlWebResearch }) =>
				Promise.all(
					highPriority.map(t =>
						crawlWebResearch(t.selfPrompt, t.pipelineHint ?? 'ace', 5).catch(() => null),
					),
				),
			)
			.catch(() => {}); // fully non-fatal
	}

	return result;
}

// ── Fallback — deterministic topics when Ollama is unavailable ─────────────

function generateFallbackTopics(
	feedbackSignals: FeedbackSignal[],
	pipelineSummary: PipelineHitSummary[],
	graphInsights:   GraphInsight[],
	hotQueryTags:    string[],
): ResearchTopic[] {
	const topics: ResearchTopic[] = [];

	// Topic from most upvoted query
	const topUpvoted = feedbackSignals
		.filter(s => s.thumbsUp > 0)
		.sort((a, b) => b.thumbsUp - a.thumbsUp)[0];

	if (topUpvoted) {
		topics.push({
			id: `dr-fb-${Date.now()}`,
			title: `Deep dive: ${topUpvoted.query.slice(0, 60)}`,
			description: `This query received ${topUpvoted.thumbsUp} positive votes — it represents a strong research interest. Expand with additional case law and statutory references.`,
			reasoning: 'Highest thumbs-up feedback signal indicates strong user interest.',
			priority: 'high',
			sources: ['feedback'],
			selfPrompt: `Provide a comprehensive legal analysis of: ${topUpvoted.query}`,
			tags: ['user-interest', topUpvoted.pipeline],
			pipelineHint: topUpvoted.pipeline,
		});
	}

	// Topic from most downvoted query (knowledge gap)
	const topDownvoted = feedbackSignals
		.filter(s => s.thumbsDown > 0)
		.sort((a, b) => b.thumbsDown - a.thumbsDown)[0];

	if (topDownvoted) {
		topics.push({
			id: `dr-gap-${Date.now()}`,
			title: `Knowledge gap: ${topDownvoted.query.slice(0, 60)}`,
			description: `This query received ${topDownvoted.thumbsDown} negative votes — the AI response quality was poor. Additional context or training data may be needed.`,
			reasoning: 'High thumbs-down signal indicates a retrieval or knowledge gap.',
			priority: 'high',
			sources: ['feedback', 'pipeline'],
			selfPrompt: `Re-analyze with expanded context: ${topDownvoted.query}. Consider additional statutory sources and recent case law.`,
			tags: ['knowledge-gap', topDownvoted.pipeline],
			pipelineHint: 'kag',
		});
	}

	// Topic from graph connections
	for (const insight of graphInsights.slice(0, 2)) {
		topics.push({
			id: `dr-graph-${Date.now()}-${insight.caseId.slice(0, 8)}`,
			title: `Cross-case analysis: ${insight.title.slice(0, 50)}`,
			description: `Connected via ${insight.sharedTypes.join(', ')} with centrality score ${insight.centrality.toFixed(2)}. Cross-referencing may reveal precedent chains.`,
			reasoning: 'Graph centrality identifies legally significant connections between cases.',
			priority: insight.centrality > 0.5 ? 'high' : 'medium',
			sources: ['graph'],
			selfPrompt: `Analyze the legal relationship between the current case and "${insight.title}". What precedents and statutory connections exist?`,
			tags: ['cross-case', ...insight.sharedTypes.slice(0, 2)],
			pipelineHint: 'kag',
		});
	}

	// Topics from pipeline performance gaps
	const weakPipeline = pipelineSummary
		.filter(p => p.avgRerank !== null && p.avgRerank < 0.5)
		.sort((a, b) => (a.avgRerank ?? 0) - (b.avgRerank ?? 0))[0];

	if (weakPipeline) {
		topics.push({
			id: `dr-pipe-${Date.now()}`,
			title: `Improve ${weakPipeline.pipeline.toUpperCase()} retrieval quality`,
			description: `The ${weakPipeline.pipeline} pipeline has low average rerank score (${weakPipeline.avgRerank?.toFixed(3)}). ${weakPipeline.uniqueChunks} unique chunks served ${weakPipeline.totalHits} hits.`,
			reasoning: `Low rerank scores in the ${weakPipeline.pipeline} pipeline suggest poor chunk quality or embedding alignment.`,
			priority: 'medium',
			sources: ['pipeline'],
			selfPrompt: `What legal concepts are underrepresented in the ${weakPipeline.pipeline} retrieval pipeline? Suggest additional training data or document sources.`,
			tags: ['pipeline-quality', weakPipeline.pipeline],
			pipelineHint: weakPipeline.pipeline,
		});
	}

	// Topics from hot queries
	for (const tag of hotQueryTags.slice(0, 2)) {
		topics.push({
			id: `dr-hot-${Date.now()}-${topics.length}`,
			title: `Trending topic: ${tag.slice(0, 60)}`,
			description: `Frequently searched query — indicates active community interest. Generate authoritative guidance.`,
			reasoning: 'High-frequency query in the hot-query leaderboard.',
			priority: 'medium',
			sources: ['analytics'],
			selfPrompt: tag,
			tags: ['trending'],
			pipelineHint: 'rag',
		});
	}

	return topics.slice(0, MAX_TOPICS);
}

// ── Invalidation helper ────────────────────────────────────────────────────

export async function invalidateDeepResearchCache(userId: string): Promise<boolean> {
	try {
		const redis = getRedis();
		const deleted = await redis.del(`deep-research:${userId}`);
		return deleted > 0;
	} catch {
		return false;
	}
}
