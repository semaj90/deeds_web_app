/**
 * Parent Atlas Optional GOAP What-If Reference Planner (v1)
 *
 * Implements the bounded TypeScript GOAP planner for CASE-SCENE-E2E-13:
 * - Strictly separates simulated hypotheses ('SIMULATION_HYPOTHESIS', origin: 'simulation')
 *   from reviewed case events.
 * - Deterministic bounded search over preconditions, effects, and costs.
 * - Validates every emitted SceneEffect against target capabilities via validateTimedSceneActionsV1.
 * - Supports AbortSignal cancellation and adversarial invalid-state/goal/budget checks.
 */

import { z } from 'zod';
import {
	validateTimedSceneActionsV1,
	type SceneBaselineTargetState,
	type SceneEffect,
	type TimedSceneAction
} from './scene-action-evaluator-v1.js';

export type GoapFactValueV1 = boolean | string | number;
export type GoapFactMapV1 = Record<string, GoapFactValueV1>;

export interface GoapOperatorV1 {
	readonly id: string;
	readonly label: string;
	readonly preconditions: GoapFactMapV1;
	readonly effects: GoapFactMapV1;
	readonly cost: number;
	readonly durationMs: number;
	readonly sceneEffects: readonly SceneEffect[];
}

export const goapBudgetSchemaV1 = z
	.object({
		maxExpansions: z.number().int().min(1).max(2000),
		maxDepth: z.number().int().min(1).max(32)
	})
	.strict();

export const goapSimulationInputSchemaV1 = z
	.object({
		schema: z.literal('atlas.goap-simulation-input.v1'),
		sceneRevisionId: z.string().min(1).max(120),
		stateHash: z.string().regex(/^[0-9a-f]{64}$/),
		sourceId: z.string().min(1).max(120),
		startMs: z.number().int().nonnegative()
	})
	.strict();

export interface GoapSimulationInputV1 {
	readonly schema: 'atlas.goap-simulation-input.v1';
	readonly sceneRevisionId: string;
	readonly stateHash: string;
	readonly sourceId: string;
	readonly startMs: number;
	readonly baseline: readonly SceneBaselineTargetState[];
	readonly initialFacts: GoapFactMapV1;
	readonly goalFacts: GoapFactMapV1;
	readonly operators: readonly GoapOperatorV1[];
	readonly budget: { readonly maxExpansions: number; readonly maxDepth: number };
	readonly signal?: AbortSignal;
}

export interface GoapSimulationPlanV1 {
	readonly schema: 'atlas.goap-simulation-plan.v1';
	readonly authorityLabel: 'SIMULATION_HYPOTHESIS';
	readonly sceneRevisionId: string;
	readonly stateHash: string;
	readonly status: 'PLANNED' | 'NO_PLAN_FOUND' | 'BUDGET_EXCEEDED' | 'CANCELLED';
	readonly totalCost: number;
	readonly expansionsUsed: number;
	readonly operatorIds: string[];
	readonly timedActions: TimedSceneAction[];
}

function satisfiesFacts(state: GoapFactMapV1, required: GoapFactMapV1): boolean {
	for (const [k, v] of Object.entries(required)) {
		if (state[k] !== v) return false;
	}
	return true;
}

function applyFacts(state: GoapFactMapV1, delta: GoapFactMapV1): GoapFactMapV1 {
	return { ...state, ...delta };
}

function canonicalFactKey(state: GoapFactMapV1): string {
	const entries = Object.entries(state).sort(([a], [b]) => a.localeCompare(b));
	return JSON.stringify(entries);
}

/**
 * Deterministic bounded Dijkstra/uniform-cost GOAP planner.
 * Never mutates evidence timelines or persists review state.
 */
