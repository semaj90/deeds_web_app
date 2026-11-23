import { createHash } from 'node:crypto';
import { z } from 'zod';
import { SceneRuntimeRecipeV1Schema } from '$lib/reconstruction/scene-runtime-recipe-v1.js';
import { getFileFromSeaweed } from '$lib/server/storage/seaweed.js';
import { assertArtifactBucket } from '$lib/server/storage/storage-buckets.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const referenceSchema = z.object({
	kind: z.literal('SCENE_RUNTIME_RECIPE_V1'),
	bucket: z.string().min(1),
	artifactKey: z.string(),
	sha256: digest,
	byteLength: z.number().int().min(1).max(1_048_576),
	mimeType: z.literal('application/json'),
	manifestSha256: digest
}).strict();

/** Read the one artifact pinned by the completed job using server-owned storage metadata. */
export async function readSceneGenerationRecipeV1(
	scope: { caseId: string; sceneId: string; expectedSceneRevision: number; planHash: string; resultRefs: unknown },
	read = getFileFromSeaweed
) {
	const [reference] = z.tuple([referenceSchema]).parse(scope.resultRefs);
	assertArtifactBucket(reference.bucket);
	const expectedKey = `scene-generation/${scope.caseId}/${scope.sceneId}/sha256/${reference.sha256}.json`;
	if (reference.artifactKey !== expectedKey) throw new Error('SCENE_GENERATION_RECIPE_KEY_MISMATCH');
	const bytes = await read({ bucket: reference.bucket, objectKey: expectedKey, maximumBytes: reference.byteLength });
	if (bytes.byteLength !== reference.byteLength || createHash('sha256').update(bytes).digest('hex') !== reference.sha256) {
		throw new Error('SCENE_GENERATION_RECIPE_READBACK_MISMATCH');
	}
	const recipe = SceneRuntimeRecipeV1Schema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
	if (recipe.caseId !== scope.caseId || recipe.sceneId !== scope.sceneId ||
		recipe.sceneRevision !== scope.expectedSceneRevision || recipe.planHash !== scope.planHash) {
		throw new Error('SCENE_GENERATION_RECIPE_SCOPE_MISMATCH');
	}
	return recipe;
}
