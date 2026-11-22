import { describe, expect, it } from 'vitest';
import {
	evaluateDeterministicSceneStateV1,
	expandEvacuateRecipeV1,
	validateTimedSceneActionsV1,
	type SceneBaselineTargetState,
	type TimedSceneAction
} from './scene-action-evaluator-v1.js';

const BASELINE: SceneBaselineTargetState[] = [
	{
		targetId: 'door-front',
		capability: 'door',
		visible: true,
		position: [0, 0, 6],
		hingeRad: 0,
		lightIntensity: 0,
		materialStateId: 'oak-default'
	},
	{
		targetId: 'actor-1',
		capability: 'actor',
		visible: true,
		position: [0, 0, 0],
		hingeRad: 0,
		lightIntensity: 0,
		materialStateId: 'suit-navy',
		approvedClipIds: ['Walk', 'Idle', 'EvacuateRun']
	},
	{
		targetId: 'alarm-light-1',
		capability: 'light',
		visible: true,
		position: [0, 2.7, 0],
		hingeRad: 0,
		lightIntensity: 0.2,
		materialStateId: 'fixture'
	},
	{
		targetId: 'wall-north',
		capability: 'static',
		visible: true,
		position: [0, 1.4, -6],
		hingeRad: 0,
		lightIntensity: 0,
		materialStateId: 'plaster-ivory'
	}
];

