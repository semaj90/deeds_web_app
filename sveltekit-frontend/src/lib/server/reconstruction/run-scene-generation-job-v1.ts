import { readSceneGenerationInputStatusV1 } from './load-scene-generation-plan-v1.js';
import { claimSceneGenerationJobV1, completeSceneGenerationJobV1, stopStaleSceneGenerationJobV1 } from './scene-generation-job-lifecycle-v1.js';
import { compileSceneGenerationJobToSeaweedV1 } from './scene-generation-worker-v1.js';

/** Handle one explicitly dispatched job. The lease recovery owner handles transient failures. */
export async function runSceneGenerationJobV1(input: Parameters<typeof claimSceneGenerationJobV1>[0]) {
	const job = await claimSceneGenerationJobV1(input);
	if (!job) return 'not_claimed';
	const attempt = { caseId: job.caseId, sceneId: job.sceneId, jobId: job.jobId,
		workerId: input.workerId.trim(), attemptCount: job.attemptCount };
	const beforeCompile = await readSceneGenerationInputStatusV1(job);
	if (beforeCompile !== 'current') {
		return await stopStaleSceneGenerationJobV1({ ...attempt, status: beforeCompile }) ? beforeCompile : 'lease_lost';
	}
	const result = await compileSceneGenerationJobToSeaweedV1({
		snapshot: {
			caseId: job.caseId, sceneId: job.sceneId, expectedSceneRevision: job.expectedSceneRevision,
			inputKind: job.inputKind, requestSnapshot: job.requestSnapshot, sourceSnapshot: job.sourceSnapshot
		},
		requestSha256: job.requestSha256
	});
	return completeSceneGenerationJobV1({ ...attempt, result });
}
