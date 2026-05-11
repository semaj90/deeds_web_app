import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { contextualChat } from '$lib/server/llm/contextual-chat.js';
import { recordSearchQuery } from '$lib/server/analytics/search-analytics.js';
import { db } from '$lib/server/db/client';
import { contextTimeline } from '$lib/server/db/schema-postgres.js';
import { executeChain, routeIntent } from '$lib/server/ai/intent-router.js';
import { inferIntent } from '$lib/intent/regex-intent.js';
import { z } from 'zod';

const contextualChatSchema = z.object({
	message: z.string().max(50000).optional(),
	query: z.string().max(50000).optional(),
	caseId: z.string().max(500).optional().default(''),
	sessionId: z.string().max(500).optional(),
	tags: z.array(z.string().max(200)).max(20).optional(),
	jurisdiction: z.string().max(200).optional(),
	sectionTypes: z.array(z.enum([
		'facts', 'issues', 'reasoning', 'holding', 'citations',
		'parties', 'motions', 'bibliography', 'procedural_history',
		'sentencing', 'judgment'
	])).max(11).optional(),
	context: z.string().max(10000).optional().default(''),
	history: z.array(z.object({
		role: z.string().max(50),
		content: z.string().max(50000)
	})).max(50).optional().default([])
}).refine(d => (d.message?.trim() || d.query?.trim()), {
	message: 'Message is required'
});

/** POST /api/ai/contextual-chat — RAG-augmented case-context-aware chat */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		let raw: unknown;
		try {
			raw = await request.json();
		} catch {
			return json({ error: 'Invalid JSON' }, { status: 400 });
		}
		const parsed = contextualChatSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}

		const message = parsed.data.message || parsed.data.query || '';
		const { caseId, sessionId, tags, jurisdiction, sectionTypes } = parsed.data;
		const session = sessionId || '';
		const intent = inferIntent(message);
		const decision = routeIntent(intent, message, {
			userId: Number(locals.user.id),
			sessionId: session,
			caseId: caseId || undefined,
		});

		// Fire-and-forget analytics — does not affect response latency
		recordSearchQuery({ query: message, pipeline: 'contextual', cacheHit: false, userId: locals.user.id });
		void db.insert(contextTimeline).values({
			userId: Number(locals.user.id),
			sessionId: session,
			eventType: 'chat.intent',
			pipeline: 'ace',
			payload: {
				label: intent.label,
				confidence: intent.confidence,
				keywords: intent.keywords,
				route: decision.chain.map((step) => step.tool),
				fallback: decision.fallback,
				alternates: intent.alternates,
				reason: decision.reason,
			},
		}).catch(() => {});

		const chainExecution = await executeChain(decision, {
			userId: Number(locals.user.id),
			sessionId: session,
			caseId: caseId || undefined,
		});

		const result = await contextualChat({
			message,
			caseId: caseId || null,
			sessionId: session || null,
			userId: locals.user.id,
			tags: tags ?? null,
			jurisdiction: jurisdiction || null,
			sectionTypes: sectionTypes ?? null,
		});

		return json({
			response: result.answer,
			turnId: result.turnId,
			keywords: result.keywords,
			keyPhrases: result.keyPhrases,
			suggestions: result.suggestions,
			citations: result.citations,
			latencyMs: result.latencyMs,
			model: 'gemma4-legal:latest',
			intent: {
				label: intent.label,
				confidence: intent.confidence,
				keywords: intent.keywords,
				fallback: intent.fallback,
			},
			route: {
				reason: decision.reason,
				fallback: decision.fallback,
				chain: decision.chain,
				trace: chainExecution.trace,
				result: chainExecution.result,
			},
		});
	} catch (err) {
		console.error('[ai/contextual-chat] Error:', err);
		return json({ error: 'AI service unavailable' }, { status: 503 });
	}
};
