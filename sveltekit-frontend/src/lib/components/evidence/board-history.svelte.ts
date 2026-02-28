/**
 * Board History — Command-pattern undo/redo for EvidenceBoard.
 * Class-backed $state following canvas-store.svelte.ts pattern.
 *
 * Commands are pushed on completion (drag-end, not every mousemove).
 * execute() is already applied when pushed — undo() reverses it.
 */

export interface BoardCommand {
	execute(): void;
	undo(): void;
	description: string;
}

type NodePosition = { id: string; x: number; y: number };
type NodeData = { id: string; [key: string]: any };
type ConnectionData = { id: string; [key: string]: any };

const MAX_HISTORY = 50;

class BoardHistory {
	undoStack = $state<BoardCommand[]>([]);
	redoStack = $state<BoardCommand[]>([]);

	canUndo = $derived(this.undoStack.length > 0);
	canRedo = $derived(this.redoStack.length > 0);
	lastAction = $derived(this.undoStack.at(-1)?.description ?? '');

	push(command: BoardCommand) {
		this.undoStack = [...this.undoStack.slice(-MAX_HISTORY + 1), command];
		this.redoStack = [];
	}

	undo() {
		const cmd = this.undoStack.at(-1);
		if (!cmd) return;
		cmd.undo();
		this.undoStack = this.undoStack.slice(0, -1);
		this.redoStack = [...this.redoStack, cmd];
	}

	redo() {
		const cmd = this.redoStack.at(-1);
		if (!cmd) return;
		cmd.execute();
		this.redoStack = this.redoStack.slice(0, -1);
		this.undoStack = [...this.undoStack, cmd];
	}

	clear() {
		this.undoStack = [];
		this.redoStack = [];
	}
}

export const boardHistory = new BoardHistory();

// ── Command Factories ────────────────────────────────────────────

export function createMoveCommand(
	nodeId: string,
	fromX: number, fromY: number,
	toX: number, toY: number,
	applyMove: (id: string, x: number, y: number) => void
): BoardCommand {
	return {
		execute: () => applyMove(nodeId, toX, toY),
		undo: () => applyMove(nodeId, fromX, fromY),
		description: `Move node`
	};
}

export function createBulkMoveCommand(
	moves: { id: string; fromX: number; fromY: number; toX: number; toY: number }[],
	applyMove: (id: string, x: number, y: number) => void
): BoardCommand {
	return {
		execute: () => moves.forEach(m => applyMove(m.id, m.toX, m.toY)),
		undo: () => moves.forEach(m => applyMove(m.id, m.fromX, m.fromY)),
		description: `Move ${moves.length} nodes`
	};
}

export function createAddNodeCommand(
	node: NodeData,
	addFn: (node: NodeData) => void,
	removeFn: (id: string) => void
): BoardCommand {
	return {
		execute: () => addFn(node),
		undo: () => removeFn(node.id),
		description: `Add node`
	};
}

export function createDeleteNodeCommand(
	node: NodeData,
	addFn: (node: NodeData) => void,
	removeFn: (id: string) => void
): BoardCommand {
	return {
		execute: () => removeFn(node.id),
		undo: () => addFn(node),
		description: `Delete node`
	};
}

export function createAddConnectionCommand(
	connection: ConnectionData,
	addFn: (conn: ConnectionData) => void,
	removeFn: (id: string) => void
): BoardCommand {
	return {
		execute: () => addFn(connection),
		undo: () => removeFn(connection.id),
		description: `Add connection`
	};
}

export function createDeleteConnectionCommand(
	connection: ConnectionData,
	addFn: (conn: ConnectionData) => void,
	removeFn: (id: string) => void
): BoardCommand {
	return {
		execute: () => removeFn(connection.id),
		undo: () => addFn(connection),
		description: `Delete connection`
	};
}
