import { z } from 'zod';
import { SceneGenerationPlanV1Schema, scenePropRotationActionV1Schema } from './scene-generation-plan-v1.js';
import { sceneCameraPresetV1Schema } from './scene-camera-cue-v1.js';

export const SceneRuntimeRecipeV1Schema = z.object({
	schema: z.literal('parent-atlas.scene-runtime-recipe/v1'),
	planHash: z.string().regex(/^[a-f0-9]{64}$/),
	caseId: z.string().uuid(),
	sceneId: z.string().uuid(),
	sceneRevision: z.number().int().nonnegative(),
	environment: z.object({
		kind: z.enum(['urban', 'beach', 'indoor', 'four-bedroom-house', 'custom']),
		seed: z.number().int().nonnegative(),
		profile: z.enum(['urban-blocks-v1', 'beach-v1', 'indoor-room-v1', 'four-bedroom-house-v1', 'custom-recipe-v1']),
		customRecipeId: z.string().nullable(),
		cellSizeMeters: z.number().int(),
		extentMeters: z.object({ x: z.number().positive(), z: z.number().positive() }).strict(),
		coordinateStatus: z.enum(['illustrative_uncalibrated', 'reviewed_transform', 'calibrated_metric'])
	}).strict(),
	streaming: z.object({
		algorithm: z.literal('parent-atlas.scene-cell-residency/v1'),
		maxResidentCells: z.literal(64),
		unloadGraceMs: z.literal(1_500),
		activeSceneMemoryMiB: z.number().int().positive().max(8)
	}).strict(),
	actors: z.array(z.object({ actorId: z.string(), label: z.string(), appearance: z.string(), evidenceIds: z.array(z.string().uuid()) }).strict()),
	primitiveRegistry: z.array(z.object({ objectId: z.string(), registryId: z.string() }).strict()),
	assets: z.array(z.object({ assetId: z.string().uuid(), assetRevision: z.number().int(), sha256: z.string() }).strict()),
	placements: z.array(z.object({
		placementId: z.string(), targetKind: z.enum(['actor', 'primitive', 'asset']), targetId: z.string(),
		positionMeters: z.tuple([z.number(), z.number(), z.number()]),
		rotationQuaternion: z.tuple([z.number(), z.number(), z.number(), z.number()]),
		scale: z.tuple([z.number(), z.number(), z.number()])
	}).strict()),
	eventLanes: z.array(z.object({
		clockId: z.string(),
		evidenceId: z.string().uuid().nullable(),
		events: z.array(z.object({
			eventId: z.string(), cueType: z.string(), label: z.string(), status: z.string(), reviewStatus: z.string(),
			cameraPreset: sceneCameraPresetV1Schema.optional(),
			evidenceIds: z.array(z.string().uuid()), actorIds: z.array(z.string()), targetRefs: z.array(z.object({ kind: z.enum(['actor', 'primitive', 'asset']), targetId: z.string() }).strict()),
			action: z.discriminatedUnion('type', [
				z.object({ type: z.literal('visible_during_interval'), visible: z.boolean() }).strict(),
				z.object({ type: z.literal('move_during_interval'), fromMeters: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()] as const), toMeters: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()] as const) }).strict(),
				scenePropRotationActionV1Schema,
				z.object({ type: z.literal('pulse_light_during_interval'), colorHex: z.string().regex(/^#[0-9a-f]{6}$/i), minIntensity: z.number().finite().min(0).max(5), maxIntensity: z.number().finite().min(0).max(10), periodMs: z.number().int().min(100).max(10_000) }).strict().refine((action) => action.maxIntensity > action.minIntensity)
			]).optional(),
			startMs: z.number().int(), endMs: z.number().int(), uncertaintyMs: z.number().int()
		}).strict())
	}).strict()),
	quality: z.object({ profile: z.string(), maxTextureDimension: z.number().int(), maxTriangles: z.number().int(), maxInstances: z.number().int() }).strict(),
	narrative: z.object({
		why: z.object({ status: z.enum(['unknown', 'hypothesis', 'disputed']), text: z.string().nullable(), evidenceIds: z.array(z.string().uuid()), reviewStatus: z.enum(['unreviewed', 'accepted', 'disputed']), reviewDecisionId: z.string().uuid().nullable() }).strict(),
		how: z.object({ status: z.enum(['unknown', 'hypothesis', 'disputed']), text: z.string().nullable(), evidenceIds: z.array(z.string().uuid()), reviewStatus: z.enum(['unreviewed', 'accepted', 'disputed']), reviewDecisionId: z.string().uuid().nullable() }).strict()
	}).strict(),
	provenance: z.object({
		generator: z.literal('procedural-three-scene-v1'),
		clockPolicy: z.literal('source_local_unaligned'),
		identityPolicy: z.literal('pseudonymous_visual_handles'),
		motivePolicy: z.literal('unknown_or_cited_hypothesis')
	}).strict()
}).strict().superRefine((recipe, ctx) => {
	const pulseLightBindings = recipe.eventLanes.flatMap((lane) => lane.events)
		.filter((event) => event.action?.type === 'pulse_light_during_interval')
		.reduce((total, event) => total + event.targetRefs.length, 0);
	if (pulseLightBindings > 64) ctx.addIssue({ code: 'custom', path: ['eventLanes'], message: 'Pulse-light presentation is limited to 64 event-target bindings' });
	const primitiveIds = new Set(recipe.primitiveRegistry.map((primitive) => primitive.objectId));
	for (const lane of recipe.eventLanes) for (const event of lane.events) {
		if (event.action?.type === 'rotate_prop_during_interval' && (!event.targetRefs.length ||
			event.targetRefs.some((target) => target.kind !== 'primitive' || !primitiveIds.has(target.targetId)))) {
			ctx.addIssue({ code: 'custom', path: ['eventLanes'], message: 'Prop rotation requires registered primitive targets' });
		}
	}
});

