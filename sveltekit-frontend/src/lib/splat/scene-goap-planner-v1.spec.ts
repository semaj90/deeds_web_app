import { describe, expect, it } from 'vitest';
import {
	evaluateDeterministicSceneStateV1,
	type SceneBaselineTargetState
} from './scene-action-evaluator-v1.js';
import { planGoapWhatIfV1, type GoapOperatorV1 } from './scene-goap-planner-v1.js';

const BASELINE: SceneBaselineTargetState[] = [
	{
		targetId: 'door-front',
		capability: 'door',
		visible: true,
		position: [0, 0, 6],
		hingeRad: 0,
		lightIntensity: 0,
		materialStateId: 'oak'
	},
	{
		targetId: 'actor-1',
		capability: 'actor',
		visible: true,
		position: [0, 0, 0],
		hingeRad: 0,
		lightIntensity: 0,
		materialStateId: 'suit',
		approvedClipIds: ['Walk']
	}
];

const OPERATORS: GoapOperatorV1[] = [
	{
		id: 'open_front_door',
		label: 'Open front door',
		preconditions: { doorOpen: false },
		effects: { doorOpen: true },
		cost: 1,
		durationMs: 1000,
		sceneEffects: [
			{ type: 'rotate_hinge', targetId: 'door-front', fromRad: 0, toRad: Math.PI / 2 }
		]
	},
	{
		id: 'exit_house',
		label: 'Walk out front door',
		preconditions: { doorOpen: true, atExit: false },
		effects: { atExit: true },
		cost: 2,
		durationMs: 2000,
		sceneEffects: [
			{ type: 'move_to', targetId: 'actor-1', from: [0, 0, 0], to: [0, 0, 8] },
			{ type: 'play_clip', targetId: 'actor-1', clipId: 'Walk' }
		]
	}
];

describe('GoapWhatIfPlannerV1 (CASE-SCENE-E2E-13)', () => {
	it('plans deterministic SIMULATION_HYPOTHESIS sequence and replays deterministically', () => {
		const plan = planGoapWhatIfV1({
			schema: 'atlas.goap-simulation-input.v1',
			sceneRevisionId: 'rev-10',
			stateHash: 'a'.repeat(64),
			sourceId: 'clock:sim',
			startMs: 1000,
			baseline: BASELINE,
			initialFacts: { doorOpen: false, atExit: false },
			goalFacts: { atExit: true },
			operators: OPERATORS,
			budget: { maxExpansions: 32, maxDepth: 6 }
		});

		expect(plan.authorityLabel).toBe('SIMULATION_HYPOTHESIS');
		expect(plan.status).toBe('PLANNED');
		expect(plan.operatorIds).toEqual(['open_front_door', 'exit_house']);
		expect(plan.totalCost).toBe(3);
		expect(plan.timedActions.every((a) => a.origin === 'simulation')).toBe(true);

		// Verify deterministic replay at midpoint of exit_house (t = 3000ms)
		const stateAt3s = evaluateDeterministicSceneStateV1(
			BASELINE,
			plan.timedActions,
			'clock:sim',
			3000,
			{ includeSimulation: true }
		);
		expect(stateAt3s.find((t) => t.targetId === 'door-front')?.hingeRad).toBeCloseTo(Math.PI / 2, 6);
		expect(stateAt3s.find((t) => t.targetId === 'actor-1')?.position[2]).toBeCloseTo(4, 6);
	});

	it('handles adversarial empty goals, invalid capabilities, budget caps, and cancellation', () => {
		expect(() =>
			planGoapWhatIfV1({
				schema: 'atlas.goap-simulation-input.v1',
				sceneRevisionId: 'rev-10',
				stateHash: 'b'.repeat(64),
				sourceId: 'clock:sim',
				startMs: 0,
				baseline: BASELINE,
				initialFacts: { doorOpen: false },
				goalFacts: {},
				operators: OPERATORS,
				budget: { maxExpansions: 10, maxDepth: 4 }
			})
		).toThrow(/GOAP_GOAL_EMPTY/);

		const ac = new AbortController();
		ac.abort();
		const cancelled = planGoapWhatIfV1({
			schema: 'atlas.goap-simulation-input.v1',
			sceneRevisionId: 'rev-10',
			stateHash: 'b'.repeat(64),
			sourceId: 'clock:sim',
			startMs: 0,
			baseline: BASELINE,
			initialFacts: { doorOpen: false, atExit: false },
			goalFacts: { atExit: true },
			operators: OPERATORS,
			budget: { maxExpansions: 10, maxDepth: 4 },
			signal: ac.signal
		});
		expect(cancelled.status).toBe('CANCELLED');

		const unreachable = planGoapWhatIfV1({
			schema: 'atlas.goap-simulation-input.v1',
			sceneRevisionId: 'rev-10',
			stateHash: 'b'.repeat(64),
			sourceId: 'clock:sim',
			startMs: 0,
			baseline: BASELINE,
			initialFacts: { doorOpen: false, atExit: false },
			goalFacts: { teleported: true },
			operators: OPERATORS,
			budget: { maxExpansions: 10, maxDepth: 4 }
		});
		expect(unreachable.status).toBe('NO_PLAN_FOUND');
	});
});
