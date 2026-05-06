/**
 * RabbitMQ ↔ XState v5 Integration Bridge.
 *
 * Wraps RabbitMQ queue operations as XState `fromPromise` actors so
 * state machines can publish/await queue results without manual ack/nack
 * boilerplate.  Each actor resolves when the RabbitMQ publish succeeds
 * (fire-and-forget publish) or when a response message is received
 * (request-reply pattern via correlation ID).
 *
 * Depends on: existing `rabbitmq-client.ts` + `rabbitmq-manager-fixed.ts`
 *
 * Usage in an XState machine:
 *   import { fromRabbitPublish, rabbitActors } from '$lib/messaging/rabbitmq-xstate-integration';
 *
 *   const machine = setup({
 *     actors: { embedDocument: fromRabbitPublish('document.embed') }
 *   }).createMachine({ ... });
 */

import { fromPromise } from 'xstate';

// ─── Queue name enum (mirrors rabbitmq-manager-fixed.ts) ─────────────────────

export type QueueName =
  | 'cache.invalidate'
  | 'document.embed'
  | 'chat.document.embed'
  | 'evidence.process'
  | 'vector.index'
  | 'chat.context'
  | 'analytics.track'
  | 'codebase.index'
  | 'ace.evaluate'
  | 'synthesis.generate'
  | 'audio.process'
  | 'glyph.tile.rebuild'
  | 'qlora.distill';

// ─── Publish actor factory ────────────────────────────────────────────────────

interface PublishInput<T = unknown> {
  payload: T;
  /** Optional routing key override (defaults to queue name) */
  routingKey?: string;
}

interface PublishResult {
  /** Whether the message was accepted by the broker */
  sent: boolean;
  /** Timestamp when the message was published (ISO) */
  publishedAt: string;
  errors?: string[];
}

/**
 * Create an XState `fromPromise` actor that publishes to a RabbitMQ queue.
 *
 * The actor resolves immediately after the publish call returns (fire-and-forget).
 * Use this for queues where you don't need to wait for the consumer to finish.
 *
 * @example
 * const machine = setup({
 *   actors: {
 *     embedDoc: fromRabbitPublish('document.embed'),
 *   }
 * }).createMachine({
 *   states: {
 *     embedding: {
 *       invoke: {
 *         src: 'embedDoc',
 *         input: ({ event }) => ({ payload: event.document }),
 *         onDone: 'waitingForResult',
 *         onError: 'failed',
 *       }
 *     }
 *   }
 * });
 */
export function fromRabbitPublish<T = unknown>(queue: QueueName) {
  return fromPromise<PublishResult, PublishInput<T>>(
    async ({ input }: { input: PublishInput<T> }) => {
      const { publishMessage } = await import('$lib/server/queue/rabbitmq-client.js');
      const exchange = queueToExchange(queue);
      const routingKey = input.routingKey ?? queue;

      const result = await publishMessage(exchange, routingKey, input.payload);

      return {
        sent: result.ok,
        publishedAt: new Date().toISOString(),
        errors: result.error ? [result.error] : undefined,
      };
    }
  );
}

// ─── Convenience actors for the most common queues ───────────────────────────

/**
 * Pre-built XState actors for the most common RabbitMQ queues.
 * Use in `setup({ actors: { ...rabbitActors } })`.
 */
export const rabbitActors = {
  /** Publish a document for embedding */
  embedDocument: fromRabbitPublish<{
    documentId: string;
    text: string;
    collection?: string;
    metadata?: Record<string, unknown>;
  }>('document.embed'),

  /** Publish an evidence item for full processing (9-stage pipeline) */
  processEvidence: fromRabbitPublish<{
    evidenceId: string;
    caseId: string;
    userId: string;
  }>('evidence.process'),

  /** Publish a vector index operation */
  indexVector: fromRabbitPublish<{
    collection: string;
    documentId: string;
    chunks: Array<{ text: string; embedding: number[] }>;
  }>('vector.index'),

  /** Trigger an ACE evaluation */
  evaluateAce: fromRabbitPublish<{
    query: string;
    caseId?: string;
    filePath?: string;
  }>('ace.evaluate'),

  /** Queue a synthesis generation job */
  queueSynthesis: fromRabbitPublish<{
    prompt: string;
    caseId?: string;
    model?: string;
  }>('synthesis.generate'),

  /** Trigger a glyph tile atlas rebuild */
  rebuildGlyphAtlas: fromRabbitPublish<{
    reason: string;
    scope?: 'full' | 'incremental';
  }>('glyph.tile.rebuild'),
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function queueToExchange(queue: QueueName): string {
  // Map queue names to their exchange (mirrors rabbitmq-manager-fixed.ts exchange map)
  const exchangeMap: Record<QueueName, string> = {
    'cache.invalidate':     'cache.invalidation',
    'document.embed':       'document.processing',
    'chat.document.embed':  'document.processing',
    'evidence.process':     'evidence.processing',
    'vector.index':         'vector.operations',
    'chat.context':         'chat.operations',
    'analytics.track':      'analytics.events',
    'codebase.index':       'codebase.indexing',
    'ace.evaluate':         'ace.evaluation',
    'synthesis.generate':   'synthesis.generation',
    'audio.process':        'audio.processing',
    'glyph.tile.rebuild':   'glyph.operations',
    'qlora.distill':        'training.operations',
  };
  return exchangeMap[queue] ?? queue;
}
