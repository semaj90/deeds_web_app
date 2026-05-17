/**
 * PATCH /api/tasks/[id]   — update task status or trigger run
 * DELETE /api/tasks/[id]  — delete task
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { userResearchTasks } from '$lib/server/db/schema-postgres.js';
import { eq, and } from 'drizzle-orm';
import { runResearchTask } from '$lib/server/research/task-runner.js';

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
	const userIdStr = locals.user?.id ?? null;
	const userId = userIdStr ? Number(userIdStr) : null;
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
				runResearchTask(task.id, {
          selfPrompt: task.selfPrompt,
          pipelineHint: task.pipelineHint,
        }).catch(() => {});
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
	const userIdStr = locals.user?.id ?? null;
	const userId = userIdStr ? Number(userIdStr) : null;
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
