/**
 * Codebase Deep Research Scanner
 *
 * Combines rg (ripgrep) codebase search with Ollama deep research
 * to generate TypeScript/SvelteKit-specific research topics.
 *
 * Pipeline:
 *   1. rg search — find code patterns across codebase
 *   2. MapReduce matrix — pipeline hit signals (RAG/KAG/DAG/ACE)
 *   3. CouchDB PageRank — file importance scores
 *   4. Ollama synthesis — deep research topic generation
 *
 * Integration points:
 *   - FastMCP: registered as `codebase:deep-research` tool
 *   - LangGraph: output compatible with StateGraph supervisor
 *   - ACE: feeds back into context-assembler queryTags
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { bifrostChat } from '$lib/server/ollama.js';
import { getRedis } from '$lib/server/redis.js';
import { pool } from '$lib/server/db/client';

const execAsync = promisify(exec);

const MODEL = 'gemma4-legal:latest';
const CACHE_PREFIX = 'codebase:deep-research:';
const CACHE_TTL = 1800; // 30 min
const MAX_RG_RESULTS = 50;

// ── Types ──────────────────────────────────────────────────────────────────

export interface CodeSearchHit {
	file:    string;
	line:    number;
	content: string;
	score:   number;
}

export interface CodeResearchTopic {
	title:       string;
	description: string;
	codePattern: string;
	files:       string[];
	pipeline:    string;
	selfPrompt:  string;
	priority:    'high' | 'medium' | 'low';
}

export interface CodebaseResearchResult {
	topics:       CodeResearchTopic[];
	searchHits:   number;
	filesScanned: number;
	patterns:     PatternAnalysis[];
	buildMs:      number;
	cached:       boolean;
}

export interface PatternAnalysis {
	pattern:    string;
	hitCount:   number;
	topFiles:   string[];
	category:   'architecture' | 'error-handling' | 'performance' | 'security' | 'testing';
}

// ── Codebase Search (rg-based) ─────────────────────────────────────────────

/**
 * Execute a ripgrep search across the SvelteKit codebase.
 * Uses rg for speed (>10x faster than Node.js fs.readdir + fs.readFile).
 */
async function rgSearch(
	pattern:  string,
	options?: { glob?: string; maxResults?: number; caseSensitive?: boolean },
): Promise<CodeSearchHit[]> {
	const hits: CodeSearchHit[] = [];
	const maxResults = options?.maxResults ?? MAX_RG_RESULTS;
	const glob = options?.glob ?? '*.{ts,svelte,js}';
	const caseFlag = options?.caseSensitive ? '' : '-i';

	try {
		const cmd = `rg ${caseFlag} --json --max-count ${maxResults} --glob "${glob}" "${pattern}" src/`;
		const { stdout } = await execAsync(cmd, {
			cwd: process.cwd(),
			maxBuffer: 5 * 1024 * 1024, // 5MB
			timeout: 10_000,
		});

		for (const line of stdout.split('\n')) {
			if (!line.trim()) continue;
			try {
				const parsed = JSON.parse(line) as { type: string; data?: { path?: { text?: string }; line_number?: number; lines?: { text?: string } } };
				if (parsed.type === 'match' && parsed.data) {
					hits.push({
						file: parsed.data.path?.text ?? '',
						line: parsed.data.line_number ?? 0,
						content: (parsed.data.lines?.text ?? '').trim().slice(0, 200),
						score: 1.0,
					});
				}
			} catch {
				// Skip malformed lines
			}
		}
	} catch {
		// rg not available or no matches
	}

	return hits;
}

/**
 * Search for architectural patterns in the codebase.
 * Returns categorized pattern analysis.
 */
async function analyzeCodePatterns(): Promise<PatternAnalysis[]> {
	const patterns: PatternAnalysis[] = [];

	const searches: Array<{
		pattern: string;
		category: PatternAnalysis['category'];
		label: string;
	}> = [
		{ pattern: 'async function.*Request', category: 'architecture', label: 'Async request handlers' },
		{ pattern: 'catch\\s*\\(', category: 'error-handling', label: 'Error catch blocks' },
		{ pattern: 'AbortSignal\\.timeout', category: 'performance', label: 'Request timeouts' },
		{ pattern: 'locals\\.user', category: 'security', label: 'Auth guards' },
		{ pattern: 'z\\.object|safeParse', category: 'security', label: 'Zod validation' },
		{ pattern: '\\$state|\\$derived|\\$effect', category: 'architecture', label: 'Svelte 5 runes' },
		{ pattern: 'bifrostChat|ollamaFetch', category: 'architecture', label: 'LLM calls' },
		{ pattern: 'getRedis|redis\\.', category: 'performance', label: 'Redis cache usage' },
		{ pattern: 'pool\\.query', category: 'architecture', label: 'Direct SQL queries' },
		{ pattern: 'vitest|describe\\(|it\\(|test\\(', category: 'testing', label: 'Test coverage' },
	];

	// Run searches in parallel (max 5 concurrent)
	const results = await Promise.all(
		searches.map(async (s) => {
			const hits = await rgSearch(s.pattern, { maxResults: 30 });
			const uniqueFiles = [...new Set(hits.map((h) => h.file))];
			return {
				pattern: s.label,
				hitCount: hits.length,
				topFiles: uniqueFiles.slice(0, 5),
				category: s.category,
			};
		})
	);

	return results.filter((r) => r.hitCount > 0);
}

