import { describe, expect, it } from 'vitest';
import { buildSceneGenerationPlanV1 } from '$lib/server/reconstruction/scene-generation-plan-v1.js';
import { compileSceneRuntimeRecipeV1 } from './scene-runtime-recipe-v1.js';
import { createSceneRuntimeThreeV1 } from './scene-runtime-three-v1.js';

const caseId = '44444444-4444-4444-8444-444444444444';
const sceneId = '33333333-3333-4333-8333-333333333333';
const evidenceA = '11111111-1111-4111-8111-111111111111';
const evidenceB = '22222222-2222-4222-8222-222222222222';
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

function makeRuntime(kind: 'beach' | 'four-bedroom-house' = 'beach', calibrated = false, withMovementConflict = false) {
	const plan = buildSceneGenerationPlanV1({
		schema: 'parent-atlas.scene-generation-plan/v1', caseId, sceneId, expectedSceneRevision: 2, generator: 'procedural-three-scene-v1',
		caseIntake: null, narrative: { why: { status: 'unknown' }, how: { status: 'unknown' } },
		sources: [
			{ evidenceId: evidenceA, sourceRevision: `sha256:${hashA}`, sha256: hashA },
			{ evidenceId: evidenceB, sourceRevision: `sha256:${hashB}`, sha256: hashB }
		], reviewedObservations: [],
		actors: [{ actorId: 'ACTOR-01', label: 'Unidentified person', appearance: 'Neutral placeholder', evidenceIds: [evidenceA] }],
		primitives: [{ objectId: 'OBJECT-01', registryId: 'cone' }], assets: [],
		placements: [
			{ placementId: 'PLACEMENT-ACTOR', targetKind: 'actor', targetId: 'ACTOR-01', positionMeters: [-1, 0, 0], rotationQuaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
			{ placementId: 'PLACEMENT-PROP', targetKind: 'primitive', targetId: 'OBJECT-01', positionMeters: [2, 0, 1], rotationQuaternion: [0, 0, 0, 1], scale: [1, 1, 1] }
		],
		events: [
			{ eventId: 'EVENT-MOVE-01', cueType: 'move', label: 'Illustrative movement path', status: 'hypothesis', reviewStatus: 'unreviewed', evidenceIds: [evidenceA], actorIds: ['ACTOR-01'], targetRefs: [{ kind: 'actor', targetId: 'ACTOR-01' }],
				action: { type: 'move_during_interval', fromMeters: [-1, 0, 0], toMeters: [3, 0, 0] },
				clock: { evidenceId: evidenceA, clockId: `camera:${evidenceA}`, startMs: 1_000, endMs: 3_000, uncertaintyMs: 250 } },
			{ eventId: 'EVENT-PROP-01', cueType: 'timed_prop', label: 'Timed prop hypothesis', status: 'hypothesis', reviewStatus: 'unreviewed', evidenceIds: [evidenceB], actorIds: [], targetRefs: [{ kind: 'primitive', targetId: 'OBJECT-01' }],
				action: { type: 'visible_during_interval', visible: true },
				clock: { evidenceId: evidenceB, clockId: `camera:${evidenceB}`, startMs: 5_000, endMs: 7_000, uncertaintyMs: 500 } },
			{ eventId: 'EVENT-ALARM-01', cueType: 'alarm', label: 'Illustrative alarm light', status: 'hypothesis', reviewStatus: 'unreviewed', evidenceIds: [evidenceB], actorIds: [], targetRefs: [{ kind: 'primitive', targetId: 'OBJECT-01' }],
				action: { type: 'pulse_light_during_interval', colorHex: '#ffb347', minIntensity: 0.15, maxIntensity: 2.5, periodMs: 1_000 },
				clock: { evidenceId: evidenceB, clockId: `camera:${evidenceB}`, startMs: 7_000, endMs: 9_000, uncertaintyMs: 500 } },
			...(withMovementConflict ? [{
				eventId: 'EVENT-MOVE-02', cueType: 'move' as const, label: 'Conflicting alternate movement', status: 'hypothesis' as const, reviewStatus: 'unreviewed' as const,
				evidenceIds: [evidenceA], actorIds: ['ACTOR-01'], targetRefs: [{ kind: 'actor' as const, targetId: 'ACTOR-01' }],
				action: { type: 'move_during_interval' as const, fromMeters: [-1, 0, 0] as [number, number, number], toMeters: [-1, 0, 4] as [number, number, number] },
				clock: { evidenceId: evidenceA, clockId: `camera:${evidenceA}`, startMs: 1_000, endMs: 3_000, uncertaintyMs: 250 }
			}] : [])
		],
		environment: { kind, seed: 42, cellSizeMeters: 32, extentMeters: { x: 320, z: 320 },
			coordinateStatus: calibrated ? 'calibrated_metric' : 'illustrative_uncalibrated',
			calibrationEvidenceIds: calibrated ? [evidenceA] : [] },
		quality: { profile: 'retro', maxTextureDimension: 128, maxTriangles: 100_000, maxInstances: 20_000, activeSceneMemoryMiB: 8 },
		provenance: { intakeStatus: 'USER_INTAKE_UNVERIFIED', clockPolicy: 'source_local_unaligned', identityPolicy: 'pseudonymous_visual_handles', motivePolicy: 'unknown_or_cited_hypothesis' }
	});
	return createSceneRuntimeThreeV1(compileSceneRuntimeRecipeV1(plan));
}

describe('SceneRuntimeThreeV1', () => {
	it('pulses an illustrative alarm light deterministically only on its bound source clock and interval', () => {
		const runtime = makeRuntime();
		try {
			const target = runtime.targetNodes.get('primitive:OBJECT-01')!;
			const light = target.getObjectByName('event-pulse:EVENT-ALARM-01') as import('three').PointLight;
			expect(light).toBeDefined();
			runtime.setSourceTime(`camera:${evidenceA}`, 8_000);
			expect(light.visible).toBe(false);
			runtime.setSourceTime(`camera:${evidenceB}`, 7_000);
			const midpointIntensity = light.intensity;
			expect(light.visible).toBe(true);
			runtime.setSourceTime(`camera:${evidenceB}`, 7_250);
			expect(light.intensity).toBeGreaterThan(midpointIntensity);
			runtime.setSourceTime(`camera:${evidenceB}`, 9_000);
			expect(light.visible).toBe(false);
		} finally {
			runtime.dispose();
		}
	});

	it('renders four connected bedrooms and stable furniture IDs from the house plan while preserving event targets', () => {
		const runtime = makeRuntime('four-bedroom-house');
		try {
			const house = runtime.root.getObjectByName('four-bedroom-house-v1')!;
			const rooms = house.children.filter((child) => /^bedroom-[1-4]$/.test(child.name));
			expect(rooms).toHaveLength(4);
			for (const room of rooms) expect(room.userData.connectsTo).toEqual(['hallway']);
			expect(house.getObjectByName('bedroom-1-desk')?.userData.houseObject).toEqual({
				id: 'bedroom-1-desk', label: 'Desk', room: 'Bedroom 1'
			});
			expect(runtime.selectEvent('EVENT-MOVE-01')?.targets[0]).toBe(runtime.targetNodes.get('actor:ACTOR-01'));
		} finally {
			runtime.dispose();
		}
	});

	it('rejects attempts to assign metric status to the generated house even with an evidence ID', () => {
		expect(() => makeRuntime('four-bedroom-house', true)).toThrow('The procedural house layout is illustrative');
	});
	it('renders the recipe environment, generated actors, and registry primitives with stable targets', () => {
		const runtime = makeRuntime();
		expect(runtime.root.userData).toMatchObject({ caseId, sceneId, coordinateStatus: 'illustrative_uncalibrated', illustrative: true });
		expect(runtime.environmentInstanceCount).toBe(36);
		expect(runtime.actors.has('ACTOR-01')).toBe(true);
		expect(runtime.targetNodes.get('primitive:OBJECT-01')?.position.toArray()).toEqual([2, 0, 1]);
		expect(runtime.selectEvent('EVENT-MOVE-01')?.targets[0]).toBe(runtime.targetNodes.get('actor:ACTOR-01'));
		runtime.dispose();
	});

	it('streams bounded environment cells by activity while retaining event targets', () => {
		const runtime = makeRuntime();
		try {
			expect(runtime.getResidencyMetrics()).toMatchObject({ loadedCells: 1, residentLimit: 9, mode: 'navigation' });
			expect(runtime.getEventFocusPosition('EVENT-MOVE-01')).toEqual([-1, 0, 0]);
			runtime.updateEnvironmentFocus([320, 0, 0], 'video-scrub', 2000);
			expect(runtime.getResidencyMetrics()).toMatchObject({ mode: 'video-scrub', queuedCells: 9 });
			runtime.drainEnvironmentCellQueue(1);
			expect(runtime.getResidencyMetrics()).toMatchObject({ loadedCells: 1, queuedCells: 8 });
			expect(runtime.targetNodes.get('actor:ACTOR-01')).toBeTruthy();
			runtime.updateEnvironmentFocus([320, 0, 0], 'editing', 2600);
			expect(runtime.getResidencyMetrics()).toMatchObject({ mode: 'editing', loadedCells: 1, queuedCells: 8 });
		} finally {
			runtime.dispose();
		}
	});

	it('scrubs one absolute source clock at a time and applies visibility and movement actions', () => {
		const runtime = makeRuntime();
		const actor = runtime.targetNodes.get('actor:ACTOR-01')!;
		const prop = runtime.targetNodes.get('primitive:OBJECT-01')!;
		expect(prop.visible).toBe(false);
		runtime.setSourceTime(`camera:${evidenceB}`, 5_000);
		expect(prop.visible).toBe(true);
		expect(actor.position.toArray()).toEqual([-1, 0, 0]);
		runtime.setSourceTime(`camera:${evidenceB}`, 7_000);
		expect(prop.visible).toBe(false);
		runtime.setSourceTime(`camera:${evidenceA}`, 2_000);
		expect(actor.position.toArray()).toEqual([1, 0, 0]);
		expect(runtime.activeSourceTime).toEqual({ clockId: `camera:${evidenceA}`, sourceTimeMs: 2_000 });
		runtime.dispose();
	});

	it('holds actor transform and animation at baseline while movement cues conflict', () => {
		const runtime = makeRuntime('beach', false, true);
		try {
			const actor = runtime.targetNodes.get('actor:ACTOR-01')!;
			runtime.setSourceTime(`camera:${evidenceA}`, 2_000);
			expect(actor.position.toArray()).toEqual([-1, 0, 0]);
			expect(actor.userData.conflictEventIds).toEqual(['EVENT-MOVE-01', 'EVENT-MOVE-02']);
		} finally {
			runtime.dispose();
		}
	});

	it('requires registered custom-environment and asset resolvers instead of loading arbitrary URLs', () => {
		const runtime = makeRuntime();
		const recipe = { ...runtime.recipe, environment: { ...runtime.recipe.environment, kind: 'custom' as const } };
		runtime.dispose();
		expect(() => createSceneRuntimeThreeV1(recipe)).toThrow('SCENE_CUSTOM_RECIPE_RESOLVER_REQUIRED');
		const assetRecipe = { ...runtime.recipe, assets: [{ assetId: '66666666-6666-4666-8666-666666666666', assetRevision: 1, sha256: hashA }] };
		expect(() => createSceneRuntimeThreeV1(assetRecipe)).toThrow('SCENE_ASSET_RESOLVER_REQUIRED');
	});
});
