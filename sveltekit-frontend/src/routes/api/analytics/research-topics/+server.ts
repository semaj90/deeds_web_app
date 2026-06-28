/**
 * GET /api/analytics/research-topics
 *
 * Returns advanced self-prompting research topics derived from:
 *   1. QLoRA examples index (Redis-cached, feedback-weighted per pipeline)
 *   2. User analytics hot-query leaderboard
 *   3. Graph analysis (Neo4j neighbors for connected cases)
 *   4. Ollama deep-research chain expansion (3-hop self-prompt)
 *
 * Supports codebase research domains: ripgrep, awk, TypeScript, SvelteKit 2.
 *
 * Query params:
 *   pipeline?  'ace'|'rag'|'kag'|'dag'|'codebase'|'all'  (default: 'all')
 *   caseId?    UUID — enriches with graph neighbors
 *   limit?     1-50 (default 12)
 *   depth?     1-5 self-prompt chain depth (default 3)
 *   domains?   comma-separated keywords to bias codebase topics
 *              e.g. "typescript,sveltekit,ripgrep"
 *   rebuild?   '1' — force cache rebuild
 *
 * Auth: requires locals.user
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import {
	queryResearchIndex,
	buildResearchIndex,
	getCachedPromptChain,
	cachePromptChain,
	getResearchIndexStats,
	invalidateResearchIndex,
	type ResearchSketch,
} from '$lib/server/analytics/research-cache.js';
import { getRedis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch, getOllamaGenerationEndpoint } from '$lib/server/ollama.js';

// ── Param schema ───────────────────────────────────────────────────────────────

const paramsSchema = z.object({
	pipeline: z.enum(['ace', 'rag', 'kag', 'dag', 'codebase', 'reranker', 'all']).default('all'),
	caseId:   z.string().uuid().optional(),
	limit:    z.coerce.number().int().min(1).max(50).default(12),
	depth:    z.coerce.number().int().min(1).max(5).default(3),
	domains:  z.string().max(300).default(''),
	rebuild:  z.string().optional(),
});

// ── Codebase domain seeds ──────────────────────────────────────────────────────
// Base prompts for TypeScript / SvelteKit 2 / ripgrep deep research when
// there are few/no codebase qlora examples yet.

const CODEBASE_SEED_TOPICS: Record<string, string[]> = {
	typescript: [
		'How do TypeScript generics constrain Drizzle ORM query builders in this codebase?',
		'What are the unsafe type casts (`as any`) remaining in the server layer and how can they be eliminated?',
		'How does the inference-router.ts type-narrow across 7 fallback tiers?',
	],
	sveltekit: [
		'How does SvelteKit 2 layout hierarchy affect SSR caching for the ACE context assembler?',
		'Which routes are incorrectly using `throw error()` inside try/catch blocks?',
		'How do `+page.server.ts` load functions propagate graceful degradation patterns?',
	],
	ripgrep: [
		'What files import from `$lib/server/db` instead of the canonical `$lib/server/db/client`?',
		'Which API routes are missing Zod validation (G19 audit)?',
		'Find all `export let` Svelte 4 prop patterns still present in .svelte files.',
	],
	awk: [
		'Aggregate the distribution of chunk scores across all pipeline types from chunk_hit_log.',
		'What is the ratio of auth-guarded vs public API routes by directory depth?',
		'Compute average search_time_ms per pipeline from rag_query_log grouped by day.',
	],
	ollama: [
		'What is the optimal KV cache quantisation strategy for gemma4-rotorquant:latest at 8K context?',
		'How does Flash Attention affect memory bandwidth for the 11B parameter model on RTX 3060 Ti?',
		'What are the trade-offs between TurboQuant INT4 and full-precision for legal reasoning tasks?',
	],
};

function seedTopicsForDomains(domains: string[]): string[] {
	if (!domains.length) return [];
	const out: string[] = [];
	for (const d of domains) {
		const key = d.toLowerCase().trim();
		const seeds = CODEBASE_SEED_TOPICS[key] ?? [];
		out.push(...seeds.slice(0, 2));
	}
	return out;
}

// ── Self-prompt chain generation via Ollama ────────────────────────────────────

async function generatePromptChain(
	seedQuery: string,
	entityTags: string[],
	depth: number,
	domains: string[]
): Promise<string[]> {
	const domainHint = domains.length
		? `Focus on: ${domains.join(', ')}.`
		: '';

	const tagHint = entityTags.length
		? `Key topics: ${entityTags.slice(0, 6).join(', ')}.`
		: '';

	const prompt =
		`You are a legal AI research assistant generating a self-prompting research chain.\n` +
		`Given the seed query below, produce exactly ${depth} follow-up research questions ` +
		`that go progressively deeper — each building on the previous answer.\n` +
		`${domainHint} ${tagHint}\n\n` +
		`Seed query: "${seedQuery.slice(0, 300)}"\n\n` +
		`Output ONLY the ${depth} questions, one per line, no numbering, no extra text.`;

	try {
		const res = await ollamaFetch(`${getOllamaGenerationEndpoint()}/api/generate`, {
			method:  'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model:  'gemma4-rotorquant:latest',
				prompt,
				stream:  false,
				options: { temperature: 0.6, num_predict: 256 },
			}),
			signal: AbortSignal.timeout(15_000),
		});
		if (!res.ok) return [];
		const data = await res.json() as { response?: string };
		const lines = (data.response ?? '')
			.split('\n')
			.map((l: string) => l.replace(/^[-•*\d.)\s]+/, '').trim())
			.filter((l: string) => l.length > 10);
		return lines.slice(0, depth);
	} catch {
		return [];
	}
}

// ── Graph expansion ────────────────────────────────────────────────────────────

async function fetchGraphTopicExpansions(caseId: string): Promise<string[]> {
	try {
		const { findConnectedCases } = await import('$lib/server/graph/graph-centrality.js');
		const connected = await findConnectedCases(caseId, 6);
		return connected
			.filter(c => c.sharedTypes?.length > 0)
			.slice(0, 4)
			.map(c =>
				`How does case "${(c.title ?? c.caseId).slice(0, 60)}" relate via ` +
				`${c.sharedTypes.slice(0, 2).join('/')} connections?`
			);
	} catch {
		return [];
	}
}

// ── Hot queries from analytics:hot_queries ZINCRBY ────────────────────────────

async function fetchHotQueryTags(limit = 8): Promise<string[]> {
	try {
		const redis = getRedis();
		const results = await redis.zrevrange('analytics:hot_queries', 0, limit - 1, 'WITHSCORES');
		// WITHSCORES returns [hash, score, hash, score, ...]
		// Lookup original queries from analytics:query_vecs hash
		const hashes = results.filter((_, i) => i % 2 === 0);
		if (!hashes.length) return [];
		const metas = await redis.hmget('analytics:query_vecs', ...hashes);
		const queries: string[] = [];
		for (const m of metas) {
			if (!m) continue;
			try {
				const parsed = JSON.parse(m) as { query?: string };
				if (parsed.query) queries.push(parsed.query.slice(0, 150));
			} catch { /* */ }
		}
		return queries;
	} catch {
		return [];
	}
}

