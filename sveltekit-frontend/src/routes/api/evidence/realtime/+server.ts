import type { RequestHandler } from './$types';
import { z } from 'zod';
import { subscribe, getJob } from '$lib/server/evidence-progress';
import { getAnalysisJob } from '$lib/server/analysis/analysis-jobs.js';

const querySchema = z.object({
	jobId: z.string().min(1, 'Missing jobId parameter').max(200)
});

/**
 * GET /api/evidence/realtime?jobId=xxx
 * SSE endpoint for real-time evidence processing progress.
 *
 * Primary: subscribes to in-memory progress store (fast, same-process).
 * Fallback: polls analysis_jobs DB table every 2s (survives restarts).
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return new Response(parsed.error.issues[0]?.message ?? 'Missing jobId parameter', { status: 400 });
	}
	const { jobId } = parsed.data;

	const encoder = new TextEncoder();
	let isClosed = false;
	let unsubscribe: (() => void) | null = null;
	let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
	let dbPollInterval: ReturnType<typeof setInterval> | null = null;

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
				if (dbPollInterval) { clearInterval(dbPollInterval); dbPollInterval = null; }
			};

			const closeStream = () => {
				isClosed = true;
				cleanup();
				try { controller.close(); } catch { /* already closed */ }
			};

			// Send initial connection event
			safeEnqueue(`data: ${JSON.stringify({ type: 'connected', jobId })}\n\n`);

			// Try in-memory store first (fast path — same-process uploads)
			const memJob = getJob(jobId);
			if (memJob) {
				// Subscribe to in-memory progress updates
				unsubscribe = subscribe(jobId, (progress) => {
					safeEnqueue(`data: ${JSON.stringify({ type: 'progress', ...progress })}\n\n`);

					if (progress.step === 'complete' || progress.step === 'error') {
						safeEnqueue(`data: ${JSON.stringify({ type: progress.step, ...progress })}\n\n`);
						closeStream();
					}
				});
			} else {
				// Fallback: poll analysis_jobs DB table (handles restarts, worker jobs)
				let lastStatus = '';
				let lastProgress = '';

				const pollDb = async () => {
					if (isClosed) return;
					try {
						const row = await getAnalysisJob(jobId);
						if (!row) {
							safeEnqueue(`data: ${JSON.stringify({ type: 'error', message: 'Job not found' })}\n\n`);
							closeStream();
							return;
						}

						// Only send update if something changed
						if (row.status !== lastStatus || row.progress !== lastProgress) {
							lastStatus = row.status ?? '';
							lastProgress = row.progress ?? '';

							safeEnqueue(`data: ${JSON.stringify({
								type: 'progress',
								jobId,
								step: row.status === 'completed' ? 'complete'
									: row.status === 'failed' ? 'error'
									: row.status === 'running' ? 'embedding'
									: 'uploading',
								progress: parseInt(row.progress ?? '0', 10),
								message: row.error ?? `Job ${row.status} (${row.progress ?? 0}%)`,
								error: row.error ?? undefined,
							})}\n\n`);

							if (row.status === 'completed' || row.status === 'failed') {
								safeEnqueue(`data: ${JSON.stringify({
									type: row.status === 'completed' ? 'complete' : 'error',
									jobId,
									result: row.result,
									error: row.error ?? undefined,
								})}\n\n`);
								closeStream();
							}
						}
					} catch {
						// DB poll error — keep trying
					}
				};

				// Poll immediately, then every 2s
				pollDb();
				dbPollInterval = setInterval(pollDb, 2_000);
			}

			// Keep-alive every 30 seconds
			keepAliveInterval = setInterval(() => {
				safeEnqueue(': keep-alive\n\n');
			}, 30_000);
		},
		cancel() {
			isClosed = true;
			if (unsubscribe) { unsubscribe(); unsubscribe = null; }
			if (keepAliveInterval) { clearInterval(keepAliveInterval); keepAliveInterval = null; }
			if (dbPollInterval) { clearInterval(dbPollInterval); dbPollInterval = null; }
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
