import { json, type RequestHandler } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { pgRows } from '$lib/server/db/client.js';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import {
	formatEvidenceAnalysisProgressSseV1,
	formatEvidenceSseRetryV1,
	parseEvidenceEventCursorV1,
	type EvidenceAnalysisJobStatusV1,
} from '$lib/server/evidence/evidence-progress-sse-v1.js';
import {
	enqueueEvidenceProgressChunkV1,
	evidenceProgressConnectionLimiterV1,
	evidenceProgressStreamLimitsV1,
} from '$lib/server/evidence/evidence-progress-stream-limits-v1.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH_SIZE = 32;
const POLL_INTERVAL_MS = 1_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const AUTH_RECHECK_INTERVAL_MS = 30_000;
const SOURCE_REVISION_RE = /^sha256:[a-f0-9]{64}$/;

type EventRow = {
	pruned_max_seq: string | bigint;
	event_seq: string | bigint | null;
	event_id: string | null;
	job_id: string | null;
	evidence_id: string | null;
	case_id: string | null;
	stage: string | null;
	status: EvidenceAnalysisJobStatusV1 | null;
	source_revision: string | null;
	progress: string | null;
};

function waitForPoll(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal.aborted) return resolve();
		const timeout = setTimeout(done, ms);
		function done() {
			clearTimeout(timeout);
			signal.removeEventListener('abort', done);
			resolve();
		}
		signal.addEventListener('abort', done, { once: true });
	});
}