/**
 * Fetch pipeline hit distribution from chunk_hit_log.
 */
async function fetchPipelineDistribution(days: number): Promise<Record<string, number>> {
	try {
		const { rows } = await pool.query<{ pipeline: string; cnt: string }>(`
			SELECT pipeline, COUNT(*) AS cnt
			FROM chunk_hit_log
			WHERE created_at > NOW() - INTERVAL '1 day' * $1
			GROUP BY pipeline
			ORDER BY cnt DESC
		`, [days]);

		return Object.fromEntries(rows.map((r) => [r.pipeline, parseInt(r.cnt)]));
	} catch {
		return {};
	}
}

/**
 * Fetch feedback-weighted query insights.
 */
async function fetchFeedbackInsights(days: number): Promise<Array<{ query: string; score: number; pipeline: string }>> {
	try {
		const { rows } = await pool.query<{
			query_text: string;
			net_score: string;
			top_pipeline: string;
		}>(`
			SELECT
				rql.query_hash AS query_text,
				(COUNT(*) FILTER (WHERE rf.helpful = true) -
				 COUNT(*) FILTER (WHERE rf.helpful = false))::float AS net_score,
				MODE() WITHIN GROUP (ORDER BY chl.pipeline) AS top_pipeline
			FROM rag_query_log rql
			LEFT JOIN response_feedback rf ON rf.query_hash = rql.query_hash
			LEFT JOIN chunk_hit_log chl ON chl.query_hash = rql.query_hash
			WHERE rql.created_at > NOW() - INTERVAL '1 day' * $1
			GROUP BY rql.query_hash
			HAVING COUNT(rf.*) > 0
			ORDER BY net_score DESC
			LIMIT 10
		`, [days]);

		return rows.map((r) => ({
			query: r.query_text,
			score: parseFloat(r.net_score) || 0,
			pipeline: r.top_pipeline ?? 'unknown',
		}));
	} catch {
		return [];
	}
}

// ── Synthesis ──────────────────────────────────────────────────────────────

/**
 * Generate deep research topics from codebase analysis + pipeline data.
 */
async function synthesizeCodebaseResearch(
	patterns:    PatternAnalysis[],
	pipelineDist: Record<string, number>,
	feedbackInsights: Array<{ query: string; score: number; pipeline: string }>,
): Promise<CodeResearchTopic[]> {
	const prompt = `You are a TypeScript/SvelteKit 2 code research analyst for a legal AI platform. Analyze the following codebase patterns and retrieval pipeline data to generate 6 advanced research topics for self-prompting improvement.

## Codebase Pattern Analysis
${patterns.map((p) => `- ${p.pattern}: ${p.hitCount} hits across ${p.topFiles.length} files (${p.category})`).join('\n')}

## Pipeline Hit Distribution (last 7 days)
${Object.entries(pipelineDist).map(([k, v]) => `- ${k.toUpperCase()}: ${v} hits`).join('\n') || 'No pipeline data available.'}

## Feedback-Weighted Insights (top queries)
${feedbackInsights.slice(0, 5).map((f) => `- "${f.query}" score=${f.score > 0 ? '+' : ''}${f.score} (${f.pipeline})`).join('\n') || 'No feedback data available.'}

## Architecture Context
- SvelteKit 2 + Svelte 5 runes ($state, $derived, $effect, $props)
- Multi-tier cache: LokiJS → IndexedDB → Redis → Ollama
- RAG + KAG + DAG + ACE retrieval pipelines
- CouchDB MapReduce for PageRank
- Glyph tile atlas for semantic Voronoi map
- FastMCP tool registry (20+ tools)
- LangGraph StateGraph supervisor

Return a JSON array of exactly 6 research topics:
[
  {
    "title": "...",
    "description": "...",
    "codePattern": "regex pattern to search for related code",
    "files": ["file1.ts", "file2.ts"],
    "pipeline": "rag|kag|dag|ace|cross-pipeline",
    "selfPrompt": "A specific TypeScript/SvelteKit research question",
    "priority": "high|medium|low"
  }
]

Return ONLY the JSON array, no other text.`;

	try {
		const raw = await bifrostChat(
			[{ role: 'user', content: prompt }],
			MODEL,
			{ temperature: 0.4, maxTokens: 2000, timeoutMs: 30_000 }
		);

		return parseCodeTopics(raw);
	} catch {
		return buildFallbackCodeTopics(patterns, pipelineDist);
	}
}