export type SceneRuntimeRecipeV1 = z.infer<typeof SceneRuntimeRecipeV1Schema>;

/** Convert a plan produced by the authorized server resolver into a compact, lazy-render recipe.
 * This browser-safe projection is not an authorization or integrity boundary; server job admission
 * must re-resolve references and recompute the plan hash against canonical owners.
 */
export function compileSceneRuntimeRecipeV1(input: unknown): SceneRuntimeRecipeV1 {
	const plan = SceneGenerationPlanV1Schema.parse(input);
	const profileByEnvironment = {
		urban: 'urban-blocks-v1', beach: 'beach-v1', indoor: 'indoor-room-v1', 'four-bedroom-house': 'four-bedroom-house-v1', custom: 'custom-recipe-v1'
	} as const;
	const eventLanes = new Map<string, SceneRuntimeRecipeV1['eventLanes'][number]>();
	for (const event of plan.events) {
		const clockId = event.clock.clockId;
		let lane = eventLanes.get(clockId);
		if (!lane) {
			lane = { clockId, evidenceId: event.clock.evidenceId, events: [] };
			eventLanes.set(clockId, lane);
		} else if (lane.evidenceId !== event.clock.evidenceId) {
			throw new Error('SCENE_CLOCK_LANE_MERGES_EVIDENCE_SOURCES');
		}
		lane.events.push({ eventId: event.eventId, cueType: event.cueType, label: event.label, status: event.status, reviewStatus: event.reviewStatus,
			...(event.cameraPreset ? { cameraPreset: event.cameraPreset } : {}),
			evidenceIds: event.evidenceIds, actorIds: event.actorIds, targetRefs: event.targetRefs, action: event.action,
			startMs: event.clock.startMs, endMs: event.clock.endMs, uncertaintyMs: event.clock.uncertaintyMs });
	}
	const recipe = {
		schema: 'parent-atlas.scene-runtime-recipe/v1' as const,
		planHash: plan.planHash, caseId: plan.caseId, sceneId: plan.sceneId, sceneRevision: plan.expectedSceneRevision,
		environment: { kind: plan.environment.kind, seed: plan.environment.seed, profile: profileByEnvironment[plan.environment.kind],
			customRecipeId: plan.environment.customRecipeId, cellSizeMeters: plan.environment.cellSizeMeters,
			extentMeters: plan.environment.extentMeters, coordinateStatus: plan.environment.coordinateStatus },
		streaming: { algorithm: 'parent-atlas.scene-cell-residency/v1' as const, maxResidentCells: 64 as const, unloadGraceMs: 1_500 as const, activeSceneMemoryMiB: plan.quality.activeSceneMemoryMiB },
		actors: plan.actors.map(({ actorId, label, appearance, evidenceIds }) => ({ actorId, label, appearance, evidenceIds })).sort((a, b) => a.actorId.localeCompare(b.actorId)),
		primitiveRegistry: [...plan.primitives].sort((a, b) => a.objectId.localeCompare(b.objectId)),
		assets: [...plan.assets].sort((a, b) => a.assetId.localeCompare(b.assetId)),
		placements: [...plan.placements].sort((a, b) => a.placementId.localeCompare(b.placementId)),
		eventLanes: [...eventLanes.values()].map((lane) => ({ ...lane, events: [...lane.events].sort((a, b) => a.startMs - b.startMs || a.eventId.localeCompare(b.eventId)) }))
			.sort((a, b) => a.clockId.localeCompare(b.clockId)),
		quality: { profile: plan.quality.profile, maxTextureDimension: plan.quality.maxTextureDimension, maxTriangles: plan.quality.maxTriangles, maxInstances: plan.quality.maxInstances },
		narrative: {
			why: { status: plan.narrative.why.status, text: plan.narrative.why.text ?? null, evidenceIds: [...plan.narrative.why.evidenceIds].sort(), reviewStatus: plan.narrative.why.reviewStatus, reviewDecisionId: plan.narrative.why.reviewDecisionId },
			how: { status: plan.narrative.how.status, text: plan.narrative.how.text ?? null, evidenceIds: [...plan.narrative.how.evidenceIds].sort(), reviewStatus: plan.narrative.how.reviewStatus, reviewDecisionId: plan.narrative.how.reviewDecisionId }
		},
		provenance: { generator: plan.generator, clockPolicy: plan.provenance.clockPolicy, identityPolicy: plan.provenance.identityPolicy, motivePolicy: plan.provenance.motivePolicy }
	};
	return SceneRuntimeRecipeV1Schema.parse(recipe);
}
