import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getWorkerStats: vi.fn(),
	getJobCounts: vi.fn(),
	getJobsForEvidence: vi.fn(),
	enqueueJob: vi.fn(),
	getProjectionStatus: vi.fn(),
}));

vi.mock('$lib/server/analysis/worker.js', () => ({ getWorkerStats: mocks.getWorkerStats }));
vi.mock('$lib/server/analysis/analysis-jobs.js', () => ({
	getJobCounts: mocks.getJobCounts,
	getJobsForEvidence: mocks.getJobsForEvidence,
	enqueueJob: mocks.enqueueJob,
}));
vi.mock('$lib/server/evidence/evidence-vector-projection-scheduler-v1.js', () => ({
	getEvidenceVectorProjectionSchedulerStatusV1: mocks.getProjectionStatus,
}));

describe('evidence analysis projection scheduler status', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.getWorkerStats.mockReturnValue({ running: true, gates: {} });
		mocks.getJobCounts.mockResolvedValue({ queued: 0, running: 0, completed: 0, failed: 0 });
		mocks.getProjectionStatus.mockReturnValue({ enabled: false, started: false, inFlight: false });
	});

	it('returns scheduler configuration and live lifecycle state to authenticated operators', async () => {
		const { GET } = await import('./+server.js');
		const response = await GET({
			url: new URL('http://localhost/api/evidence/analysis'),
			locals: { user: { id: 'operator' } },
		} as never);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			available: true,
			worker: { running: true },
			jobCounts: { queued: 0, running: 0, completed: 0, failed: 0 },
			projectionScheduler: { enabled: false, started: false, inFlight: false },
			error: null,
		});
	});

	it('reports status unavailable instead of fabricating zero counts when worker diagnostics fail', async () => {
		mocks.getWorkerStats.mockImplementation(() => { throw new Error('worker diagnostics unavailable'); });
		const { GET } = await import('./+server.js');
		const response = await GET({
			url: new URL('http://localhost/api/evidence/analysis'),
			locals: { user: { id: 'operator' } },
		} as never);

		expect(response.status).toBe(503);
		await expect(response.json()).resolves.toMatchObject({
			available: false,
			worker: null,
			jobCounts: null,
			projectionScheduler: { enabled: false, started: false, inFlight: false },
			error: 'ANALYSIS_STATUS_UNAVAILABLE',
		});
	});

	it('reports status unavailable when the durable job-count query fails', async () => {
		mocks.getJobCounts.mockRejectedValue(new Error('database unavailable'));
		const { GET } = await import('./+server.js');
		const response = await GET({
			url: new URL('http://localhost/api/evidence/analysis'),
			locals: { user: { id: 'operator' } },
		} as never);

		expect(response.status).toBe(503);
		await expect(response.json()).resolves.toMatchObject({
			available: false,
			worker: null,
			jobCounts: null,
			error: 'ANALYSIS_STATUS_UNAVAILABLE',
		});
	});

	it('reports evidence job status unavailable instead of an empty job list on database failure', async () => {
		mocks.getJobsForEvidence.mockRejectedValue(new Error('durable job store unavailable'));
		const { GET } = await import('./+server.js');
		const response = await GET({
			url: new URL('http://localhost/api/evidence/analysis?evidenceId=fixture-evidence'),
			locals: { user: { id: 'operator' } },
		} as never);

		expect(response.status).toBe(503);
		await expect(response.json()).resolves.toEqual({
			available: false,
			evidenceId: 'fixture-evidence',
			jobs: [],
			error: 'ANALYSIS_STATUS_UNAVAILABLE',
		});
	});
});
