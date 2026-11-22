import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { SceneGenerationPlanV1Schema } from '$lib/reconstruction/scene-generation-plan-v1.js';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { db } from '$lib/server/db/client.js';
import { sceneGenerationJobs as jobs } from '$lib/server/db/schema/scene-generation-jobs.js';
import { ENV } from '$lib/server/env.server.js';
import { enqueueSceneGenerationJobV1 } from '$lib/server/reconstruction/enqueue-scene-generation-job-v1.js';
import { cancelSceneGenerationJobV1 } from '$lib/server/reconstruction/scene-generation-job-lifecycle-v1.js';
import { readSceneGenerationInputStatusV1, SceneGenerationPlanLoadErrorV1 } from '$lib/server/reconstruction/load-scene-generation-plan-v1.js';
import { readSceneGenerationRecipeV1 } from '$lib/server/reconstruction/read-scene-generation-recipe-v1.js';
import { SceneGenerationPlanResolutionErrorV1 } from '$lib/server/reconstruction/resolve-scene-generation-plan-v1.js';
import { isUuid } from '$lib/server/validation.js';
import { readSceneDocumentRevisionV1 } from '$lib/server/scene-document-revisions-v1.js';

const headers = { 'cache-control': 'private, no-store' };
const fail = (error: string, status: number) => json({ ok: false, job: null, error }, { status, headers });
const success = (job: unknown, status = 200) => json({ ok: true, job, error: null }, { status, headers });
const cancelSchema = z.object({ action: z.literal('cancel'), jobId: z.uuid() }).strict();

function actorIdFromSession(id: unknown) {
	const number = typeof id === 'string' || typeof id === 'number' ? Number(id) : 0;
	return Number.isInteger(number) && number > 0 && number <= 2_147_483_647 ? number : null;
}

/** Explicit admission of a reviewed preview for background recipe generation. */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actorId = actorIdFromSession(locals.user?.id);
	if (!actorId) return fail('Unauthorized', 401);
	if (!isUuid(params.id)) return fail('Invalid case ID', 400);
	if (!ENV.SCENE_GENERATION_JOBS_ENABLED) return fail('Scene generation jobs are disabled', 503);
	let raw: unknown;
	try {
		const text = await request.text();
		if (text.length > 512 * 1024) return fail('Generation plan exceeds 512 KiB', 413);
		raw = JSON.parse(text);
	} catch { return fail('Invalid JSON body', 400); }
	const parsed = SceneGenerationPlanV1Schema.safeParse(raw);
	if (!parsed.success) return fail('Invalid generation plan', 400);
	try {
		const job = await enqueueSceneGenerationJobV1({ caseId: params.id, actorId, plan: parsed.data });
		return success(job, job.replayed ? 200 : 202);
	} catch (error) {
		if (error instanceof SceneGenerationPlanLoadErrorV1) return fail(error.message, error.status);
		if (error instanceof SceneGenerationPlanResolutionErrorV1) {
			return fail(error.code, error.code === 'SOURCE_NOT_AUTHORIZED' || error.code === 'PLAN_CASE_SCOPE_MISMATCH' ? 404 : 409);
		}
		console.error('[scene-generation-jobs] Admission failed:', error instanceof Error ? error.name : 'UnknownError');
		return fail('Unable to queue scene generation', 500);
	}
};

