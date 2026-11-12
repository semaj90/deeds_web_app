import { beforeEach, describe, expect, it, vi } from 'vitest';

const execute = vi.hoisted(() => vi.fn());
const getAuthorizedCase = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/db/client.js', () => ({
	db: { execute },
	pgRows: (result: { rows?: unknown[] }) => result.rows ?? [],
}));

vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase }));

import { GET } from './+server.js';

const caseId = '89317a13-5ec2-4919-8795-1128bb01fdce';
const jobId = 'e24f9ad7-75b5-4f7c-9a40-1f305b6f0c51';
const evidenceId = '1c7a1bdc-8a1f-41f4-9c72-c9b4cfad8434';
const otherCaseId = '79317a13-5ec2-4919-8795-1128bb01fdce';

function scopedJobRow(overrides: Record<string, unknown> = {}) {
	return { id: jobId, case_id: caseId, evidence_case_id: caseId, ...overrides };
}

function request(lastEventId?: string, after?: string, signal?: AbortSignal) {
	const headers = new Headers();
	if (lastEventId) headers.set('last-event-id', lastEventId);
	const query = after ? `?after=${encodeURIComponent(after)}` : '';
	return new Request(`http://localhost/api/cases/${caseId}/evidence/jobs/${jobId}/events${query}`, { headers, signal });
}

function eventRow(eventSeq: string, status: string) {
	return {
		event_seq: eventSeq,
		event_id: `f24f9ad7-75b5-4f7c-9a40-1f305b6f0c5${eventSeq.slice(-1)}`,
		job_id: jobId,
		evidence_id: evidenceId,
		case_id: caseId,
		stage: status,
		status,
		source_revision: `sha256:${'0'.repeat(64)}`,
		progress: status === 'completed' ? '100' : '40',
	};
}

function pollRows(events: ReturnType<typeof eventRow>[], prunedMaxSeq = '0') {
	if (events.length === 0) return { rows: [{ pruned_max_seq: prunedMaxSeq, event_seq: null }] };
	return { rows: events.map((event) => ({ ...event, pruned_max_seq: prunedMaxSeq })) };
}

