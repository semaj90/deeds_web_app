/**
 * Dispatch-or-Execute-Inline — RabbitMQ Job Routing with Inline Fallback
 *
 * When RabbitMQ is available: publishes to queue (normal production path).
 * When RabbitMQ is unavailable: runs the handler inline using the same
 * worker logic from queue-worker.ts (dev mode / graceful degradation).
 *
 * 8 of 11 queues support inline execution. The 3 excluded are:
 * - codebase.index (10-30s, blocks event loop)
 * - knowledge.backfill (5-30s, external API deps)
 * - synthesis.generate (has its own inline fallback in the route)
 */

import type { RabbitMQManager } from './rabbitmq-manager-fixed.js';

export type QueueName =
	| 'cache.invalidate'
	| 'document.embed'
	| 'evidence.process'
	| 'vector.index'
	| 'chat.context'
	| 'analytics.track'
	| 'codebase.index'
	| 'ace.evaluate'
	| 'error.embed'
	| 'synthesis.generate'
	| 'knowledge.backfill';

export interface DispatchResult {
	mode: 'queued' | 'inline' | 'skipped';
	durationMs?: number;
	error?: string;
}

const INLINE_CAPABLE = new Set<QueueName>([
	'cache.invalidate',
	'document.embed',
	'evidence.process',
	'vector.index',
	'chat.context',
	'analytics.track',
	'ace.evaluate',
	'error.embed',
]);

const stats = { queued: 0, inline: 0, skipped: 0, errors: 0 };
let loggedStartupWarning = false;

/**
 * Dispatch a job to RabbitMQ queue, falling back to inline execution
 * when the queue is unavailable.
 */
export async function dispatchOrExecuteInline(
	queue: QueueName,
	data: unknown
): Promise<DispatchResult> {
	try {
		const { rabbitmq } = await import('./rabbitmq-manager-fixed.js');
		if (rabbitmq.isReady()) {
			await callPublisher(rabbitmq, queue, data as Record<string, unknown>);
			stats.queued++;
			return { mode: 'queued' };
		}
	} catch {
		// RabbitMQ module failed to load — fall through to inline
	}

	// RabbitMQ unavailable — try inline fallback
	if (!INLINE_CAPABLE.has(queue)) {
		stats.skipped++;
		if (!loggedStartupWarning) {
			console.warn(`[dispatch] RabbitMQ unavailable — expensive queues (codebase.index, knowledge.backfill, synthesis.generate) will be skipped`);
			loggedStartupWarning = true;
		}
		return { mode: 'skipped' };
	}

	const start = performance.now();
	try {
		await executeInline(queue, data);
		const ms = Math.round(performance.now() - start);
		stats.inline++;
		console.log(`[dispatch] ${queue}: inline fallback ${ms}ms`);
		return { mode: 'inline', durationMs: ms };
	} catch (err) {
		stats.errors++;
		const message = err instanceof Error ? err.message : String(err);
		console.warn(`[dispatch] ${queue}: inline fallback failed — ${message}`);
		return { mode: 'inline', error: message };
	}
}

/**
 * Get dispatch statistics for health/monitoring endpoints
 */
export function getDispatchStats(): Readonly<typeof stats> {
	return { ...stats };
}

// ─── Publisher Router ────────────────────────────────────────────────────────

async function callPublisher(
  rabbitmq: RabbitMQManager,
  queue: QueueName,
  data: unknown
): Promise<void> {
  const d = data as Record<string, unknown>;
  switch (queue) {
    case 'cache.invalidate':
      await rabbitmq.publishCacheInvalidation(d);
      break;
    case 'document.embed':
      await rabbitmq.publishDocumentEmbed(d as Parameters<typeof rabbitmq.publishDocumentEmbed>[0]);
      break;
    case 'evidence.process':
      await rabbitmq.publishEvidenceProcess(
        d as Parameters<typeof rabbitmq.publishEvidenceProcess>[0]
      );
      break;
    case 'vector.index':
      await rabbitmq.publishVectorIndex(d as Parameters<typeof rabbitmq.publishVectorIndex>[0]);
      break;
    case 'chat.context':
      await rabbitmq.publishChatContext(d as Parameters<typeof rabbitmq.publishChatContext>[0]);
      break;
    case 'analytics.track':
      await rabbitmq.publishAnalyticsEvent(
        d as Parameters<typeof rabbitmq.publishAnalyticsEvent>[0]
      );
      break;
    case 'codebase.index':
      await rabbitmq.publishCodebaseIndex(d as Parameters<typeof rabbitmq.publishCodebaseIndex>[0]);
      break;
    case 'ace.evaluate':
      await rabbitmq.publishACEEvaluation(d as Parameters<typeof rabbitmq.publishACEEvaluation>[0]);
      break;
    case 'error.embed':
      await rabbitmq.publishErrorEmbed(d as Parameters<typeof rabbitmq.publishErrorEmbed>[0]);
      break;
    case 'synthesis.generate':
      await rabbitmq.publishSynthesisGenerate(
        d as Parameters<typeof rabbitmq.publishSynthesisGenerate>[0]
      );
      break;
    case 'knowledge.backfill':
      await rabbitmq.publishKnowledgeBackfill(
        d as Parameters<typeof rabbitmq.publishKnowledgeBackfill>[0]
      );
      break;
  }
}

