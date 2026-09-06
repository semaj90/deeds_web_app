#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';

export async function proveTaskOutboxConfirmChannel() {
  const { db, closeConnections } = await import('../../src/lib/server/db/client.js');
  const { enqueueArtifactWorkItem } = await import('../../src/lib/server/queue/artifact-work-dispatch-v1.js');
  const { publishOutboxBatch } = await import('../../src/lib/server/queue/outbox.js');
  const { declareTopology, EXCHANGES, ROUTING_KEYS } = await import('../../src/lib/server/queue/topology.js');
  const { getRabbitMQUrl } = await import('../../src/lib/config/env.server.js');
  const { publishMessage } = await import('../../src/lib/server/queue/rabbitmq-client.js');

  const proofId = randomUUID();
  const runId = randomUUID();
  const requestId = randomUUID();
  const actionKey = `queue09-proof:${proofId}`;
  const routingKey = ROUTING_KEYS.retrievalMaterialize;
  const report = {
  schema: 'atlas.task-outbox-confirm-channel-proof.v1',
  proofId,
  runId,
  actionKey,
  directTaskPublishRejected: false,
  outboxTask: {
    taskId: null as string | null,
    outboxId: null as string | null,
    pendingBeforePublish: null as number | null,
    deliveredAfterConfirm: false,
    confirmedPublish: false,
  },
  consumed: {
    received: false,
    acknowledged: false,
    actionKeyMatched: false,
    routingKeyMatched: false,
  },
  status: 'TASK_OUTBOX_CONFIRM_CHANNEL_NOT_PROVEN',
  };

  let publishConn: any = null;
  let consumeConn: any = null;
  let consumeCh: any = null;

  try {
  await db.execute(sql`
    INSERT INTO workflow_runs (id, user_id, status, trace_id, query, graph_id)
    VALUES (${runId}::uuid, 0, 'received', ${`trace:${proofId}`}, 'queue09 confirm proof', 'queue09-proof')
  `);

  const item = {
    schema: 'atlas.action-work-item.v1' as const,
    actionKey,
    commandType: 'retrieval.materialize' as const,
    operation: 'queue09.confirm-channel-proof',
    inputArtifactRefs: [],
    requiredRevisionSetHash: `revision-set:${proofId}`,
    budget: { timeoutMs: 30_000 },
    executorClass: 'IO' as const,
    priority: 'normal' as const,
    parametersHash: `parameters:${proofId}`,
    expectedOutputSchema: 'atlas.queue09-proof.v1',
    producerRevision: 'queue09-proof:v1',
  };
  const enqueued = await enqueueArtifactWorkItem({
    runId,
    requestId,
    capability: 'queue09.confirm-channel-proof',
    targetWorkerClass: 'queue09-proof-worker',
    item,
  });
  report.outboxTask.taskId = enqueued.taskId;

  const before = await db.execute<{
    id: string;
    routing_key: string;
    exchange: string;
    delivered_at: Date | null;
  }>(sql`
    SELECT id, routing_key, exchange, delivered_at
    FROM workflow_outbox
    WHERE task_id = ${enqueued.taskId}::uuid
    LIMIT 1
  `);
  const row = before.rows?.[0];
  if (!row || row.delivered_at !== null || row.exchange !== EXCHANGES.tasks || row.routing_key !== routingKey) {
    throw new Error('TASK_OUTBOX_PREIMAGE_INVALID');
  }
  report.outboxTask.outboxId = row.id;

  const pending = await db.execute<{ count: string | number | bigint }>(sql`
    SELECT COUNT(*) AS count
    FROM workflow_outbox
    WHERE delivered_at IS NULL AND failed_at IS NULL
  `);
  report.outboxTask.pendingBeforePublish = Number(pending.rows?.[0]?.count ?? -1);
  if (report.outboxTask.pendingBeforePublish !== 1) throw new Error('UNRELATED_PENDING_OUTBOX_ROWS');

  const direct = await publishMessage(EXCHANGES.tasks, routingKey, item);
  report.directTaskPublishRejected = direct.ok === false &&
    direct.error?.includes('direct atlas.tasks.v1 publish is forbidden') === true;

  const amqplib = (await import('amqplib')) as any;
  const rabbitUrl = getRabbitMQUrl();
  publishConn = await amqplib.connect(rabbitUrl);
  const publishCh = await publishConn.createConfirmChannel();
  consumeConn = await amqplib.connect(rabbitUrl);
  consumeCh = await consumeConn.createChannel();
  await declareTopology(consumeCh);
  const tempQueue = `atlas.q.queue09.proof.${proofId}`;
  await consumeCh.assertQueue(tempQueue, { durable: false, exclusive: true, autoDelete: true });
  await consumeCh.bindQueue(tempQueue, EXCHANGES.tasks, routingKey);

  const publishFn = (exchange: string, key: string, payload: Buffer): Promise<void> =>
    new Promise((resolve, reject) => {
      const ok = publishCh.publish(exchange, key, payload, {
        persistent: true,
        contentType: 'application/json',
      });
      const wait = () => publishCh.waitForConfirms().then(() => {
        report.outboxTask.confirmedPublish = true;
        resolve();
      }).catch(reject);
      if (ok) wait();
      else publishCh.once('drain', wait);
    });

  const published = await publishOutboxBatch(publishFn, 1);
  if (published.attempted !== 1 || published.delivered !== 1) {
    throw new Error(`TASK_OUTBOX_PUBLISH_NOT_CONFIRMED:${JSON.stringify(published)}`);
  }
  const after = await db.execute<{ delivered_at: Date | null }>(sql`
    SELECT delivered_at FROM workflow_outbox WHERE id = ${row.id}::uuid
  `);
  report.outboxTask.deliveredAfterConfirm = after.rows?.[0]?.delivered_at != null;

  const matched = await new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), 5_000);
    consumeCh.consume(tempQueue, (message: any) => {
      if (!message) return;
      clearTimeout(timer);
      try {
        const value = JSON.parse(message.content.toString('utf8')) as {
          command?: { taskId?: string };
          payload?: { actionKey?: string };
        };
        consumeCh.ack(message);
        resolve(value);
      } catch (error) {
        consumeCh.nack(message, false, false);
        reject(error);
      }
    }, { noAck: false }).catch(reject);
  });
  report.consumed.received = matched !== null;
  report.consumed.acknowledged = matched !== null;
  report.consumed.actionKeyMatched = matched?.payload?.actionKey === actionKey;
  report.consumed.routingKeyMatched = routingKey === row.routing_key;

  const proven = report.directTaskPublishRejected &&
    report.outboxTask.confirmedPublish &&
    report.outboxTask.deliveredAfterConfirm &&
    report.consumed.received &&
    report.consumed.acknowledged &&
    report.consumed.actionKeyMatched &&
    report.consumed.routingKeyMatched;
    report.status = proven ? 'TASK_OUTBOX_CONFIRM_CHANNEL_PROVEN' : 'TASK_OUTBOX_CONFIRM_CHANNEL_NOT_PROVEN';
    return report;
  } finally {
    await consumeCh?.close().catch(() => {});
    await consumeConn?.close().catch(() => {});
    await publishConn?.close().catch(() => {});
    await closeConnections();
  }
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/prove-task-outbox-confirm-channel.mts')) {
  const { loadAtlasEnv } = await import('./load-atlas-env.mjs');
  loadAtlasEnv();
  const result = await proveTaskOutboxConfirmChannel();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'TASK_OUTBOX_CONFIRM_CHANNEL_PROVEN') process.exitCode = 1;
}