/** Resumable, case-authorized view of the existing durable analysis_jobs owner. */
export const GET: RequestHandler = async ({ params, locals, request }) => {
	const actorId = Number(locals.user?.id);
	const { caseId, jobId } = params;
	if (!Number.isSafeInteger(actorId) || actorId <= 0) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	if (!UUID_RE.test(caseId) || !UUID_RE.test(jobId)) {
		return json({ error: 'Not found' }, { status: 404 });
	}
	const initialCursor = parseEvidenceEventCursorV1(
		request.headers.get('last-event-id') ?? new URL(request.url).searchParams.get('after'),
	);
	if (initialCursor === null) return json({ error: 'Invalid event cursor' }, { status: 400 });

	try {
		const authorizedCase = await getAuthorizedCase(caseId, actorId);
		if (!authorizedCase) return json({ error: 'Not found' }, { status: 404 });

		const [jobRow] = pgRows(await db.execute(sql`
			SELECT j.id, j.case_id, e.case_id AS evidence_case_id
			FROM public.analysis_jobs AS j
			JOIN public.evidence AS e ON e.id = j.evidence_id
			WHERE j.id = ${jobId}::uuid
			  AND e.case_id = ${caseId}::uuid
			  AND (j.case_id IS NULL OR j.case_id = e.case_id)
			LIMIT 1
		`));
		const jobCaseId = typeof jobRow?.case_id === 'string' ? jobRow.case_id : null;
		if (
			!jobRow ||
			jobRow.evidence_case_id !== caseId ||
			(jobCaseId !== null && jobCaseId !== caseId)
		) return json({ error: 'Not found' }, { status: 404 });
		const lease = evidenceProgressConnectionLimiterV1.acquire(String(actorId), jobId);
		if (!lease.allowed) {
			return json(
				{ error: 'Evidence progress stream capacity reached', code: 'reason' in lease ? lease.reason : undefined },
				{ status: 429, headers: { 'Retry-After': '5' } },
			);
		}

		const encoder = new TextEncoder();
		const localAbort = new AbortController();
		const stop = () => localAbort.abort();
		if (request.signal.aborted) stop();
		else request.signal.addEventListener('abort', stop, { once: true });
		let cursor = initialCursor;
		let ended = false;
		let retrySent = false;
		let lastHeartbeatAt = Date.now();
		let lastAuthorizationCheckAt = Date.now();
		const finish = (controller?: ReadableStreamDefaultController<Uint8Array>) => {
			ended = true;
			lease.release();
			request.signal.removeEventListener('abort', stop);
			if (!localAbort.signal.aborted) localAbort.abort();
			try { controller?.close(); } catch { /* already closed/cancelled */ }
		};
		let maxQueuedBytesObserved = 0;
		const enqueueBounded = (controller: ReadableStreamDefaultController<Uint8Array>, chunk: Uint8Array) => {
			const desiredSize = controller.desiredSize ?? 0;
			maxQueuedBytesObserved = Math.max(
				maxQueuedBytesObserved,
				evidenceProgressStreamLimitsV1.maxQueuedBytes - desiredSize,
			);
			if (!enqueueEvidenceProgressChunkV1(
				controller,
				chunk,
				evidenceProgressStreamLimitsV1.maxQueuedBytes,
			)) {
				console.warn('[evidence-sse] closing stream at byte queue limit', {
					maxQueuedBytesObserved,
					maxQueuedBytes: evidenceProgressStreamLimitsV1.maxQueuedBytes,
				});
				finish(controller);
				return false;
			}
			maxQueuedBytesObserved = Math.max(
				maxQueuedBytesObserved,
				evidenceProgressStreamLimitsV1.maxQueuedBytes - (controller.desiredSize ?? 0),
			);
			return true;
		};

		const stream = new ReadableStream<Uint8Array>({
			async pull(controller) {
				if (ended || localAbort.signal.aborted) {
					finish(controller);
					return;
				}

				try {
					// EventSource owns reconnect and Last-Event-ID handling. A per-connection
					// retry hint adds bounded jitter so proxy restarts do not herd clients.
					if (!retrySent) {
						if (!enqueueBounded(controller, encoder.encode(formatEvidenceSseRetryV1()))) return;
						retrySent = true;
						return;
					}
					if (Date.now() - lastAuthorizationCheckAt >= AUTH_RECHECK_INTERVAL_MS) {
						lastAuthorizationCheckAt = Date.now();
						if (!await getAuthorizedCase(caseId, actorId)) {
							if (enqueueBounded(controller, encoder.encode('event: stream-ended\ndata: {"code":"AUTHORIZATION_REVOKED"}\n\n'))) {
								finish(controller);
							}
							return;
						}
					}

					const rows = pgRows(await db.execute(sql`
						SELECT j.progress_events_pruned_max_seq::text AS pruned_max_seq,
						       e.event_seq::text, e.event_id::text, e.job_id::text, e.evidence_id::text,
						       e.case_id::text, e.stage, e.status, e.source_revision, e.progress
						FROM public.analysis_jobs AS j
						JOIN public.evidence AS ev ON ev.id = j.evidence_id AND ev.case_id = ${caseId}::uuid
						LEFT JOIN LATERAL (
							SELECT event_seq, event_id, job_id, evidence_id, case_id, stage, status, source_revision, progress
							FROM public.analysis_job_events
							WHERE job_id = j.id
							  AND case_id = ${caseId}::uuid
							  AND event_seq > ${cursor.toString()}::bigint
							ORDER BY event_seq ASC
							LIMIT ${BATCH_SIZE}
						) AS e ON TRUE
						WHERE j.id = ${jobId}::uuid
						  AND (j.case_id IS NULL OR j.case_id = ev.case_id)
						ORDER BY e.event_seq ASC NULLS LAST
					`)) as EventRow[];

					const prunedMaxSeq = rows.length > 0 ? BigInt(rows[0].pruned_max_seq) : 0n;
					const eventRows = rows.filter((row): row is EventRow & { event_seq: string | bigint } => row.event_seq !== null);
					if ((cursor < prunedMaxSeq || eventRows.length > 0) && !await getAuthorizedCase(caseId, actorId)) {
						if (enqueueBounded(controller, encoder.encode('event: stream-ended\ndata: {"code":"AUTHORIZATION_REVOKED"}\n\n'))) {
							finish(controller);
						}
						return;
					}
					if (cursor < prunedMaxSeq) {
						if (enqueueBounded(controller, encoder.encode('event: stream-ended\ndata: {"code":"EVENT_HISTORY_GAP"}\n\n'))) {
							finish(controller);
						}
						return;
					}

					for (const row of eventRows) {
						if (!row.source_revision || !SOURCE_REVISION_RE.test(row.source_revision)) {
							if (enqueueBounded(controller, encoder.encode('event: stream-error\ndata: {"code":"SOURCE_REVISION_UNAVAILABLE"}\n\n'))) {
								finish(controller);
							}
							return;
						}
						const sequence = BigInt(row.event_seq);
						if (!enqueueBounded(controller, encoder.encode(formatEvidenceAnalysisProgressSseV1(sequence, {
							eventId: row.event_id!,
							jobId: row.job_id!,
							evidenceId: row.evidence_id!,
							caseId: row.case_id!,
							stage: row.stage!,
							status: row.status!,
							sourceRevision: row.source_revision,
							progress: Math.max(0, Math.min(100, Number.parseInt(row.progress ?? '0', 10) || 0)),
						})))) return;
						cursor = sequence;
						if (row.status === 'completed' || row.status === 'failed') {
							finish(controller);
							return;
						}
					}
					if (eventRows.length > 0) return;

					const elapsed = Date.now() - lastHeartbeatAt;
					if (elapsed >= HEARTBEAT_INTERVAL_MS) {
						if (!enqueueBounded(controller, encoder.encode(`: heartbeat ${new Date().toISOString()}\n\n`))) return;
						lastHeartbeatAt = Date.now();
						return;
					}
					await waitForPoll(Math.min(POLL_INTERVAL_MS, HEARTBEAT_INTERVAL_MS - elapsed), localAbort.signal);
					if (localAbort.signal.aborted) finish(controller);
				} catch {
					if (!ended && !localAbort.signal.aborted) {
						enqueueBounded(controller, encoder.encode('event: stream-error\ndata: {"code":"PROGRESS_READ_UNAVAILABLE"}\n\n'));
					}
					finish(controller);
				}
			},
			cancel() {
				finish();
			},
		}, {
			highWaterMark: evidenceProgressStreamLimitsV1.maxQueuedBytes,
			size: (chunk) => chunk.byteLength,
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream; charset=utf-8',
				'Cache-Control': 'no-cache, no-transform',
				'X-Accel-Buffering': 'no',
				'X-Content-Type-Options': 'nosniff',
			},
		});
	} catch {
		return json({ error: 'Evidence progress unavailable' }, { status: 503 });
	}
};
