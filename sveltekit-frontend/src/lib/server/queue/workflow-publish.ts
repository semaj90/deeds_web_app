/**
 * Server-side workflow event publisher.
 *
 * Workers call `publishWorkflowEvent(sessionId, event)` to push real-time
 * progress events into the Redis list consumed by:
 *   GET /api/workflow-events/[sessionId]  (SSE endpoint)
 *
 * Protocol:
 *   RPUSH workflow:events:{sessionId}  JSON(event)
 *   EXPIRE workflow:events:{sessionId} 300  (5-min TTL, set on first push)
 *
 * Fire-and-forget safe — never throws. Callers may `.catch(() => {})` but
 * don't need to; errors are swallowed internally.
 *
 * Usage:
 *   import { publishWorkflowEvent } from '$lib/server/queue/workflow-publish.js';
 *   publishWorkflowEvent(sessionId, { type: 'RERANK_COMPLETE', hits: 8 });
 */

import { getRedis } from '$lib/server/redis.js';

export type WorkflowEventType =
	// Infrastructure
	| 'SSE_CONNECTED'
	| 'SSE_ERROR'
	| 'WORKFLOW_COMPLETE'
	| 'WORKFLOW_ERROR'
	// Evidence pipeline (existing)
	| 'OCR_COMPLETE'
	| 'OCR_ERROR'
	| 'EMBEDDING_COMPLETE'
	| 'EMBEDDING_ERROR'
	| 'ENTITY_COMPLETE'
	| 'ENTITY_ERROR'
	| 'SUMMARY_COMPLETE'
	| 'SUMMARY_ERROR'
	// Claude Assist pipeline (new)
	| 'SCHEMA_LOOKUP_COMPLETE'
	| 'RERANK_COMPLETE'
	| 'KAG_COMPLETE'
	| 'SCAFFOLD_WARMED'
	| 'ASSIST_COMPLETE'
	| 'ASSIST_ERROR'
	// Generic pipeline stage
	| 'PIPELINE_STAGE_START'
	| 'PIPELINE_STAGE_DONE'
	| 'PIPELINE_STAGE_ERROR';

export interface WorkflowEventPayload {
	type: WorkflowEventType;
	/** Human-readable label for UI progress bars. */
	label?: string;
	/** Duration of this stage in ms. */
	durationMs?: number;
	/** Result summary (counts, keys, etc.) — keep compact. */
	data?: Record<string, unknown>;
	/** Error message if type ends in _ERROR. */
	error?: string;
}

const EVENT_TTL = 300; // 5 minutes

/**
 * Push one event into the Redis workflow stream for `sessionId`.
 * Non-blocking: returns immediately, does not await Redis.
 */
export function publishWorkflowEvent(
	sessionId: string,
	event: WorkflowEventPayload,
): void {
	if (!sessionId) return;

	const key = `workflow:events:${sessionId}`;
	const payload = JSON.stringify({ ...event, ts: new Date().toISOString() });

	try {
		const redis = getRedis();
		// pipeline: RPUSH + EXPIRE in one round-trip
		redis
			.pipeline()
			.rpush(key, payload)
			.expire(key, EVENT_TTL)
			.exec()
			.catch(() => { /* Redis unavailable — silent degradation */ });
	} catch {
		// getRedis() may throw before server is fully initialised
	}
}

/**
 * Convenience: emit WORKFLOW_COMPLETE and signal the SSE stream to close.
 */
export function publishWorkflowComplete(
	sessionId: string,
	summary?: Record<string, unknown>,
): void {
	publishWorkflowEvent(sessionId, { type: 'WORKFLOW_COMPLETE', data: summary });
}

/**
 * Convenience: emit WORKFLOW_ERROR.
 */
export function publishWorkflowError(
	sessionId: string,
	error: string,
	data?: Record<string, unknown>,
): void {
	publishWorkflowEvent(sessionId, { type: 'WORKFLOW_ERROR', error, data });
}
