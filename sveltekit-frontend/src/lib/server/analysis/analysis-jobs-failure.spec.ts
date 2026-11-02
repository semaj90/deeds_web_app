import { describe, expect, it, vi } from 'vitest';
import { failAnalysisJob } from './analysis-jobs.js';

const jobId = '44444444-4444-4444-8444-444444444444';

describe('durable analysis job failure state', () => {
	it('requires a database row readback before treating failure as persisted', async () => {
		const executor = { execute: vi.fn().mockResolvedValue({ rows: [{ id: jobId }] }) };

		await expect(failAnalysisJob(jobId, 'source extraction failed', executor)).resolves.toBeUndefined();
		expect(executor.execute).toHaveBeenCalledOnce();
	});

	it('reports when no durable job row was updated', async () => {
		const executor = { execute: vi.fn().mockResolvedValue({ rows: [] }) };

		await expect(failAnalysisJob(jobId, 'source extraction failed', executor))
			.rejects.toThrow('ANALYSIS_JOB_FAILURE_ROW_MISSING');
	});
});