export function planGoapWhatIfV1(input: GoapSimulationInputV1): GoapSimulationPlanV1 {
	goapSimulationInputSchemaV1.parse({
		schema: input.schema,
		sceneRevisionId: input.sceneRevisionId,
		stateHash: input.stateHash,
		sourceId: input.sourceId,
		startMs: input.startMs
	});
	const budget = goapBudgetSchemaV1.parse(input.budget);

	if (Object.keys(input.goalFacts).length === 0) {
		throw new RangeError('GOAP_GOAL_EMPTY: At least one goal fact is required');
	}

	const sortedOps = [...input.operators].sort((a, b) => a.id.localeCompare(b.id));
	for (const op of sortedOps) {
		if (!Number.isFinite(op.cost) || op.cost <= 0) {
			throw new RangeError(`GOAP_OPERATOR_INVALID_COST: '${op.id}' must have positive finite cost`);
		}
		if (!Number.isSafeInteger(op.durationMs) || op.durationMs <= 0) {
			throw new RangeError(
				`GOAP_OPERATOR_INVALID_DURATION: '${op.id}' must have positive integer durationMs`
			);
		}
		// Pre-validate every emitted SceneEffect against baseline capabilities
		const dummyActions: TimedSceneAction[] = op.sceneEffects.map((effect, idx) => ({
			id: `${op.id}__${idx}`,
			sceneRevisionId: input.sceneRevisionId,
			sourceId: input.sourceId,
			startMs: input.startMs,
			endMs: input.startMs + op.durationMs,
			effect,
			origin: 'simulation'
		}));
		const errors = validateTimedSceneActionsV1(input.baseline, dummyActions);
		if (errors.length > 0) {
			throw new Error(
				`GOAP_OPERATOR_CAPABILITY_REJECTED: '${op.id}' -> ${errors[0]!.reason} (${errors[0]!.detail})`
			);
		}
	}

	interface SearchNode {
		facts: GoapFactMapV1;
		cost: number;
		ops: GoapOperatorV1[];
	}

	const queue: SearchNode[] = [{ facts: { ...input.initialFacts }, cost: 0, ops: [] }];
	const bestCostByState = new Map<string, number>([[canonicalFactKey(input.initialFacts), 0]]);
	let expansionsUsed = 0;

	while (queue.length > 0) {
		if (input.signal?.aborted) {
			return {
				schema: 'atlas.goap-simulation-plan.v1',
				authorityLabel: 'SIMULATION_HYPOTHESIS',
				sceneRevisionId: input.sceneRevisionId,
				stateHash: input.stateHash,
				status: 'CANCELLED',
				totalCost: 0,
				expansionsUsed,
				operatorIds: [],
				timedActions: []
			};
		}

		// Deterministic ordering: lowest cost -> fewest steps -> lexicographical operator IDs
		queue.sort(
			(a, b) =>
				a.cost - b.cost ||
				a.ops.length - b.ops.length ||
				a.ops.map((o) => o.id).join(',').localeCompare(b.ops.map((o) => o.id).join(','))
		);

		const current = queue.shift()!;
		if (satisfiesFacts(current.facts, input.goalFacts)) {
			let cursorMs = input.startMs;
			const timedActions: TimedSceneAction[] = [];
			for (let stepIdx = 0; stepIdx < current.ops.length; stepIdx++) {
				const op = current.ops[stepIdx]!;
				const stepStart = cursorMs;
				const stepEnd = cursorMs + op.durationMs;
				for (let effIdx = 0; effIdx < op.sceneEffects.length; effIdx++) {
					timedActions.push({
						id: `sim_${stepIdx}_${op.id}_${effIdx}`,
						sceneRevisionId: input.sceneRevisionId,
						sourceId: input.sourceId,
						startMs: stepStart,
						endMs: stepEnd,
						effect: op.sceneEffects[effIdx]!,
						origin: 'simulation'
					});
				}
				cursorMs = stepEnd;
			}

			return {
				schema: 'atlas.goap-simulation-plan.v1',
				authorityLabel: 'SIMULATION_HYPOTHESIS',
				sceneRevisionId: input.sceneRevisionId,
				stateHash: input.stateHash,
				status: 'PLANNED',
				totalCost: current.cost,
				expansionsUsed,
				operatorIds: current.ops.map((o) => o.id),
				timedActions
			};
		}

		if (expansionsUsed >= budget.maxExpansions) {
			return {
				schema: 'atlas.goap-simulation-plan.v1',
				authorityLabel: 'SIMULATION_HYPOTHESIS',
				sceneRevisionId: input.sceneRevisionId,
				stateHash: input.stateHash,
				status: 'BUDGET_EXCEEDED',
				totalCost: 0,
				expansionsUsed,
				operatorIds: [],
				timedActions: []
			};
		}

		expansionsUsed++;
		if (current.ops.length >= budget.maxDepth) continue;

		for (const op of sortedOps) {
			if (!satisfiesFacts(current.facts, op.preconditions)) continue;
			const nextFacts = applyFacts(current.facts, op.effects);
			const nextKey = canonicalFactKey(nextFacts);
			const nextCost = current.cost + op.cost;
			const prevBest = bestCostByState.get(nextKey);
			if (prevBest !== undefined && prevBest <= nextCost) continue;

			bestCostByState.set(nextKey, nextCost);
			queue.push({
				facts: nextFacts,
				cost: nextCost,
				ops: [...current.ops, op]
			});
		}
	}

	return {
		schema: 'atlas.goap-simulation-plan.v1',
		authorityLabel: 'SIMULATION_HYPOTHESIS',
		sceneRevisionId: input.sceneRevisionId,
		stateHash: input.stateHash,
		status: 'NO_PLAN_FOUND',
		totalCost: 0,
		expansionsUsed,
		operatorIds: [],
		timedActions: []
	};
}
