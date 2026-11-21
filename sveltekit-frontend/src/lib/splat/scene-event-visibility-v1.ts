import type { SceneTimelineCueV1 } from './scene-document-v1.js';

export interface SceneTimedEventV1 {
	eventId: string;
	clockId: string;
	startMs: number;
	endMs: number;
	status: 'provisional' | 'accepted' | 'disputed' | 'unresolved';
	targetRefs?: Array<{ kind: 'actor' | 'primitive' | 'asset'; targetId: string }>;
	/** Optional deterministic presentation behavior; never changes the event's evidence/review meaning. */
	action?: SceneEventActionV1;
}

/** Project a validated saved cue into the renderer's pure timeline evaluator. */
export function sceneTimelineCueToRuntimeV1(cue: SceneTimelineCueV1): SceneTimedEventV1 {
	const action: SceneEventActionV1 = cue.action.type === 'visible_during_interval'
		? { type: 'visible_during_interval', visible: cue.action.visible }
		: { type: 'move_during_interval',
			fromMeters: [cue.action.fromMeters[0]!, cue.action.fromMeters[1]!, cue.action.fromMeters[2]!],
			toMeters: [cue.action.toMeters[0]!, cue.action.toMeters[1]!, cue.action.toMeters[2]!] };
	return {
		eventId: cue.eventId,
		clockId: cue.clockId,
		startMs: cue.startMs,
		endMs: cue.endMs,
		status: 'provisional',
		targetRefs: cue.targets.map((target) => ({
			kind: target.role === 'ACTOR' ? 'actor' : 'primitive',
			targetId: target.objectId
		})),
		action
	};
}

export type SceneEventActionV1 =
	| { type: 'visible_during_interval'; visible: boolean }
	| { type: 'move_during_interval'; fromMeters: [number, number, number]; toMeters: [number, number, number] }
	| { type: 'pulse_light_during_interval'; colorHex: string; minIntensity: number; maxIntensity: number; periodMs: number };

export interface SceneTimelineTargetV1 {
	kind: 'actor' | 'primitive' | 'asset';
	targetId: string;
	visible: boolean;
	positionMeters: [number, number, number];
}

export interface SceneTimelineTargetStateV1 {
	kind: SceneTimelineTargetV1['kind'];
	targetId: string;
	visible: boolean;
	positionMeters: [number, number, number];
	activeEventIds: string[];
	conflictEventIds: string[];
}

export interface SceneEventConflictV1 {
	kind: SceneTimelineTargetV1['kind'];
	targetId: string;
	clockId: string;
	eventIds: [string, string];
	reason: 'contradictory_visibility' | 'overlapping_movement';
}

/** Find overlapping same-clock cues that ask one target to take incompatible actions. */
export function findSceneEventConflictsV1(events: readonly SceneTimedEventV1[]): SceneEventConflictV1[] {
	const conflicts: SceneEventConflictV1[] = [];
	for (let leftIndex = 0; leftIndex < events.length; leftIndex++) {
		const left = events[leftIndex]!;
		if (!left.action) continue;
		for (let rightIndex = leftIndex + 1; rightIndex < events.length; rightIndex++) {
			const right = events[rightIndex]!;
			if (!right.action || left.clockId !== right.clockId || left.startMs >= right.endMs || right.startMs >= left.endMs) continue;
			const reason = left.action.type === 'visible_during_interval' && right.action.type === 'visible_during_interval'
				? left.action.visible !== right.action.visible ? 'contradictory_visibility' as const : null
				: left.action.type === 'move_during_interval' && right.action.type === 'move_during_interval'
					? JSON.stringify([left.action.fromMeters, left.action.toMeters]) !== JSON.stringify([right.action.fromMeters, right.action.toMeters]) ? 'overlapping_movement' as const : null
					: null;
			if (!reason) continue;
			for (const leftTarget of left.targetRefs ?? []) {
				if (!(right.targetRefs ?? []).some((target) => target.kind === leftTarget.kind && target.targetId === leftTarget.targetId)) continue;
				conflicts.push({ kind: leftTarget.kind, targetId: leftTarget.targetId, clockId: left.clockId,
					eventIds: [left.eventId, right.eventId].sort() as [string, string], reason });
			}
		}
	}
	return conflicts.sort((a, b) => a.clockId.localeCompare(b.clockId) || a.kind.localeCompare(b.kind) ||
		a.targetId.localeCompare(b.targetId) || a.eventIds[0].localeCompare(b.eventIds[0]) || a.eventIds[1].localeCompare(b.eventIds[1]));
}

