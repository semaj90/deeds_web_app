import { z } from 'zod';

export type SceneToolMode =
	| 'select'
	| 'translate'
	| 'rotate'
	| 'scale'
	| 'primitive'
	| 'deform'
	| 'animate'
	| 'measure';

export const sceneToolModeSchema = z.enum([
	'select',
	'translate',
	'rotate',
	'scale',
	'primitive',
	'deform',
	'animate',
	'measure'
]);

export interface TransformStateV1 {
	position: [number, number, number];
	rotation: [number, number, number, number]; // Quaternion [x, y, z, w]
	scale: [number, number, number];
}

export const transformStateV1Schema = z.object({
	position: z.tuple([z.number(), z.number(), z.number()]),
	rotation: z.tuple([z.number(), z.number(), z.number(), z.number()]),
	scale: z.tuple([z.number(), z.number(), z.number()])
});

export interface SceneObjectDescriptorV1 {
	readonly id: string;
	readonly kind: string;
	readonly name: string;
	transform: TransformStateV1;
	visible: boolean;
	locked?: boolean;
	metadata?: Record<string, unknown>;
}

export interface SceneExecutionContext {
	getObject(id: string): SceneObjectDescriptorV1 | undefined;
	setObjectTransform(id: string, transform: TransformStateV1): void;
	addObject(object: SceneObjectDescriptorV1): void;
	removeObject(id: string): void;
	selectObject(id: string | null): void;
	getSelectedObjectId(): string | null;
	getToolMode(): SceneToolMode;
	setToolMode(mode: SceneToolMode): void;
}

export interface SceneCommand {
	readonly id: string;
	readonly type: string;
	readonly timestampMs: number;
	execute(context: SceneExecutionContext): void;
	undo(context: SceneExecutionContext): void;
	toSerializable(): Record<string, unknown>;
}

function generateCommandId(prefix: string): string {
	const rnd = Math.random().toString(36).substring(2, 9);
	return `${prefix}-${Date.now()}-${rnd}`;
}

export class TransformObjectCommand implements SceneCommand {
	readonly id: string;
	readonly type = 'transform_object';
	readonly timestampMs: number;

	constructor(
		readonly objectId: string,
		readonly oldTransform: TransformStateV1,
		readonly newTransform: TransformStateV1
	) {
		this.id = generateCommandId('cmd-xform');
		this.timestampMs = Date.now();
	}

	execute(context: SceneExecutionContext): void {
		context.setObjectTransform(this.objectId, this.newTransform);
	}

	undo(context: SceneExecutionContext): void {
		context.setObjectTransform(this.objectId, this.oldTransform);
	}

	toSerializable(): Record<string, unknown> {
		return {
			id: this.id,
			type: this.type,
			timestampMs: this.timestampMs,
			objectId: this.objectId,
			oldTransform: this.oldTransform,
			newTransform: this.newTransform
		};
	}
}

export class AddObjectCommand implements SceneCommand {
	readonly id: string;
	readonly type = 'add_object';
	readonly timestampMs: number;

	constructor(readonly object: SceneObjectDescriptorV1) {
		this.id = generateCommandId('cmd-add');
		this.timestampMs = Date.now();
	}

	execute(context: SceneExecutionContext): void {
		context.addObject(this.object);
		context.selectObject(this.object.id);
	}

	undo(context: SceneExecutionContext): void {
		context.removeObject(this.object.id);
		if (context.getSelectedObjectId() === this.object.id) {
			context.selectObject(null);
		}
	}

	toSerializable(): Record<string, unknown> {
		return {
			id: this.id,
			type: this.type,
			timestampMs: this.timestampMs,
			object: this.object
		};
	}
}

export class RemoveObjectCommand implements SceneCommand {
	readonly id: string;
	readonly type = 'remove_object';
	readonly timestampMs: number;

	constructor(readonly object: SceneObjectDescriptorV1) {
		this.id = generateCommandId('cmd-rm');
		this.timestampMs = Date.now();
	}

