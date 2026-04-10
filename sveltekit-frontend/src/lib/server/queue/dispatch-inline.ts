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
	data: Record<string, unknown>
): Promise<void> {
	switch (queue) {
		case 'cache.invalidate':
			await rabbitmq.publishCacheInvalidation(data);
			break;
		case 'document.embed':
			await rabbitmq.publishDocumentEmbed(data as any);
			break;
		case 'evidence.process':
			await rabbitmq.publishEvidenceProcess(data as any);
			break;
		case 'vector.index':
			await rabbitmq.publishVectorIndex(data as any);
			break;
		case 'chat.context':
			await rabbitmq.publishChatContext(data as any);
			break;
		case 'analytics.track':
			await rabbitmq.publishAnalyticsEvent(data as any);
			break;
		case 'codebase.index':
			await rabbitmq.publishCodebaseIndex(data as any);
			break;
		case 'ace.evaluate':
			await rabbitmq.publishACEEvaluation(data as any);
			break;
		case 'error.embed':
			await rabbitmq.publishErrorEmbed(data as any);
			break;
		case 'synthesis.generate':
			await rabbitmq.publishSynthesisGenerate(data as any);
			break;
		case 'knowledge.backfill':
			await rabbitmq.publishKnowledgeBackfill(data as any);
			break;
	}
}

// ─── Inline Handler Router ───────────────────────────────────────────────────

async function executeInline(queue: QueueName, data: unknown): Promise<void> {
	switch (queue) {
		case 'cache.invalidate':
			return inlineCacheInvalidate(data as any);
		case 'document.embed':
			return inlineDocumentEmbed(data as any);
		case 'evidence.process':
			return inlineEvidenceProcess(data as any);
		case 'vector.index':
			return inlineVectorIndex(data as any);
		case 'chat.context':
			return inlineChatContext(data as any);
		case 'analytics.track':
			return inlineAnalyticsTrack(data as any);
		case 'ace.evaluate':
			return inlineACEEvaluate(data as any);
		case 'error.embed':
			return inlineErrorEmbed(data as any);
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
		context: (data.context ?? { ragChunks: [], kagNeighbors: [], persona: 'neutral' }) as any,
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
