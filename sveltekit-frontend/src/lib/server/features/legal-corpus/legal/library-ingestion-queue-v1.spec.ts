import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/db/client', () => ({ pool: { query: mockQuery } }));

import {
	assertLibraryIngestionLeaseV1,
	claimLibraryIngestionJobByIdV1,
	claimNextLibraryIngestionJobV1,
	failLibraryIngestionAttemptV1,
	heartbeatLibraryIngestionLeaseV1,
} from './library-ingestion-queue-v1.js';

describe('library ingestion durable queue contract v1', () => {
	beforeEach(() => mockQuery.mockReset());

	it('claims one queued or expired job atomically with SKIP LOCKED and a fresh lease token', async () => {
		mockQuery.mockResolvedValueOnce({
			rowCount: 1,
			rows: [{
				id: 'job-1', document_id: 'doc-1', lease_token: 'lease-1', fencing_token: '1', attempt_count: 1,
				source_hash: 'a'.repeat(64),
			}],
		});

		await expect(claimNextLibraryIngestionJobV1(60)).resolves.toEqual({
			jobId: 'job-1', documentId: 'doc-1', leaseToken: 'lease-1', fencingToken: '1', attemptCount: 1,
			sourceHash: 'a'.repeat(64),
		});
		const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain('FOR UPDATE SKIP LOCKED');
		expect(sql).toContain("status = 'queued'");
		expect(sql).toContain('lease_expires_at <= now()');
		expect(sql).toContain("source_hash ~ '^[a-fA-F0-9]{64}$'");
		expect(sql).toContain('job.source_hash');
		expect(params[1]).toBe(60);
	});

	it('reclaim issues a new lease token for the same expired job so the previous token is fenced', async () => {
		mockQuery
			.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'job-1', document_id: 'doc-1', lease_token: '00000000-0000-4000-8000-000000000001', fencing_token: '1', attempt_count: 1, source_hash: 'a'.repeat(64) }] })
			.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'job-1', document_id: 'doc-1', lease_token: '00000000-0000-4000-8000-000000000002', fencing_token: '2', attempt_count: 2, source_hash: 'a'.repeat(64) }] });
		const first = await claimNextLibraryIngestionJobV1();
		const reclaimed = await claimNextLibraryIngestionJobV1();
		expect(reclaimed?.jobId).toBe(first?.jobId);
		expect(reclaimed?.leaseToken).not.toBe(first?.leaseToken);
		expect(first?.fencingToken).toBe('1');
		expect(reclaimed?.fencingToken).toBe('2');
		expect(reclaimed?.attemptCount).toBe(2);
		const [claimSql] = mockQuery.mock.calls[1] as [string, unknown[]];
		expect(claimSql).toContain("status = 'running' AND lease_expires_at <= now()");
		expect(claimSql).toContain('fencing_token = job.fencing_token + 1');
		expect(claimSql).toContain('FOR UPDATE SKIP LOCKED');
	});

	it('returns no job when the ready queue is empty', async () => {
		mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
		await expect(claimNextLibraryIngestionJobV1()).resolves.toBeNull();
	});

	it('claims only the job named by a document.parse dispatch', async () => {
		const jobId = '01932000-0000-4000-8000-000000000001';
		mockQuery.mockResolvedValueOnce({
			rowCount: 1,
			rows: [{ id: jobId, document_id: '01932000-0000-4000-8000-000000000002', lease_token: 'lease', fencing_token: '3', attempt_count: 2, source_hash: 'b'.repeat(64) }],
		});

		const claim = await claimLibraryIngestionJobByIdV1(jobId, 60);

		expect(claim?.jobId).toBe(jobId);
		const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain('AND ($3::uuid IS NULL OR id = $3::uuid)');
		expect(params[2]).toBe(jobId);
	});

	it('fences Rabbit dispatch against document, source hash, and stored revision before leasing', async () => {
		const jobId = '01932000-0000-4000-8000-000000000001';
		const documentId = '01932000-0000-4000-8000-000000000002';
		const documentRevision = '01932000-0000-4000-8000-000000000003';
		mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

		await expect(claimLibraryIngestionJobByIdV1(jobId, 60, {
			documentId,
			sourceSha256: 'c'.repeat(64),
			documentRevision,
		})).resolves.toBeNull();
		const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain('document_id = $4::uuid');
		expect(sql).toContain('lower(source_hash) = lower($5::text)');
		expect(sql).toContain('version.id = $6::uuid');
		expect(params.slice(2)).toEqual([jobId, documentId, 'c'.repeat(64), documentRevision]);
	});

	it('rejects malformed specific job IDs before touching the database', async () => {
		await expect(claimLibraryIngestionJobByIdV1('not-a-uuid')).rejects.toThrow('LIBRARY_INGESTION_JOB_ID_INVALID');
		expect(mockQuery).not.toHaveBeenCalled();
	});

	it('rejects leases outside the bounded worker policy before querying', async () => {
		await expect(claimNextLibraryIngestionJobV1(5)).rejects.toThrow('LIBRARY_INGESTION_LEASE_SECONDS_OUT_OF_RANGE');
		expect(mockQuery).not.toHaveBeenCalled();
	});

	it('heartbeats only the current unexpired lease', async () => {
		mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
		await expect(heartbeatLibraryIngestionLeaseV1('job-1', 'lease-1', '7')).resolves.toBe(true);
		const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain("status = 'running'");
		expect(sql).toContain('lease_token = $2::uuid');
		expect(sql).toContain('fencing_token = $3::bigint');
		expect(sql).toContain('lease_expires_at > now()');
	});

	it('fails closed when the lease is no longer owned', async () => {
		mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
		await expect(assertLibraryIngestionLeaseV1('job-1', 'lease-1', '6')).rejects.toThrow('LIBRARY_INGESTION_LEASE_LOST');
		const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain('fencing_token = $3::bigint');
		expect(params).toEqual(['job-1', 'lease-1', '6']);
	});

	it('schedules retry with the lease cleared and does not overwrite a newer claim', async () => {
		mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ status: 'queued' }] });
		mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
		await expect(failLibraryIngestionAttemptV1('job-1', 'lease-1', '7', 'temporary')).resolves.toBe('retry_scheduled');
		const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain('attempt_count < max_attempts');
		expect(sql).toContain('lease_token = NULL');
		expect(sql).toContain('lease_expires_at > now()');
		expect(sql).toContain('fencing_token = $3::bigint');
		expect(sql).toContain('available_at = CASE');
		expect(params).toEqual(['job-1', 'lease-1', '7', 'temporary']);
	});

	it('does not mutate job or document state after losing the lease', async () => {
		mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
		await expect(failLibraryIngestionAttemptV1('job-1', 'stale-token', '6', 'late failure')).resolves.toBe('lease_lost');
		expect(mockQuery).toHaveBeenCalledTimes(1);
	});
});
