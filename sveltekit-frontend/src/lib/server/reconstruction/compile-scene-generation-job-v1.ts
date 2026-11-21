import { createHash } from 'node:crypto';
import { compileSceneRuntimeRecipeV1 } from '$lib/reconstruction/scene-runtime-recipe-v1.js';
import { SCENE_PRIMITIVE_KINDS_V1 } from '$lib/splat/scene-primitive-registry-v1.js';
import { stableStringify } from '$lib/server/analysis/stable-hash.js';
import { buildSceneGenerationJobKeysV1 } from './scene-generation-job-keys-v1.js';
import { buildSceneGenerationPlanV1 } from './scene-generation-plan-v1.js';

const primitiveIds = new Set<string>(SCENE_PRIMITIVE_KINDS_V1);
const maxRecipeBytes = 1_048_576;

/**
 * Compile the procedural recipe artifact from a claimed job snapshot.
 * The worker owns authorization, current source checks, leases, and artifact publication.
 */
export function compileSceneGenerationJobV1(input: { snapshot: unknown; requestSha256: string }) {
	const { job, requestSha256 } = buildSceneGenerationJobKeysV1(input.snapshot);
	if (requestSha256 !== input.requestSha256) throw new Error('SCENE_GENERATION_REQUEST_HASH_MISMATCH');
	const { planHash, ...body } = job.requestSnapshot;
	const plan = buildSceneGenerationPlanV1(body);
	if (plan.planHash !== planHash) throw new Error('SCENE_GENERATION_PLAN_HASH_MISMATCH');

	if (plan.environment.kind === 'custom' || plan.assets.length > 0) {
		throw new Error('SCENE_GENERATION_REQUIRES_ASSET_COMPILER');
	}
	if (plan.primitives.some((primitive) => !primitiveIds.has(primitive.registryId))) {
		throw new Error('SCENE_GENERATION_UNKNOWN_PRIMITIVE');
	}
	if (plan.actors.length + plan.primitives.length > plan.quality.maxInstances) {
		throw new Error('SCENE_GENERATION_INSTANCE_BUDGET_EXCEEDED');
	}
	for (const { clock } of plan.events) {
		const expectedClockId = clock.evidenceId === null ? `scene:${job.sceneId}` : `evidence:${clock.evidenceId}`;
		if (clock.clockId !== expectedClockId) throw new Error('SCENE_GENERATION_CLOCK_NOT_CANONICAL');
	}

	const recipe = compileSceneRuntimeRecipeV1(plan);
	// Drop absent optional fields before sorting keys for canonical JSON output.
	const bytes = Buffer.from(stableStringify(JSON.parse(JSON.stringify(recipe))), 'utf8');
	if (bytes.length > maxRecipeBytes || bytes.length > recipe.streaming.activeSceneMemoryMiB * 1_048_576) {
		throw new Error('SCENE_GENERATION_RECIPE_BUDGET_EXCEEDED');
	}
	return {
		recipe,
		bytes,
		receipt: {
			format: recipe.schema,
			caseId: job.caseId,
			sceneId: job.sceneId,
			expectedSceneRevision: job.expectedSceneRevision,
			requestSha256,
			planHash,
			byteLength: bytes.length,
			sha256: createHash('sha256').update(bytes).digest('hex')
		}
	};
}