export const GET: RequestHandler = async ({ locals, params, url }) => {
	const actorId = actorIdFromSession(locals.user?.id);
	if (!actorId) return fail('Unauthorized', 401);
	const jobId = url.searchParams.get('jobId');
	const view = url.searchParams.get('view');
	if (!isUuid(params.id) || (view !== 'recent' && !isUuid(jobId))) return fail('Invalid case or job ID', 400);
	if (!ENV.SCENE_GENERATION_JOBS_ENABLED) return fail('Scene generation jobs are disabled', 503);
	try {
		if (!await getAuthorizedCase(params.id, actorId)) return fail('Case or job not found', 404);
		if (view === 'recent') {
			const [job] = await db.select({
				jobId: jobs.jobId, sceneId: jobs.sceneId, status: jobs.status,
				planHash: sql<string>`${jobs.requestSnapshot}->>'planHash'`
			}).from(jobs).where(and(eq(jobs.caseId, params.id), eq(jobs.createdBy, actorId)))
				.orderBy(desc(jobs.createdAt), desc(jobs.jobId)).limit(1);
			return success(job ?? null);
		}
		if (!isUuid(jobId)) return fail('Invalid job ID', 400);
		if (view === 'recipe') {
			const [job] = await db.select({
				caseId: jobs.caseId, jobId: jobs.jobId, sceneId: jobs.sceneId, status: jobs.status,
				expectedSceneRevision: jobs.expectedSceneRevision, requestSnapshot: jobs.requestSnapshot, resultRefs: jobs.resultRefs
			}).from(jobs).where(and(eq(jobs.caseId, params.id), eq(jobs.jobId, jobId))).limit(1);
			if (!job) return fail('Case or job not found', 404);
			if (job.status !== 'completed') return fail('Scene recipe is not ready', 409);
			const scope = { ...job, createdBy: actorId };
			const inputStatus = await readSceneGenerationInputStatusV1(scope);
			if (inputStatus === 'source_missing') return fail('Case or job not found', 404);
			if (inputStatus === 'source_stale') return fail('Scene inputs changed. Prepare a fresh proposal.', 409);
			const recipe = await readSceneGenerationRecipeV1({ ...job, planHash: job.requestSnapshot.planHash });
			const revision = ENV.SCENE_PERSISTENCE_ENABLED && job.expectedSceneRevision > 0
				? await readSceneDocumentRevisionV1({ caseId: job.caseId, sceneId: job.sceneId, revision: job.expectedSceneRevision })
				: null;
			if (ENV.SCENE_PERSISTENCE_ENABLED && job.expectedSceneRevision > 0 && !revision) {
				return fail('The scene base revision is unavailable.', 409);
			}
			return success({ jobId, recipe, plan: job.requestSnapshot,
				revision: revision ? { manifest: revision.manifest, manifestSha256: revision.manifestSha256 } : null });
		}
		const [job] = await db.select({ jobId: jobs.jobId, sceneId: jobs.sceneId, status: jobs.status, progress: jobs.progress })
			.from(jobs).where(and(eq(jobs.caseId, params.id), eq(jobs.jobId, jobId))).limit(1);
		return job ? success(job) : fail('Case or job not found', 404);
	} catch (error) {
		console.error('[scene-generation-jobs] Status lookup failed:', error instanceof Error ? error.name : 'UnknownError');
		return fail('Unable to read scene generation status', 500);
	}
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const actorId = actorIdFromSession(locals.user?.id);
	if (!actorId) return fail('Unauthorized', 401);
	if (!isUuid(params.id)) return fail('Invalid case ID', 400);
	if (!ENV.SCENE_GENERATION_JOBS_ENABLED) return fail('Scene generation jobs are disabled', 503);
	let raw: unknown;
	try {
		const text = await request.text();
		if (text.length > 256) return fail('Job command exceeds 256 characters', 413);
		raw = JSON.parse(text);
	} catch { return fail('Invalid JSON body', 400); }
	const command = cancelSchema.safeParse(raw);
	if (!command.success) return fail('Invalid job command', 400);
	try {
		const job = await cancelSceneGenerationJobV1({ caseId: params.id, actorId, jobId: command.data.jobId });
		return job ? success(job) : fail('Case or job not found', 404);
	} catch (error) {
		console.error('[scene-generation-jobs] Cancellation failed:', error instanceof Error ? error.name : 'UnknownError');
		return fail('Unable to cancel scene generation', 500);
	}
};
