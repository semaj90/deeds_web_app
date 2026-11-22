import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { db } from '$lib/server/db/client.js';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { cancelSceneGenerationJobV1, claimSceneGenerationJobV1, completeSceneGenerationJobV1, recoverExpiredSceneGenerationJobV1 } from './scene-generation-job-lifecycle-v1.js';
import { readSceneGenerationInputStatusV1 } from './load-scene-generation-plan-v1.js';

vi.mock('./load-scene-generation-plan-v1.js', () => ({ readSceneGenerationInputStatusV1: vi.fn() }));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: vi.fn() }));

const caseId = '11111111-1111-4111-8111-111111111111';
const sceneId = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';
const scope = { caseId, sceneId, jobId };
const worker = { ...scope, workerId: 'test-worker' };

function transactionFixture(rows: unknown[], snapshot?: unknown) {
	const returning = vi.fn().mockResolvedValue(rows);
	const where = vi.fn((_predicate: SQL) => ({ returning }));
	const set = vi.fn((_values: Record<string, unknown>) => ({ where }));
	const values = vi.fn().mockResolvedValue(undefined);
	const lock = vi.fn().mockResolvedValue(snapshot ? [snapshot] : []);
	const selectWhere = vi.fn((_predicate: SQL) => ({ for: lock }));
	const tx = { update: vi.fn(() => ({ set })), insert: vi.fn(() => ({ values })),
		select: () => ({ from: () => ({ where: selectWhere }) }) };
	const transaction = vi.fn((run: (tx: unknown) => Promise<unknown>) => run(tx));
	return { database: { transaction } as unknown as typeof db, where, set, values, lock, selectWhere, tx, transaction };
}

describe('scene generation job lifecycle', () => {
	const cancel = { caseId, jobId, actorId: 7 };
	const authorizedCase = { id: caseId } as NonNullable<Awaited<ReturnType<typeof getAuthorizedCase>>>;

	it.each(['queued', 'running'] as const)('cancels a %s job under lock and clears its lease', async (status) => {
		const fixture = transactionFixture([], { jobId, sceneId, status, progress: 0 });
		vi.mocked(getAuthorizedCase).mockResolvedValueOnce(authorizedCase);
		expect(await cancelSceneGenerationJobV1(cancel, fixture.database)).toEqual({ jobId, sceneId, status: 'canceled', progress: 0 });
		expect(getAuthorizedCase).toHaveBeenCalledWith(caseId, 7, fixture.tx);
		expect(fixture.lock).toHaveBeenCalledWith('update');
		const predicate = new PgDialect().sqlToQuery(fixture.selectWhere.mock.calls[0]![0]);
		expect(predicate.params).toEqual([caseId, jobId]);
		expect(fixture.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'canceled', workerId: null, leaseExpiresAt: null }));
		expect(fixture.values).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ jobId, fromStatus: status, toStatus: 'canceled' }));
	});

	it('does not inspect the job for an unauthorized case', async () => {
		const fixture = transactionFixture([], { jobId, sceneId, status: 'queued', progress: 0 });
		vi.mocked(getAuthorizedCase).mockResolvedValueOnce(null);
		expect(await cancelSceneGenerationJobV1(cancel, fixture.database)).toBeNull();
		expect(fixture.selectWhere).not.toHaveBeenCalled();
		expect(fixture.set).not.toHaveBeenCalled();
	});

	it.each(['completed', 'canceled'] as const)('returns an existing %s outcome without overwriting history', async (status) => {
		const job = { jobId, sceneId, status, progress: status === 'completed' ? 100 : 0 };
		const fixture = transactionFixture([], job);
		vi.mocked(getAuthorizedCase).mockResolvedValueOnce(authorizedCase);
		expect(await cancelSceneGenerationJobV1(cancel, fixture.database)).toEqual(job);
		expect(fixture.set).not.toHaveBeenCalled();
		expect(fixture.values).not.toHaveBeenCalled();
	});

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
		expect(await completeSceneGenerationJobV1({ ...worker, attemptCount: 2, result }, fixture.database)).toBe('lease_lost');
		const predicate = new PgDialect().sqlToQuery(fixture.selectWhere.mock.calls[0]![0]);
		expect(predicate.sql).toContain('"lease_expires_at" > clock_timestamp()');
		expect(predicate.params).toEqual(expect.arrayContaining([caseId, sceneId, jobId, 'running', worker.workerId, 2, requestSha256, 4]));
		expect(fixture.values).not.toHaveBeenCalled();
	});

	it.each(['current', 'source_stale', 'source_missing'] as const)('decides publication inside the locked transaction when input is %s', async (status) => {
		const planSha256 = 'b'.repeat(64);
		const snapshot = { ...scope, expectedSceneRevision: 4, createdBy: 7, requestSnapshot: { planHash: planSha256 } };
		const fixture = transactionFixture([{ jobId }], snapshot);
		const result = {
			manifest: { caseId, sceneId, expectedSceneRevision: 4, requestSha256: 'a'.repeat(64), planSha256 },
			resultRefs: []
		} as unknown as Parameters<typeof completeSceneGenerationJobV1>[0]['result'];
		vi.mocked(readSceneGenerationInputStatusV1).mockResolvedValueOnce(status);
		const outcome = status === 'current' ? 'completed' : status;
		expect(await completeSceneGenerationJobV1({ ...worker, attemptCount: 2, result }, fixture.database)).toBe(outcome);
		expect(fixture.lock).toHaveBeenCalledWith('update');
		expect(fixture.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'serializable' });
		expect(readSceneGenerationInputStatusV1).toHaveBeenCalledWith(snapshot, fixture.tx);
		expect(fixture.where.mock.calls[0]?.[0]).toBe(fixture.selectWhere.mock.calls[0]?.[0]);
		expect(fixture.values).toHaveBeenCalledWith(expect.objectContaining({ toStatus: outcome }));
		expect(Object.hasOwn(fixture.set.mock.calls[0]![0], 'resultRefs')).toBe(status === 'current');
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
