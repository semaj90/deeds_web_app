import { and, eq, gt, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '$lib/server/db/client.js';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { sceneGenerationJobs as jobs, sceneGenerationJobEvents as events } from '$lib/server/db/schema/scene-generation-jobs.js';
import type { compileSceneGenerationJobToSeaweedV1 } from './scene-generation-worker-v1.js';
import { readSceneGenerationInputStatusV1 } from './load-scene-generation-plan-v1.js';

const scopeSchema = z.object({ caseId: z.uuid(), sceneId: z.uuid(), jobId: z.uuid() });
const workerSchema = scopeSchema.extend({ workerId: z.string().trim().min(1).max(128) });
const claimSchema = workerSchema.extend({ attemptCount: z.number().int().min(1).max(5) });
const databaseClock = sql`clock_timestamp()`;
type WorkerResult = Awaited<ReturnType<typeof compileSceneGenerationJobToSeaweedV1>>;
type Scope = z.infer<typeof scopeSchema>;

function inScope(scope: Scope) {
	return and(eq(jobs.jobId, scope.jobId), eq(jobs.caseId, scope.caseId), eq(jobs.sceneId, scope.sceneId));
}

// Every caller holds the parent job row lock from the preceding UPDATE.
function appendEvent(tx: Pick<typeof db, 'insert'>, jobId: string, fromStatus: 'queued' | 'running',
	toStatus: 'running' | 'completed' | 'failed' | 'queued' | 'source_missing' | 'source_stale' | 'canceled', reasonCode: string) {
	const sequence = sql`(select coalesce(max(${events.sequence}), 0) + 1 from ${events} where ${events.jobId} = ${jobId})`;
	return tx.insert(events).values({ jobId, sequence, fromStatus, toStatus, reasonCode });
}

const cancelSchema = scopeSchema.omit({ sceneId: true }).extend({ actorId: z.number().int().positive().max(2_147_483_647) });

/** Cancel a case-scoped job under the same row lock used for completion. */
export async function cancelSceneGenerationJobV1(input: z.infer<typeof cancelSchema>, database = db) {
	const { caseId, jobId, actorId } = cancelSchema.parse(input);
	return database.transaction(async (tx: typeof db) => {
		if (!await getAuthorizedCase(caseId, actorId, tx)) return null;
		const scope = and(eq(jobs.caseId, caseId), eq(jobs.jobId, jobId));
		const [job] = await tx.select({ jobId: jobs.jobId, sceneId: jobs.sceneId, status: jobs.status, progress: jobs.progress })
			.from(jobs).where(scope).for('update');
		if (!job) return null;
		if (job.status !== 'queued' && job.status !== 'running') return job;
		await tx.update(jobs).set({ status: 'canceled', workerId: null, leaseExpiresAt: null,
			errorCode: null, updatedAt: databaseClock }).where(scope);
		await appendEvent(tx, jobId, job.status, 'canceled', 'USER_CANCELED');
		return { ...job, status: 'canceled' as const };
	});
}

/** Stop the current attempt when its admitted inputs can no longer be resolved. */
export async function stopStaleSceneGenerationJobV1(
	input: z.infer<typeof claimSchema> & { status: 'source_missing' | 'source_stale' }, database = db
): Promise<boolean> {
	const scope = claimSchema.extend({ status: z.enum(['source_missing', 'source_stale']) }).parse(input);
	const reason = scope.status === 'source_missing' ? 'PLAN_INPUT_UNAVAILABLE' : 'PLAN_INPUT_CHANGED';
	return database.transaction(async (tx: typeof db) => {
		const [job] = await tx.update(jobs).set({
			status: scope.status, workerId: null, leaseExpiresAt: null, errorCode: reason, updatedAt: databaseClock
		}).where(and(inScope(scope), eq(jobs.status, 'running'), eq(jobs.workerId, scope.workerId),
			eq(jobs.attemptCount, scope.attemptCount), gt(jobs.leaseExpiresAt, databaseClock)))
			.returning({ jobId: jobs.jobId });
		if (!job) return false;
		await appendEvent(tx, scope.jobId, 'running', scope.status, reason);
		return true;
	});
}

/** Claim one explicitly dispatched, already admitted job. */
export async function claimSceneGenerationJobV1(input: z.infer<typeof workerSchema> & { leaseSeconds: number }, database = db) {
	const scope = workerSchema.extend({ leaseSeconds: z.number().int().min(1).max(900) }).parse(input);
	return database.transaction(async (tx: typeof db) => {
		const [job] = await tx.update(jobs).set({
			status: 'running', workerId: scope.workerId, leaseExpiresAt: sql`${databaseClock} + (${scope.leaseSeconds} * interval '1 second')`,
			attemptCount: sql`${jobs.attemptCount} + 1`, startedAt: databaseClock, updatedAt: databaseClock, errorCode: null
		}).where(and(inScope(scope), eq(jobs.status, 'queued'), lte(jobs.availableAt, databaseClock),
			sql`${jobs.attemptCount} < ${jobs.maxAttempts}`)).returning();
		if (!job) return null;
		await appendEvent(tx, scope.jobId, 'queued', 'running', 'WORKER_CLAIMED');
		return job as typeof jobs.$inferSelect;
	});
}

/** Read canonical inputs and attach the result within one serializable transaction. */
export async function completeSceneGenerationJobV1(input: z.infer<typeof claimSchema> & { result: WorkerResult }, database = db) {
	const scope = claimSchema.parse(input);
	const { manifest, resultRefs } = input.result;
	if (manifest.caseId !== scope.caseId || manifest.sceneId !== scope.sceneId) throw new Error('SCENE_GENERATION_RESULT_SCOPE_MISMATCH');
	return database.transaction(async (tx: typeof db) => {
		const ownsAttempt = and(inScope(scope), eq(jobs.status, 'running'), eq(jobs.workerId, scope.workerId),
			eq(jobs.attemptCount, scope.attemptCount), gt(jobs.leaseExpiresAt, databaseClock),
			eq(jobs.requestSha256, manifest.requestSha256), eq(jobs.expectedSceneRevision, manifest.expectedSceneRevision));
		const [snapshot] = await tx.select({
			caseId: jobs.caseId, sceneId: jobs.sceneId, expectedSceneRevision: jobs.expectedSceneRevision,
			createdBy: jobs.createdBy, requestSnapshot: jobs.requestSnapshot
		}).from(jobs).where(ownsAttempt).for('update');
		if (!snapshot) return 'lease_lost' as const;
		if (snapshot.requestSnapshot.planHash !== manifest.planSha256) throw new Error('SCENE_GENERATION_RESULT_PLAN_MISMATCH');
		const status = await readSceneGenerationInputStatusV1(snapshot, tx);
		const reason = status === 'source_missing' ? 'PLAN_INPUT_UNAVAILABLE' : 'PLAN_INPUT_CHANGED';
		const [job] = await tx.update(jobs).set(status === 'current' ? {
			status: 'completed', progress: 100, workerId: null, leaseExpiresAt: null, errorCode: null,
			resultRefs: resultRefs.map((ref) => ({ ...ref, manifestSha256: manifest.manifestSha256 })),
			completedAt: databaseClock, updatedAt: databaseClock
		} : {
			status, workerId: null, leaseExpiresAt: null, errorCode: reason, updatedAt: databaseClock
		}).where(ownsAttempt).returning({ jobId: jobs.jobId });
		if (!job) return 'lease_lost' as const;
		const outcome = status === 'current' ? 'completed' : status;
		await appendEvent(tx, scope.jobId, 'running', outcome, outcome === 'completed' ? 'VERIFIED_RECIPE_PUBLISHED' : reason);
		return outcome;
	}, { isolationLevel: 'serializable' });
}

/** Recover an expired lease, without granting an extra attempt beyond the job budget. */
export async function recoverExpiredSceneGenerationJobV1(input: Scope, database = db): Promise<'queued' | 'failed' | null> {
	const scope = scopeSchema.parse(input);
	return database.transaction(async (tx: typeof db) => {
		const [job]: Array<{ status: 'queued' | 'failed' }> = await tx.update(jobs).set({
			status: sql`case when ${jobs.attemptCount} < ${jobs.maxAttempts} then 'queued' else 'failed' end`,
			workerId: null, leaseExpiresAt: null, errorCode: 'WORKER_LEASE_EXPIRED',
			availableAt: databaseClock, updatedAt: databaseClock
		}).where(and(inScope(scope), eq(jobs.status, 'running'), lte(jobs.leaseExpiresAt, databaseClock)))
			.returning({ status: jobs.status });
		if (!job) return null;
		await appendEvent(tx, scope.jobId, 'running', job.status, 'WORKER_LEASE_EXPIRED');
		return job.status;
	});
}