// ── Main handler ───────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = paramsSchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json(
			{ topics: [], hotQueryTags: [], graphExpansions: [], meta: {}, error: parsed.error.issues[0]?.message },
			{ status: 400 }
		);
	}
	const { pipeline, caseId, limit, depth, domains, rebuild } = parsed.data;
	const domainList = domains ? domains.split(',').map(d => d.trim()).filter(Boolean) : [];

	// ── 1. Force-rebuild if requested ─────────────────────────────────────────
	if (rebuild === '1') {
		await invalidateResearchIndex();
	}

	// ── 2. Query Redis-cached index ────────────────────────────────────────────
	let sketches: ResearchSketch[] = await queryResearchIndex(pipeline, limit);

	// ── 3. If codebase pipeline & few results, seed with domain prompts ────────
	const seedTopics = (pipeline === 'codebase' || pipeline === 'all') && domainList.length
		? seedTopicsForDomains(domainList)
		: [];

	// ── 4. Parallel: hot queries + graph expansions ────────────────────────────
	const [hotQueryTags, graphExpansions] = await Promise.all([
		fetchHotQueryTags(10),
		caseId ? fetchGraphTopicExpansions(caseId) : Promise.resolve<string[]>([]),
	]);

	// ── 5. Build research topics with self-prompt chains ──────────────────────
	// Limit Ollama calls: only generate chains for top-5 (others use cache or skip)
	const topics = await Promise.all(
		sketches.slice(0, limit).map(async (sketch) => {
			// Check chain cache first
			let chain = await getCachedPromptChain(sketch.queryHash);

			if (!chain) {
				// Only call Ollama for high-quality sketches (gold+) to stay within budget
				const isHighQuality = ['platinum', 'gold'].includes(sketch.qualityTier ?? '');
				if (isHighQuality || sketch.compositeScore > 2.5) {
					chain = await generatePromptChain(
						sketch.query || 'How does this legal pipeline work?',
						sketch.entityTags,
						depth,
						domainList
					);
					if (chain.length) {
						cachePromptChain(sketch.queryHash, chain).catch(() => {});
					}
				} else {
					chain = [];
				}
			}

			return {
				queryHash:      sketch.queryHash,
				query:          sketch.query,
				pipeline:       sketch.pipelines[0] ?? pipeline,
				pipelines:      sketch.pipelines,
				qualityTier:    sketch.qualityTier,
				confidence:     Math.min(sketch.compositeScore / 8, 1.0), // normalise to [0,1]
				feedbackRatio:  sketch.feedbackRatio,
				feedbackUp:     sketch.feedbackUp,
				feedbackDown:   sketch.feedbackDown,
				entityTags:     sketch.entityTags,
				graphSummary:   sketch.graphSummary,
				selfPromptChain: chain,
			};
		})
	);

	// ── 6. Build index stats for meta ──────────────────────────────────────────
	const stats = await getResearchIndexStats();

	return json({
		topics,
		seedTopics,          // domain-seeded codebase starters (if requested)
		hotQueryTags,        // live hot-query ring buffer
		graphExpansions,     // Neo4j-derived related case questions
		meta: {
			pipeline,
			limit,
			depth,
			domains: domainList,
			cacheBuiltAt:    stats.builtAt,
			totalByPipeline: stats.totalByPipeline,
		},
	});
};

// ── POST: force rebuild ────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => ({})) as Record<string, unknown>;
	const action = body.action as string | undefined;

	if (action === 'rebuild') {
		const result = await buildResearchIndex();
		return json({ success: true, ...result });
	}

	return json({ error: 'Unknown action' }, { status: 400 });
};


