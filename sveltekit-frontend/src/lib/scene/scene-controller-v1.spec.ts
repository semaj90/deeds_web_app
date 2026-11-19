import { describe, expect, it, vi } from 'vitest';
import {
	SceneControllerV1,
	InMemorySceneExecutionContext,
	TransformObjectCommand,
	AddObjectCommand,
	RemoveObjectCommand,
	SelectObjectCommand,
	SetToolModeCommand,
	CommandHistory,
	sceneToolModeSchema,
	transformStateV1Schema,
	type SceneObjectDescriptorV1,
	type TransformStateV1
} from './scene-controller-v1.js';

describe('scene-controller-v1', () => {
	const sampleTransform1: TransformStateV1 = {
		position: [0, 0, 0],
		rotation: [0, 0, 0, 1],
		scale: [1, 1, 1]
	};

	const sampleTransform2: TransformStateV1 = {
		position: [1.5, 0.5, -2.0],
		rotation: [0, 0.7071, 0, 0.7071],
		scale: [2, 2, 2]
	};

	const sampleObject: SceneObjectDescriptorV1 = {
		id: 'obj-e-001',
		kind: 'box',
		name: 'Evidence Box E-001',
		transform: sampleTransform1,
		visible: true
	};

	it('validates tool modes against schema', () => {
		expect(sceneToolModeSchema.safeParse('select').success).toBe(true);
		expect(sceneToolModeSchema.safeParse('translate').success).toBe(true);
		expect(sceneToolModeSchema.safeParse('rotate').success).toBe(true);
		expect(sceneToolModeSchema.safeParse('scale').success).toBe(true);
		expect(sceneToolModeSchema.safeParse('primitive').success).toBe(true);
		expect(sceneToolModeSchema.safeParse('deform').success).toBe(true);
		expect(sceneToolModeSchema.safeParse('animate').success).toBe(true);
		expect(sceneToolModeSchema.safeParse('measure').success).toBe(true);
		expect(sceneToolModeSchema.safeParse('invalid_mode').success).toBe(false);
	});

	it('validates transform states against schema', () => {
		expect(transformStateV1Schema.safeParse(sampleTransform1).success).toBe(true);
		expect(transformStateV1Schema.safeParse(sampleTransform2).success).toBe(true);
		expect(
			transformStateV1Schema.safeParse({
				position: [0, 0], // too short
				rotation: [0, 0, 0, 1],
				scale: [1, 1, 1]
			}).success
		).toBe(false);
	});

	describe('CommandHistory', () => {
		it('executes commands and maintains undo/redo stacks', () => {
			const ctx = new InMemorySceneExecutionContext();
			const history = new CommandHistory(10);

			expect(history.canUndo()).toBe(false);
			expect(history.canRedo()).toBe(false);

			const cmd = new SetToolModeCommand('select', 'translate');
			history.execute(cmd, ctx);

			expect(ctx.getToolMode()).toBe('translate');
			expect(history.canUndo()).toBe(true);
			expect(history.canRedo()).toBe(false);

			const undone = history.undo(ctx);
			expect(undone).toBe(cmd);
			expect(ctx.getToolMode()).toBe('select');
			expect(history.canUndo()).toBe(false);
			expect(history.canRedo()).toBe(true);

			const redone = history.redo(ctx);
			expect(redone).toBe(cmd);
			expect(ctx.getToolMode()).toBe('translate');
			expect(history.canUndo()).toBe(true);
			expect(history.canRedo()).toBe(false);
		});

		it('clears redo stack when a new command is executed', () => {
			const ctx = new InMemorySceneExecutionContext();
			const history = new CommandHistory(10);

			history.execute(new SetToolModeCommand('select', 'translate'), ctx);
			history.undo(ctx);
			expect(history.canRedo()).toBe(true);

			// New branch of history
			history.execute(new SetToolModeCommand('select', 'rotate'), ctx);
			expect(history.canRedo()).toBe(false);
			expect(ctx.getToolMode()).toBe('rotate');
		});

		it('respects maximum capacity', () => {
			const ctx = new InMemorySceneExecutionContext();
			const history = new CommandHistory(5);

			for (let i = 0; i < 8; i++) {
				history.execute(
					new SelectObjectCommand(`obj-${i}`, `obj-${i + 1}`),
					ctx
				);
			}

			expect(history.getUndoCount()).toBe(5);
		});
	});

	describe('SceneControllerV1', () => {
		it('manages tool modes with undo/redo and notification dispatch', () => {
			const controller = new SceneControllerV1();
			const listener = vi.fn();
			controller.subscribe(listener);

			expect(controller.getToolMode()).toBe('select');

			controller.setToolMode('translate');
			expect(controller.getToolMode()).toBe('translate');
			expect(listener).toHaveBeenCalledWith({
				type: 'tool_mode_changed',
				payload: { mode: 'translate' }
			});

			controller.undo();
			expect(controller.getToolMode()).toBe('select');

			controller.redo();
			expect(controller.getToolMode()).toBe('translate');
		});

		it('handles object addition, selection, and undo/redo', () => {
			const controller = new SceneControllerV1();
			const listener = vi.fn();
			controller.subscribe(listener);

			expect(controller.isDirty()).toBe(false);

			controller.addObject(sampleObject);
			expect(controller.isDirty()).toBe(true);
			expect(controller.getSelectedObjectId()).toBe('obj-e-001');
			expect(controller.getContext().getObject('obj-e-001')).toBeDefined();

			controller.undo();
			expect(controller.getSelectedObjectId()).toBeNull();
			expect(controller.getContext().getObject('obj-e-001')).toBeUndefined();

			controller.redo();
			expect(controller.getSelectedObjectId()).toBe('obj-e-001');
			expect(controller.getContext().getObject('obj-e-001')?.name).toBe('Evidence Box E-001');
		});

		it('transforms objects and inverts matrix deltas accurately on undo', () => {
			const controller = new SceneControllerV1();
			controller.addObject(sampleObject);
			controller.markClean();

			controller.transformObject('obj-e-001', sampleTransform2);
			expect(controller.isDirty()).toBe(true);

			const current = controller.getContext().getObject('obj-e-001');
			expect(current?.transform.position).toEqual([1.5, 0.5, -2.0]);
			expect(current?.transform.scale).toEqual([2, 2, 2]);

			controller.undo();
			const restored = controller.getContext().getObject('obj-e-001');
			expect(restored?.transform.position).toEqual([0, 0, 0]);
			expect(restored?.transform.scale).toEqual([1, 1, 1]);

			controller.redo();
			const reRestored = controller.getContext().getObject('obj-e-001');
			expect(reRestored?.transform.position).toEqual([1.5, 0.5, -2.0]);
		});

		it('removes objects and restores them on undo', () => {
			const controller = new SceneControllerV1();
			controller.addObject(sampleObject);

			controller.removeObject('obj-e-001');
			expect(controller.getContext().getObject('obj-e-001')).toBeUndefined();
			expect(controller.getSelectedObjectId()).toBeNull();

			controller.undo();
			expect(controller.getContext().getObject('obj-e-001')).toBeDefined();
			expect(controller.getSelectedObjectId()).toBe('obj-e-001');
		});

		it('exports serializable action logs for audit receipts', () => {
			const controller = new SceneControllerV1();
			controller.addObject(sampleObject);
			controller.transformObject('obj-e-001', sampleTransform2);

			const log = controller.history.toActionLog();
			expect(log).toHaveLength(2);
			expect(log[0].type).toBe('add_object');
			expect(log[1].type).toBe('transform_object');
			expect(typeof log[0].id).toBe('string');
			expect(typeof log[1].timestampMs).toBe('number');
		});
	});
});
