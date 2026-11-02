import type { RequestHandler } from './$types';
import { z } from 'zod';
import { subscribe, getJob, isJobOwnedBy } from '$lib/server/evidence-progress';
import { getAnalysisJobForOwner } from '$lib/server/analysis/analysis-jobs.js';
import {
	buildEvidenceProcessingCompletionV1,
	formatEvidenceProgressSseEventV1,
} from '$lib/server/evidence/evidence-progress-sse-v1.js';

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
	const ownerId = String(locals.user.id);
	const numericOwnerId = Number(ownerId);
	const memJob = getJob(jobId);
	let ownedJob = null;
	if (Number.isSafeInteger(numericOwnerId) && numericOwnerId > 0) {
		ownedJob = await getAnalysisJobForOwner(jobId, numericOwnerId).catch((error) => {
			console.warn('[EvidenceRealtime] database ownership lookup failed:', error);
			return null;
		});
	}
	if (!ownedJob && memJob && !isJobOwnedBy(jobId, ownerId)) return new Response('Job not found', { status: 404 });
	if (!ownedJob && !memJob) return new Response('Job not found', { status: 404 });

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
			const emitEvent = (event: 'connected' | 'progress' | 'complete' | 'error', payload: Record<string, unknown>) => {
				safeEnqueue(formatEvidenceProgressSseEventV1(event, payload));
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
			emitEvent('connected', { jobId });

			// Durable DB jobs own processing status; memory is only the pre-enqueue upload fallback.
			if (!ownedJob && memJob) {
				// Subscribe to in-memory progress updates
				unsubscribe = subscribe(jobId, (progress) => {
					emitEvent('progress', progress as unknown as Record<string, unknown>);

					if (progress.step === 'complete' || progress.step === 'error') {
						emitEvent(progress.step === 'complete' ? 'complete' : 'error', progress as unknown as Record<string, unknown>);
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
						const row = await getAnalysisJobForOwner(jobId, numericOwnerId);
						if (!row) {
							emitEvent('error', { message: 'Job not found' });
							closeStream();
							return;
						}

						// Only send update if something changed
						if (row.status !== lastStatus || row.progress !== lastProgress) {
							lastStatus = row.status ?? '';
							lastProgress = row.progress ?? '';
							const percent = Math.max(0, Math.min(100, Number.parseInt(row.progress ?? '0', 10) || 0));
							const step = row.status === 'queued' ? 'queued'
								: row.status === 'completed' || percent >= 100 ? 'complete'
								: row.status === 'failed' ? 'error'
								: percent < 20 ? 'uploading'
								: percent < 30 ? 'hashing'
								: percent < 50 ? 'storing'
								: percent < 65 ? 'db-insert'
								: percent < 70 ? 'extracting'
								: percent < 87 ? 'embedding'
								: percent < 92 ? 'vector-storage'
								: percent < 93 ? 'graph'
								: percent < 95 ? 'entity-extraction'
								: 'summarizing';

								emitEvent('progress', {
								jobId,
								evidenceId: row.evidenceId,
								step,
								progress: percent,
								message: row.error ?? `Document ${step.replaceAll('-', ' ')} (${percent}%)`,
								error: row.error ?? undefined,
							});

							if (row.status === 'completed' || row.status === 'failed') {
								if (row.status === 'completed') {
									emitEvent('complete', buildEvidenceProcessingCompletionV1({
										jobId,
										evidenceId: row.evidenceId,
										result: row.result,
										projectionSchedulerEnabled:
											process.env.QDRANT_ENABLED === 'true' &&
											process.env.EVIDENCE_VECTOR_PROJECTION_WORKER_ENABLED === 'true',
									}));
								} else {
									emitEvent('error', {
										jobId,
										evidenceId: row.evidenceId,
										error: row.error ?? undefined,
									});
								}
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
