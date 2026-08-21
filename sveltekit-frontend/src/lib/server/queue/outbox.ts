/**
 * Transactional outbox — Postgres is authoritative and RabbitMQ is delivery.
 *
 * Durable task rule:
 *   workflow_task + workflow_outbox are committed in one DB transaction.
 *   Only the outbox publisher sends atlas.tasks.v1 work to RabbitMQ.
 *   The publisher marks delivered_at only after its publishFn resolves; the
 *   production boot path supplies a RabbitMQ confirm-channel publishFn.
 */

import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import {
  taskTypeSchema,
  type TaskType,
  type WorkCommandBase,
} from './commands.js';
import type { AnalyticsEventType } from '$lib/server/analytics/analytics-event-envelope.js';
import type { EventFabricType } from './event-fabric.js';
import { EXCHANGES, ROUTING_KEYS, type EventRoutingKey } from './topology.js';

type SqlExecutor = { execute: typeof db.execute };

function errorDetails(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { value: String(error) };
  const cause = error.cause as Error | undefined;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: cause ? {
      name: cause.name,
      message: cause.message,
      code: (cause as any).code,
      detail: (cause as any).detail,
      hint: (cause as any).hint,
      table: (cause as any).table,
      column: (cause as any).column,
      constraint: (cause as any).constraint,
      stack: cause.stack,
    } : undefined,
  };
}

export interface OutboxRow {
  id: string;
  runId: string;
  taskId: string;
  eventType: string;
  payload: unknown;
  routingKey: string;
  exchange: string;
  attempt: number;
  createdAt: Date;
  deliveredAt: Date | null;
  failedAt: Date | null;
  errorMessage: string | null;
}

const TASK_TYPE_TO_ROUTING_KEY: Record<TaskType, string> = {
  'code.inspect': ROUTING_KEYS.codeInspect,
  'code.patch': ROUTING_KEYS.codePatch,
  'code.test': ROUTING_KEYS.codeTest,
  'retrieval.evaluate': ROUTING_KEYS.retrievalEvaluate,
  'retrieval.materialize': ROUTING_KEYS.retrievalMaterialize,
  'graph.project': ROUTING_KEYS.graphProject,
  'embedding.backfill': ROUTING_KEYS.embeddingBackfill,
  'document.parse': ROUTING_KEYS.documentParse,
  'agent.execute': ROUTING_KEYS.agentExecute,
  'agent.execute.opencode': ROUTING_KEYS.agentExecuteOpencode,
};

/**
 * Authoritative durable task enqueue.
 *
 * The task and its RabbitMQ outbox row are inserted in the same transaction;
 * there is no crash window where one can commit without the other.
 */
export async function enqueueTask(opts: {
  runId: string;
  requestId: string;
  traceId?: string;
  commandType: TaskType;
  capability: string;
  targetWorkerClass: string;
  payload: unknown;
  timeoutMs: number;
}): Promise<{ taskId: string; commandId: string; idempotencyKey: string }> {
  taskTypeSchema.parse(opts.commandType);

  const taskId = crypto.randomUUID();
  const commandId = crypto.randomUUID();
  const idempotencyKey = await idempotencyKey(taskId, 0, opts.commandType);

  const command: WorkCommandBase = {
    commandId,
    commandType: opts.commandType,
    issuedAt: new Date().toISOString(),
    traceId: opts.traceId,
    requestId: opts.requestId,
    runId: opts.runId,
    taskId,
    capability: opts.capability,
    targetWorkerClass: opts.targetWorkerClass,
    attempt: 0,
    timeoutMs: opts.timeoutMs,
    idempotencyKey,
  };

  const routingKey = TASK_TYPE_TO_ROUTING_KEY[opts.commandType];

  await db.transaction(async (tx: SqlExecutor) => {
    await tx.execute(sql`
      INSERT INTO workflow_tasks (
        id, run_id, request_id, trace_id, command_type, capability,
        target_worker_class, status, attempt, idempotency_key,
        payload, timeout_ms, created_at, updated_at
      ) VALUES (
        ${taskId}::uuid,
        ${opts.runId}::uuid,
        ${opts.requestId}::uuid,
        ${opts.traceId ?? null},
        ${opts.commandType},
        ${opts.capability},
        ${opts.targetWorkerClass},
        'queued',
        0,
        ${idempotencyKey},
        ${JSON.stringify(opts.payload)}::jsonb,
        ${opts.timeoutMs},
        NOW(),
        NOW()
      )
    `);

    await tx.execute(sql`
      INSERT INTO workflow_outbox (
        id, run_id, task_id, event_type, payload, routing_key, exchange,
        attempt, created_at
      ) VALUES (
        gen_random_uuid(),
        ${opts.runId}::uuid,
        ${taskId}::uuid,
        'worker.task.queued',
        ${JSON.stringify({ command, payload: opts.payload })}::jsonb,
        ${routingKey},
        ${EXCHANGES.tasks},
        0,
        NOW()
      )
    `);
  });

  return { taskId, commandId, idempotencyKey };
}

