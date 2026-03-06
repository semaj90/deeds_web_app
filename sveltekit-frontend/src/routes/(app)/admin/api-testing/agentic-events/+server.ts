// API endpoint: /api/agentic-events
// Server-Sent Events stream for real-time clustering pipeline updates
// Wired to TypeScript k-means clustering worker (XState v5)
// Future: wire to CUDA clustering service (Go/C++ at deeds_labs/cuda-binaries/)

import type { RequestHandler } from './$types';
import { getClusteringStatus } from '$lib/server/ml/topic-clustering-worker.js';

export const GET: RequestHandler = async ({ request }) => {
	const stream = new ReadableStream({
		start(controller) {
			// Send initial connection message
			controller.enqueue(': connected\n\n');

			// Send current status immediately
			const status = getClusteringStatus();
			controller.enqueue(
				`event: status\ndata: ${JSON.stringify(status)}\n\n`
			);

			// Poll clustering status every 2 seconds
			const pollInterval = setInterval(() => {
				try {
					const currentStatus = getClusteringStatus();
					controller.enqueue(
						`event: status\ndata: ${JSON.stringify(currentStatus)}\n\n`
					);

					// Stage-specific events for UI
					if (currentStatus.status === 'clustering') {
						controller.enqueue(
							`event: clustering_active\ndata: ${JSON.stringify({
								documentsProcessed: currentStatus.documentsProcessed,
								centroidCount: currentStatus.centroidCount,
								elapsedMs: Date.now() - currentStatus.startTime
							})}\n\n`
						);
					}

					if (currentStatus.status === 'done') {
						controller.enqueue(
							`event: pipeline_complete\ndata: ${JSON.stringify({
								jobId: currentStatus.jobId,
								silhouetteScore: currentStatus.silhouetteScore,
								documentsProcessed: currentStatus.documentsProcessed,
								cacheInvalidated: currentStatus.cacheInvalidated,
								durationMs: (currentStatus.endTime || Date.now()) - currentStatus.startTime
							})}\n\n`
						);
					}

					if (currentStatus.status === 'failed') {
						controller.enqueue(
							`event: pipeline_error\ndata: ${JSON.stringify({
								jobId: currentStatus.jobId,
								error: currentStatus.error,
								durationMs: Date.now() - currentStatus.startTime
							})}\n\n`
						);
					}
				} catch {
					// Non-fatal: SSE continues
				}
			}, 2000);

			// Heartbeat every 30s
			const heartbeat = setInterval(() => {
				controller.enqueue(`: heartbeat\n\n`);
			}, 30000);

			// Cleanup on disconnect
			request.signal.addEventListener('abort', () => {
				clearInterval(pollInterval);
				clearInterval(heartbeat);
				controller.close();
			});
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
