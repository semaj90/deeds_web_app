/**
 * Parent Atlas Bounded 6-Action Catalog & Deterministic State Evaluator (v1)
 *
 * Implements S(t) = Evaluate(S_0, E, t) for random-access deterministic timeline
 * scrubbing without playback-history side effects.
 *
 * Invariants:
 * - Six concrete bounded action types only: set_visibility, move_to, rotate_hinge,
 *   set_light, play_clip, set_material.
 * - Target capability validation rejects unsupported actions (e.g. play_clip on static mesh).
 * - Reviewed case events ('reviewed_event') remain strictly separated from optional
 *   GOAP simulation hypotheses ('simulation').
 * - Scrubbing forward, backward, or in random order produces identical S(t).
 */

export type Vec3 = readonly [number, number, number];

export type SceneEffect =
	| {
			type: 'set_visibility';
			targetId: string;
			visible: boolean;
	  }
	| {
			type: 'move_to';
			targetId: string;
			from: Vec3;
			to: Vec3;
	  }
	| {
			type: 'rotate_hinge';
			targetId: string;
			fromRad: number;
			toRad: number;
	  }
	| {
			type: 'set_light';
			targetId: string;
			intensity: number;
	  }
	| {
			type: 'play_clip';
			targetId: string;
			clipId: string;
	  }
	| {
			type: 'set_material';
			targetId: string;
			materialStateId: string;
	  };

export type SceneActionOrigin = 'reviewed_event' | 'simulation';

export interface TimedSceneAction {
	id: string;
	sceneRevisionId: string;
	sourceId: string;
	startMs: number;
	endMs: number;
	effect: SceneEffect;
	origin: SceneActionOrigin;
}

export type SceneTargetCapabilityKind = 'actor' | 'door' | 'light' | 'prop' | 'static';

export interface SceneBaselineTargetState {
	targetId: string;
	capability: SceneTargetCapabilityKind;
	visible: boolean;
	position: [number, number, number];
	hingeRad: number;
	lightIntensity: number;
	materialStateId: string;
	approvedClipIds?: readonly string[];
}

export interface EvaluatedTargetState {
	targetId: string;
	capability: SceneTargetCapabilityKind;
	visible: boolean;
	position: [number, number, number];
	hingeRad: number;
	lightIntensity: number;
	materialStateId: string;
	activeClip: { clipId: string; localTimeSeconds: number } | null;
	appliedActionIds: string[];
	conflictActionIds: string[];
	originsPresent: SceneActionOrigin[];
}

export interface ActionValidationError {
	actionId: string;
	targetId: string;
	reason:
		| 'MISSING_TARGET'
		| 'UNSUPPORTED_CAPABILITY'
		| 'UNAPPROVED_CLIP'
		| 'INVALID_TIME_INTERVAL'
		| 'NON_FINITE_PARAMETER';
	detail: string;
}

const CAPABILITY_MATRIX: Readonly<Record<SceneEffect['type'], ReadonlySet<SceneTargetCapabilityKind>>> = {
	set_visibility: new Set(['actor', 'door', 'light', 'prop', 'static']),
	move_to: new Set(['actor', 'prop']),
	rotate_hinge: new Set(['door']),
	set_light: new Set(['light']),
	play_clip: new Set(['actor']),
	set_material: new Set(['actor', 'door', 'prop', 'static'])
};