describe('case-scoped evidence job SSE', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getAuthorizedCase.mockResolvedValue({ id: caseId });
	});

	it('replays strictly after Last-Event-ID and ends at terminal status with redacted source-qualified data', async () => {
		execute
			.mockResolvedValueOnce({ rows: [scopedJobRow()] })
			.mockResolvedValueOnce(pollRows([eventRow('42', 'completed')]));
		const response = await GET({
			params: { caseId, jobId },
			locals: { user: { id: 7 } },
			request: request('41'),
		} as never);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/event-stream');
		const body = await response.text();
		expect(body).toMatch(/^retry: [2-5]\d{3}\n\n/);
		expect(body).toContain('id: 42\n');
		expect(body).toContain('event: analysis-progress\n');
		expect(body).toContain(`"jobId":"${jobId}"`);
		expect(body).toContain(`"evidenceId":"${evidenceId}"`);
		expect(body).toContain(`"caseId":"${caseId}"`);
		expect(body).toContain(`"sourceRevision":"sha256:${'0'.repeat(64)}"`);
		expect(body).toContain('"status":"completed"');
		expect(body).not.toContain('filename');
		expect(body).not.toContain('"error":');
	});

	it('replays ordered queued, running, and terminal states with unique sequence IDs', async () => {
		execute
			.mockResolvedValueOnce({ rows: [scopedJobRow()] })
			.mockResolvedValueOnce(pollRows([
				eventRow('40', 'queued'),
				eventRow('41', 'running'),
				eventRow('42', 'completed'),
			]));
		const response = await GET({
			params: { caseId, jobId },
			locals: { user: { id: 7 } },
			request: request(),
		} as never);

		const body = await response.text();
		expect(body.match(/id: \d+\n/g)).toEqual(['id: 40\n', 'id: 41\n', 'id: 42\n']);
		expect(body.indexOf('"status":"queued"')).toBeLessThan(body.indexOf('"status":"running"'));
		expect(body.indexOf('"status":"running"')).toBeLessThan(body.indexOf('"status":"completed"'));
	});

	it('does not expose a job from another or unauthorized case', async () => {
		getAuthorizedCase.mockResolvedValue(null);
		const response = await GET({
			params: { caseId, jobId },
			locals: { user: { id: 8 } },
			request: request(),
		} as never);

		expect(response.status).toBe(404);
		expect(execute).not.toHaveBeenCalled();
	});

	it('returns not found when the requested job is not attached to the authorized case', async () => {
		execute.mockResolvedValueOnce({ rows: [] });
		const response = await GET({
			params: { caseId, jobId },
			locals: { user: { id: 7 } },
			request: request(),
		} as never);

		expect(response.status).toBe(404);
		expect(execute).toHaveBeenCalledTimes(1);
	});

	it('rejects a job assigned to this case when its evidence belongs to another case', async () => {
		execute.mockResolvedValueOnce({
			rows: [scopedJobRow({ evidence_case_id: otherCaseId })],
		});
		const response = await GET({
			params: { caseId, jobId },
			locals: { user: { id: 7 } },
			request: request(),
		} as never);

		expect(response.status).toBe(404);
		expect(execute).toHaveBeenCalledTimes(1);
	});

	it('rejects a job assigned to another case even when its evidence belongs here', async () => {
		execute.mockResolvedValueOnce({
			rows: [scopedJobRow({ case_id: otherCaseId })],
		});
		const response = await GET({
			params: { caseId, jobId },
			locals: { user: { id: 7 } },
			request: request(),
		} as never);

		expect(response.status).toBe(404);
		expect(execute).toHaveBeenCalledTimes(1);
	});

	it('yields to unrelated event-loop work and stops polling after disconnect', async () => {
		execute
			.mockResolvedValueOnce({ rows: [scopedJobRow()] })
			.mockResolvedValueOnce(pollRows([]));
		const controller = new AbortController();
		const response = await GET({
			params: { caseId, jobId },
			locals: { user: { id: 7 } },
			request: request(undefined, undefined, controller.signal),
		} as never);

		const reader = response.body!.getReader();
		const retryHint = await reader.read();
		expect(new TextDecoder().decode(retryHint.value)).toMatch(/^retry: [2-5]\d{3}\n\n$/);
		const pendingRead = reader.read();
		let unrelatedWorkRan = false;
		await new Promise<void>((resolve) => setTimeout(() => {
			unrelatedWorkRan = true;
			resolve();
		}, 0));
		expect(unrelatedWorkRan).toBe(true);
		controller.abort();
		await expect(pendingRead).resolves.toMatchObject({ done: true });
		expect(execute).toHaveBeenCalledTimes(2);
	});

	it('rechecks authorization before delivering newly read events', async () => {
		getAuthorizedCase
			.mockResolvedValueOnce({ id: caseId })
			.mockResolvedValueOnce(null);
		execute
			.mockResolvedValueOnce({ rows: [scopedJobRow()] })
			.mockResolvedValueOnce(pollRows([eventRow('42', 'completed')]));
		const response = await GET({
			params: { caseId, jobId },
			locals: { user: { id: 7 } },
			request: request(),
		} as never);

		const body = await response.text();
		expect(body).toContain('event: stream-ended\ndata: {"code":"AUTHORIZATION_REVOKED"}\n\n');
		expect(body).not.toContain('event: analysis-progress');
		expect(body).not.toContain('"status":"completed"');
		expect(getAuthorizedCase).toHaveBeenCalledTimes(2);
	});

	it('rejects malformed replay cursors before opening the stream', async () => {
		const response = await GET({
			params: { caseId, jobId },
			locals: { user: { id: 7 } },
			request: request('1;forged'),
		} as never);

		expect(response.status).toBe(400);
	});

	it('uses a bounded query cursor for explicit EventSource recreation', async () => {
		execute
			.mockResolvedValueOnce({ rows: [scopedJobRow()] })
			.mockResolvedValueOnce(pollRows([eventRow('42', 'completed')]));
		const response = await GET({
			params: { caseId, jobId },
			locals: { user: { id: 7 } },
			request: request(undefined, '41'),
		} as never);

		expect(response.status).toBe(200);
		expect((await response.text()).match(/id: 42\n/g)).toHaveLength(1);
	});

	it('fails closed when the job has no canonical SHA-256 source revision', async () => {
		execute
			.mockResolvedValueOnce({ rows: [scopedJobRow()] })
			.mockResolvedValueOnce(pollRows([{ ...eventRow('42', 'running'), source_revision: 'fixture-revision' }]));
		const response = await GET({
			params: { caseId, jobId },
			locals: { user: { id: 7 } },
			request: request(),
		} as never);

		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain('SOURCE_REVISION_UNAVAILABLE');
		expect(body).not.toContain('fixture-revision');
	});

	it('redacts event-history read failures into a terminal stream error', async () => {
		execute
			.mockResolvedValueOnce({ rows: [scopedJobRow()] })
			.mockRejectedValueOnce(new Error('relation analysis_job_events does not exist'));
		const response = await GET({
			params: { caseId, jobId },
			locals: { user: { id: 7 } },
			request: request(),
		} as never);

		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain('event: stream-error\ndata: {"code":"PROGRESS_READ_UNAVAILABLE"}\n\n');
		expect(body).not.toContain('analysis_job_events does not exist');
	});

	it('ends explicitly when retention removed events newer than the client cursor', async () => {
		execute
			.mockResolvedValueOnce({ rows: [scopedJobRow()] })
			.mockResolvedValueOnce(pollRows([], '42'));
		const response = await GET({
			params: { caseId, jobId },
			locals: { user: { id: 7 } },
			request: request(undefined, '41'),
		} as never);

		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain('event: stream-ended\ndata: {"code":"EVENT_HISTORY_GAP"}\n\n');
		expect(body).not.toContain('event: stream-ended\\n');
		expect(body).not.toContain('analysis-progress');
	});

	it('does not report a retention gap when the cursor has reached the prune watermark', async () => {
		execute
			.mockResolvedValueOnce({ rows: [scopedJobRow()] })
			.mockResolvedValueOnce(pollRows([eventRow('43', 'completed')], '42'));
		const response = await GET({
			params: { caseId, jobId },
			locals: { user: { id: 7 } },
			request: request(undefined, '42'),
		} as never);

		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain('id: 43');
		expect(body).toContain('"status":"completed"');
		expect(body).not.toContain('EVENT_HISTORY_GAP');
	});
});