	execute(context: SceneExecutionContext): void {
		context.removeObject(this.object.id);
		if (context.getSelectedObjectId() === this.object.id) {
			context.selectObject(null);
		}
	}

	undo(context: SceneExecutionContext): void {
		context.addObject(this.object);
		context.selectObject(this.object.id);
	}

	toSerializable(): Record<string, unknown> {
		return {
			id: this.id,
			type: this.type,
			timestampMs: this.timestampMs,
			object: this.object
		};
	}
}

export class SelectObjectCommand implements SceneCommand {
	readonly id: string;
	readonly type = 'select_object';
	readonly timestampMs: number;

	constructor(
		readonly previousId: string | null,
		readonly nextId: string | null
	) {
		this.id = generateCommandId('cmd-sel');
		this.timestampMs = Date.now();
	}

	execute(context: SceneExecutionContext): void {
		context.selectObject(this.nextId);
	}

	undo(context: SceneExecutionContext): void {
		context.selectObject(this.previousId);
	}

	toSerializable(): Record<string, unknown> {
		return {
			id: this.id,
			type: this.type,
			timestampMs: this.timestampMs,
			previousId: this.previousId,
			nextId: this.nextId
		};
	}
}

export class SetToolModeCommand implements SceneCommand {
	readonly id: string;
	readonly type = 'set_tool_mode';
	readonly timestampMs: number;

	constructor(
		readonly previousMode: SceneToolMode,
		readonly nextMode: SceneToolMode
	) {
		this.id = generateCommandId('cmd-tool');
		this.timestampMs = Date.now();
	}

	execute(context: SceneExecutionContext): void {
		context.setToolMode(this.nextMode);
	}

	undo(context: SceneExecutionContext): void {
		context.setToolMode(this.previousMode);
	}

	toSerializable(): Record<string, unknown> {
		return {
			id: this.id,
			type: this.type,
			timestampMs: this.timestampMs,
			previousMode: this.previousMode,
			nextMode: this.nextMode
		};
	}
}

export class CommandHistory {
	private undoStack: SceneCommand[] = [];
	private redoStack: SceneCommand[] = [];
	private maxCapacity: number;

	constructor(maxCapacity = 100) {
		this.maxCapacity = Math.max(1, maxCapacity);
	}

	execute(command: SceneCommand, context: SceneExecutionContext): void {
		command.execute(context);
		this.undoStack.push(command);
		if (this.undoStack.length > this.maxCapacity) {
			this.undoStack.shift();
		}
		this.redoStack = [];
	}

	undo(context: SceneExecutionContext): SceneCommand | null {
		const command = this.undoStack.pop();
		if (!command) return null;
		command.undo(context);
		this.redoStack.push(command);
		return command;
	}

	redo(context: SceneExecutionContext): SceneCommand | null {
		const command = this.redoStack.pop();
		if (!command) return null;
		command.execute(context);
		this.undoStack.push(command);
		return command;
	}

	canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	getUndoCount(): number {
		return this.undoStack.length;
	}

	getRedoCount(): number {
		return this.redoStack.length;
	}

	clear(): void {
		this.undoStack = [];
		this.redoStack = [];
	}

	toActionLog(): Array<Record<string, unknown>> {
		return this.undoStack.map((cmd) => cmd.toSerializable());
	}
}

export class InMemorySceneExecutionContext implements SceneExecutionContext {
	private objects = new Map<string, SceneObjectDescriptorV1>();
	private selectedObjectId: string | null = null;
	private toolMode: SceneToolMode = 'select';

	getObject(id: string): SceneObjectDescriptorV1 | undefined {
		const found = this.objects.get(id);
		if (!found) return undefined;
		return {
			...found,
			transform: {
				position: [...found.transform.position],
				rotation: [...found.transform.rotation],
				scale: [...found.transform.scale]
			}
		};
	}

