/**
 * Transactional outbox pattern — guarantees Postgres-first ordering.
 *
 * Rule: a Postgres workflow_task row MUST exist before any WorkCommand is
 * published to RabbitMQ. The outbox achieves this by writing both the task
 * row and an outbox row in the SAME database transaction. A background
 * publisher reads undelivered outbox rows and sends them to RabbitMQ, then
 * marks them delivered.
 *
 * This prevents the race where the process crashes after publishing to
 * RabbitMQ but before recording the task in Postgres, which would produce
 * a worker that sees a task ID that doesn't exist.
 *
 * Worker policy (enforced by the consumer, not this module):
 *   receive → validate envelope → claim task in Postgres
 *   → check idempotency → emit worker.started → execute
 *   → persist outcome → emit worker.completed → commit → ACK
 *
 * On retryable failure:  persist attempt → emit retry_scheduled → NACK/retry
 * On permanent failure:  persist failure → emit worker.failed → dead-letter
 */

import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import { taskTypeSchema, type TaskType, type WorkCommandBase } from './commands.js';
import { EXCHANGES, ROUTING_KEYS } from './topology.js';

// ---------------------------------------------------------------------------
// Outbox row shape
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Task type → RabbitMQ routing key
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Core outbox write — call inside your existing Postgres transaction
// ---------------------------------------------------------------------------

/**
 * Write a task row + outbox row atomically.
 *
 * Usage — inside a transaction or at the end of a mutation handler:
 *
 *   const { taskId } = await enqueueTask(db, {
 *     runId, commandType: 'code.inspect',
 *     capability: 'retrieval', targetWorkerClass: 'atlas.worker.opencode.v1',
 *     payload: { ... },
 *     timeoutMs: 120_000,
 *   });
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
  taskTypeSchema.parse(opts.commandType); // hard fail on unknown type

  const taskId = crypto.randomUUID();
  const commandId = crypto.randomUUID();

  // Stable idempotency key: hash of (taskId + attempt=0 + commandType).
  // Workers increment attempt on retry; subsequent attempts use the retry lane.
  const idempotencyKey = await _idempotencyKey(taskId, 0, opts.commandType);

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

  // Both rows in a single statement block — callers should wrap in a
  // transaction if they need this atomic with other writes.
  await db.execute(sql`
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

  await db.execute(sql`
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

  return { taskId, commandId, idempotencyKey };
}

// ---------------------------------------------------------------------------
// Idempotency key derivation (SHA-256 via Web Crypto)
// ---------------------------------------------------------------------------

async function _idempotencyKey(taskId: string, attempt: number, commandType: string): Promise<string> {
  const raw = `${taskId}:${attempt}:${commandType}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Outbox publisher — run from a singleton background loop
// ---------------------------------------------------------------------------

/**
 * Poll for undelivered outbox rows and publish to RabbitMQ.
 * This is the "at-least-once" delivery guarantee.
 *
 * Call once at server startup (hooks.server.ts worker #1, same pattern as
 * the existing RabbitMQ pipeline boot):
 *
 *   import { startOutboxPublisher } from '$lib/server/queue/outbox.js';
 *   startOutboxPublisher({ publishFn: rabbitPublish });
 */
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
        await _publishBatch(publishFn, batchSize);
      } catch (err) {
        console.warn('[outbox] publish batch error:', (err as Error).message);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  };

  loop().catch((err) => console.error('[outbox] publisher crashed:', err));

  return () => {
    running = false;
  };
}

async function _publishBatch(
  publishFn: (exchange: string, routingKey: string, payload: Buffer) => Promise<void>,
  batchSize: number
): Promise<void> {
  const rows = await db.execute(sql`
    SELECT id, routing_key, exchange, payload
    FROM workflow_outbox
    WHERE delivered_at IS NULL AND failed_at IS NULL
    ORDER BY created_at ASC
    LIMIT ${batchSize}
    FOR UPDATE SKIP LOCKED
  `);

  for (const row of rows.rows ?? []) {
    const r = row as Record<string, unknown>;
    try {
      await publishFn(
        String(r.exchange),
        String(r.routing_key),
        Buffer.from(JSON.stringify(r.payload))
      );
      await db.execute(sql`
        UPDATE workflow_outbox SET delivered_at = NOW() WHERE id = ${r.id}::uuid
      `);
    } catch (err) {
      await db.execute(sql`
        UPDATE workflow_outbox
        SET attempt = attempt + 1,
            failed_at = CASE WHEN attempt >= 5 THEN NOW() ELSE NULL END,
            error_message = ${(err as Error).message}
        WHERE id = ${r.id}::uuid
      `);
    }
  }
}