describe('Bounded 6-Action Catalog & Deterministic Evaluator (CASE-SCENE-E2E-13)', () => {
	it('produces identical S(t) regardless of forward, backward, or random seek order', () => {
		const actions: TimedSceneAction[] = [
			{
				id: 'act-open-door',
				sceneRevisionId: 'rev-1',
				sourceId: 'clock:cam1',
				startMs: 1000,
				endMs: 2000,
				effect: { type: 'rotate_hinge', targetId: 'door-front', fromRad: 0, toRad: Math.PI / 2 },
				origin: 'reviewed_event'
			},
			{
				id: 'act-actor-walk',
				sceneRevisionId: 'rev-1',
				sourceId: 'clock:cam1',
				startMs: 1500,
				endMs: 3500,
				effect: { type: 'move_to', targetId: 'actor-1', from: [0, 0, 0], to: [4, 0, 0] },
				origin: 'reviewed_event'
			},
			{
				id: 'act-actor-clip',
				sceneRevisionId: 'rev-1',
				sourceId: 'clock:cam1',
				startMs: 1500,
				endMs: 3500,
				effect: { type: 'play_clip', targetId: 'actor-1', clipId: 'Walk' },
				origin: 'reviewed_event'
			},
			{
				id: 'act-alarm-on',
				sceneRevisionId: 'rev-1',
				sourceId: 'clock:cam1',
				startMs: 2000,
				endMs: 4000,
				effect: { type: 'set_light', targetId: 'alarm-light-1', intensity: 3.0 },
				origin: 'reviewed_event'
			}
		];

		// Random-access seek sequence: forward -> past end -> backward before start -> midpoint
		const snap500A = evaluateDeterministicSceneStateV1(BASELINE, actions, 'clock:cam1', 500);
		const snap2500A = evaluateDeterministicSceneStateV1(BASELINE, actions, 'clock:cam1', 2500);
		const snap1500A = evaluateDeterministicSceneStateV1(BASELINE, actions, 'clock:cam1', 1500);
		const snap500B = evaluateDeterministicSceneStateV1(BASELINE, actions, 'clock:cam1', 500);
		const snap2500B = evaluateDeterministicSceneStateV1(BASELINE, actions, 'clock:cam1', 2500);

		expect(snap500A).toEqual(snap500B);
		expect(snap2500A).toEqual(snap2500B);

		// Before 1000ms: door is closed (0 rad), alarm at baseline 0.2
		expect(snap500B.find((t) => t.targetId === 'door-front')?.hingeRad).toBe(0);
		expect(snap500B.find((t) => t.targetId === 'alarm-light-1')?.lightIntensity).toBe(0.2);

		// At 1500ms: door is halfway open (pi/4), actor clip local time is 0s
		expect(snap1500A.find((t) => t.targetId === 'door-front')?.hingeRad).toBeCloseTo(Math.PI / 4, 6);
		expect(snap1500A.find((t) => t.targetId === 'actor-1')?.activeClip).toEqual({
			clipId: 'Walk',
			localTimeSeconds: 0
		});

		// At 2500ms: door completed opening (pi/2), actor halfway at x=2, clip localTime=1.0s, alarm at 3.0
		expect(snap2500A.find((t) => t.targetId === 'door-front')?.hingeRad).toBeCloseTo(Math.PI / 2, 6);
		expect(snap2500A.find((t) => t.targetId === 'actor-1')?.position[0]).toBeCloseTo(2.0, 6);
		expect(snap2500A.find((t) => t.targetId === 'actor-1')?.activeClip).toEqual({
			clipId: 'Walk',
			localTimeSeconds: 1.0
		});
		expect(snap2500A.find((t) => t.targetId === 'alarm-light-1')?.lightIntensity).toBe(3.0);
	});

	it('rejects unsupported target capabilities and unapproved clips', () => {
		const badActions: TimedSceneAction[] = [
			{
				id: 'bad-clip-on-wall',
				sceneRevisionId: 'rev-1',
				sourceId: 'clock:cam1',
				startMs: 0,
				endMs: 1000,
				effect: { type: 'play_clip', targetId: 'wall-north', clipId: 'Walk' },
				origin: 'reviewed_event'
			},
			{
				id: 'bad-hinge-on-light',
				sceneRevisionId: 'rev-1',
				sourceId: 'clock:cam1',
				startMs: 0,
				endMs: 1000,
				effect: { type: 'rotate_hinge', targetId: 'alarm-light-1', fromRad: 0, toRad: 1 },
				origin: 'reviewed_event'
			},
			{
				id: 'unapproved-clip',
				sceneRevisionId: 'rev-1',
				sourceId: 'clock:cam1',
				startMs: 0,
				endMs: 1000,
				effect: { type: 'play_clip', targetId: 'actor-1', clipId: 'Backflip' },
				origin: 'simulation'
			}
		];

		const errors = validateTimedSceneActionsV1(BASELINE, badActions);
		expect(errors.map((e) => e.reason)).toEqual([
			'UNSUPPORTED_CAPABILITY',
			'UNSUPPORTED_CAPABILITY',
			'UNAPPROVED_CLIP'
		]);
	});

	it('keeps reviewed_event separate from simulation (GOAP) and expands evacuate recipe', () => {
		const simActions = expandEvacuateRecipeV1({
			sceneRevisionId: 'rev-1',
			sourceId: 'clock:sim',
			startMs: 1000,
			endMs: 5000,
			actorId: 'actor-1',
			alarmLightId: 'alarm-light-1',
			from: [0, 0, 0],
			to: [8, 0, 0],
			clipId: 'EvacuateRun',
			baseline: BASELINE
		});

		// Without includeSimulation, simulation actions do not mutate reviewed evidence state
		const evidenceOnly = evaluateDeterministicSceneStateV1(BASELINE, simActions, 'clock:sim', 3000, {
			includeSimulation: false
		});
		expect(evidenceOnly.find((t) => t.targetId === 'actor-1')?.position).toEqual([0, 0, 0]);
		expect(evidenceOnly.find((t) => t.targetId === 'alarm-light-1')?.lightIntensity).toBe(0.2);

		// With includeSimulation: true, hypothetical GOAP preview evaluates cleanly
		const withSim = evaluateDeterministicSceneStateV1(BASELINE, simActions, 'clock:sim', 3000, {
			includeSimulation: true
		});
		expect(withSim.find((t) => t.targetId === 'actor-1')?.position[0]).toBeCloseTo(4, 6);
		expect(withSim.find((t) => t.targetId === 'actor-1')?.originsPresent).toEqual(['simulation']);
		expect(withSim.find((t) => t.targetId === 'alarm-light-1')?.lightIntensity).toBe(2.5);
	});
});
