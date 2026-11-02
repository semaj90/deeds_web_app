// SSE handler for real-time clustering pipeline updates.
// Served at /api/agentic-events via the re-export in src/routes/api/agentic-events/+server.ts
// (also reachable at /admin/api-testing/agentic-events).
// Wired to TypeScript k-means clustering worker (XState v5)
// Future: wire to CUDA clustering service (Go/C++ at deeds_labs/cuda-binaries/)

import type { RequestHandler } from './$types';
import { getClusteringStatus } from '$lib/server/ml/topic-clustering-worker.js';

const encoder = new TextEncoder();

export const GET: RequestHandler = async ({ request }) => {
	let pollInterval: ReturnType<typeof setInterval> | undefined;
	let heartbeat: ReturnType<typeof setInterval> | undefined;
	let closed = false;
	let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;

	// Idempotent teardown: a closed stream must never be written to or closed again
	// (controller.close() on a closed stream throws ERR_INVALID_STATE and crashes the process).
	const shutdown = () => {
		if (closed) return;
		closed = true;
		clearInterval(pollInterval);
		clearInterval(heartbeat);
		try {
			controllerRef?.close();
		} catch {
			// already closed/errored by the client disconnect
		}
	};

	const send = (chunk: string) => {
		if (closed || !controllerRef) return;
		try {
			controllerRef.enqueue(encoder.encode(chunk));
		} catch {
			shutdown();
		}
	};

	const sendEvent = (event: string, payload: unknown) =>
		send(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controllerRef = controller;
			send(': connected\n\n');
			sendEvent('status', getClusteringStatus());

			// Poll clustering status every 2 seconds
			pollInterval = setInterval(() => {
				try {
					const currentStatus = getClusteringStatus();
					sendEvent('status', currentStatus);

					// Stage-specific events for UI
					if (currentStatus.status === 'clustering') {
						sendEvent('clustering_active', {
							documentsProcessed: currentStatus.documentsProcessed,
							centroidCount: currentStatus.centroidCount,
							elapsedMs: Date.now() - currentStatus.startTime
						});
					}

					if (currentStatus.status === 'done') {
						sendEvent('pipeline_complete', {
							jobId: currentStatus.jobId,
							silhouetteScore: currentStatus.silhouetteScore,
							documentsProcessed: currentStatus.documentsProcessed,
							cacheInvalidated: currentStatus.cacheInvalidated,
							durationMs: (currentStatus.endTime || Date.now()) - currentStatus.startTime
						});
					}

					if (currentStatus.status === 'failed') {
						sendEvent('pipeline_error', {
							jobId: currentStatus.jobId,
							error: currentStatus.error,
							durationMs: Date.now() - currentStatus.startTime
						});
					}
				} catch {
					// Non-fatal: SSE continues
				}
			}, 2000);

			// Heartbeat every 30s
			heartbeat = setInterval(() => send(': heartbeat\n\n'), 30000);

			request.signal.addEventListener('abort', shutdown, { once: true });
			if (request.signal.aborted) shutdown();
		},
		cancel() {
			shutdown();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
