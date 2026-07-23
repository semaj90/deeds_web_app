/**
 * RabbitMQ topology — exchanges, queues, bindings.
 *
 * Call declareTopology(channel) once at startup (before publishing or
 * consuming) to idempotently assert the full topology. All operations
 * are IF-NOT-EXISTS safe.
 *
 * Routing key taxonomy (finite — never derive from user input):
 *   atlas.work.code.*         — code analysis / patching workers
 *   atlas.work.retrieval.*    — retrieval pipeline workers
 *   atlas.work.graph.*        — graph projection workers
 *   atlas.work.embedding.*    — embedding backfill workers
 *   atlas.work.document.*     — document parse workers
 *   atlas.work.agent.*        — agentic execution workers
 */

// ---------------------------------------------------------------------------
// Exchange names
// ---------------------------------------------------------------------------

export const EXCHANGES = {
  tasks: 'atlas.tasks.v1',
  dlx: 'atlas.tasks.dlx.v1',
} as const;

// ---------------------------------------------------------------------------
// Routing keys (finite taxonomy)
// ---------------------------------------------------------------------------

export const ROUTING_KEYS = {
  codeInspect: 'atlas.work.code.inspect',
  codePatch: 'atlas.work.code.patch',
  codeTest: 'atlas.work.code.test',
  retrievalEvaluate: 'atlas.work.retrieval.evaluate',
  retrievalMaterialize: 'atlas.work.retrieval.materialize',
  graphProject: 'atlas.work.graph.project',
  embeddingBackfill: 'atlas.work.embedding.backfill',
  documentParse: 'atlas.work.document.parse',
  agentExecute: 'atlas.work.agent.execute',
  agentExecuteOpencode: 'atlas.work.agent.execute.opencode',
} as const;

export type RoutingKey = (typeof ROUTING_KEYS)[keyof typeof ROUTING_KEYS];

// ---------------------------------------------------------------------------
// Queue names
// ---------------------------------------------------------------------------

export const QUEUES = {
  codeWork: 'atlas.q.code.work',
  retrievalWork: 'atlas.q.retrieval.work',
  graphWork: 'atlas.q.graph.work',
  embeddingWork: 'atlas.q.embedding.work',
  documentWork: 'atlas.q.document.work',
  agentWork: 'atlas.q.agent.work',
  dlx: 'atlas.q.dlx',
  retryCode: 'atlas.q.retry.code',
  retryRetrieval: 'atlas.q.retry.retrieval',
  retryAgent: 'atlas.q.retry.agent',
} as const;

// ---------------------------------------------------------------------------
// Minimal amqplib channel interface (avoids a hard dep on @types/amqplib here)
// ---------------------------------------------------------------------------

export interface AmqpChannel {
  assertExchange(
    exchange: string,
    type: string,
    options?: { durable?: boolean; autoDelete?: boolean }
  ): Promise<unknown>;
  assertQueue(
    queue: string,
    options?: {
      durable?: boolean;
      arguments?: Record<string, unknown>;
    }
  ): Promise<unknown>;
  bindQueue(queue: string, exchange: string, routingKey: string): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// declareTopology — idempotent topology assertion
// ---------------------------------------------------------------------------

/**
 * Assert all exchanges, queues, and bindings.
 * Safe to call multiple times; all assertions use IF-NOT-EXISTS semantics.
 *
 * Call once at startup, before any publish or consume operation.
 */
export async function declareTopology(ch: AmqpChannel): Promise<void> {
  // Task exchange — topic, durable, persists across broker restart
  await ch.assertExchange(EXCHANGES.tasks, 'topic', { durable: true });

  // Dead-letter exchange — direct, durable
  await ch.assertExchange(EXCHANGES.dlx, 'direct', { durable: true });

  // DLX catch-all queue
  await ch.assertQueue(QUEUES.dlx, { durable: true });

  // Retry queues — messages expire after TTL and are re-routed to tasks exchange
  const retryQueues: Array<{ queue: string; routingPrefix: string }> = [
    { queue: QUEUES.retryCode, routingPrefix: 'atlas.work.code.' },
    { queue: QUEUES.retryRetrieval, routingPrefix: 'atlas.work.retrieval.' },
    { queue: QUEUES.retryAgent, routingPrefix: 'atlas.work.agent.' },
  ];

  for (const { queue } of retryQueues) {
    await ch.assertQueue(queue, {
      durable: true,
      arguments: {
        'x-message-ttl': 30_000,
        'x-dead-letter-exchange': EXCHANGES.tasks,
      },
    });
  }

  // Worker queues — quorum queues with DLX on permanent failure
  const workerQueues: Array<{ queue: string; bindPattern: string }> = [
    { queue: QUEUES.codeWork, bindPattern: 'atlas.work.code.*' },
    { queue: QUEUES.retrievalWork, bindPattern: 'atlas.work.retrieval.*' },
    { queue: QUEUES.graphWork, bindPattern: 'atlas.work.graph.*' },
    { queue: QUEUES.embeddingWork, bindPattern: 'atlas.work.embedding.*' },
    { queue: QUEUES.documentWork, bindPattern: 'atlas.work.document.*' },
    { queue: QUEUES.agentWork, bindPattern: 'atlas.work.agent.*' },
  ];

  for (const { queue, bindPattern } of workerQueues) {
    await ch.assertQueue(queue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': EXCHANGES.dlx,
        'x-queue-type': 'quorum',
      },
    });
    await ch.bindQueue(queue, EXCHANGES.tasks, bindPattern);
  }
}
