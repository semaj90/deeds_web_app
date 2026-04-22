/**
 * GET  /api/tasks          — list research tasks for the current user (or session)
 * POST /api/tasks          — create a task; optionally run deep-research immediately
 * PATCH /api/tasks/[id]    — update status / result (handled in [id]/+server.ts)
 * DELETE /api/tasks/[id]   — delete (handled in [id]/+server.ts)
 *
 * Anonymous users get tasks by sessionId cookie (30-day TTL).
 * Authenticated users get tasks by userId; sessionId tasks merged on first login.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { userResearchTasks } from '$lib/server/db/schema-postgres.js';
import { eq, desc } from 'drizzle-orm';
import { runResearchTask, type ResearchTaskProvider } from '$lib/server/research/task-runner.js';

const ANON_SESSION_COOKIE = 'urt_session';
const SESSION_TTL_DAYS = 30;

function getOrCreateSession(cookies: import('@sveltejs/kit').Cookies): string {
	let sid = cookies.get(ANON_SESSION_COOKIE);
	if (!sid) {
		sid = crypto.randomUUID();
		cookies.set(ANON_SESSION_COOKIE, sid, {
			path: '/',
			maxAge: 60 * 60 * 24 * SESSION_TTL_DAYS,
			httpOnly: true,
			sameSite: 'lax',
		});
	}
	return sid;
}

// ── GET — list tasks ──────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ locals, cookies }) => {
	const userId = locals.user?.id ?? null;
	const sessionId = getOrCreateSession(cookies);

	try {
		const rows = await db
			.select()
			.from(userResearchTasks)
			.where(
				userId
					? eq(userResearchTasks.userId, userId)
					: eq(userResearchTasks.sessionId, sessionId)
			)
			.orderBy(desc(userResearchTasks.createdAt))
			.limit(50);

		return json({ tasks: rows });
	} catch {
		return json({ tasks: [] });
	}
};

// ── POST — create task ────────────────────────────────────────────────────────

const createSchema = z.object({
  title: z.string().min(1).max(200),
  selfPrompt: z.string().min(3).max(1000),
  pipelineHint: z.enum(['ace', 'rag', 'kag', 'dag', 'all']).default('ace'),
  provider: z.enum(['ollama']).default('ollama'),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  sourceText: z.string().max(2000).optional(),
  summary: z.string().max(1000).optional(),
  runNow: z.boolean().default(false),
});

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	const userId = locals.user?.id ?? null;
	const sessionId = getOrCreateSession(cookies);

	const raw = await request.json().catch(() => ({})) as Record<string, unknown>;
	const parsed = createSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { title, selfPrompt, pipelineHint, provider, priority, sourceText, summary, runNow } =
    parsed.data;

	try {
		const [task] = await db
      .insert(userResearchTasks)
      .values({
        userId,
        sessionId: userId ? null : sessionId,
        title,
        selfPrompt,
        pipelineHint,
        priority,
        sourceText: sourceText ?? null,
        summary: summary ?? null,
        result: { provider } satisfies { provider: ResearchTaskProvider },
        status: runNow ? 'running' : 'pending',
      })
      .returning();

		// Fire-and-forget deep research if runNow
		if (runNow && task) {
			runResearchTask(task.id, { selfPrompt, pipelineHint, provider }).catch(() => {});
		}

		return json({ task }, { status: 201 });
	} catch (err) {
		console.error('[tasks] create error:', err);
		return json({ error: 'Failed to create task' }, { status: 500 });
	}
};
