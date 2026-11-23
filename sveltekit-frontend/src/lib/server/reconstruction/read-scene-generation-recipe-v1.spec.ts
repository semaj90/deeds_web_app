import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { storageBuckets } from '$lib/server/storage/storage-buckets.js';
import { buildSceneGenerationPlanV1 } from './scene-generation-plan-v1.js';
import { buildSceneGenerationJobKeysV1 } from './scene-generation-job-keys-v1.js';
import { compileSceneGenerationJobV1 } from './compile-scene-generation-job-v1.js';
import { readSceneGenerationRecipeV1 } from './read-scene-generation-recipe-v1.js';

const caseId = '11111111-1111-4111-8111-111111111111';
const sceneId = '22222222-2222-4222-8222-222222222222';
const plan = buildSceneGenerationPlanV1({
	schema: 'parent-atlas.scene-generation-plan/v1', caseId, sceneId, expectedSceneRevision: 0,
	generator: 'procedural-three-scene-v1', caseIntake: null,
	narrative: { why: { status: 'unknown' }, how: { status: 'unknown' } },
	sources: [], actors: [], primitives: [], placements: [], events: [],
	environment: { kind: 'indoor', seed: 7, cellSizeMeters: 32, extentMeters: { x: 32, z: 32 }, coordinateStatus: 'illustrative_uncalibrated' },
	quality: { profile: 'retro', maxTextureDimension: 128, maxTriangles: 50_000, maxInstances: 10_000, activeSceneMemoryMiB: 8 },
	provenance: { intakeStatus: 'USER_INTAKE_UNVERIFIED', clockPolicy: 'source_local_unaligned', identityPolicy: 'pseudonymous_visual_handles', motivePolicy: 'unknown_or_cited_hypothesis' }
});
const { job, requestSha256 } = buildSceneGenerationJobKeysV1({
	caseId, sceneId, expectedSceneRevision: 0, inputKind: 'BLOCKOUT', requestSnapshot: plan, sourceSnapshot: []
});
const { bytes, recipe, receipt } = compileSceneGenerationJobV1({ snapshot: job, requestSha256 });
const reference = {
	kind: 'SCENE_RUNTIME_RECIPE_V1', bucket: storageBuckets.artifacts,
	artifactKey: `scene-generation/${caseId}/${sceneId}/sha256/${receipt.sha256}.json`,
	sha256: receipt.sha256, byteLength: bytes.length, mimeType: 'application/json', manifestSha256: 'a'.repeat(64)
};
const scope = { caseId, sceneId, expectedSceneRevision: 0, planHash: plan.planHash, resultRefs: [reference] };

describe('scene generation recipe readback', () => {
	it('opens verified compiler output with a bounded read using the registered object key', async () => {
		const read = vi.fn().mockResolvedValue(bytes);
		expect(await readSceneGenerationRecipeV1(scope, read)).toEqual(recipe);
		expect(read).toHaveBeenCalledExactlyOnceWith({ bucket: reference.bucket, objectKey: reference.artifactKey, maximumBytes: bytes.length });
	});

	it('rejects an unrelated object key before storage access', async () => {
		const read = vi.fn();
		await expect(readSceneGenerationRecipeV1({ ...scope, resultRefs: [{ ...reference, artifactKey: 'other-case/recipe.json' }] }, read))
			.rejects.toThrow('SCENE_GENERATION_RECIPE_KEY_MISMATCH');
		expect(read).not.toHaveBeenCalled();
	});

	it('rejects tampered bytes and a valid digest with the wrong inner revision', async () => {
		const tampered = Buffer.from(bytes);
		tampered[0] = tampered[0]! ^ 1;
		await expect(readSceneGenerationRecipeV1(scope, async () => tampered)).rejects.toThrow('SCENE_GENERATION_RECIPE_READBACK_MISMATCH');
		const stale = Buffer.from(JSON.stringify({ ...recipe, sceneRevision: 9 }));
		const sha256 = createHash('sha256').update(stale).digest('hex');
		await expect(readSceneGenerationRecipeV1({ ...scope, resultRefs: [{
			...reference, sha256, byteLength: stale.length, artifactKey: `scene-generation/${caseId}/${sceneId}/sha256/${sha256}.json`
		}] }, async () => stale)).rejects.toThrow('SCENE_GENERATION_RECIPE_SCOPE_MISMATCH');
	});
});