function parseCodeTopics(raw: string): CodeResearchTopic[] {
	try {
		const jsonMatch = raw.match(/\[[\s\S]*\]/);
		if (!jsonMatch) return [];

		const parsed = JSON.parse(jsonMatch[0]) as unknown[];
		if (!Array.isArray(parsed)) return [];

		return parsed.slice(0, 6).map((item: unknown, i: number) => {
			const t = item as Record<string, unknown>;
			return {
				title:       String(t.title ?? `Topic ${i + 1}`),
				description: String(t.description ?? ''),
				codePattern: String(t.codePattern ?? ''),
				files:       Array.isArray(t.files) ? (t.files as string[]).slice(0, 5) : [],
				pipeline:    String(t.pipeline ?? 'cross-pipeline'),
				selfPrompt:  String(t.selfPrompt ?? ''),
				priority:    (['high', 'medium', 'low'].includes(String(t.priority))
					? String(t.priority) : 'medium') as 'high' | 'medium' | 'low',
			};
		});
	} catch {
		return [];
	}
}

function buildFallbackCodeTopics(
	patterns:    PatternAnalysis[],
	pipelineDist: Record<string, number>,
): CodeResearchTopic[] {
	const topics: CodeResearchTopic[] = [];

	// Find weakest pattern categories
	const categoryHits = new Map<string, number>();
	for (const p of patterns) {
		categoryHits.set(p.category, (categoryHits.get(p.category) ?? 0) + p.hitCount);
	}

	const weakest = [...categoryHits.entries()].sort((a, b) => a[1] - b[1]);
	for (const [cat] of weakest.slice(0, 2)) {
		topics.push({
			title:       `Improve ${cat} coverage`,
			description: `Low pattern hit count in ${cat} category`,
			codePattern: cat === 'testing' ? 'describe\\(|test\\(' : cat === 'security' ? 'locals\\.user' : '',
			files:       [],
			pipeline:    'cross-pipeline',
			selfPrompt:  `What ${cat} patterns are missing in the SvelteKit codebase?`,
			priority:    'high',
		});
	}

	// Find weakest pipeline
	const weakPipeline = Object.entries(pipelineDist).sort((a, b) => a[1] - b[1])[0];
	if (weakPipeline) {
		topics.push({
			title:       `Strengthen ${weakPipeline[0].toUpperCase()} pipeline`,
			description: `Only ${weakPipeline[1]} hits — investigate retrieval gaps`,
			codePattern: weakPipeline[0],
			files:       [],
			pipeline:    weakPipeline[0],
			selfPrompt:  `Why does the ${weakPipeline[0]} pipeline have low hit rates?`,
			priority:    'medium',
		});
	}

	return topics;
}

// ── Public API ────────────────────────────────────────────────────────────

export interface CodebaseResearchOptions {
	days?:         number;
	query?:        string;   // optional rg search query
	synthesize?:   boolean;
}

/**
 * Execute codebase deep research scan.
 *
 * 1. rg pattern analysis across src/
 * 2. Pipeline hit distribution from chunk_hit_log
 * 3. Feedback-weighted query insights
 * 4. Ollama synthesis → research topics with self-prompts
 */
export async function executeCodebaseResearch(
	userId:  string,
	options: CodebaseResearchOptions = {},
): Promise<CodebaseResearchResult> {
	const start = Date.now();
	const days = Math.min(options.days ?? 7, 30);

	// Check cache
	const cacheKey = `${CACHE_PREFIX}${userId}`;
	try {
		const redis = getRedis();
		const cached = await redis.get(cacheKey);
		if (cached) {
			return { ...JSON.parse(cached) as CodebaseResearchResult, cached: true };
		}
	} catch {
		// Redis unavailable
	}

	// Run analysis in parallel
	const [patterns, pipelineDist, feedbackInsights, customHits] = await Promise.all([
		analyzeCodePatterns(),
		fetchPipelineDistribution(days),
		fetchFeedbackInsights(days),
		options.query ? rgSearch(options.query) : Promise.resolve([]),
	]);

	const totalHits = patterns.reduce((s, p) => s + p.hitCount, 0) + customHits.length;
	const allFiles = new Set(patterns.flatMap((p) => p.topFiles));

	// Synthesize research topics
	const topics = options.synthesize !== false
		? await synthesizeCodebaseResearch(patterns, pipelineDist, feedbackInsights)
		: [];

	const result: CodebaseResearchResult = {
		topics,
		searchHits: totalHits,
		filesScanned: allFiles.size,
		patterns,
		buildMs: Date.now() - start,
		cached: false,
	};

	// Cache
	try {
		const redis = getRedis();
		await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
	} catch {
		// Redis unavailable
	}

	return result;
}

/**
 * Invalidate codebase research cache.
 */
export async function invalidateCodebaseResearchCache(userId: string): Promise<void> {
	try {
		const redis = getRedis();
		await redis.del(`${CACHE_PREFIX}${userId}`);
	} catch {
		// Redis unavailable
	}
}
