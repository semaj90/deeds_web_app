import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	claimBatch: vi.fn(),
	resetStaleJobs: vi.fn(),
	updateAnalysisJob: vi.fn(),
	completeAnalysisJob: vi.fn(),
	failAnalysisJob: vi.fn(),
	recordAnalysisPassResult: vi.fn(),
	clientConnect: vi.fn(),
	clientQuery: vi.fn(),
	clientOn: vi.fn(),
	clientEnd: vi.fn(),
  clientHandlers: {} as Record<string, (...args: unknown[]) => void>,
  client: {} as Record<string, unknown>,
  dbInsert: vi.fn(),
  dbValues: vi.fn(),
  dbReturning: vi.fn(),
  dbExecute: vi.fn(),
	entityGate: { activeCount: 0, pendingCount: 0 },
	forensicsGate: { activeCount: 0, pendingCount: 0 },
	summarizeGate: { activeCount: 0, pendingCount: 0 },
	embedGate: { activeCount: 0, pendingCount: 0 },
	gated: vi.fn(),
}));

vi.mock('../../src/lib/server/analysis/analysis-jobs.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/server/analysis/analysis-jobs.js')>()),
  claimBatch: mocks.claimBatch,
  resetStaleJobs: mocks.resetStaleJobs,
  updateAnalysisJob: mocks.updateAnalysisJob,
  completeAnalysisJob: mocks.completeAnalysisJob,
  failAnalysisJob: mocks.failAnalysisJob,
  ANALYSIS_JOBS_NOTIFY_CHANNEL: 'atlas_analysis_jobs',
}));

vi.mock('../../src/lib/server/analysis/analysis-pass-results.js', () => ({
	recordAnalysisPassResult: mocks.recordAnalysisPassResult,
}));

vi.mock('../../src/lib/server/queue/topology.js', () => ({ EVENT_ROUTING_KEYS: {} }));

vi.mock('../../src/lib/server/analysis/concurrency-gate.js', () => {
	return {
		embedGate: mocks.embedGate,
		entityGate: mocks.entityGate,
		forensicsGate: mocks.forensicsGate,
		summarizeGate: mocks.summarizeGate,
		gated: mocks.gated,
		getGateStats: vi.fn(() => ({})),
	};
});

vi.mock('../../src/lib/server/analysis/code-evidence-synthesizer.js', () => ({
	buildCodeEvidenceLedgerInputFromSource: vi.fn(),
	buildCodeEvidenceSynthesizerReceiptFromSource: vi.fn(),
}));

vi.mock('../../src/lib/server/atlas/identity/packet-key-builder.js', () => ({
	computePacketKey: vi.fn(),
}));

vi.mock('pg', () => ({
  Client: vi.fn(() => mocks.client),
  Pool: vi.fn(),
}));

vi.mock('$lib/server/db/client', () => ({
  db: { insert: mocks.dbInsert, execute: mocks.dbExecute },
  pgRows: vi.fn(),
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
  analysisJobs: { tableName: 'analysis_jobs' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings: Array.from(strings),
    values,
  }),
}));

vi.mock('$lib/server/db/postgres-error-details.js', () => ({
  postgresErrorDetails: (error: unknown) => String(error),
}));