export async function writeAnalyticsEventOutboxRow(
  tx: SqlExecutor,
  opts: {
    runId: string;
    eventType: AnalyticsEventType;
    routingKey: EventRoutingKey;
    payload: unknown;
    traceId?: string;
    sourceRef?: string;
  },
): Promise<{ eventId: string }> {
  return writeStructuredOutboxRow(tx, {
    ...opts,
    exchange: EXCHANGES.events,
  });
}

export async function writeIntegrationEventOutboxRow(
  tx: SqlExecutor,
  opts: {
    runId: string;
    eventType: EventFabricType;
    routingKey: EventRoutingKey;
    payload: unknown;
    traceId?: string;
    sourceRef?: string;
  },
): Promise<{ eventId: string }> {
  return writeStructuredOutboxRow(tx, {
    ...opts,
    exchange: EXCHANGES.events,
  });
}

async function writeStructuredOutboxRow(
  tx: SqlExecutor,
  opts: {
    runId: string;
    eventType: AnalyticsEventType | EventFabricType;
    routingKey: EventRoutingKey;
    payload: unknown;
    traceId?: string;
    sourceRef?: string;
    exchange: string;
  },
): Promise<{ eventId: string }> {
  const eventId = crypto.randomUUID();
  const event = {
    eventId,
    eventType: opts.eventType,
    occurredAt: new Date().toISOString(),
    traceId: opts.traceId,
    sourceRef: opts.sourceRef,
    payload: opts.payload,
  };

  await tx.execute(sql`
    INSERT INTO workflow_outbox (
      id, run_id, task_id, event_type, payload, routing_key, exchange,
      attempt, created_at
    ) VALUES (
      gen_random_uuid(),
      ${opts.runId}::uuid,
      NULL,
      ${opts.eventType},
      ${JSON.stringify(event)}::jsonb,
      ${opts.routingKey},
      ${opts.exchange},
      0,
      NOW()
    )
  `);

  return { eventId };
}

async function idempotencyKey(taskId: string, attempt: number, commandType: string): Promise<string> {
  const raw = `${taskId}:${attempt}:${commandType}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function startOutboxPublisher(opts: {
  publishFn: (exchange: string, routingKey: string, payload: Buffer) => Promise<void>;
  intervalMs?: number;
  batchSize?: number;
}): () => void {
  const { publishFn, intervalMs = 1000, batchSize = 50 } = opts;
  let running = true;

  const loop = async () => {
    while (running) {
      try {
        await publishOutboxBatch(publishFn, batchSize);
      } catch (err) {
        console.error('[outbox] publish batch error:', JSON.stringify(errorDetails(err), null, 2));
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  };

  void loop().catch((err) => console.error('[outbox] publisher crashed:', err));
  return () => { running = false; };
}

/**
 * Publish one locked batch. The transaction keeps FOR UPDATE SKIP LOCKED row
 * locks until broker confirms are received and delivered_at is persisted.
 * A crash after broker confirm but before DB commit can cause redelivery, so
 * consumers must remain idempotent; this is the intended at-least-once model.
 */
export async function publishOutboxBatch(
  publishFn: (exchange: string, routingKey: string, payload: Buffer) => Promise<void>,
  batchSize: number,
): Promise<{ attempted: number; delivered: number }> {
  return db.transaction(async (tx: SqlExecutor) => {
    const rows = await tx.execute(sql`
      SELECT id, routing_key, exchange, payload
      FROM workflow_outbox
      WHERE delivered_at IS NULL AND failed_at IS NULL
      ORDER BY created_at ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    `);

    const attempted = rows.rows?.length ?? 0;
    let delivered = 0;

    for (const row of rows.rows ?? []) {
      const record = row as Record<string, unknown>;
      try {
        await publishFn(
          String(record.exchange),
          String(record.routing_key),
          Buffer.from(JSON.stringify(record.payload)),
        );
        await tx.execute(sql`
          UPDATE workflow_outbox
          SET delivered_at = NOW(), error_message = NULL
          WHERE id = ${record.id}::uuid
        `);
        delivered += 1;
      } catch (err) {
        await tx.execute(sql`
          UPDATE workflow_outbox
          SET attempt = attempt + 1,
              failed_at = CASE WHEN attempt >= 5 THEN NOW() ELSE NULL END,
              error_message = ${(err as Error).message}
          WHERE id = ${record.id}::uuid
        `);
      }
    }

    return { attempted, delivered };
  });
}
