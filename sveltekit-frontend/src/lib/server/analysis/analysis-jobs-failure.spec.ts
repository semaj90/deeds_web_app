import { describe, expect, it, vi } from 'vitest';
import {
	classifyEvidenceUploadFailureV1,
	shouldRetryEvidenceUploadFailureV1,
	MAX_EVIDENCE_UPLOAD_ATTEMPTS_V1,
	completeEvidenceUploadJobV1,
	failAnalysisJob,
	failEvidenceUploadJobV1,
	markEvidenceUploadProcessingV1
} from './analysis-jobs.js';

const jobId = '44444444-4444-4444-8444-444444444444';

describe('evidence upload failure classification', () => {
	it('retries only transient storage failures within the bounded attempt budget', () => {
		expect(MAX_EVIDENCE_UPLOAD_ATTEMPTS_V1).toBe(3);
		expect(shouldRetryEvidenceUploadFailureV1('STORAGE_TEMPORARY_FAILURE', 1)).toBe(true);
		expect(shouldRetryEvidenceUploadFailureV1('STORAGE_TEMPORARY_FAILURE', 2)).toBe(true);
		expect(shouldRetryEvidenceUploadFailureV1('STORAGE_TEMPORARY_FAILURE', 3)).toBe(false);
		expect(shouldRetryEvidenceUploadFailureV1('SOURCE_MISSING', 1)).toBe(false);
		expect(shouldRetryEvidenceUploadFailureV1('SOURCE_CHECKSUM_MISMATCH', 1)).toBe(false);
	});

	it('classifies an exact missing key as source_missing', () => {
		const error = Object.assign(new Error('object missing'), {
			name: 'NoSuchKey', code: 'NoSuchKey', $metadata: { httpStatusCode: 404 }
		});
		expect(classifyEvidenceUploadFailureV1(error)).toBe('SOURCE_MISSING');
	});

	it('classifies checksum mismatch independently', () => {
		expect(classifyEvidenceUploadFailureV1(new Error('EVIDENCE_SOURCE_SHA256_MISMATCH')))
			.toBe('SOURCE_CHECKSUM_MISMATCH');
	});

	it('labels storage timeouts as temporary without treating arbitrary 404s as missing evidence', () => {
		const unavailable = Object.assign(new Error('unavailable'), {
			name: 'ServiceUnavailable', $metadata: { httpStatusCode: 503 }
		});
		const missingBucket = Object.assign(new Error('bucket missing'), {
			name: 'NoSuchBucket', code: 'NoSuchBucket', $metadata: { httpStatusCode: 404 }
		});
		expect(classifyEvidenceUploadFailureV1(unavailable)).toBe('STORAGE_TEMPORARY_FAILURE');
		expect(classifyEvidenceUploadFailureV1(missingBucket)).toBe('UPLOAD_PIPELINE_FAILED');
	});
});

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

describe('durable upload pipeline status', () => {
	const evidenceId = '55555555-5555-4555-8555-555555555555';
	const uploadResult = {
		status: 'processed',
		sourceRevision: `sha256:${'a'.repeat(64)}`,
		chunkCount: 2,
		persistedCount: 2,
	};

	it('moves evidence to processing using the job being executed', async () => {
		const executor = { execute: vi.fn().mockResolvedValue({ rows: [{ attempt_count: 1, already_complete: false }] }) };

		await expect(markEvidenceUploadProcessingV1(evidenceId, jobId, executor as never)).resolves.toBe(1);
		expect(executor.execute).toHaveBeenCalledOnce();
	});

	it('atomically records complete extraction state and the job receipt', async () => {
		const tx = { execute: vi.fn().mockResolvedValue({ rows: [{ id: jobId }] }) };
		const executor = { transaction: vi.fn((run) => run(tx)) };

		await expect(completeEvidenceUploadJobV1(jobId, evidenceId, uploadResult, executor as never)).resolves.toBeUndefined();
		expect(executor.transaction).toHaveBeenCalledOnce();
		expect(tx.execute).toHaveBeenCalledTimes(3);
	});

	it('atomically records failed extraction state and terminal job failure', async () => {
		const tx = { execute: vi.fn().mockResolvedValue({ rows: [{ id: jobId }] }) };
		const executor = { transaction: vi.fn((run) => run(tx)) };

		await expect(failEvidenceUploadJobV1(jobId, evidenceId, 'source extraction failed', executor as never)).resolves.toBeUndefined();
		expect(executor.transaction).toHaveBeenCalledOnce();
		expect(tx.execute).toHaveBeenCalledTimes(3);
	});

	it('rejects incomplete success receipts before changing either row', async () => {
		const executor = { transaction: vi.fn() };

		await expect(
			completeEvidenceUploadJobV1(jobId, evidenceId, { ...uploadResult, persistedCount: 1 }, executor as never)
		).rejects.toThrow('ANALYSIS_UPLOAD_CANONICAL_RECEIPT_INVALID');
		expect(executor.transaction).not.toHaveBeenCalled();
	});
});
