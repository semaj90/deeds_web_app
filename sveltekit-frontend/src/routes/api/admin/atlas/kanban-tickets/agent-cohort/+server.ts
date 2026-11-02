import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { listKanbanTasks } from '$lib/server/atlas/kanban-task-board.js';

const AgentCohortQuerySchema = z.object({
  cohort: z.string().trim().regex(/^openspec:[a-z0-9]+(?:-[a-z0-9]+)*$/).max(255),
  limit: z.coerce.number().int().min(1).max(5).default(5),
}).strict();

const stableEmpty = {
  ok: false,
  cohort: null as string | null,
  tasks: [] as unknown[],
  total: 0,
  invalidTasks: [] as unknown[],
  executionAdmission: 'BLOCKED_PERMISSION_AND_REVISION_PROOF' as const,
  dispatchAllowed: false as const,
  canonicalAuthority: false as const,
  error: null as string | null,
};

export const GET: RequestHandler = async ({ url, locals }) => {
  if (locals.user?.role !== 'admin') {
    return json({ ...stableEmpty, error: 'ADMIN_ONLY' }, { status: 403 });
  }

  const entries = [...url.searchParams.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) {
    return json({ ...stableEmpty, error: 'DUPLICATE_QUERY_PARAMETER' }, { status: 400 });
  }

  const parsed = AgentCohortQuerySchema.safeParse(Object.fromEntries(entries));
  if (!parsed.success) {
    return json({ ...stableEmpty, error: 'INVALID_AGENT_COHORT_QUERY' }, { status: 400 });
  }

  try {
    const board = await listKanbanTasks({
      featureId: parsed.data.cohort,
      lane: 'todo',
      status: 'pending',
      readyOnly: true,
      limit: parsed.data.limit,
    });

    return json({
      ...stableEmpty,
      ok: true,
      cohort: parsed.data.cohort,
      tasks: board.tasks,
      total: board.total,
      invalidTasks: board.invalid,
      error: null,
    });
  } catch {
    return json({ ...stableEmpty, error: 'KANBAN_COHORT_READ_UNAVAILABLE' }, { status: 503 });
  }
};
