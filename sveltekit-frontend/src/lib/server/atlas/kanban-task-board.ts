import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '$lib/server/db/client.js';
import {
  kanbanTaskAttempts,
  kanbanTaskComments,
  kanbanTaskDependencies,
  kanbanTaskEvents,
  kanbanTasks,
} from '$lib/server/db/schema/kanban-tasks.js';

type KanbanDb = typeof db;

export const KanbanTaskLaneSchema = z.enum(['todo', 'in_progress', 'done']);
export const KanbanTaskStatusSchema = z.enum(['pending', 'active', 'completed', 'failed']);

export const KanbanTaskSchema = z.object({
  taskId: z.string().min(1),
  featureId: z.string().min(1),
  featureLabel: z.string().min(1),
  sourceRefs: z.array(z.string().min(1)),
  lane: KanbanTaskLaneSchema,
  status: KanbanTaskStatusSchema,
  validationCommand: z.string().nullable(),
  assignee: z.string().nullable().optional(),
  priority: z.number().int().optional(),
  claimToken: z.string().nullable().optional(),
  claimExpiresAt: z.string().nullable().optional(),
  lastHeartbeatAt: z.string().nullable().optional(),
  currentRunId: z.string().nullable().optional(),
  attemptCount: z.number().int().optional(),
  failureCount: z.number().int().optional(),
  maxRetries: z.number().int().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  idempotencyKey: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type KanbanTask = z.infer<typeof KanbanTaskSchema>;

export const KanbanTaskListInputSchema = z.object({
  lane: KanbanTaskLaneSchema.optional(),
  status: KanbanTaskStatusSchema.optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

export type KanbanTaskListInput = z.infer<typeof KanbanTaskListInputSchema>;

export const KanbanTaskListOutputSchema = z.object({
  tasks: z.array(KanbanTaskSchema),
  total: z.number().int().nonnegative(),
});

export type KanbanTaskListOutput = z.infer<typeof KanbanTaskListOutputSchema>;

export const KanbanTaskShowInputSchema = z.object({
  taskId: z.string().min(1),
});

export const KanbanTaskClaimInputSchema = z.object({
  taskId: z.string().min(1),
  workerId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  claimToken: z.string().min(1).optional(),
  validationCommand: z.string().min(1).optional(),
});

export const KanbanTaskBlockInputSchema = z.object({
  taskId: z.string().min(1),
  reason: z.string().min(1).optional(),
  validationCommand: z.string().min(1).optional(),
});

export const KanbanTaskCompleteInputSchema = z.object({
  taskId: z.string().min(1),
  workerId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  validationCommand: z.string().min(1).optional(),
});

export const KanbanTaskRetryInputSchema = z.object({
  taskId: z.string().min(1),
  reason: z.string().min(1).optional(),
  validationCommand: z.string().min(1).optional(),
});

export const KanbanTaskReclaimInputSchema = z.object({
  taskId: z.string().min(1),
  validationCommand: z.string().min(1).optional(),
});

export const KanbanTaskHeartbeatInputSchema = z.object({
  taskId: z.string().min(1),
  claimToken: z.string().min(1),
  runId: z.string().min(1),
  note: z.string().min(1).optional(),
});

export const KanbanTaskHeartbeatResultSchema = z.object({
  task: KanbanTaskSchema,
  heartbeatAt: z.string(),
  claimExpiresAt: z.string(),
});

export const KanbanTaskClaimResultSchema = z.object({
  task: KanbanTaskSchema,
  claimToken: z.string().min(1),
  runId: z.string().min(1),
  claimExpiresAt: z.string(),
});

export const KanbanTaskCreateChildInputSchema = z.object({
  parentTaskId: z.string().min(1),
  taskId: z.string().min(1),
  featureId: z.string().min(1),
  featureLabel: z.string().min(1),
  sourceRefs: z.array(z.string().min(1)).default([]),
  lane: KanbanTaskLaneSchema.default('todo'),
  validationCommand: z.string().min(1).optional(),
});

export const KanbanTaskDependencySchema = z.object({
  parentTaskId: z.string().min(1),
  childTaskId: z.string().min(1),
  createdAt: z.string(),
});

export type KanbanTaskDependency = z.infer<typeof KanbanTaskDependencySchema>;

export const KanbanTaskDependenciesInputSchema = z.object({
  parentTaskId: z.string().min(1).optional(),
  childTaskId: z.string().min(1).optional(),
});

export const KanbanTaskCommentSchema = z.object({
  id: z.number().int().positive(),
  taskId: z.string().min(1),
  author: z.string().min(1),
  body: z.string().min(1),
  createdAt: z.string(),
});

export type KanbanTaskComment = z.infer<typeof KanbanTaskCommentSchema>;

export const KanbanTaskCommentsInputSchema = z.object({
  taskId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

export const KanbanTaskAttemptSchema = z.object({
  id: z.number().int().positive(),
  taskId: z.string().min(1),
  runId: z.string().min(1),
  worker: z.string().min(1),
  startedAt: z.string(),
  finishedAt: z.string().nullable().optional(),
  success: z.boolean(),
  failureKind: z.string().nullable().optional(),
  executionReceiptId: z.string().nullable().optional(),
});

export type KanbanTaskAttempt = z.infer<typeof KanbanTaskAttemptSchema>;

export const KanbanTaskAttemptsInputSchema = z.object({
  taskId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

export const KanbanTaskEventTypeSchema = z.enum([
  'claimed',
  'heartbeat',
  'blocked',
  'completed',
  'retried',
  'stale_claim_reclaimed',
  'child_created',
  'dependency_linked',
  'promoted_ready',
  'protocol_violation',
]);

export const KanbanTaskEventSchema = z.object({
  taskId: z.string().min(1),
  runId: z.string().min(1).nullable().optional(),
  eventType: KanbanTaskEventTypeSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
});

export type KanbanTaskEvent = z.infer<typeof KanbanTaskEventSchema>;

async function withKanbanTransaction<T>(fn: (tx: KanbanDb) => Promise<T>): Promise<T> {
  const dbAny = db as unknown as {
    transaction?: <U>(fn: (tx: KanbanDb) => Promise<U>) => Promise<U>;
  };

  if (dbAny.transaction) {
    return dbAny.transaction(fn);
  }

  return fn(db);
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.length > 0) return value;
  return new Date().toISOString();
}

function optionalIso(value: unknown): string | null | undefined {
  if (value == null) return value === null ? null : undefined;
  return toIso(value);
}

function optionalNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeRow(row: Record<string, unknown>): KanbanTask {
  return KanbanTaskSchema.parse({
    taskId: String(row.task_id ?? ''),
    featureId: String(row.feature_id ?? ''),
    featureLabel: String(row.feature_label ?? ''),
    sourceRefs: Array.isArray(row.source_refs) ? row.source_refs.map((item) => String(item)) : [],
    lane: String(row.lane ?? 'todo'),
    status: String(row.status ?? 'pending'),
    validationCommand: row.validation_command == null ? null : String(row.validation_command),
    assignee: row.assignee == null ? null : String(row.assignee),
    priority: optionalNumber(row.priority),
    claimToken: row.claim_token == null ? null : String(row.claim_token),
    claimExpiresAt: optionalIso(row.claim_expires_at),
    lastHeartbeatAt: optionalIso(row.last_heartbeat_at),
    currentRunId: row.current_run_id == null ? null : String(row.current_run_id),
    attemptCount: optionalNumber(row.attempt_count),
    failureCount: optionalNumber(row.failure_count),
    maxRetries: optionalNumber(row.max_retries),
    startedAt: optionalIso(row.started_at),
    completedAt: optionalIso(row.completed_at),
    idempotencyKey: row.idempotency_key == null ? null : String(row.idempotency_key),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  });
}

function isTaskDone(task: KanbanTask | null): boolean {
  return task?.lane === 'done' && task.status === 'completed';
}

async function appendKanbanTaskEvent(dbLike: KanbanDb, input: {
  taskId: string;
  eventType: z.infer<typeof KanbanTaskEventTypeSchema>;
  payload?: Record<string, unknown>;
  runId?: string | null;
  createdAt?: Date;
}): Promise<void> {
  const createdAt = input.createdAt ?? new Date();
  await dbLike
    .insert(kanbanTaskEvents)
    .values({
      taskId: input.taskId,
      runId: input.runId ?? null,
      eventType: input.eventType,
      payload: input.payload ?? {},
      createdAt,
    })
    .returning();
}

async function insertDependencyEdge(dbLike: KanbanDb, parentTaskId: string, childTaskId: string, createdAt: Date): Promise<void> {
  await dbLike
    .insert(kanbanTaskDependencies)
    .values({
      parentTaskId,
      childTaskId,
      createdAt,
    })
    .returning();
}

async function appendAttempt(dbLike: KanbanDb, input: {
  taskId: string;
  runId: string;
  worker: string;
  failureKind?: string | null;
  success?: boolean;
  executionReceiptId?: string | null;
}): Promise<void> {
  const now = new Date();
  await dbLike
    .insert(kanbanTaskAttempts)
    .values({
      taskId: input.taskId,
      runId: input.runId,
      worker: input.worker,
      startedAt: now,
      finishedAt: now,
      success: input.success ?? false,
      failureKind: input.failureKind ?? null,
      executionReceiptId: input.executionReceiptId ?? null,
    })
    .returning();
}

export async function recordKanbanTaskAttempt(input: {
  taskId: string;
  runId: string;
  worker: string;
  success?: boolean;
  failureKind?: string | null;
  executionReceiptId?: string | null;
}): Promise<void> {
  await withKanbanTransaction(async (tx) => {
    await appendAttempt(tx, input);
  });
}

export async function recordKanbanProtocolViolation(input: {
  taskId: string;
  runId: string;
  worker: string;
  reason: string;
  receiptId?: string | null;
}): Promise<void> {
  await withKanbanTransaction(async (tx) => {
    await appendKanbanTaskEvent(tx, {
      taskId: input.taskId,
      runId: input.runId,
      eventType: 'protocol_violation',
      payload: {
        worker: input.worker,
        reason: input.reason,
        receiptId: input.receiptId ?? null,
      },
    });
    await appendAttempt(tx, {
      taskId: input.taskId,
      runId: input.runId,
      worker: input.worker,
      failureKind: 'protocol_violation',
      success: false,
      executionReceiptId: input.receiptId ?? null,
    });
  });
}

export async function listKanbanTaskComments(input: z.infer<typeof KanbanTaskCommentsInputSchema>): Promise<KanbanTaskComment[]> {
  const parsed = KanbanTaskCommentsInputSchema.parse(input);
  const rows = parsed.taskId
    ? await db
        .select()
        .from(kanbanTaskComments)
        .where(eq(kanbanTaskComments.taskId, parsed.taskId))
        .orderBy(asc(kanbanTaskComments.createdAt), asc(kanbanTaskComments.id))
        .limit(parsed.limit)
    : await db
        .select()
        .from(kanbanTaskComments)
        .orderBy(asc(kanbanTaskComments.createdAt), asc(kanbanTaskComments.id))
        .limit(parsed.limit);

  return (rows as Array<Record<string, unknown>>).map((row) => KanbanTaskCommentSchema.parse({
    id: Number(row.id),
    taskId: String(row.task_id ?? ''),
    author: String(row.author ?? ''),
    body: String(row.body ?? ''),
    createdAt: toIso(row.created_at),
  }));
}

export async function listKanbanTaskAttempts(input: z.infer<typeof KanbanTaskAttemptsInputSchema>): Promise<KanbanTaskAttempt[]> {
  const parsed = KanbanTaskAttemptsInputSchema.parse(input);
  const conditions = [
    parsed.taskId ? sql`task_id = ${parsed.taskId}` : undefined,
    parsed.runId ? sql`run_id = ${parsed.runId}` : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => condition !== undefined);

  const rows = await db.execute(sql`
    SELECT id, task_id, run_id, worker, started_at, finished_at, success, failure_kind, execution_receipt_id
    FROM kanban_task_attempts
    ${conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``}
    ORDER BY started_at ASC, id ASC
    LIMIT ${parsed.limit}
  `);

  return (rows.rows as Array<Record<string, unknown>>).map((row) => KanbanTaskAttemptSchema.parse({
    id: Number(row.id),
    taskId: String(row.task_id ?? ''),
    runId: String(row.run_id ?? ''),
    worker: String(row.worker ?? ''),
    startedAt: toIso(row.started_at),
    finishedAt: row.finished_at == null ? null : toIso(row.finished_at),
    success: Boolean(row.success),
    failureKind: row.failure_kind == null ? null : String(row.failure_kind),
    executionReceiptId: row.execution_receipt_id == null ? null : String(row.execution_receipt_id),
  }));
}

async function selectTask(taskId: string): Promise<KanbanTask | null> {
  const rows = await db.select().from(kanbanTasks).where(eq(kanbanTasks.taskId, taskId)).limit(1);
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? normalizeRow(row) : null;
}

async function mutateTask(dbLike: KanbanDb, taskId: string, values: Record<string, unknown>): Promise<KanbanTask> {
  const rows = await dbLike
    .update(kanbanTasks)
    .set({
      ...values,
      updatedAt: new Date(),
    })
    .where(eq(kanbanTasks.taskId, taskId))
    .returning();

  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    throw new Error(`Kanban task not found: ${taskId}`);
  }
  return normalizeRow(row);
}

function leaseExpiration(hours = 0, minutes = 15): Date {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + minutes + hours * 60);
  return expiresAt;
}

export async function listKanbanTasks(input: KanbanTaskListInput): Promise<KanbanTaskListOutput> {
  const parsed = KanbanTaskListInputSchema.parse(input);
  const conditions = [
    parsed.lane ? eq(kanbanTasks.lane, parsed.lane) : undefined,
    parsed.status ? eq(kanbanTasks.status, parsed.status) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => condition !== undefined);

  const rows = conditions.length > 0
    ? await db
        .select()
        .from(kanbanTasks)
        .where(and(...conditions))
        .orderBy(desc(kanbanTasks.updatedAt), asc(kanbanTasks.taskId))
        .limit(parsed.limit)
    : await db
        .select()
        .from(kanbanTasks)
        .orderBy(desc(kanbanTasks.updatedAt), asc(kanbanTasks.taskId))
        .limit(parsed.limit);

  const totalQuery = conditions.length > 0
    ? db
        .select({ total: sql<number>`count(*)` })
        .from(kanbanTasks)
        .where(and(...conditions))
    : db.select({ total: sql<number>`count(*)` }).from(kanbanTasks);

  const totalRows = await totalQuery;
  const total = Number((totalRows[0] as { total?: number } | undefined)?.total ?? rows.length);

  return {
    tasks: (rows as Array<Record<string, unknown>>).map(normalizeRow),
    total,
  };
}

export async function showKanbanTask(input: { taskId: string }): Promise<KanbanTask | null> {
  const parsed = KanbanTaskShowInputSchema.parse(input);
  return selectTask(parsed.taskId);
}

export async function claimKanbanTask(input: z.infer<typeof KanbanTaskClaimInputSchema>): Promise<z.infer<typeof KanbanTaskClaimResultSchema>> {
  const parsed = KanbanTaskClaimInputSchema.parse(input);
  return withKanbanTransaction(async (tx) => {
    const now = new Date();
    const runId = parsed.runId ?? `run:${parsed.workerId ?? 'anonymous'}:${parsed.taskId}:${now.getTime()}`;
    const claimToken = parsed.claimToken ?? `claim:${runId}`;
    const claimExpiresAt = leaseExpiration();
    const rows = await tx
      .update(kanbanTasks)
      .set({
        lane: 'in_progress',
        status: 'active',
        assignee: parsed.workerId ?? null,
        claimToken,
        currentRunId: runId,
        claimExpiresAt,
        lastHeartbeatAt: now,
        startedAt: sql`coalesce(${kanbanTasks.startedAt}, now())`,
        attemptCount: sql`${kanbanTasks.attemptCount} + 1`,
        validationCommand:
          parsed.validationCommand ??
          (parsed.workerId ? `claimed_by:${parsed.workerId}` : 'claimed'),
        updatedAt: now,
      })
      .where(
        and(
          eq(kanbanTasks.taskId, parsed.taskId),
          eq(kanbanTasks.lane, 'todo'),
          eq(kanbanTasks.status, 'pending'),
          isNull(kanbanTasks.claimToken),
        ),
      )
      .returning();

    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      throw new Error(`Kanban claim conflict or task not found: ${parsed.taskId}`);
    }
    await appendKanbanTaskEvent(tx, {
      taskId: parsed.taskId,
      runId,
      eventType: 'claimed',
      payload: {
        workerId: parsed.workerId ?? null,
        claimToken,
        claimExpiresAt: claimExpiresAt.toISOString(),
      },
    });
    return {
      task: normalizeRow(row),
      claimToken,
      runId,
      claimExpiresAt: claimExpiresAt.toISOString(),
    };
  });
}

export async function blockKanbanTask(input: { taskId: string; reason?: string }): Promise<KanbanTask> {
  const parsed = KanbanTaskBlockInputSchema.parse(input);
  return withKanbanTransaction(async (tx) => {
    const task = await mutateTask(tx, parsed.taskId, {
      lane: 'todo',
      status: 'failed',
      assignee: null,
      claimToken: null,
      claimExpiresAt: null,
      lastHeartbeatAt: null,
      currentRunId: null,
      validationCommand:
        parsed.validationCommand ??
        (parsed.reason ? `blocked:${parsed.reason}` : 'blocked'),
    });
    await appendKanbanTaskEvent(tx, {
      taskId: parsed.taskId,
      eventType: 'blocked',
      payload: { reason: parsed.reason ?? null },
    });
    return task;
  });
}

export async function completeKanbanTask(input: { taskId: string; workerId?: string }): Promise<KanbanTask> {
  const parsed = KanbanTaskCompleteInputSchema.parse(input);
  return withKanbanTransaction(async (tx) => {
    const now = new Date();
    const task = await mutateTask(tx, parsed.taskId, {
      lane: 'done',
      status: 'completed',
      assignee: parsed.workerId ?? null,
      claimToken: null,
      claimExpiresAt: null,
      lastHeartbeatAt: now,
      completedAt: now,
      currentRunId: parsed.runId ?? (parsed.workerId ? `run:${parsed.workerId}` : null),
      validationCommand:
        parsed.validationCommand ??
        (parsed.workerId ? `completed_by:${parsed.workerId}` : 'completed'),
    });
    await appendKanbanTaskEvent(tx, {
      taskId: parsed.taskId,
      runId: parsed.runId ?? (parsed.workerId ? `run:${parsed.workerId}` : undefined),
      eventType: 'completed',
      payload: { workerId: parsed.workerId ?? null },
    });
    return task;
  });
}

export async function retryKanbanTask(input: { taskId: string; reason?: string }): Promise<KanbanTask> {
  const parsed = KanbanTaskRetryInputSchema.parse(input);
  return withKanbanTransaction(async (tx) => {
    const task = await mutateTask(tx, parsed.taskId, {
      lane: 'todo',
      status: 'pending',
      assignee: null,
      claimToken: null,
      claimExpiresAt: null,
      lastHeartbeatAt: null,
      currentRunId: null,
      validationCommand:
        parsed.validationCommand ??
        (parsed.reason ? `retry:${parsed.reason}` : 'retry'),
    });
    await appendKanbanTaskEvent(tx, {
      taskId: parsed.taskId,
      eventType: 'retried',
      payload: { reason: parsed.reason ?? null },
    });
    return task;
  });
}

export async function reclaimStaleKanbanTask(input: z.infer<typeof KanbanTaskReclaimInputSchema>): Promise<KanbanTask> {
  const parsed = KanbanTaskReclaimInputSchema.parse(input);
  return withKanbanTransaction(async (tx) => {
    const now = new Date();
    const rows = await tx
      .update(kanbanTasks)
      .set({
        lane: 'todo',
        status: 'pending',
        assignee: null,
        claimToken: null,
        claimExpiresAt: null,
        lastHeartbeatAt: null,
        currentRunId: null,
        updatedAt: now,
        validationCommand:
          parsed.validationCommand ?? 'stale_claim_reclaimed',
      })
      .where(
        and(
          eq(kanbanTasks.taskId, parsed.taskId),
          eq(kanbanTasks.status, 'active'),
          sql`${kanbanTasks.claimExpiresAt} IS NOT NULL AND ${kanbanTasks.claimExpiresAt} <= now()`,
        ),
      )
      .returning();

    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      throw new Error(`Kanban stale reclaim rejected for task ${parsed.taskId}`);
    }

    await appendKanbanTaskEvent(tx, {
      taskId: parsed.taskId,
      eventType: 'stale_claim_reclaimed',
      payload: {},
    });
    return normalizeRow(row);
  });
}

export async function heartbeatKanbanTask(input: z.infer<typeof KanbanTaskHeartbeatInputSchema>): Promise<z.infer<typeof KanbanTaskHeartbeatResultSchema>> {
  const parsed = KanbanTaskHeartbeatInputSchema.parse(input);
  return withKanbanTransaction(async (tx) => {
    const heartbeatAt = new Date();
    const claimExpiresAt = leaseExpiration();
    const rows = await tx
      .update(kanbanTasks)
      .set({
        lastHeartbeatAt: heartbeatAt,
        claimExpiresAt,
        updatedAt: heartbeatAt,
      })
      .where(
        and(
          eq(kanbanTasks.taskId, parsed.taskId),
          eq(kanbanTasks.status, 'active'),
          eq(kanbanTasks.claimToken, parsed.claimToken),
          eq(kanbanTasks.currentRunId, parsed.runId),
        ),
      )
      .returning();

    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      throw new Error(`Heartbeat rejected for task ${parsed.taskId}`);
    }

    await appendKanbanTaskEvent(tx, {
      taskId: parsed.taskId,
      runId: parsed.runId,
      eventType: 'heartbeat',
      payload: { note: parsed.note ?? null, claimExpiresAt: claimExpiresAt.toISOString() },
    });

    return {
      task: normalizeRow(row),
      heartbeatAt: heartbeatAt.toISOString(),
      claimExpiresAt: claimExpiresAt.toISOString(),
    };
  });
}

export async function createChildKanbanTask(input: z.infer<typeof KanbanTaskCreateChildInputSchema>): Promise<KanbanTask> {
  const parsed = KanbanTaskCreateChildInputSchema.parse(input);
  return withKanbanTransaction(async (tx) => {
    const now = new Date();
    const [child] = await tx
      .insert(kanbanTasks)
      .values({
        taskId: parsed.taskId,
        featureId: parsed.featureId,
        featureLabel: parsed.featureLabel,
        sourceRefs: [...parsed.sourceRefs, `parent_task:${parsed.parentTaskId}`],
        lane: parsed.lane,
        status: 'pending',
        validationCommand: parsed.validationCommand ?? `parent_task:${parsed.parentTaskId}`,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!child) {
      throw new Error(`Failed to create kanban task: ${parsed.taskId}`);
    }

    await insertDependencyEdge(tx, parsed.parentTaskId, parsed.taskId, now);
    await appendKanbanTaskEvent(tx, {
      taskId: parsed.taskId,
      eventType: 'child_created',
      payload: {
        parentTaskId: parsed.parentTaskId,
        sourceRefs: parsed.sourceRefs,
      },
    });
    await appendKanbanTaskEvent(tx, {
      taskId: parsed.taskId,
      eventType: 'dependency_linked',
      payload: {
        parentTaskId: parsed.parentTaskId,
        childTaskId: parsed.taskId,
      },
    });

    return normalizeRow(child as Record<string, unknown>);
  });
}

export async function listKanbanTaskDependencies(input: z.infer<typeof KanbanTaskDependenciesInputSchema>): Promise<KanbanTaskDependency[]> {
  const parsed = KanbanTaskDependenciesInputSchema.parse(input);
  const conditions = [
    parsed.parentTaskId ? sql`parent_task_id = ${parsed.parentTaskId}` : undefined,
    parsed.childTaskId ? sql`child_task_id = ${parsed.childTaskId}` : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => condition !== undefined);

  const rows = await db.execute(sql`
    SELECT parent_task_id, child_task_id, created_at
    FROM kanban_task_dependencies
    ${conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``}
    ORDER BY created_at ASC, parent_task_id ASC, child_task_id ASC
  `);

  return (rows.rows as Array<Record<string, unknown>>).map((row) => KanbanTaskDependencySchema.parse({
    parentTaskId: String(row.parent_task_id ?? ''),
    childTaskId: String(row.child_task_id ?? ''),
    createdAt: toIso(row.created_at),
  }));
}

export async function listKanbanTaskEvents(input: { taskId?: string; runId?: string; limit?: number }): Promise<KanbanTaskEvent[]> {
  const limit = Math.max(1, Math.min(500, input.limit ?? 100));
  const conditions = [
    input.taskId ? sql`task_id = ${input.taskId}` : undefined,
    input.runId ? sql`run_id = ${input.runId}` : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => condition !== undefined);

  const rows = await db.execute(sql`
    SELECT task_id, run_id, event_type, payload, created_at
    FROM kanban_task_events
    ${conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``}
    ORDER BY created_at ASC, task_id ASC
    LIMIT ${limit}
  `);

  return (rows.rows as Array<Record<string, unknown>>).map((row) => KanbanTaskEventSchema.parse({
    taskId: String(row.task_id ?? ''),
    runId: row.run_id == null ? null : String(row.run_id),
    eventType: row.event_type,
    payload: row.payload ?? {},
    createdAt: toIso(row.created_at),
  }));
}

export async function promoteReadyChildrenForParent(parentTaskId: string): Promise<KanbanTask[]> {
  return withKanbanTransaction(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT child_task_id
      FROM kanban_task_dependencies
      WHERE parent_task_id = ${parentTaskId}
      ORDER BY created_at ASC
    `);

    const childIds = (rows.rows as Array<{ child_task_id?: unknown }>).map((row) => String(row.child_task_id ?? '')).filter(Boolean);
    const promoted: KanbanTask[] = [];

    for (const childTaskId of childIds) {
      const parents = await tx.execute(sql`
        SELECT t.*
        FROM kanban_task_dependencies d
        JOIN kanban_tasks t ON t.task_id = d.parent_task_id
        WHERE d.child_task_id = ${childTaskId}
        ORDER BY d.created_at ASC
      `);

      const parentTasks = (parents.rows as Array<Record<string, unknown>>).map((row) => normalizeRow(row));

      if (parentTasks.length > 0 && parentTasks.every((task) => isTaskDone(task))) {
        const [updated] = await tx
          .update(kanbanTasks)
          .set({
            lane: 'todo',
            status: 'pending',
            validationCommand: `promoted_ready_from:${parentTaskId}`,
            updatedAt: new Date(),
          })
          .where(eq(kanbanTasks.taskId, childTaskId))
          .returning();

        if (updated) {
          promoted.push(normalizeRow(updated as Record<string, unknown>));
          await appendKanbanTaskEvent(tx, {
            taskId: childTaskId,
            eventType: 'promoted_ready',
            payload: { parentTaskId },
          });
        }
      }
    }

    return promoted;
  });
}

export function formatKanbanTaskSummary(task: KanbanTask): string {
  return `${task.taskId} [${task.lane}/${task.status}] ${task.featureLabel}`;
}
