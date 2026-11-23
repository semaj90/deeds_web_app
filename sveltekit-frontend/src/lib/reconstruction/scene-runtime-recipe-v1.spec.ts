import { describe, expect, it } from 'vitest';
import { buildSceneGenerationPlanV1 } from '$lib/server/reconstruction/scene-generation-plan-v1.js';
import { compileSceneRuntimeRecipeV1 } from './scene-runtime-recipe-v1.js';

const caseId = '44444444-4444-4444-8444-444444444444';
const sceneId = '33333333-3333-4333-8333-333333333333';
const imageA = '11111111-1111-4111-8111-111111111111';
const imageB = '22222222-2222-4222-8222-222222222222';
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

function makePlan() {
	return buildSceneGenerationPlanV1({
		schema: 'parent-atlas.scene-generation-plan/v1', caseId, sceneId, expectedSceneRevision: 0, generator: 'procedural-three-scene-v1',
		caseIntake: null, narrative: { why: { status: 'unknown' }, how: { status: 'unknown' } },
		sources: [{ evidenceId: imageA, sourceRevision: `sha256:${hashA}`, sha256: hashA }, { evidenceId: imageB, sourceRevision: `sha256:${hashB}`, sha256: hashB }],
		reviewedObservations: [],
		actors: [{ actorId: 'ACTOR-01', label: 'Unidentified person', evidenceIds: [imageA] }],
		primitives: [{ objectId: 'OBJECT-01', registryId: 'box' }], assets: [],
		placements: [{ placementId: 'PLACEMENT-01', targetKind: 'actor', targetId: 'ACTOR-01', positionMeters: [1, 0, 2], rotationQuaternion: [0, 0, 0, 1], scale: [1, 1, 1] }],
		events: [
			{ eventId: 'EVENT-A-02', cueType: 'alarm', label: 'Alarm proposal', status: 'hypothesis', reviewStatus: 'unreviewed', evidenceIds: [imageA], actorIds: [], clock: { evidenceId: imageA, clockId: `evidence:${imageA}`, startMs: 2_000, endMs: 3_000, uncertaintyMs: 200 } },
			{ eventId: 'EVENT-B-01', cueType: 'timed_prop', label: 'Bonfire display cue', status: 'hypothesis', reviewStatus: 'unreviewed', evidenceIds: [imageB], actorIds: [], targetRefs: [{ kind: 'primitive', targetId: 'OBJECT-01' }], action: { type: 'visible_during_interval', visible: true }, clock: { evidenceId: imageB, clockId: `evidence:${imageB}`, startMs: 1_000, endMs: 2_000, uncertaintyMs: 0 } }
		],
		environment: { kind: 'beach', seed: 42, cellSizeMeters: 32, extentMeters: { x: 320, z: 320 }, coordinateStatus: 'illustrative_uncalibrated' },
		quality: { profile: 'retro', maxTextureDimension: 128, maxTriangles: 100_000, maxInstances: 20_000, activeSceneMemoryMiB: 8 },
		provenance: { intakeStatus: 'USER_INTAKE_UNVERIFIED', clockPolicy: 'source_local_unaligned', identityPolicy: 'pseudonymous_visual_handles', motivePolicy: 'unknown_or_cited_hypothesis' }
	});
}

describe('SceneRuntimeRecipeV1', () => {
	it('compiles a compact, deterministic recipe with an environment population profile and streaming policy', () => {
		const plan = makePlan();
		const first = compileSceneRuntimeRecipeV1(plan);
		const second = compileSceneRuntimeRecipeV1(plan);
		expect(first).toEqual(second);
		expect(first.environment).toMatchObject({ kind: 'beach', profile: 'beach-v1', seed: 42 });
		expect(first.streaming).toMatchObject({ maxResidentCells: 64, unloadGraceMs: 1_500, activeSceneMemoryMiB: 8 });
		expect(first.placements).toHaveLength(1);
	});

	it('keeps each evidence clock in its own lane and orders only within each lane', () => {
		const recipe = compileSceneRuntimeRecipeV1(makePlan());
		expect(recipe.eventLanes).toHaveLength(2);
		expect(recipe.eventLanes.map((lane) => lane.evidenceId)).toEqual([imageA, imageB]);
		expect(recipe.eventLanes[0]?.events.map((event) => event.eventId)).toEqual(['EVENT-A-02']);
		expect(recipe.eventLanes[1]?.events[0]?.targetRefs).toEqual([{ kind: 'primitive', targetId: 'OBJECT-01' }]);
		expect(recipe.eventLanes[1]?.events[0]?.action).toEqual({ type: 'visible_during_interval', visible: true });
	});

	it('supports a blockout without evidence and leaves why/how unknown', () => {
		const plan = makePlan();
		const { planHash: _planHash, ...body } = plan;
		const blockout = buildSceneGenerationPlanV1({
			...body, sources: [], actors: [], primitives: [], assets: [], placements: [], events: [], reviewedObservations: [],
			narrative: { why: { status: 'unknown' }, how: { status: 'unknown' } }
		});
		const recipe = compileSceneRuntimeRecipeV1(blockout);
		expect(recipe.eventLanes).toEqual([]);
		expect(recipe.actors).toEqual([]);
		expect(recipe.narrative.why).toMatchObject({ status: 'unknown', text: null, evidenceIds: [], reviewStatus: 'unreviewed' });
	});

	it('preserves the server plan receipt and rejects clock lanes that merge evidence sources', () => {
		const plan = makePlan();
		expect(compileSceneRuntimeRecipeV1({ ...plan, planHash: '0'.repeat(64) }).planHash).toBe('0'.repeat(64));
		const { planHash: _planHash, ...body } = plan;
		const mergedBody = { ...body, events: body.events.map((event) => ({ ...event, clock: { ...event.clock, clockId: 'MERGED-CLOCK' } })) };
		const mergedPlan = buildSceneGenerationPlanV1(mergedBody);
		expect(() => compileSceneRuntimeRecipeV1(mergedPlan)).toThrow('SCENE_CLOCK_LANE_MERGES_EVIDENCE_SOURCES');
	});
});
