/**
 * RabbitMQ topology — canonical exchange, queue, and routing-key registry.
 *
 * Rules:
 *   - Routing keys are finite and registered here. Never derive a routing key
 *     from raw query text or arbitrary user input.
 *   - Queue names encode worker class + schema version; change the version
 *     when the message contract changes.
 *   - Every queue has a dead-letter exchange binding. Workers that reject a
 *     message permanently NACK without requeue — it lands in the DLX.
 *   - Retry queues use per-message TTL + DLX re-route to re-enter the main
 *     exchange after the delay expires.
 *
 * Declare topology at service startup via declareTopology().
 */

// ---------------------------------------------------------------------------
// Exchange names
// ---------------------------------------------------------------------------

export const EXCHANGES = {
  /** Main task exchange — type: topic, durable */
  tasks: 'atlas.tasks.v1',

  /** Dead-letter exchange for failed/expired messages */
  dlx: 'atlas.tasks.dlx.v1',

  /** Retry exchanges — messages here expire and re-route to tasks */
  retry10s: 'atlas.retry.10s.v1',
  retry60s: 'atlas.retry.60s.v1',
  retry5m: 'atlas.retry.5m.v1',
} as const;

// ---------------------------------------------------------------------------
// Routing keys (must match taskTypeSchema values in commands.ts)
// ---------------------------------------------------------------------------

export const ROUTING_KEYS = {
  codeInspect: 'code.inspect',
  codePatch: 'code.patch',
  codeTest: 'code.test',
  retrievalEvaluate: 'retrieval.evaluate',
  retrievalMaterialize: 'retrieval.materialize',
  graphProject: 'graph.project',
  embeddingBackfill: 'embedding.backfill',
  documentParse: 'document.parse',
  agentExecute: 'agent.execute',
  agentExecuteOpencode: 'agent.execute.opencode',
} as const;

export type RoutingKey = (typeof ROUTING_KEYS)[keyof typeof ROUTING_KEYS];

// ---------------------------------------------------------------------------
// Queue names — encode worker class + version
// ---------------------------------------------------------------------------

export const QUEUES = {
  /** Read-only code inspection (OpenCode, ast-grep, tree-sitter) */
  codeAnalysis: 'atlas.worker.code-analysis.v1',

  /** Mutating code patches (OpenCode with allowedMutations=true) */
  codeMutation: 'atlas.worker.code-mutation.v1',

  /** Test execution (vitest, playwright, npm run check) */
  test: 'atlas.worker.test.v1',

  /** Retrieval pipeline evaluation and materialization */
  retrieval: 'atlas.worker.retrieval.v1',

  /** Neo4j GDS graph projection and PageRank */
  graph: 'atlas.worker.graph.v1',

  /** GPU embedding backfill and reranking */
  gpu: 'atlas.worker.gpu.v1',

  /** OpenCode coding-agent adapter */
  opencode: 'atlas.worker.opencode.v1',

  // ── DLQ / retry ─────────────────────────────────────────────────────────

  /** Permanently failed messages — operator reviews */
  failed: 'atlas.tasks.failed.v1',

  retry10s: 'atlas.retry.10s.v1',
  retry60s: 'atlas.retry.60s.v1',
  retry5m: 'atlas.retry.5m.v1',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

// ---------------------------------------------------------------------------
// Routing key → queue bindings
// ---------------------------------------------------------------------------

/** Which queue(s) receive messages for each routing key pattern. */
export const BINDINGS: Array<{ queue: QueueName; routingKey: string }> = [
  { queue: QUEUES.codeAnalysis, routingKey: ROUTING_KEYS.codeInspect },
  { queue: QUEUES.codeMutation, routingKey: ROUTING_KEYS.codePatch },
  { queue: QUEUES.test, routingKey: ROUTING_KEYS.codeTest },
  { queue: QUEUES.retrieval, routingKey: ROUTING_KEYS.retrievalEvaluate },
  { queue: QUEUES.retrieval, routingKey: ROUTING_KEYS.retrievalMaterialize },
  { queue: QUEUES.graph, routingKey: ROUTING_KEYS.graphProject },
  { queue: QUEUES.gpu, routingKey: ROUTING_KEYS.embeddingBackfill },
  { queue: QUEUES.codeAnalysis, routingKey: ROUTING_KEYS.documentParse },
  { queue: QUEUES.codeAnalysis, routingKey: ROUTING_KEYS.agentExecute },
  { queue: QUEUES.opencode, routingKey: ROUTING_KEYS.agentExecuteOpencode },
];

// ---------------------------------------------------------------------------
// Declarator — call once at startup to assert topology
// ---------------------------------------------------------------------------

export interface AmqpChannel {
  assertExchange(name: string, type: string, opts: object): Promise<unknown>;
  assertQueue(name: string, opts: object): Promise<unknown>;
  bindQueue(queue: string, exchange: string, pattern: string): Promise<unknown>;
}

/**
 * Idempotent topology declaration.
 * Call from the RabbitMQ connection-ready handler before consuming or publishing.
 */
export async function declareTopology(ch: AmqpChannel): Promise<void> {
  // ── Exchanges ────────────────────────────────────────────────────────────

  await ch.assertExchange(EXCHANGES.tasks, 'topic', { durable: true });
  await ch.assertExchange(EXCHANGES.dlx, 'fanout', { durable: true });
  await ch.assertExchange(EXCHANGES.retry10s, 'fanout', { durable: true });
  await ch.assertExchange(EXCHANGES.retry60s, 'fanout', { durable: true });
  await ch.assertExchange(EXCHANGES.retry5m, 'fanout', { durable: true });

  // ── Retry queues (TTL + DLX re-route back to main exchange) ─────────────

  const retryArgs = (ttlMs: number) => ({
    durable: true,
    arguments: {
      'x-message-ttl': ttlMs,
      'x-dead-letter-exchange': EXCHANGES.tasks,
    },
  });

  await ch.assertQueue(QUEUES.retry10s, retryArgs(10_000));
  await ch.assertQueue(QUEUES.retry60s, retryArgs(60_000));
  await ch.assertQueue(QUEUES.retry5m, retryArgs(300_000));
  await ch.bindQueue(QUEUES.retry10s, EXCHANGES.retry10s, '');
  await ch.bindQueue(QUEUES.retry60s, EXCHANGES.retry60s, '');
  await ch.bindQueue(QUEUES.retry5m, EXCHANGES.retry5m, '');

  // ── DLQ ─────────────────────────────────────────────────────────────────

  await ch.assertQueue(QUEUES.failed, { durable: true });
  await ch.bindQueue(QUEUES.failed, EXCHANGES.dlx, '');

  // ── Worker queues ────────────────────────────────────────────────────────

  const workerQueueArgs = {
    durable: true,
    arguments: { 'x-dead-letter-exchange': EXCHANGES.dlx },
  };

  const workerQueues: QueueName[] = [
    QUEUES.codeAnalysis,
    QUEUES.codeMutation,
    QUEUES.test,
    QUEUES.retrieval,
    QUEUES.graph,
    QUEUES.gpu,
    QUEUES.opencode,
  ];

  for (const q of workerQueues) {
    await ch.assertQueue(q, workerQueueArgs);
  }

  // ── Bindings ─────────────────────────────────────────────────────────────

  for (const { queue, routingKey } of BINDINGS) {
    await ch.bindQueue(queue, EXCHANGES.tasks, routingKey);
  }
}
