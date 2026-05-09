/**
 * /api/analytics/research-graph
 *
 * GET  — return cached graph stats (clusters, policy weights)
 * POST — { action: 'build' }      — rebuild graph from research_summaries
 *        { action: 'policy' }     — recompute RL policy weights from feedback
 *        { action: 'search', query, embedding, tags?, pipeline?, topK? }
 *                                 — tag-aware embedding search
 *        { action: 'rl-step', query, embedding, tags?, pipeline? }
 *                                 — run one full RL loop iteration
 */

import { json }           from '@sveltejs/kit';
import { z }              from 'zod';
import { getRedis, getJson } from '$lib/server/redis.js';
import {
	buildResearchGraph,
	computeRlPolicy,
	searchWithTagEmbedding,
	runResearchRlLoop,
	getCachedPolicy,
} from '$lib/server/analytics/research-graph-rl.js';
import type { RequestHandler } from './$types';

const REDIS_GRAPH_KEY   = 'ace:research:graph';
const REDIS_POLICY_KEY  = 'ace:research:policy';
// Rate-limit: max 10 rl-step calls per user per minute (GPU-bound operation)
const RL_RATE_LIMIT     = 10;
const RL_RATE_WINDOW_S  = 60;

const DEGRADED_GET_RESPONSE = {
	graph: { clusters: [], totalSummaries: 0, builtAt: null },
	policy: null,
};

// ── GET ───────────────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ ...DEGRADED_GET_RESPONSE, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		// Use a 30s timeout via getJson logic internally if possible, or just await
		const [graph, policy] = await Promise.all([
			getJson(REDIS_GRAPH_KEY).catch(() => null),
			getJson(REDIS_POLICY_KEY).catch(() => null),
		]);

		return json({
			graph:  graph  ?? DEGRADED_GET_RESPONSE.graph,
			policy: policy ?? null,
		});
	} catch (err) {
		console.warn('[ResearchGraph] GET failed:', err);
		return json({
			...DEGRADED_GET_RESPONSE,
			error: (err as Error)?.message ?? 'Retrieval failed',
		});
	}
};

// ── POST schemas ──────────────────────────────────────────────────────────────

const BuildSchema  = z.object({ action: z.literal('build')  });
const PolicySchema = z.object({ action: z.literal('policy') });

const SearchSchema = z.object({
	action:    z.literal('search'),
	query:     z.string().min(1).max(1000),
	embedding: z.array(z.number()).length(768),
	tags:      z.array(z.string()).max(20).optional().default([]),
	pipeline:  z.string().max(20).optional().default('ace'),
	topK:      z.number().int().min(1).max(50).optional().default(10),
});

const RlStepSchema = z.object({
	action:    z.literal('rl-step'),
	query:     z.string().min(1).max(1000),
	embedding: z.array(z.number()).length(768),
	tags:      z.array(z.string()).max(20).optional().default([]),
	pipeline:  z.string().max(20).optional().default('ace'),
});

const BodySchema = z.discriminatedUnion('action', [
	BuildSchema,
	PolicySchema,
	SearchSchema,
	RlStepSchema,
]);

// ── POST ──────────────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const parsed = BodySchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Bad request' }, { status: 400 });
	}

	const data = parsed.data;

	try {
		if (data.action === 'build') {
			const result = await buildResearchGraph();
			return json(result);
		}

		if (data.action === 'policy') {
			const weights = await computeRlPolicy();
			return json({ weights });
		}

		if (data.action === 'search') {
			const results = await searchWithTagEmbedding(
				data.query,
				data.embedding,
				data.tags,
				data.topK,
			);
			// Also return cached policy for client-side display
			const policy = await getCachedPolicy();
			return json({ results, policy });
		}

		if (data.action === 'rl-step') {
			// Token-bucket rate-limit: 10 requests/user/minute (GPU-bound)
			const bucketKey = `ratelimit:rl-step:${locals.user.id}`;
			try {
				const redis = getRedis();
				const count = await redis.incr(bucketKey);
				if (count === 1) await redis.expire(bucketKey, RL_RATE_WINDOW_S);
				if (count > RL_RATE_LIMIT) {
					return json({ error: 'Rate limit exceeded — max 10 rl-step requests per minute' }, { status: 429 });
				}
			} catch { /* Redis down — allow through rather than block */ }

			const result = await runResearchRlLoop({
				query:          data.query,
				queryEmbedding: data.embedding,
				tags:           data.tags,
				pipeline:       data.pipeline,
			});
			return json(result);
		}
	} catch (err) {
		console.error(`[ResearchGraph] POST ${data.action} failed:`, err);
		return json({
			error: (err as Error)?.message ?? `Action ${data.action} failed`,
			action: data.action,
		}, { status: 500 });
	}

	return json({ error: 'Unknown action' }, { status: 400 });
};