	setObjectTransform(id: string, transform: TransformStateV1): void {
		const found = this.objects.get(id);
		if (!found) return;
		found.transform = {
			position: [...transform.position],
			rotation: [...transform.rotation],
			scale: [...transform.scale]
		};
	}

	addObject(object: SceneObjectDescriptorV1): void {
		this.objects.set(object.id, {
			...object,
			transform: {
				position: [...object.transform.position],
				rotation: [...object.transform.rotation],
				scale: [...object.transform.scale]
			}
		});
	}

	removeObject(id: string): void {
		this.objects.delete(id);
	}

	selectObject(id: string | null): void {
		this.selectedObjectId = id;
	}

	getSelectedObjectId(): string | null {
		return this.selectedObjectId;
	}

	getToolMode(): SceneToolMode {
		return this.toolMode;
	}

	setToolMode(mode: SceneToolMode): void {
		this.toolMode = mode;
	}

	getAllObjects(): SceneObjectDescriptorV1[] {
		return Array.from(this.objects.values());
	}
}

export class SceneControllerV1 {
	readonly history: CommandHistory;
	private context: SceneExecutionContext;
	private listeners = new Set<(event: { type: string; payload?: unknown }) => void>();
	private dirty = false;

	constructor(context?: SceneExecutionContext, maxHistory = 100) {
		this.context = context ?? new InMemorySceneExecutionContext();
		this.history = new CommandHistory(maxHistory);
	}

	getContext(): SceneExecutionContext {
		return this.context;
	}

	subscribe(fn: (event: { type: string; payload?: unknown }) => void): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	private notify(type: string, payload?: unknown): void {
		this.listeners.forEach((fn) => {
			try {
				fn({ type, payload });
			} catch (err) {
				console.error('SceneController listener error:', err);
			}
		});
	}

	getToolMode(): SceneToolMode {
		return this.context.getToolMode();
	}

	setToolMode(mode: SceneToolMode): void {
		const current = this.context.getToolMode();
		if (current === mode) return;
		this.history.execute(new SetToolModeCommand(current, mode), this.context);
		this.notify('tool_mode_changed', { mode });
	}

	getSelectedObjectId(): string | null {
		return this.context.getSelectedObjectId();
	}

	selectObject(id: string | null): void {
		const current = this.context.getSelectedObjectId();
		if (current === id) return;
		this.history.execute(new SelectObjectCommand(current, id), this.context);
		this.notify('selection_changed', { id });
	}

	transformObject(id: string, newTransform: TransformStateV1): void {
		const obj = this.context.getObject(id);
		if (!obj) return;
		const cmd = new TransformObjectCommand(id, obj.transform, newTransform);
		this.history.execute(cmd, this.context);
		this.dirty = true;
		this.notify('object_transformed', { id, transform: newTransform });
	}

	addObject(object: SceneObjectDescriptorV1): void {
		const cmd = new AddObjectCommand(object);
		this.history.execute(cmd, this.context);
		this.dirty = true;
		this.notify('object_added', { object });
	}

	removeObject(id: string): void {
		const obj = this.context.getObject(id);
		if (!obj) return;
		const cmd = new RemoveObjectCommand(obj);
		this.history.execute(cmd, this.context);
		this.dirty = true;
		this.notify('object_removed', { id });
	}

	undo(): boolean {
		if (!this.history.canUndo()) return false;
		const undone = this.history.undo(this.context);
		if (undone) {
			this.dirty = true;
			this.notify('undo', { command: undone });
			return true;
		}
		return false;
	}

	redo(): boolean {
		if (!this.history.canRedo()) return false;
		const redone = this.history.redo(this.context);
		if (redone) {
			this.dirty = true;
			this.notify('redo', { command: redone });
			return true;
		}
		return false;
	}

	isDirty(): boolean {
		return this.dirty;
	}

	markClean(): void {
		this.dirty = false;
	}
}
