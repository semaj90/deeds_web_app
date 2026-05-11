/**
 * Client-side timeline event poster.
 *
 * Phase D of the 2026-05-10 service-worker + regex-tool-router design (§1.6).
 *
 * Single entry point: `postTimelineEvent()`. Fire-and-forget by contract — never
 * throws, never awaits. If the SW is active, the request goes through the SW
 * fetch handler which transparently queues on offline / 5xx. If the SW is
 * unavailable, falls back to a direct best-effort fetch.
 *
 * Two debug helpers: `getTimelineQueueDepth()` and `flushTimelineQueueNow()`.
 * Both round-trip via `postMessage` to the SW. Return zeroed values when the
 * SW isn't installed.
 */

export interface TimelineEventInput {
	eventType:  string;                                                  // 'chat.intent' | 'dwell_long' | ...
	pipeline?:  'ace' | 'rag' | 'kag' | 'dag' | 'codebase';
	sessionId?: string;
	payload?:   Record<string, unknown>;
}

const TIMELINE_URL = '/api/analytics/context-timeline';

function isSwAvailable(): boolean {
	return typeof navigator !== 'undefined'
		&& 'serviceWorker' in navigator
		&& navigator.serviceWorker.controller !== null;
}

/**
 * Fire-and-forget timeline event.
 *
 * - When SW active: POST → SW intercepts → online passes through, offline queues.
 * - When SW absent: POST direct, swallow errors so caller doesn't await rejection.
 *
 * NEVER awaited. NEVER throws.
 */
export function postTimelineEvent(evt: TimelineEventInput): void {
	if (typeof window === 'undefined') return; // SSR safety

	const body = JSON.stringify({
		eventType: evt.eventType,
		pipeline:  evt.pipeline  ?? 'ace',
		sessionId: evt.sessionId ?? '',
		payload:   evt.payload   ?? {},
	});

	// fetch() returns a promise; we deliberately do NOT await it. Errors are
	// swallowed inside .catch() to keep this fire-and-forget.
	fetch(TIMELINE_URL, {
		method:      'POST',
		headers:     { 'Content-Type': 'application/json' },
		body,
		credentials: 'include',
		// `keepalive` lets the request survive page unload (max 64KB body).
		keepalive:   true,
	}).catch(() => {
		/* swallow — SW will queue, OR network is offline; design promise is fire-and-forget */
	});
}

interface SwMessageReply<T> {
	type: string;
	[k: string]: unknown;
}

/**
 * Round-trip a one-shot postMessage to the SW and wait for the typed reply.
 * Returns null on timeout / SW absent.
 */
async function askSw<T>(payload: { type: string }, timeoutMs = 2000): Promise<T | null> {
	if (!isSwAvailable()) return null;
	const controller = navigator.serviceWorker.controller;
	if (!controller) return null;

	return new Promise<T | null>((resolve) => {
		const channel = new MessageChannel();
		const t = setTimeout(() => { channel.port1.close(); resolve(null); }, timeoutMs);
		channel.port1.onmessage = (e) => {
			clearTimeout(t);
			channel.port1.close();
			resolve(e.data as T);
		};
		controller.postMessage(payload, [channel.port2]);
	});
}

/**
 * Returns the number of events currently sitting in the SW's IDB queue.
 * Returns 0 when SW isn't installed.
 */
export async function getTimelineQueueDepth(): Promise<number> {
	const reply = await askSw<SwMessageReply<unknown> & { depth?: number }>(
		{ type: 'analytics-queue-depth' }
	);
	return reply?.depth ?? 0;
}

/**
 * Trigger an immediate queue drain (e.g. before `beforeunload`).
 * Returns counts; returns zeros when SW isn't installed.
 */
export async function flushTimelineQueueNow(): Promise<{ drained: number; failed: number }> {
	const reply = await askSw<SwMessageReply<unknown> & { drained?: number; failed?: number }>(
		{ type: 'analytics-flush-now' },
		8000
	);
	return {
		drained: reply?.drained ?? 0,
		failed:  reply?.failed  ?? 0,
	};
}