export function validateTimedSceneActionsV1(
	baseline: readonly SceneBaselineTargetState[],
	actions: readonly TimedSceneAction[]
): ActionValidationError[] {
	const byId = new Map(baseline.map((t) => [t.targetId, t]));
	const errors: ActionValidationError[] = [];

	for (const action of actions) {
		if (
			!Number.isSafeInteger(action.startMs) ||
			!Number.isSafeInteger(action.endMs) ||
			action.startMs < 0 ||
			action.endMs <= action.startMs
		) {
			errors.push({
				actionId: action.id,
				targetId: action.effect.targetId,
				reason: 'INVALID_TIME_INTERVAL',
				detail: `Invalid interval [${action.startMs}, ${action.endMs}]`
			});
		}

		const target = byId.get(action.effect.targetId);
		if (!target) {
			errors.push({
				actionId: action.id,
				targetId: action.effect.targetId,
				reason: 'MISSING_TARGET',
				detail: `Target '${action.effect.targetId}' not in baseline scene`
			});
			continue;
		}

		if (!CAPABILITY_MATRIX[action.effect.type].has(target.capability)) {
			errors.push({
				actionId: action.id,
				targetId: target.targetId,
				reason: 'UNSUPPORTED_CAPABILITY',
				detail: `Target '${target.targetId}' (${target.capability}) does not support '${action.effect.type}'`
			});
			continue;
		}

		if (action.effect.type === 'move_to') {
			if (![...action.effect.from, ...action.effect.to].every(Number.isFinite)) {
				errors.push({
					actionId: action.id,
					targetId: target.targetId,
					reason: 'NON_FINITE_PARAMETER',
					detail: 'move_to vectors must be finite'
				});
			}
		} else if (action.effect.type === 'rotate_hinge') {
			if (!Number.isFinite(action.effect.fromRad) || !Number.isFinite(action.effect.toRad)) {
				errors.push({
					actionId: action.id,
					targetId: target.targetId,
					reason: 'NON_FINITE_PARAMETER',
					detail: 'rotate_hinge angles must be finite'
				});
			}
		} else if (action.effect.type === 'set_light') {
			if (!Number.isFinite(action.effect.intensity) || action.effect.intensity < 0) {
				errors.push({
					actionId: action.id,
					targetId: target.targetId,
					reason: 'NON_FINITE_PARAMETER',
					detail: 'set_light intensity must be finite and >= 0'
				});
			}
		} else if (action.effect.type === 'play_clip') {
			if (target.approvedClipIds && !target.approvedClipIds.includes(action.effect.clipId)) {
				errors.push({
					actionId: action.id,
					targetId: target.targetId,
					reason: 'UNAPPROVED_CLIP',
					detail: `Clip '${action.effect.clipId}' is not in approvedClipIds for '${target.targetId}'`
				});
			}
		}
	}

	return errors;
}

/**
 * Pure deterministic evaluator: S(t) = Evaluate(S_0, E, t)
 * Evaluates both completed (endMs <= t) and currently active (startMs <= t < endMs)
 * effects from immutable baseline S_0 on the given source clock (`sourceId`).
 * Random-access seeks (forward, backward, arbitrary order) always yield identical S(t).
 */
