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
import { getRedis }       from '$lib/server/redis.js';
import {
	buildResearchGraph,
	computeRlPolicy,
	searchWithTagEmbedding,
	runResearchRlLoop,
	getCachedPolicy,
} from '$lib/server/analytics/research-graph-rl.js';
import type { RequestHandler } from './$types';

const REDIS_GRAPH_KEY  = 'rsgraph:clusters';
const REDIS_POLICY_KEY = 'rlpolicy:pipeline_weights';

// ── GET ───────────────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ clusters: [], policy: null, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const redis = getRedis();
		const [rawGraph, rawPolicy] = await Promise.all([
			redis.get(REDIS_GRAPH_KEY),
			redis.get(REDIS_POLICY_KEY),
		]);

		const graph  = rawGraph  ? JSON.parse(rawGraph)  : null;
		const policy = rawPolicy ? JSON.parse(rawPolicy) : null;

		return json({
			graph:  graph  ?? { clusters: [], totalSummaries: 0, builtAt: null },
			policy: policy ?? null,
		});
	} catch {
		return json({ graph: { clusters: [], totalSummaries: 0, builtAt: null }, policy: null });
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
		const result = await runResearchRlLoop({
			query:          data.query,
			queryEmbedding: data.embedding,
			tags:           data.tags,
			pipeline:       data.pipeline,
		});
		return json(result);
	}

	return json({ error: 'Unknown action' }, { status: 400 });
};
