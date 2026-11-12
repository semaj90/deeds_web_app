import { describe, expect, it, vi } from 'vitest';
import { createAnalysisJobProgressEventWriterV1 } from './analysis-job-progress-events-v1.js';

const jobId = 'af5368e3-7e37-48dc-b6fd-03798462bed3';

describe('durable analysis job progress stages', () => {
	it('appends source-qualified detail when the proposal event table is available', async () => {
		const execute = vi.fn()
			.mockResolvedValueOnce({ rows: [{ available: true }] })
			.mockResolvedValueOnce({ rows: [{ event_id: 'stable-event-id' }] });
		const recordStage = createAnalysisJobProgressEventWriterV1({ execute });

		await expect(recordStage(jobId, 'text_extraction')).resolves.toBe(true);
		expect(execute).toHaveBeenCalledTimes(2);
	});

	it('is a no-op on pre-migration schemas and caches the missing-table probe briefly', async () => {
		const execute = vi.fn().mockResolvedValue({ rows: [{ available: false }] });
		const recordStage = createAnalysisJobProgressEventWriterV1({ execute }, () => 1_000);

		await expect(recordStage(jobId, 'processing')).resolves.toBe(false);
		await expect(recordStage(jobId, 'canonical_indexing')).resolves.toBe(false);
		expect(execute).toHaveBeenCalledOnce();
	});

	it('fails closed on an unexpected stage value before querying storage', async () => {
		const execute = vi.fn();
		const recordStage = createAnalysisJobProgressEventWriterV1({ execute });

		await expect(recordStage(jobId, 'not-a-stage' as never))
			.rejects.toThrow('ANALYSIS_JOB_PROGRESS_STAGE_INVALID');
		expect(execute).not.toHaveBeenCalled();
	});
});
