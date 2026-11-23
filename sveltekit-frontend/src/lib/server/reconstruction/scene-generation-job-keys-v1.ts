import { sha256Hex, stableStringify } from '$lib/server/analysis/stable-hash.js';
import { SceneGenerationJobDraftV1Schema, type SceneGenerationJobDraftV1 } from '$lib/reconstruction/scene-generation-job-contract-v1.js';

/** Build deterministic request and idempotency hashes after server-side admission. */
export function buildSceneGenerationJobKeysV1(input: unknown): {
	job: SceneGenerationJobDraftV1;
	requestSha256: string;
	idempotencyKey: string;
} {
	const job = SceneGenerationJobDraftV1Schema.parse(input);
	const sourceSnapshot = [...job.sourceSnapshot].sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
	if (Buffer.byteLength(stableStringify(job.requestSnapshot), 'utf8') > 1_048_576) throw new Error('SCENE_GENERATION_REQUEST_TOO_LARGE');
	const requestSha256 = sha256Hex(stableStringify({ requestSnapshot: job.requestSnapshot, sourceSnapshot }));
	const idempotencyKey = sha256Hex(stableStringify({
		caseId: job.caseId,
		sceneId: job.sceneId,
		inputKind: job.inputKind,
		expectedSceneRevision: job.expectedSceneRevision,
		requestSha256
	}));
	return { job: { ...job, sourceSnapshot }, requestSha256, idempotencyKey };
}
