import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { db } from '$lib/server/db/client.js';
import { claimSceneGenerationJobV1, completeSceneGenerationJobV1, recoverExpiredSceneGenerationJobV1 } from './scene-generation-job-lifecycle-v1.js';

const caseId = '11111111-1111-4111-8111-111111111111';
const sceneId = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';
const scope = { caseId, sceneId, jobId };
const worker = { ...scope, workerId: 'test-worker' };

function transactionFixture(rows: unknown[]) {
	const returning = vi.fn().mockResolvedValue(rows);
	const where = vi.fn((_predicate: SQL) => ({ returning }));
	const set = vi.fn((_values: Record<string, unknown>) => ({ where }));
	const values = vi.fn().mockResolvedValue(undefined);
	const tx = { update: vi.fn(() => ({ set })), insert: vi.fn(() => ({ values })) };
	const transaction = vi.fn((run: (tx: unknown) => Promise<unknown>) => run(tx));
	return { database: { transaction } as unknown as typeof db, where, set, values };
}

describe('scene generation job lifecycle', () => {
	it('claims an eligible job and appends its transition in the transaction', async () => {
		const job = { jobId, attemptCount: 1 };
		const fixture = transactionFixture([job]);
		expect(await claimSceneGenerationJobV1({ ...worker, leaseSeconds: 60 }, fixture.database)).toBe(job);
		const predicate = new PgDialect().sqlToQuery(fixture.where.mock.calls[0]![0]);
		expect(predicate.sql).toContain('"attempt_count" <');
		expect(predicate.params).toEqual(expect.arrayContaining([caseId, sceneId, jobId, 'queued']));
		expect(fixture.values).toHaveBeenCalledWith(expect.objectContaining({ jobId, fromStatus: 'queued', toStatus: 'running' }));
	});

	it('fences completion by scoped request, worker, attempt and database lease time', async () => {
		const fixture = transactionFixture([]);
		const requestSha256 = 'a'.repeat(64);
		const result = {
			manifest: { caseId, sceneId, expectedSceneRevision: 4, requestSha256 },
			resultRefs: []
		} as unknown as Parameters<typeof completeSceneGenerationJobV1>[0]['result'];
		expect(await completeSceneGenerationJobV1({ ...worker, attemptCount: 2, result }, fixture.database)).toBe(false);
		const predicate = new PgDialect().sqlToQuery(fixture.where.mock.calls[0]![0]);
		expect(predicate.sql).toContain('"lease_expires_at" > clock_timestamp()');
		expect(predicate.params).toEqual(expect.arrayContaining([caseId, sceneId, jobId, worker.workerId, 2, requestSha256, 4]));
		expect(fixture.values).not.toHaveBeenCalled();
	});

	it('clears the expired lease and records exhaustion without claiming another attempt', async () => {
		const fixture = transactionFixture([{ status: 'failed' }]);
		expect(await recoverExpiredSceneGenerationJobV1(scope, fixture.database)).toBe('failed');
		const predicate = new PgDialect().sqlToQuery(fixture.where.mock.calls[0]![0]);
		expect(predicate.sql).toContain('"lease_expires_at" <= clock_timestamp()');
		expect(fixture.set).toHaveBeenCalledWith(expect.objectContaining({ workerId: null, leaseExpiresAt: null }));
		expect(fixture.values).toHaveBeenCalledWith(expect.objectContaining({ fromStatus: 'running', toStatus: 'failed' }));
	});
});
