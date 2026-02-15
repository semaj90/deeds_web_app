import type { RequestHandler } from './$types';
import { subscribe, getJob } from '$lib/server/evidence-progress';

/**
 * GET /api/evidence/realtime?jobId=xxx
 * SSE endpoint for real-time evidence processing progress.
 * Subscribes to the in-memory progress store and streams updates.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	const jobId = url.searchParams.get('jobId');
	if (!jobId) {
		return new Response('Missing jobId parameter', { status: 400 });
	}

	const encoder = new TextEncoder();
	let isClosed = false;
	let unsubscribe: (() => void) | null = null;
	let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

	const stream = new ReadableStream({
		start(controller) {
			const safeEnqueue = (data: string) => {
				if (isClosed) return;
				try {
					controller.enqueue(encoder.encode(data));
				} catch {
					isClosed = true;
					cleanup();
				}
			};

			const cleanup = () => {
				if (unsubscribe) { unsubscribe(); unsubscribe = null; }
				if (keepAliveInterval) { clearInterval(keepAliveInterval); keepAliveInterval = null; }
			};

			// Send initial connection event
			safeEnqueue(`data: ${JSON.stringify({ type: 'connected', jobId })}\n\n`);

			// Subscribe to progress updates from the in-memory store
			unsubscribe = subscribe(jobId, (progress) => {
				safeEnqueue(`data: ${JSON.stringify({ type: 'progress', ...progress })}\n\n`);

				// Close stream when job completes or errors
				if (progress.step === 'complete' || progress.step === 'error') {
					const eventType = progress.step === 'complete' ? 'complete' : 'error';
					safeEnqueue(`data: ${JSON.stringify({ type: eventType, ...progress })}\n\n`);
					isClosed = true;
					cleanup();
					try { controller.close(); } catch { /* already closed */ }
				}
			});

			// Keep-alive every 30 seconds
			keepAliveInterval = setInterval(() => {
				safeEnqueue(': keep-alive\n\n');
			}, 30_000);

			// If job doesn't exist (expired or invalid), close immediately
			if (!getJob(jobId)) {
				safeEnqueue(`data: ${JSON.stringify({ type: 'error', message: 'Job not found or expired' })}\n\n`);
				isClosed = true;
				cleanup();
				try { controller.close(); } catch { /* already closed */ }
			}
		},
		cancel() {
			isClosed = true;
			if (unsubscribe) { unsubscribe(); unsubscribe = null; }
			if (keepAliveInterval) { clearInterval(keepAliveInterval); keepAliveInterval = null; }
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no',
		},
	});
};
