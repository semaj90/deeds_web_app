import { z } from 'zod';
import { SceneGenerationPlanV1Schema } from './scene-generation-plan-v1.js';

export const SceneGenerationJobStatusV1 = ['queued', 'running', 'completed', 'failed', 'canceled', 'source_missing', 'source_stale'] as const;
export type SceneGenerationJobStatusV1 = (typeof SceneGenerationJobStatusV1)[number];

const sourceSnapshotEntryV1Schema = z.object({
	evidenceId: z.uuid(),
	sourceRevision: z.string().trim().min(1).max(200),
	sha256: z.string().regex(/^[0-9a-f]{64}$/)
}).strict();

export const SceneGenerationJobDraftV1Schema = z.object({
	caseId: z.uuid(),
	sceneId: z.uuid(),
	expectedSceneRevision: z.number().int().nonnegative(),
	inputKind: z.enum(['BLOCKOUT', 'EVIDENCE_BACKED']),
	requestSnapshot: SceneGenerationPlanV1Schema,
	sourceSnapshot: z.array(sourceSnapshotEntryV1Schema).max(100)
}).strict().superRefine((job, ctx) => {
	if (job.inputKind === 'BLOCKOUT' && job.sourceSnapshot.length !== 0) {
		ctx.addIssue({ code: 'custom', path: ['sourceSnapshot'], message: 'BLOCKOUT_MUST_HAVE_EMPTY_SOURCE_SNAPSHOT' });
	}
	if (job.inputKind === 'EVIDENCE_BACKED' && job.sourceSnapshot.length === 0) {
		ctx.addIssue({ code: 'custom', path: ['sourceSnapshot'], message: 'EVIDENCE_BACKED_REQUIRES_SOURCE_SNAPSHOT' });
	}
	if (job.requestSnapshot.caseId !== job.caseId || job.requestSnapshot.sceneId !== job.sceneId ||
		job.requestSnapshot.expectedSceneRevision !== job.expectedSceneRevision) {
		ctx.addIssue({ code: 'custom', path: ['requestSnapshot'], message: 'JOB_SCOPE_MUST_MATCH_PLAN_SNAPSHOT' });
	}
	const planSources = [...job.requestSnapshot.sources].map(({ evidenceId, sourceRevision, sha256 }) => ({ evidenceId, sourceRevision, sha256 }))
		.sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
	const pinnedSources = [...job.sourceSnapshot].sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
	if (JSON.stringify(planSources) !== JSON.stringify(pinnedSources)) {
		ctx.addIssue({ code: 'custom', path: ['sourceSnapshot'], message: 'JOB_SOURCE_SNAPSHOT_MUST_MATCH_PLAN' });
	}
	const ids = job.sourceSnapshot.map((source) => source.evidenceId);
	if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['sourceSnapshot'], message: 'DUPLICATE_SOURCE_EVIDENCE_ID' });
});

export type SceneGenerationJobDraftV1 = z.infer<typeof SceneGenerationJobDraftV1Schema>;

const allowedTransitions: Readonly<Record<SceneGenerationJobStatusV1, readonly SceneGenerationJobStatusV1[]>> = {
	queued: ['running', 'canceled', 'source_missing', 'source_stale'],
	running: ['queued', 'completed', 'failed', 'canceled', 'source_missing', 'source_stale'],
	completed: [],
	failed: ['queued'],
	canceled: [],
	source_missing: ['queued'],
	source_stale: []
};

export function canTransitionSceneGenerationJobV1(input: {
	from: SceneGenerationJobStatusV1;
	to: SceneGenerationJobStatusV1;
	attemptCount: number;
	maxAttempts: number;
}): boolean {
	if (!Number.isInteger(input.attemptCount) || !Number.isInteger(input.maxAttempts) ||
		input.attemptCount < 0 || input.maxAttempts < 1 || input.maxAttempts > 5 || input.attemptCount > input.maxAttempts) return false;
	if (!allowedTransitions[input.from].includes(input.to)) return false;
	if (input.from === 'queued' && input.to === 'running' && input.attemptCount >= input.maxAttempts) return false;
	if ((input.from === 'failed' || input.from === 'source_missing') && input.to === 'queued') return input.attemptCount < input.maxAttempts;
	if (input.from === 'running' && input.to === 'queued') return input.attemptCount < input.maxAttempts;
	return true;
}