/**
 * Evaluate a scene decoration against one explicit source clock. This helper
 * never aligns clocks and does not treat visibility as evidence or approval.
 */
export function isSceneEventActiveV1(event: SceneTimedEventV1, clockId: string, sourceTimeMs: number): boolean {
	if (!event.eventId || !event.clockId || !clockId || !Number.isSafeInteger(event.startMs) ||
		!Number.isSafeInteger(event.endMs) || event.startMs < 0 || event.endMs <= event.startMs ||
		!Number.isSafeInteger(sourceTimeMs) || sourceTimeMs < 0) {
		throw new RangeError('SCENE_EVENT_TIME_BINDING_INVALID');
	}
	return event.clockId === clockId && sourceTimeMs >= event.startMs && sourceTimeMs < event.endMs;
}

/** Toggle a derived visual node only; keep the event record and review state intact. */
export function applySceneEventVisibilityV1(node: { visible: boolean }, event: SceneTimedEventV1, clockId: string, sourceTimeMs: number): boolean {
	const active = isSceneEventActiveV1(event, clockId, sourceTimeMs);
	node.visible = active;
	return active;
}

/**
 * Resolve authored event cues to deterministic presentation state at one
 * source-clock time. This is intentionally a pure projection: it neither
 * aligns clocks nor changes evidence, review, or persisted scene state.
 */
export function evaluateSceneTimelineV1(
	targets: readonly SceneTimelineTargetV1[],
	events: readonly SceneTimedEventV1[],
	clockId: string,
	sourceTimeMs: number
): SceneTimelineTargetStateV1[] {
	if (!clockId || !Number.isSafeInteger(sourceTimeMs) || sourceTimeMs < 0) throw new RangeError('SCENE_EVENT_TIME_BINDING_INVALID');
	for (const target of targets) {
		if (!target.targetId || !target.kind || target.positionMeters.length !== 3 || !target.positionMeters.every(Number.isFinite)) {
			throw new RangeError('SCENE_EVENT_TARGET_INVALID');
		}
	}
	const states = new Map(targets.map((target) => [
		`${target.kind}:${target.targetId}`,
		{ ...target, positionMeters: [...target.positionMeters] as [number, number, number], activeEventIds: [] as string[], conflictEventIds: [] as string[], activeEvents: [] as SceneTimedEventV1[] }
	]));
	for (const event of events) {
		if (!isSceneEventActiveV1(event, clockId, sourceTimeMs)) continue;
		for (const ref of event.targetRefs ?? []) {
			const state = states.get(`${ref.kind}:${ref.targetId}`);
			if (!state) continue;
			state.activeEventIds.push(event.eventId);
			if (event.action) state.activeEvents.push(event);
		}
	}
	for (const state of states.values()) {
		state.activeEventIds.sort();
		const visibilityEvents = state.activeEvents.filter((event) => event.action?.type === 'visible_during_interval');
		const visibilityValues = new Set(visibilityEvents.map((event) => (event.action as Extract<SceneEventActionV1, { type: 'visible_during_interval' }>).visible));
		if (visibilityValues.size > 1) state.conflictEventIds.push(...visibilityEvents.map((event) => event.eventId));
		else if (visibilityEvents.length) state.visible = (visibilityEvents[0]!.action as Extract<SceneEventActionV1, { type: 'visible_during_interval' }>).visible;

		const movementEvents = state.activeEvents.filter((event) => event.action?.type === 'move_during_interval');
		const movementResults = movementEvents.map((event) => {
			const action = event.action as Extract<SceneEventActionV1, { type: 'move_during_interval' }>;
			if (![...action.fromMeters, ...action.toMeters].every(Number.isFinite)) throw new RangeError('SCENE_EVENT_PATH_INVALID');
			const duration = event.endMs - event.startMs;
			const progress = Math.max(0, Math.min(1, (sourceTimeMs - event.startMs) / duration));
			return { eventId: event.eventId, position: action.fromMeters.map((start, axis) => start + (action.toMeters[axis]! - start) * progress) as [number, number, number] };
		});
		const movementPositions = new Set(movementResults.map(({ position }) => position.join(',')));
		if (movementPositions.size > 1) state.conflictEventIds.push(...movementResults.map((result) => result.eventId));
		else if (movementResults.length) state.positionMeters = movementResults[0]!.position;
		state.conflictEventIds = [...new Set(state.conflictEventIds)].sort();
	}
	return [...states.values()].map(({ kind, targetId, visible, positionMeters, activeEventIds, conflictEventIds }) => ({ kind, targetId, visible, positionMeters, activeEventIds, conflictEventIds }));
}
