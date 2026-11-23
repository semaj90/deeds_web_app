import { describe, expect, it } from 'vitest';
import { createSceneCellResidencyV1 } from './scene-cell-residency-v1.js';
import { applySceneEventVisibilityV1, evaluateSceneTimelineV1, isSceneEventActiveV1 } from './scene-event-visibility-v1.js';
import { createSceneEnvironmentCellThreeV1, setSceneCellTimeV1 } from './scene-environment-cell-three-v1.js';

describe('large scene cells and source-clock event visibility', () => {
	it('bounds a populated-world neighborhood and unloads with a grace period', () => {
		const cells = createSceneCellResidencyV1({ cellSizeMeters: 64, radiusCells: 2, maxResidentCells: 64, graceMs: 1000 });
		const initial = cells.update([0, 0, 0], 1000);
		expect(initial.load).toHaveLength(25);
		expect(initial.resident.length).toBeLessThanOrEqual(64);
		const moved = cells.update([640, 0, 0], 1500);
		expect(moved.unload).toHaveLength(0);
		const expired = cells.update([640, 0, 0], 2100);
		expect(expired.unload.length).toBeGreaterThan(0);
		expect(expired.resident.length).toBeLessThanOrEqual(64);
	});

	it('adapts the resident radius to playback and pins the selected edit cell within the cap', () => {
		const cells = createSceneCellResidencyV1({ cellSizeMeters: 32, radiusCells: 2, maxResidentCells: 25, graceMs: 500 });
		const navigation = cells.update([0, 0, 0], 1000, { radiusCells: 2, maxResidentCells: 25 });
		expect(navigation.resident).toHaveLength(25);
		const edit = cells.update([32, 0, 0], 2000, { radiusCells: 1, maxResidentCells: 9, pinnedPositions: [[320, 0, 0]] });
		expect(edit.resident.length).toBeLessThanOrEqual(9);
		expect(edit.resident.some((cell) => cell.key === '10:0')).toBe(true);
		expect(edit.unload.length).toBeGreaterThan(0);
		expect(() => cells.update([0, 0, 0], 3000, { maxResidentCells: 65 })).toThrow('SCENE_CELL_RESIDENCY_POLICY_INVALID');
	});

	it('uses a half-open event interval and refuses implicit cross-clock alignment', () => {
		const bonfire = { eventId: 'PROP-BONFIRE-01', clockId: 'BEACH-CAM-A', startMs: 10_000, endMs: 20_000, status: 'provisional' as const };
		expect(isSceneEventActiveV1(bonfire, 'BEACH-CAM-A', 10_000)).toBe(true);
		expect(isSceneEventActiveV1(bonfire, 'BEACH-CAM-A', 20_000)).toBe(false);
		expect(isSceneEventActiveV1(bonfire, 'BEACH-CAM-B', 15_000)).toBe(false);
		const node = { visible: true };
		expect(applySceneEventVisibilityV1(node, bonfire, 'BEACH-CAM-B', 15_000)).toBe(false);
		expect(node.visible).toBe(false);
	});

	it('builds deterministic instanced city cells and gates the bonfire to its source lane', () => {
		const city = createSceneEnvironmentCellThreeV1('urban', -2, 4);
		const repeated = createSceneEnvironmentCellThreeV1('urban', -2, 4);
		const batches = city.group.children.filter((child) => 'isInstancedMesh' in child) as Array<{ count: number; instanceMatrix: { array: Float32Array } }>;
		const repeatedBatches = repeated.group.children.filter((child) => 'isInstancedMesh' in child) as typeof batches;
		expect(batches.length).toBe(4);
		expect(city.instanceCount).toBe(74);
		expect(batches.map((batch) => batch.count)).toEqual([18, 8, 24, 24]);
		expect(Array.from(batches[0]!.instanceMatrix.array)).toEqual(Array.from(repeatedBatches[0]!.instanceMatrix.array));
		const beach = createSceneEnvironmentCellThreeV1('beach', 0, 0);
		const bonfire = beach.timedNodes[0]!.node;
		setSceneCellTimeV1(beach, 'BEACH-CAM-B', 25_000);
		expect(bonfire.visible).toBe(false);
		setSceneCellTimeV1(beach, 'BEACH-CAM-A', 25_000);
		expect(bonfire.visible).toBe(true);
	});

	it('binds a timed prop to its editable clock interval and target reference', () => {
		const cue = { eventId: 'DEMO-BONFIRE-01', clockId: 'BEACH-CAM-B', startMs: 5_000, endMs: 9_000, status: 'provisional' as const, targetRefs: [{ kind: 'primitive' as const, targetId: 'PROP-BONFIRE-01' }] };
		const beach = createSceneEnvironmentCellThreeV1('beach', 0, 0, 32, { timedEventOverrides: { [cue.eventId]: cue } });
		const fire = beach.timedNodes[0]!.node;
		setSceneCellTimeV1(beach, 'BEACH-CAM-A', 7_000);
		expect(fire.visible).toBe(false);
		setSceneCellTimeV1(beach, 'BEACH-CAM-B', 5_000);
		expect(fire.visible).toBe(true);
		expect(fire.userData.targetRefs).toEqual([{ kind: 'primitive', targetId: 'PROP-BONFIRE-01' }]);
		const wrongTarget = createSceneEnvironmentCellThreeV1('beach', 0, 0, 32, { timedEventOverrides: { [cue.eventId]: { ...cue, targetRefs: [{ kind: 'primitive', targetId: 'UNRELATED-PROP' }] } } });
		setSceneCellTimeV1(wrongTarget, 'BEACH-CAM-B', 7_000);
		expect(wrongTarget.timedNodes[0]?.node.visible).toBe(false);
	});

	it('moves only the explicitly bound actor on its own source clock using absolute time', () => {
		const targets = [{ kind: 'actor' as const, targetId: 'ACTOR-01', visible: true, positionMeters: [1, 0, 2] as [number, number, number] }];
		const cues = [{
			eventId: 'EVENT-ENTRY-01', clockId: 'BANK-CAM-A', startMs: 10_000, endMs: 14_000, status: 'provisional' as const,
			targetRefs: [{ kind: 'actor' as const, targetId: 'ACTOR-01' }],
			action: { type: 'move_during_interval' as const, fromMeters: [1, 0, 2] as [number, number, number], toMeters: [5, 0, 2] as [number, number, number] }
		}];
		expect(evaluateSceneTimelineV1(targets, cues, 'BANK-CAM-A', 12_000)[0]?.positionMeters).toEqual([3, 0, 2]);
		expect(evaluateSceneTimelineV1(targets, cues, 'BANK-CAM-B', 12_000)[0]?.positionMeters).toEqual([1, 0, 2]);
		expect(evaluateSceneTimelineV1(targets, cues, 'BANK-CAM-A', 14_000)[0]?.positionMeters).toEqual([1, 0, 2]);
		expect(evaluateSceneTimelineV1(targets, cues, 'BANK-CAM-A', 12_000)[0]?.activeEventIds).toEqual(['EVENT-ENTRY-01']);
		expect(() => evaluateSceneTimelineV1(targets, [{ ...cues[0]!, action: { type: 'move_during_interval', fromMeters: [Number.NaN, 0, 0], toMeters: [1, 0, 0] } }], 'BANK-CAM-A', 12_000)).toThrow('SCENE_EVENT_PATH_INVALID');
	});

	it('suppresses input-order-dependent movement when same-clock overlapping proposals conflict', () => {
		const target = { kind: 'actor' as const, targetId: 'ACTOR-01', visible: true, positionMeters: [1, 0, 2] as [number, number, number] };
		const first = { eventId: 'EVENT-A', clockId: 'CAM-A', startMs: 0, endMs: 100, status: 'provisional' as const,
			targetRefs: [{ kind: 'actor' as const, targetId: 'ACTOR-01' }], action: { type: 'move_during_interval' as const, fromMeters: [0, 0, 0] as [number, number, number], toMeters: [10, 0, 0] as [number, number, number] } };
		const second = { ...first, eventId: 'EVENT-B', action: { ...first.action, toMeters: [0, 0, 10] as [number, number, number] } };
		const forward = evaluateSceneTimelineV1([target], [first, second], 'CAM-A', 50)[0]!;
		const reverse = evaluateSceneTimelineV1([target], [second, first], 'CAM-A', 50)[0]!;
		expect(forward.positionMeters).toEqual([1, 0, 2]);
		expect(forward.conflictEventIds).toEqual(['EVENT-A', 'EVENT-B']);
		expect(reverse).toEqual(forward);
	});

	it('keeps an overnight report interval monotonic and isolated from another witness clock', () => {
		const overnight = {
			eventId: 'REPORTED-BONFIRE-WITNESS-A', clockId: 'WITNESS-A', startMs: 23 * 60 * 60 * 1000, endMs: 26 * 60 * 60 * 1000,
			status: 'provisional' as const, targetRefs: [{ kind: 'primitive' as const, targetId: 'FIRE-01' }],
			action: { type: 'visible_during_interval' as const, visible: true }
		};
		const fire = [{ kind: 'primitive' as const, targetId: 'FIRE-01', visible: false, positionMeters: [0, 0, 0] as [number, number, number] }];
		expect(evaluateSceneTimelineV1(fire, [overnight], 'WITNESS-A', 23 * 60 * 60 * 1000)[0]?.visible).toBe(true);
		expect(evaluateSceneTimelineV1(fire, [overnight], 'WITNESS-A', 25 * 60 * 60 * 1000)[0]?.visible).toBe(true);
		expect(evaluateSceneTimelineV1(fire, [overnight], 'WITNESS-A', 26 * 60 * 60 * 1000)[0]?.visible).toBe(false);
		expect(evaluateSceneTimelineV1(fire, [overnight], 'WITNESS-B', 25 * 60 * 60 * 1000)[0]?.visible).toBe(false);
	});
});
