import { describe, expect, it } from 'vitest';
import { SceneGenerationPlanV1BodySchema, SceneGenerationPlanV1Schema } from '$lib/reconstruction/scene-generation-plan-v1.js';
import { buildSceneGenerationPlanV1 } from './scene-generation-plan-v1.js';

const caseId = '44444444-4444-4444-8444-444444444444';
const sceneId = '33333333-3333-4333-8333-333333333333';
const evidenceId = '11111111-1111-4111-8111-111111111111';
const sourceHash = 'a'.repeat(64);
const sourceRevision = `sha256:${sourceHash}`;
const observationRevision = `sha256:${'b'.repeat(64)}`;
const reviewDecisionId = '55555555-5555-4555-8555-555555555555';

const validPlan = {
	schema: 'parent-atlas.scene-generation-plan/v1',
	caseId,
	sceneId,
	expectedSceneRevision: 3,
	generator: 'procedural-three-scene-v1',
	caseIntake: { schema: 'parent-atlas.case-scene-intake/v1', status: 'USER_INTAKE_UNVERIFIED', who: 'Several unidentified people', what: 'Alleged incident', when: 'Around 10 AM', where: 'North Quay', why: 'Unknown', how: 'Unclear' },
	narrative: { why: { status: 'unknown' }, how: { status: 'unknown' } },
	sources: [{ evidenceId, sourceRevision, sha256: sourceHash }],
	reviewedObservations: [{ observationId: `sha256:${'c'.repeat(64)}`, evidenceId, sourceRevision, sourceSha256: sourceHash, analysisRevision: 'analysis-7', observationRevision, reviewDecisionId, reviewStatus: 'accepted' }],
	actors: [{ actorId: 'ACTOR-01', label: 'Unidentified person', evidenceIds: [evidenceId] }],
	primitives: [{ objectId: 'OBJECT-01', registryId: 'box' }],
	assets: [],
	placements: [
		{ placementId: 'PLACEMENT-ACTOR-01', targetKind: 'actor', targetId: 'ACTOR-01', positionMeters: [0, 0, 0], rotationQuaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
		{ placementId: 'PLACEMENT-DESK-01', targetKind: 'primitive', targetId: 'OBJECT-01', positionMeters: [2, 0, 1], rotationQuaternion: [0, 0, 0, 1], scale: [1, 1, 1] }
	],
	events: [{ eventId: 'EVENT-01', cueType: 'enter', label: 'Person appears at entrance', status: 'hypothesis', reviewStatus: 'unreviewed', evidenceIds: [evidenceId], actorIds: ['ACTOR-01'], clock: { evidenceId, clockId: 'CAM-A', startMs: 1000, endMs: 3000, uncertaintyMs: 250 } }],
	environment: { kind: 'urban', seed: 1234, cellSizeMeters: 32, extentMeters: { x: 320, z: 320 }, coordinateStatus: 'illustrative_uncalibrated' },
	quality: { profile: 'retro', maxTextureDimension: 128, maxTriangles: 50_000, maxInstances: 10_000, activeSceneMemoryMiB: 8 },
	provenance: { intakeStatus: 'USER_INTAKE_UNVERIFIED', clockPolicy: 'source_local_unaligned', identityPolicy: 'pseudonymous_visual_handles', motivePolicy: 'unknown_or_cited_hypothesis' }
} as const;

describe('SceneGenerationPlanV1', () => {
	it('normalizes and hashes the same plan deterministically', () => {
		const first = buildSceneGenerationPlanV1(validPlan);
		const reordered = buildSceneGenerationPlanV1({ ...validPlan, environment: { coordinateStatus: 'illustrative_uncalibrated', extentMeters: { z: 320, x: 320 }, cellSizeMeters: 32, seed: 1234, kind: 'urban' } });
		expect(first.planHash).toMatch(/^[a-f0-9]{64}$/);
		expect(first.planHash).toBe(reordered.planHash);
		expect(SceneGenerationPlanV1Schema.parse(first)).toEqual(first);
	});

	it('changes the hash when a scene parameter changes', () => {
		const first = buildSceneGenerationPlanV1(validPlan);
		const changed = buildSceneGenerationPlanV1({ ...validPlan, environment: { ...validPlan.environment, seed: 1235 } });
		expect(first.planHash).not.toBe(changed.planHash);
	});

	it('rejects duplicate identities, unresolved placement targets, and out-of-bounds positions', () => {
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, actors: [...validPlan.actors, validPlan.actors[0]] }).success).toBe(false);
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, placements: [{ ...validPlan.placements[0], targetId: 'ACTOR-MISSING' }] }).success).toBe(false);
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, placements: [{ ...validPlan.placements[0], positionMeters: [161, 0, 0] }] }).success).toBe(false);
	});

	it('binds timed props to a registered scene object or asset', () => {
		const timedCue = { ...validPlan.events[0], cueType: 'timed_prop', targetRefs: [{ kind: 'primitive', targetId: 'OBJECT-01' }] };
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, events: [timedCue] }).success).toBe(true);
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, events: [{ ...timedCue, targetRefs: [] }] }).success).toBe(false);
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, events: [{ ...timedCue, targetRefs: [{ kind: 'primitive', targetId: 'OBJECT-MISSING' }] }] }).success).toBe(false);
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, events: [{ ...timedCue, targetRefs: [{ kind: 'actor', targetId: 'ACTOR-01' }] }] }).success).toBe(false);
	});

	it('keeps deterministic movement as a separately targeted scene presentation action', () => {
		const movementCue = {
			...validPlan.events[0], cueType: 'move', actorIds: ['ACTOR-01'],
			targetRefs: [{ kind: 'actor', targetId: 'ACTOR-01' }],
			action: { type: 'move_during_interval', fromMeters: [-2, 0, 1], toMeters: [3, 0, -1] }
		};
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, events: [movementCue] }).success).toBe(true);
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, events: [{ ...movementCue, targetRefs: [] }] }).success).toBe(false);
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, events: [{ ...movementCue, action: { type: 'move_during_interval', fromMeters: [Number.NaN, 0, 0], toMeters: [1, 0, 0] } }] }).success).toBe(false);
	});

	it('rejects nonfinite transforms, malformed revisions, and over-budget plans', () => {
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, expectedSceneRevision: -1 }).success).toBe(false);
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, placements: [{ ...validPlan.placements[0], positionMeters: [Number.NaN, 0, 0] }] }).success).toBe(false);
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, placements: [{ ...validPlan.placements[0], rotationQuaternion: [0, 0, 0, 0] }] }).success).toBe(false);
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, quality: { ...validPlan.quality, activeSceneMemoryMiB: 9 } }).success).toBe(false);
	});

	it('requires source-bound reviewed observations and accepted measured events', () => {
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, reviewedObservations: [{ ...validPlan.reviewedObservations[0], sourceRevision: `sha256:${'d'.repeat(64)}` }] }).success).toBe(false);
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, reviewedObservations: [...validPlan.reviewedObservations, validPlan.reviewedObservations[0]] }).success).toBe(false);
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, events: [{ ...validPlan.events[0], evidenceIds: [] }] }).success).toBe(false);
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, events: [{ ...validPlan.events[0], status: 'measured', reviewStatus: 'unreviewed' }] }).success).toBe(false);
	});

	it('keeps intake prose unverified and requires citations for motive or method hypotheses', () => {
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, caseIntake: { ...validPlan.caseIntake, why: 'They wanted revenge' } }).success).toBe(true);
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, narrative: { ...validPlan.narrative, why: { status: 'hypothesis', text: 'They wanted revenge', evidenceIds: [], reviewStatus: 'accepted' } } }).success).toBe(false);
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, narrative: { ...validPlan.narrative, why: { status: 'hypothesis', text: 'They wanted revenge', evidenceIds: [evidenceId], reviewStatus: 'unreviewed' } } }).success).toBe(true);
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, narrative: { ...validPlan.narrative, how: { status: 'hypothesis', text: 'Entered through the west door', evidenceIds: [evidenceId], reviewStatus: 'accepted' } } }).success).toBe(false);
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, narrative: { ...validPlan.narrative, how: { status: 'hypothesis', text: 'Entered through the west door', evidenceIds: [evidenceId], reviewStatus: 'accepted', reviewDecisionId } } }).success).toBe(true);
	});

	it('allows a procedural blockout without evidence, events, assets, or claims', () => {
		const blockout = buildSceneGenerationPlanV1({
			...validPlan, sources: [], reviewedObservations: [], actors: [], primitives: [], assets: [], placements: [], events: [],
			caseIntake: null, narrative: { why: { status: 'unknown' }, how: { status: 'unknown' } }
		});
		expect(blockout.sources).toEqual([]);
		expect(blockout.events).toEqual([]);
	});

	it('does not accept a multi-clock event cue or claim calibrated geometry without anchors', () => {
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, events: [{ ...validPlan.events[0], clocks: [{ ...validPlan.events[0].clock }, { ...validPlan.events[0].clock, clockId: 'CAM-B' }] }] }).success).toBe(false);
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, events: [{ ...validPlan.events[0], cueType: 'teleport' }] }).success).toBe(false);
		expect(SceneGenerationPlanV1BodySchema.safeParse({ ...validPlan, environment: { ...validPlan.environment, coordinateStatus: 'calibrated_metric' } }).success).toBe(false);
	});
});
