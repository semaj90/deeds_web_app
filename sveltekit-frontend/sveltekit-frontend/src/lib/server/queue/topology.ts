export const EXCHANGES = {
  tasks: 'atlas.tasks.v1',
  tasksDlx: 'atlas.tasks.dlx.v1',
  tasksRetry: 'atlas.tasks.retry.v1',
} as const;

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

export const QUEUES = {
  codeAnalysis: 'atlas.worker.code-analysis.v1',
  codeMutation: 'atlas.worker.code-mutation.v1',
  test: 'atlas.worker.test.v1',
  retrieval: 'atlas.worker.retrieval.v1',
  graph: 'atlas.worker.graph.v1',
  gpu: 'atlas.worker.gpu.v1',
  opencode: 'atlas.worker.opencode.v1',
  failed: 'atlas.tasks.failed.v1',
  retryCode: 'atlas.worker.code-analysis.retry.v1',
  retryRetrieval: 'atlas.worker.retrieval.retry.v1',
  retryOpencode: 'atlas.worker.opencode.retry.v1',
} as const;

export interface AmqpChannel {
  assertExchange(name: string, type: string, opts: Record<string, unknown>): Promise<void>;
  assertQueue(name: string, opts: Record<string, unknown>): Promise<void>;
  bindQueue(queue: string, exchange: string, routingKey: string): Promise<void>;
}

export async function declareTopology(ch: AmqpChannel): Promise<void> {
  // Main task exchange
  await ch.assertExchange(EXCHANGES.tasks, 'topic', { durable: true });
  // Dead-letter exchange
  await ch.assertExchange(EXCHANGES.tasksDlx, 'direct', { durable: true });
  // Retry exchange (with TTL, re-routes back to main)
  await ch.assertExchange(EXCHANGES.tasksRetry, 'direct', { durable: true });

  // Failed queue (DLX sink)
  await ch.assertQueue(QUEUES.failed, { durable: true });
  await ch.bindQueue(QUEUES.failed, EXCHANGES.tasksDlx, '#');

  // Worker queues
  const workerQueues: Array<{ queue: string; routingKey: string }> = [
    { queue: QUEUES.codeAnalysis, routingKey: ROUTING_KEYS.codeInspect },
    { queue: QUEUES.codeMutation, routingKey: ROUTING_KEYS.codePatch },
    { queue: QUEUES.test, routingKey: ROUTING_KEYS.codeTest },
    { queue: QUEUES.retrieval, routingKey: ROUTING_KEYS.retrievalEvaluate },
    { queue: QUEUES.retrieval, routingKey: ROUTING_KEYS.retrievalMaterialize },
    { queue: QUEUES.graph, routingKey: ROUTING_KEYS.graphProject },
    { queue: QUEUES.gpu, routingKey: ROUTING_KEYS.embeddingBackfill },
    { queue: QUEUES.gpu, routingKey: ROUTING_KEYS.documentParse },
    { queue: QUEUES.opencode, routingKey: ROUTING_KEYS.agentExecute },
    { queue: QUEUES.opencode, routingKey: ROUTING_KEYS.agentExecuteOpencode },
  ];

  for (const { queue, routingKey } of workerQueues) {
    await ch.assertQueue(queue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': EXCHANGES.tasksDlx,
        'x-queue-type': 'quorum',
      },
    });
    await ch.bindQueue(queue, EXCHANGES.tasks, routingKey);
  }

  // Retry queues (TTL = 30s, DLX re-routes back to main exchange)
  const retryQueues = [
    { queue: QUEUES.retryCode, routingKey: ROUTING_KEYS.codeInspect },
    { queue: QUEUES.retryRetrieval, routingKey: ROUTING_KEYS.retrievalEvaluate },
    { queue: QUEUES.retryOpencode, routingKey: ROUTING_KEYS.agentExecuteOpencode },
  ];

  for (const { queue, routingKey } of retryQueues) {
    await ch.assertQueue(queue, {
      durable: true,
      arguments: {
        'x-message-ttl': 30_000,
        'x-dead-letter-exchange': EXCHANGES.tasks,
        'x-dead-letter-routing-key': routingKey,
      },
    });
  }
}
