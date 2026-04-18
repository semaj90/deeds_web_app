/**
 * PATCH /api/tasks/[id]   — update task status or trigger run
 * DELETE /api/tasks/[id]  — delete task
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { userResearchTasks, researchSummaries } from '$lib/server/db/schema-postgres.js';
import { eq, and } from 'drizzle-orm';

const ANON_SESSION_COOKIE = 'urt_session';

function getSession(cookies: import('@sveltejs/kit').Cookies): string {
	return cookies.get(ANON_SESSION_COOKIE) ?? '';
}

const patchSchema = z.object({
	status:   z.enum(['pending', 'running', 'done', 'failed']).optional(),
	notified: z.boolean().optional(),
	run:      z.boolean().optional(),
});

export const PATCH: RequestHandler = async ({ params, request, locals, cookies }) => {
	const userId = locals.user?.id ?? null;
	const sessionId = getSession(cookies);
	const taskId = params.id;

	const raw = await request.json().catch(() => ({})) as Record<string, unknown>;
	const parsed = patchSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: 'Invalid input' }, { status: 400 });
	}

	const ownerFilter = userId
		? eq(userResearchTasks.userId, userId)
		: eq(userResearchTasks.sessionId, sessionId);

	try {
		if (parsed.data.run) {
			// Mark running, then fire background execution
			const [task] = await db
				.update(userResearchTasks)
				.set({ status: 'running' })
				.where(and(eq(userResearchTasks.id, taskId), ownerFilter))
				.returning();

			if (task) {
				runDeepResearch(task.id, task.selfPrompt, task.pipelineHint).catch(() => {});
			}
			return json({ task });
		}

		const updates: Record<string, unknown> = {};
		if (parsed.data.status !== undefined) updates.status = parsed.data.status;
		if (parsed.data.notified !== undefined) updates.notified = parsed.data.notified;

		const [task] = await db
			.update(userResearchTasks)
			.set(updates)
			.where(and(eq(userResearchTasks.id, taskId), ownerFilter))
			.returning();

		return json({ task });
	} catch {
		return json({ error: 'Update failed' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params, locals, cookies }) => {
	const userId = locals.user?.id ?? null;
	const sessionId = getSession(cookies);

	const ownerFilter = userId
		? eq(userResearchTasks.userId, userId)
		: eq(userResearchTasks.sessionId, sessionId);

	try {
		await db
			.delete(userResearchTasks)
			.where(and(eq(userResearchTasks.id, params.id), ownerFilter));
		return json({ ok: true });
	} catch {
		return json({ error: 'Delete failed' }, { status: 500 });
	}
};

async function runDeepResearch(taskId: string, selfPrompt: string, pipelineHint: string) {
	try {
		const [task] = await db
			.select()
			.from(userResearchTasks)
			.where(eq(userResearchTasks.id, taskId))
			.limit(1);

		const { bifrostChat } = await import('$lib/server/ollama.js');
		const systemPrompts: Record<string, string> = {
			rag: 'You are a legal research AI. Provide thorough analysis with citations to relevant statutes and case law.',
			kag: 'You are a legal knowledge graph analyst. Trace relationships between legal concepts, cases, and statutes.',
			dag: 'You are a legal document dependency analyst. Analyze document relationships and precedent chains.',
			ace: 'You are an advanced contextual legal AI. Synthesize information from multiple retrieval pipelines and provide actionable analysis.',
		};
		const system = systemPrompts[pipelineHint] ?? systemPrompts.ace;
		const start = Date.now();
		const answer = await bifrostChat(
			[{ role: 'system', content: system }, { role: 'user', content: selfPrompt }],
			'gemma4-legal:latest',
			{ temperature: 0.3, maxTokens: 1536, timeoutMs: 120_000 },
		);
		const durationMs = Date.now() - start;

		let summaryId: string | undefined;
		try {
			function fnv1a(text: string): string {
				let h = 2166136261;
				for (let i = 0; i < Math.min(text.length, 512); i++) {
					h ^= text.charCodeAt(i);
					h = Math.imul(h, 16777619) >>> 0;
				}
				return h.toString(16).padStart(8, '0');
			}
			const [summary] = await db
				.insert(researchSummaries)
				.values({
					source:         'report',
					pipeline:       pipelineHint as 'ace' | 'rag' | 'kag' | 'dag' | 'codebase',
					entityType:     'task_result',
					query:          selfPrompt,
					queryHash:      fnv1a(selfPrompt),
					title:          task?.title ?? selfPrompt.slice(0, 120),
					summary:        answer.slice(0, 4000),
					entityTags:     [],
					relevanceScore: 0.8,
					userId:         task?.userId ?? null,
				})
				.returning({ id: researchSummaries.id });
			summaryId = summary?.id;
		} catch { /* non-fatal — result still saved in task */ }

		const result = { answer, pipeline: pipelineHint, durationMs, summaryId };
		await db
			.update(userResearchTasks)
			.set({ status: 'done', result: result as Record<string, unknown>, notified: false, completedAt: new Date() })
			.where(eq(userResearchTasks.id, taskId));
	} catch {
		await db
			.update(userResearchTasks)
			.set({ status: 'failed' })
			.where(eq(userResearchTasks.id, taskId));
	}
}
