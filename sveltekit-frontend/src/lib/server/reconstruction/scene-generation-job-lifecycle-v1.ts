import { and, eq, gt, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '$lib/server/db/client.js';
import { sceneGenerationJobs as jobs, sceneGenerationJobEvents as events } from '$lib/server/db/schema/scene-generation-jobs.js';
import type { compileSceneGenerationJobToSeaweedV1 } from './scene-generation-worker-v1.js';

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
	toStatus: 'running' | 'completed' | 'failed' | 'queued', reasonCode: string) {
	const sequence = sql`(select coalesce(max(${events.sequence}), 0) + 1 from ${events} where ${events.jobId} = ${jobId})`;
	return tx.insert(events).values({ jobId, sequence, fromStatus, toStatus, reasonCode });
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

/** Return false when the lease expired or another attempt now owns this job. */
export async function completeSceneGenerationJobV1(input: z.infer<typeof claimSchema> & { result: WorkerResult }, database = db): Promise<boolean> {
	const scope = claimSchema.parse(input);
	const { manifest, resultRefs } = input.result;
	if (manifest.caseId !== scope.caseId || manifest.sceneId !== scope.sceneId) throw new Error('SCENE_GENERATION_RESULT_SCOPE_MISMATCH');
	return database.transaction(async (tx: typeof db) => {
		const [job] = await tx.update(jobs).set({
			status: 'completed', progress: 100, workerId: null, leaseExpiresAt: null, errorCode: null,
			resultRefs: resultRefs.map((ref) => ({ ...ref, manifestSha256: manifest.manifestSha256 })),
			completedAt: databaseClock, updatedAt: databaseClock
		}).where(and(inScope(scope), eq(jobs.status, 'running'), eq(jobs.workerId, scope.workerId),
			eq(jobs.attemptCount, scope.attemptCount), gt(jobs.leaseExpiresAt, databaseClock),
			eq(jobs.requestSha256, manifest.requestSha256), eq(jobs.expectedSceneRevision, manifest.expectedSceneRevision)))
			.returning({ jobId: jobs.jobId });
		if (!job) return false;
		await appendEvent(tx, scope.jobId, 'running', 'completed', 'VERIFIED_RECIPE_PUBLISHED');
		return true;
	});
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
