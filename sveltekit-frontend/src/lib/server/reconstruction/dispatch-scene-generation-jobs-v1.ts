import { randomUUID } from 'node:crypto';
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { sceneGenerationJobs as jobs } from '$lib/server/db/schema/scene-generation-jobs.js';
import { recoverExpiredSceneGenerationJobV1 } from './scene-generation-job-lifecycle-v1.js';
import { runSceneGenerationJobV1 } from './run-scene-generation-job-v1.js';

const workerId = `scene-generation:${randomUUID()}`;
const scope = { caseId: jobs.caseId, sceneId: jobs.sceneId, jobId: jobs.jobId };

/** Recover a bounded batch and attempt at most one eligible job per tick. */
export async function dispatchSceneGenerationJobsV1() {
	const databaseClock = sql`clock_timestamp()`;
	const expired = await db.select(scope).from(jobs)
		.where(and(eq(jobs.status, 'running'), lte(jobs.leaseExpiresAt, databaseClock)))
		.orderBy(asc(jobs.leaseExpiresAt), asc(jobs.jobId)).limit(8);
	for (const job of expired) await recoverExpiredSceneGenerationJobV1(job);

	const [queued] = await db.select(scope).from(jobs)
		.where(and(eq(jobs.status, 'queued'), lte(jobs.availableAt, databaseClock), sql`${jobs.attemptCount} < ${jobs.maxAttempts}`))
		.orderBy(asc(jobs.availableAt), asc(jobs.createdAt), asc(jobs.jobId)).limit(1);
	return queued ? runSceneGenerationJobV1({ ...queued, workerId, leaseSeconds: 120 }) : 'empty';
}