export function evaluateDeterministicSceneStateV1(
	baseline: readonly SceneBaselineTargetState[],
	actions: readonly TimedSceneAction[],
	sourceId: string,
	sourceTimeMs: number,
	options: { includeSimulation?: boolean } = {}
): EvaluatedTargetState[] {
	if (!sourceId || !Number.isSafeInteger(sourceTimeMs) || sourceTimeMs < 0) {
		throw new RangeError('DETERMINISTIC_EVAL_CLOCK_INVALID');
	}

	const validationErrors = validateTimedSceneActionsV1(baseline, actions);
	if (validationErrors.length > 0) {
		throw new Error(
			`SCENE_ACTION_VALIDATION_FAILED: ${validationErrors[0]!.reason} (${validationErrors[0]!.detail})`
		);
	}

	const includeSim = options.includeSimulation ?? false;
	const states = new Map<string, EvaluatedTargetState>();
	for (const base of baseline) {
		states.set(base.targetId, {
			targetId: base.targetId,
			capability: base.capability,
			visible: base.visible,
			position: [...base.position] as [number, number, number],
			hingeRad: base.hingeRad,
			lightIntensity: base.lightIntensity,
			materialStateId: base.materialStateId,
			activeClip: null,
			appliedActionIds: [],
			conflictActionIds: [],
			originsPresent: []
		});
	}

	// Deterministic canonical order: startMs ASC, endMs ASC, reviewed_event before simulation, id ASC
	const relevant = actions
		.filter(
			(a) =>
				a.sourceId === sourceId &&
				a.startMs <= sourceTimeMs &&
				(includeSim || a.origin === 'reviewed_event')
		)
		.sort(
			(a, b) =>
				a.startMs - b.startMs ||
				a.endMs - b.endMs ||
				(a.origin === b.origin ? 0 : a.origin === 'reviewed_event' ? -1 : 1) ||
				a.id.localeCompare(b.id)
		);

	// Track active overlapping actions per target + channel for conflict detection
	const activeChannelMap = new Map<string, TimedSceneAction[]>();

	for (const action of relevant) {
		const target = states.get(action.effect.targetId);
		if (!target) continue;

		const isActive = sourceTimeMs >= action.startMs && sourceTimeMs < action.endMs;
		const progress = isActive
			? (sourceTimeMs - action.startMs) / (action.endMs - action.startMs)
			: 1; // Completed effect (endMs <= sourceTimeMs)

		if (isActive) {
			const channelKey = `${target.targetId}:${action.effect.type}`;
			const list = activeChannelMap.get(channelKey) ?? [];
			list.push(action);
			activeChannelMap.set(channelKey, list);
		}

		target.appliedActionIds.push(action.id);
		if (!target.originsPresent.includes(action.origin)) {
			target.originsPresent.push(action.origin);
		}

		switch (action.effect.type) {
			case 'set_visibility':
				target.visible = action.effect.visible;
				break;
			case 'move_to':
				target.position = [
					action.effect.from[0] + (action.effect.to[0] - action.effect.from[0]) * progress,
					action.effect.from[1] + (action.effect.to[1] - action.effect.from[1]) * progress,
					action.effect.from[2] + (action.effect.to[2] - action.effect.from[2]) * progress
				];
				break;
			case 'rotate_hinge':
				target.hingeRad =
					action.effect.fromRad + (action.effect.toRad - action.effect.fromRad) * progress;
				break;
			case 'set_light':
				target.lightIntensity = action.effect.intensity;
				break;
			case 'play_clip':
				if (isActive) {
					target.activeClip = {
						clipId: action.effect.clipId,
						localTimeSeconds: (sourceTimeMs - action.startMs) / 1000
					};
				} else {
					target.activeClip = null;
				}
				break;
			case 'set_material':
				target.materialStateId = action.effect.materialStateId;
				break;
		}
	}

	// Flag simultaneous same-channel conflicts on the same target
	for (const [channelKey, list] of activeChannelMap.entries()) {
		if (list.length > 1) {
			const targetId = channelKey.split(':')[0]!;
			const target = states.get(targetId);
			if (target) {
				target.conflictActionIds = [
					...new Set([...target.conflictActionIds, ...list.map((a) => a.id)])
				].sort();
			}
		}
	}

	return [...states.values()];
}

/**
 * Expands a bounded high-level evacuation recipe into concrete SceneEffect actions
 * (set_light + play_clip + move_to), only if targets and capabilities validate.
 */
export function expandEvacuateRecipeV1(input: {
	sceneRevisionId: string;
	sourceId: string;
	startMs: number;
	endMs: number;
	actorId: string;
	alarmLightId: string;
	from: Vec3;
	to: Vec3;
	clipId: string;
	baseline: readonly SceneBaselineTargetState[];
}): TimedSceneAction[] {
	const actions: TimedSceneAction[] = [
		{
			id: `evac_light_${input.alarmLightId}_${input.startMs}`,
			sceneRevisionId: input.sceneRevisionId,
			sourceId: input.sourceId,
			startMs: input.startMs,
			endMs: input.endMs,
			effect: { type: 'set_light', targetId: input.alarmLightId, intensity: 2.5 },
			origin: 'simulation'
		},
		{
			id: `evac_clip_${input.actorId}_${input.startMs}`,
			sceneRevisionId: input.sceneRevisionId,
			sourceId: input.sourceId,
			startMs: input.startMs,
			endMs: input.endMs,
			effect: { type: 'play_clip', targetId: input.actorId, clipId: input.clipId },
			origin: 'simulation'
		},
		{
			id: `evac_move_${input.actorId}_${input.startMs}`,
			sceneRevisionId: input.sceneRevisionId,
			sourceId: input.sourceId,
			startMs: input.startMs,
			endMs: input.endMs,
			effect: { type: 'move_to', targetId: input.actorId, from: input.from, to: input.to },
			origin: 'simulation'
		}
	];

	const errors = validateTimedSceneActionsV1(input.baseline, actions);
	if (errors.length > 0) {
		throw new Error(`EVACUATE_RECIPE_INVALID: ${errors[0]!.reason} (${errors[0]!.detail})`);
	}
	return actions;
}
