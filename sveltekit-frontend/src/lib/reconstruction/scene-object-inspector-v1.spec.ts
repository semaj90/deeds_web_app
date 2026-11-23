import { describe, expect, it } from 'vitest';
import { buildSceneGenerationPlanV1 } from '$lib/server/reconstruction/scene-generation-plan-v1.js';
import { buildSceneObjectInspectorV1 } from './scene-object-inspector-v1.js';

const caseId = '11111111-1111-4111-8111-111111111111';
const evidenceId = '22222222-2222-4222-8222-222222222222';
const sha = 'a'.repeat(64);

function plan() {
	return buildSceneGenerationPlanV1({
		schema: 'parent-atlas.scene-generation-plan/v1', caseId, sceneId: '33333333-3333-4333-8333-333333333333', expectedSceneRevision: 0,
		generator: 'procedural-three-scene-v1', caseIntake: null,
		narrative: { why: { status: 'unknown', evidenceIds: [], reviewDecisionId: null, reviewStatus: 'unreviewed' }, how: { status: 'unknown', evidenceIds: [], reviewDecisionId: null, reviewStatus: 'unreviewed' } },
		sources: [{ evidenceId, sourceRevision: `sha256:${sha}`, sha256: sha }], reviewedObservations: [],
		actors: [{ actorId: 'ACTOR-01', label: 'Person 01', appearance: 'Neutral placeholder', evidenceIds: [evidenceId] }],
		primitives: [{ objectId: 'OBJECT-01', registryId: 'chair' }], assets: [],
		placements: [{ placementId: 'PLACEMENT-01', targetKind: 'actor', targetId: 'ACTOR-01', positionMeters: [1, 0, 2], rotationQuaternion: [0, 0, 0, 1], scale: [1, 1, 1] }],
		events: [{ eventId: 'EVENT-01', cueType: 'move', label: 'Reported movement', status: 'hypothesis', reviewStatus: 'unreviewed', evidenceIds: [evidenceId], actorIds: ['ACTOR-01'], targetRefs: [{ kind: 'actor', targetId: 'ACTOR-01' }], action: { type: 'move_during_interval', fromMeters: [1, 0, 2], toMeters: [3, 0, 2] }, clock: { evidenceId, clockId: `evidence:${evidenceId}`, startMs: 10, endMs: 20, uncertaintyMs: 2 }, sourceEvent: null }],
		environment: { kind: 'indoor', seed: 1, customRecipeId: null, cellSizeMeters: 16, extentMeters: { x: 16, z: 16 }, coordinateStatus: 'illustrative_uncalibrated', calibrationEvidenceIds: [] },
		quality: { profile: 'retro', maxTextureDimension: 128, maxTriangles: 1000, maxInstances: 100, activeSceneMemoryMiB: 8 },
		provenance: { intakeStatus: 'USER_INTAKE_UNVERIFIED', clockPolicy: 'source_local_unaligned', identityPolicy: 'pseudonymous_visual_handles', motivePolicy: 'unknown_or_cited_hypothesis' }
	});
}

describe('scene object inspector projection', () => {
	it('lists a source-linked marker without requiring a presentation action', () => {
		const { planHash: _planHash, ...body } = plan();
		const { action: _action, ...marker } = body.events[0]!;
		const markerPlan = buildSceneGenerationPlanV1({ ...body, events: [{ ...marker, cueType: 'custom' }] });
		const result = buildSceneObjectInspectorV1(markerPlan, { id: 'ACTOR-01', label: 'Person 01' });
		expect(result.events).toHaveLength(1);
		expect(result.conflicts).toEqual([]);
	});
	it('resolves actor description, placement, matching events, source clock and source revision', () => {
		const result = buildSceneObjectInspectorV1(plan(), { id: 'ACTOR-01', label: 'ACTOR-01', room: 'Lobby' });
		expect(result.object.kind).toBe('actor');
		expect(result.object.description).toBe('Neutral placeholder');
		expect(result.object.placement?.positionMeters).toEqual([1, 0, 2]);
		expect(result.events.map((event) => [event.eventId, event.clockId, event.startMs, event.endMs])).toEqual([['EVENT-01', `evidence:${evidenceId}`, 10, 20]]);
		expect(result.sources).toEqual([{ evidenceId, sourceRevision: `sha256:${sha}`, sha256: sha }]);
	});

	it('keeps uncited or unavailable source references visibly unresolved', () => {
		const result = buildSceneObjectInspectorV1(plan(), { id: 'MASK-MESH-1', label: 'Reviewed mask', sourceEvidenceId: '44444444-4444-4444-8444-444444444444' });
		expect(result.object.kind).toBe('scene-object');
		expect(result.sources).toEqual([]);
		expect(result.unresolvedEvidenceIds).toEqual(['44444444-4444-4444-8444-444444444444']);
	});

	it('reports overlapping incompatible movement proposals on their shared target and clock', () => {
		const { planHash: _planHash, ...body } = plan();
		const base = body.events[0]!;
		const conflictingPlan = buildSceneGenerationPlanV1({ ...body, events: [...body.events, {
			...base,
			eventId: 'EVENT-02',
			action: { type: 'move_during_interval', fromMeters: [1, 0, 2], toMeters: [-3, 0, 2] }
		}] });
		const result = buildSceneObjectInspectorV1(conflictingPlan, { id: 'ACTOR-01', label: 'Person 01' });
		expect(result.conflicts).toEqual([{
			kind: 'actor', targetId: 'ACTOR-01', clockId: `evidence:${evidenceId}`,
			eventIds: ['EVENT-01', 'EVENT-02'], reason: 'overlapping_movement'
		}]);
	});

	it('keeps timed light parameters in the inspector without classifying them as movement conflicts', () => {
		const { planHash: _planHash, ...body } = plan();
		const pulsePlan = buildSceneGenerationPlanV1({
			...body,
			events: [{
				...body.events[0]!,
				eventId: 'EVENT-ALARM',
				cueType: 'alarm',
				label: 'Alarm indicator',
				action: { type: 'pulse_light_during_interval', colorHex: '#ffb347', minIntensity: 0.15, maxIntensity: 2.5, periodMs: 900 }
			}]
		});
		const result = buildSceneObjectInspectorV1(pulsePlan, { id: 'ACTOR-01', label: 'Person 01' });
		expect(result.events.map((event) => event.eventId)).toEqual(['EVENT-ALARM']);
		expect(result.conflicts).toEqual([]);
	});
});