// ─── Inline Handler Router ───────────────────────────────────────────────────

async function executeInline(queue: QueueName, data: unknown): Promise<void> {
  switch (queue) {
    case 'cache.invalidate':
      return inlineCacheInvalidate(data as Parameters<typeof inlineCacheInvalidate>[0]);
    case 'document.embed':
      return inlineDocumentEmbed(data as Parameters<typeof inlineDocumentEmbed>[0]);
    case 'evidence.process':
      return inlineEvidenceProcess(data as Parameters<typeof inlineEvidenceProcess>[0]);
    case 'vector.index':
      return inlineVectorIndex(data as Parameters<typeof inlineVectorIndex>[0]);
    case 'chat.context':
      return inlineChatContext(data as Parameters<typeof inlineChatContext>[0]);
    case 'analytics.track':
      return inlineAnalyticsTrack(data as Parameters<typeof inlineAnalyticsTrack>[0]);
    case 'ace.evaluate':
      return inlineACEEvaluate(data as Parameters<typeof inlineACEEvaluate>[0]);
    case 'error.embed':
      return inlineErrorEmbed(data as Parameters<typeof inlineErrorEmbed>[0]);
    default:
      throw new Error(`No inline handler for queue: ${queue}`);
  }
}

// ─── Inline Handlers (reuse queue-worker.ts process() logic) ─────────────────

async function inlineCacheInvalidate(data: { key?: string; pattern?: string }): Promise<void> {
  const { CacheInvalidateWorker } = await import('./queue-worker.js');
  const worker = new CacheInvalidateWorker();
  await worker.process(data);
}

async function inlineDocumentEmbed(data: {
  documentId: string;
  text: string;
  collection?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { DocumentEmbedWorker } = await import('./queue-worker.js');
  const worker = new DocumentEmbedWorker();
  await worker.process(data);
}

async function inlineEvidenceProcess(data: {
  evidenceId: string;
  text: string;
  contentType?: string;
}): Promise<void> {
  const { EvidenceProcessWorker } = await import('./queue-worker.js');
  const worker = new EvidenceProcessWorker();
  await worker.process(data);
}

async function inlineVectorIndex(data: {
  documentId: string;
  embedding: number[];
  collection?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { VectorIndexWorker } = await import('./queue-worker.js');
  const worker = new VectorIndexWorker();
  await worker.process(data);
}

async function inlineChatContext(data: {
  sessionId: string;
  message?: string;
  embedding?: number[];
  role?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { ChatContextWorker } = await import('./queue-worker.js');
  const worker = new ChatContextWorker();
  await worker.process(data);
}

async function inlineAnalyticsTrack(data: {
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { AnalyticsTrackWorker } = await import('./queue-worker.js');
  const worker = new AnalyticsTrackWorker();
  await worker.process(data);
}

/**
 * ACE Evaluation inline handler — extracted from rabbitmq-manager-fixed.ts handleACEEvaluate.
 * Core logic: evaluateResponse() + Redis cache (without ack/nack).
 */
async function inlineACEEvaluate(data: {
  responseId: string;
  query: string;
  response: string;
  context?: { ragChunks: unknown[]; kagNeighbors: unknown[]; persona: string };
}): Promise<void> {
  if (!data.responseId || !data.query || !data.response) return;

  const { evaluateResponse } = await import('../ace/self-prompt.js');
  const evaluation = await evaluateResponse({
    query: data.query,
    response: data.response,
    context: (data.context ?? {
      ragChunks: [],
      kagNeighbors: [],
      persona: 'neutral',
      userProfile: null,
      caseContext: null,
      glossaryMatches: null,
      kbChunks: [],
      caseChunks: [],
    }) as import('../ace/types.js').ACEContext,
    backend: 'ollama',
  });

  // Store result in Redis for async retrieval (1hr TTL)
  try {
    const { getRedis } = await import('../redis.js');
    const redis = getRedis();
    if (redis) {
      const key = `ace:result:${data.responseId}`;
      await redis.set(
        key,
        JSON.stringify({
          responseId: data.responseId,
          ...evaluation,
          evaluatedAt: new Date().toISOString(),
        }),
        'EX',
        3600
      );
    }
  } catch {
    // Redis unavailable — evaluation ran but result not cached
  }

  console.log(
    `[dispatch] ACE eval inline complete: ${data.responseId} (quality: ${evaluation.quality.toFixed(2)})`
  );
}

/**
 * Error Embedding inline handler — extracted from rabbitmq-manager-fixed.ts handleErrorEmbed.
 * Core logic: embedErrorEvent() (without ack/nack).
 */
async function inlineErrorEmbed(data: {
	errorMessage: string;
	filePath?: string;
	routePath?: string;
	stackTrace?: string;
	severity?: 'error' | 'info' | 'warn' | 'fatal';
	tsCode?: string;
	clusterId?: string;
}): Promise<void> {
	if (!data.errorMessage) return;

	const { embedErrorEvent } = await import('../pipeline/error-embedding-pipeline.js');
	await embedErrorEvent({
		errorMessage: data.errorMessage,
		filePath: data.filePath,
		routePath: data.routePath,
		stackTrace: data.stackTrace,
		severity: data.severity,
		tsCode: data.tsCode,
		clusterId: data.clusterId,
	});
}