describe('analysis worker fallback poll', () => {
	let worker: typeof import('../../src/lib/server/analysis/worker.js');
	let originalDatabaseUrl: string | undefined;
	const flushWorkerPoll = async () => {
		for (let index = 0; index < 20; index++) await Promise.resolve();
	};

	beforeEach(async () => {
		vi.resetModules();
		vi.useFakeTimers();
		vi.clearAllMocks();
		originalDatabaseUrl = process.env.DATABASE_URL;
		process.env.DATABASE_URL = 'postgres://worker-test.invalid/test';
		mocks.clientHandlers = {};
		mocks.client = {
			connect: mocks.clientConnect.mockResolvedValue(undefined),
			query: mocks.clientQuery.mockResolvedValue(undefined),
			on: mocks.clientOn.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
				mocks.clientHandlers[event] = handler;
				return mocks.client;
			}),
			end: mocks.clientEnd.mockResolvedValue(undefined),
		};
    mocks.claimBatch.mockResolvedValue([]);
    mocks.dbReturning.mockResolvedValue([{ id: 'enqueued-job-1' }]);
    mocks.dbValues.mockReturnValue({ returning: mocks.dbReturning });
    mocks.dbInsert.mockReturnValue({ values: mocks.dbValues });
    mocks.dbExecute.mockImplementation(async (query: { strings?: string[]; values?: unknown[] }) => {
      if (query.strings?.join('').includes('pg_notify')) {
        expect(query.values).toContain('atlas_analysis_jobs');
        mocks.clientHandlers.notification?.({ channel: 'atlas_analysis_jobs' });
      }
    });
		mocks.gated.mockImplementation((_gate, run) => Promise.resolve().then(run));
		mocks.resetStaleJobs.mockResolvedValue(0);
		worker = await import('../../src/lib/server/analysis/worker.js');
	});

	afterEach(() => {
		worker?.stopWorker();
		if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
		else process.env.DATABASE_URL = originalDatabaseUrl;
		vi.useRealTimers();
	});

	it('runs the fallback poll every 30 seconds without touching a database', async () => {
		worker.startWorker();
		await flushWorkerPoll();
		expect(mocks.claimBatch).toHaveBeenCalledTimes(5);
		expect(mocks.clientQuery).toHaveBeenCalledWith('LISTEN atlas_analysis_jobs');

		await vi.advanceTimersByTimeAsync(29_999);
		await flushWorkerPoll();
		expect(mocks.claimBatch).toHaveBeenCalledTimes(5);

		await vi.advanceTimersByTimeAsync(1);
		await flushWorkerPoll();
		expect(mocks.claimBatch).toHaveBeenCalledTimes(10);
		expect(mocks.updateAnalysisJob).not.toHaveBeenCalled();
		expect(mocks.recordAnalysisPassResult).not.toHaveBeenCalled();
	});

  it('wakes an immediate poll from a listener notification without enqueueing a job', async () => {
		worker.startWorker();
		await flushWorkerPoll();
		expect(mocks.claimBatch).toHaveBeenCalledTimes(5);
		const notification = mocks.clientHandlers.notification;
		expect(notification).toBeTypeOf('function');

		notification?.({ channel: 'atlas_analysis_jobs' });
		await flushWorkerPoll();
		expect(mocks.claimBatch).toHaveBeenCalledTimes(10);
		expect(mocks.updateAnalysisJob).not.toHaveBeenCalled();
    expect(mocks.recordAnalysisPassResult).not.toHaveBeenCalled();
  });

  it('connects mocked enqueue → pg_notify → listener → immediate worker poll', async () => {
    worker.startWorker();
    await flushWorkerPoll();
    expect(mocks.claimBatch).toHaveBeenCalledTimes(5);

    const { enqueueJob } = await import('../../src/lib/server/analysis/analysis-jobs.js');
    await expect(enqueueJob({ evidenceId: 'evidence-1', jobType: 'entity_extraction' })).resolves.toBe(
      'enqueued-job-1',
    );
    await flushWorkerPoll();

    expect(mocks.dbInsert).toHaveBeenCalledTimes(1);
    expect(mocks.dbReturning).toHaveBeenCalledTimes(1);
    expect(mocks.dbExecute).toHaveBeenCalledTimes(1);
    expect(mocks.claimBatch).toHaveBeenCalledTimes(10);
    expect(mocks.updateAnalysisJob).not.toHaveBeenCalled();
    expect(mocks.recordAnalysisPassResult).not.toHaveBeenCalled();
  });

	it('dispatches the configured entity and forensics capacities in one poll', async () => {
		mocks.claimBatch.mockImplementation(async (jobType: string, limit: number) => {
			if (jobType !== 'entity_extraction' && jobType !== 'forensics') return [];
			return Array.from({ length: limit }, (_, index) => ({
				id: `${jobType}-${index}`,
				evidenceId: `evidence-${index}`,
				caseId: null,
				jobType,
				result: {},
			}));
		});
		mocks.gated.mockImplementation((gate: { pendingCount: number }, _run: () => Promise<unknown>) => {
			gate.pendingCount += 1;
			return Promise.resolve();
		});

		worker.startWorker();
		await flushWorkerPoll();

		expect(mocks.claimBatch).toHaveBeenCalledWith('entity_extraction', 2);
		expect(mocks.claimBatch).toHaveBeenCalledWith('forensics', 4);
		expect(mocks.gated).toHaveBeenCalledTimes(6);
		expect(mocks.entityGate.pendingCount).toBe(2);
		expect(mocks.forensicsGate.pendingCount).toBe(4);
		expect(mocks.updateAnalysisJob).not.toHaveBeenCalled();
		expect(mocks.recordAnalysisPassResult).not.toHaveBeenCalled();
	});
});
