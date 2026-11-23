import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { SceneGenerationPlanV1Schema } from '$lib/reconstruction/scene-generation-plan-v1.js';
import { db } from '$lib/server/db/client.js';
import { sceneGenerationJobs as jobs, sceneGenerationJobEvents as events } from '$lib/server/db/schema/scene-generation-jobs.js';
import { loadSceneGenerationPlanV1, SceneGenerationPlanLoadErrorV1 } from './load-scene-generation-plan-v1.js';
import { buildSceneGenerationJobKeysV1 } from './scene-generation-job-keys-v1.js';

const commandSchema = z.object({
	caseId: z.uuid(),
	actorId: z.number().int().positive().max(2_147_483_647),
	plan: SceneGenerationPlanV1Schema
}).strict();

/** Admit an explicit request after re-resolving its preview inside the write transaction. */
export async function enqueueSceneGenerationJobV1(input: unknown, database: Pick<typeof db, 'transaction'> = db) {
	const { caseId, actorId, plan: preview } = commandSchema.parse(input);
	const { planHash, ...candidate } = preview;
	return database.transaction(async (tx: typeof db) => {
		const plan = await loadSceneGenerationPlanV1({ caseId, actorId, candidate }, tx);
		if (plan.planHash !== planHash) throw new SceneGenerationPlanLoadErrorV1('Generation preview changed. Prepare it again before queuing.', 409);

		const { job, requestSha256, idempotencyKey } = buildSceneGenerationJobKeysV1({
			caseId, sceneId: plan.sceneId, expectedSceneRevision: plan.expectedSceneRevision,
			inputKind: plan.sources.length ? 'EVIDENCE_BACKED' : 'BLOCKOUT',
			requestSnapshot: plan, sourceSnapshot: plan.sources
		});
		const [inserted] = await tx.insert(jobs).values({ ...job, createdBy: actorId, requestSha256, idempotencyKey })
			.onConflictDoNothing({ target: [jobs.caseId, jobs.sceneId, jobs.idempotencyKey] })
			.returning({ jobId: jobs.jobId, status: jobs.status });
		if (inserted) {
			await tx.insert(events).values({
				jobId: inserted.jobId, sequence: 1, fromStatus: null, toStatus: 'queued', reasonCode: 'PLAN_ADMITTED'
			});
			return { ...inserted as { jobId: string; status: typeof jobs.$inferSelect.status }, replayed: false };
		}

		const [existing]: Array<Pick<typeof jobs.$inferSelect, 'jobId' | 'status' | 'requestSha256'>> =
			await tx.select({ jobId: jobs.jobId, status: jobs.status, requestSha256: jobs.requestSha256 }).from(jobs)
				.where(and(eq(jobs.caseId, caseId), eq(jobs.sceneId, plan.sceneId), eq(jobs.idempotencyKey, idempotencyKey))).limit(1);
		if (!existing || existing.requestSha256 !== requestSha256) {
			throw new SceneGenerationPlanLoadErrorV1('Could not verify the existing queued job.', 409);
		}
		return { jobId: existing.jobId, status: existing.status, replayed: true };
	}, { isolationLevel: 'serializable' });
}
