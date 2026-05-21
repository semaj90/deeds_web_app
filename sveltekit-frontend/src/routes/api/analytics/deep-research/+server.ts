/**
 * GET  /api/analytics/deep-research
 *   Returns personalized deep research topics generated from RAG/KAG/DAG/ACE
 *   hit analytics, thumbs-up/down feedback index, graph centrality, and user
 *   analytics context — via Ollama self-prompting.
 *
 *   Query params:
 *     refresh?  boolean — bypass 30-min Redis cache and regenerate
 *
 *   Response: DeepResearchResult (topics, feedbackSignals, pipelineSummary,
 *             graphInsights, hotQueryTags, topPrompts, generatedAt, modelUsed)
 *
 * POST /api/analytics/deep-research
 *   Execute a self-prompt: takes a research topic's selfPrompt and runs it
 *   through the RAG/ACE pipeline, returning the deep analysis result.
 *
 *   Body: { selfPrompt: string, pipelineHint?: string, caseId?: string }
 *
 *   Response: { answer: string, pipeline: string, durationMs: number, cached: boolean }
 *
 * DELETE /api/analytics/deep-research
 *   Invalidate the user's cached deep research topics.
 *
 * Auth: requires locals.user
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { generateDeepResearch, invalidateDeepResearchCache } from '$lib/server/analytics/deep-research.js';
import { bifrostChat } from '$lib/server/ollama.js';
import { ENV } from '$lib/server/env.server.js';
import { startLdrResearch, searchLdrHistory } from '$lib/server/analytics/ldr-client.js';

// ── Schemas ────────────────────────────────────────────────────────────────

const postSchema = z.object({
	selfPrompt:   z.string().min(3).max(500),
	pipelineHint: z.string().max(20).optional(),
	caseId:       z.string().uuid().optional(),
});

// ── GET — generate or retrieve cached research topics ──────────────────────

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) {
		return json({
			topics: [], feedbackSignals: [], pipelineSummary: [],
			graphInsights: [], hotQueryTags: [], topPrompts: [],
			generatedAt: null, modelUsed: null, cachedUntil: null,
		});
	}

	const refresh = url.searchParams.get('refresh') === 'true';
	const userId = locals.user.id as string;

	try {
		const result = await generateDeepResearch(userId, { skipCache: refresh });
		return json(result);
	} catch (err) {
		console.error('[deep-research] Generation failed:', (err as Error).message);
		return json({
			topics: [], feedbackSignals: [], pipelineSummary: [],
			graphInsights: [], hotQueryTags: [], topPrompts: [],
			generatedAt: new Date().toISOString(),
			modelUsed: null, cachedUntil: null,
			error: 'Research generation temporarily unavailable',
		});
	}
};

// ── POST — execute a self-prompt via RAG/ACE ───────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => ({}));
	const parsed = postSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { selfPrompt, pipelineHint, caseId } = parsed.data;
	const start = Date.now();

	const ldrEnabled = (ENV as any).LDR_ENABLED !== false;

	if (ldrEnabled) {
		try {
			// 1. Check history/cache
			const cached = await searchLdrHistory(selfPrompt);
			if (cached && cached.summary && cached.summary.length > 50) {
				return json({
					answer: cached.summary,
					pipeline: pipelineHint ?? 'ace',
					durationMs: Date.now() - start,
					cached: true,
					provider: 'ldr',
					sources: cached.sources,
				});
			}

			// 2. Start a new task
			const ref = await startLdrResearch(selfPrompt, { maxIterations: 3 });
			if (ref) {
				return json({
					status: 'running',
					taskId: ref.taskId,
					queryHash: ref.queryHash,
					pipeline: pipelineHint ?? 'ace',
					provider: 'ldr',
				});
			}
		} catch (err) {
			console.warn('[deep-research API] LDR path failed, falling back to local Gemma4:', err);
		}
	}

	try {
		// Build system prompt based on pipeline hint
		const systemPrompts: Record<string, string> = {
			rag: 'You are a legal research AI. Provide a thorough analysis with citations to relevant statutes and case law. Be comprehensive and accurate.',
			kag: 'You are a legal knowledge graph analyst. Trace relationships between legal concepts, cases, and statutes. Identify precedent chains and doctrinal connections.',
			dag: 'You are a legal document dependency analyst. Analyze how documents relate to each other, identify superseded authorities, and trace amendment histories.',
			ace: 'You are an advanced contextual legal AI. Synthesize information from multiple retrieval pipelines, weighing source authority and recency. Provide actionable legal analysis.',
		};

		const system = systemPrompts[pipelineHint ?? 'ace'] ?? systemPrompts.ace;

		const caseContext = caseId
			? `\n\nContext: This analysis pertains to case ID ${caseId}. Consider case-specific evidence and relationships.`
			: '';

		const answer = await bifrostChat(
			[
				{ role: 'system', content: system + caseContext },
				{ role: 'user', content: selfPrompt },
			],
			'gemma4-legal:latest',
			{
				temperature: 0.3,
				maxTokens: 1536,
				timeoutMs: 60_000,
			},
		);

		return json({
			answer,
			pipeline: pipelineHint ?? 'ace',
			durationMs: Date.now() - start,
			cached: false,
			provider: 'gemma4-legal',
		});
	} catch (err) {
		return json({
			error: 'Deep research execution failed',
			pipeline: pipelineHint ?? 'ace',
			durationMs: Date.now() - start,
		}, { status: 502 });
	}
};

// ── DELETE — invalidate cache ──────────────────────────────────────────────

export const DELETE: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const cleared = await invalidateDeepResearchCache(locals.user.id as string);
	return json({ cleared });
};
