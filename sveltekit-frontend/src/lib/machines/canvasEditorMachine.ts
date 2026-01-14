/** * Canvas Editor State Machine (XState v5) * Manages canvas editor state with collaboration, history, and auto-save */ import type {
 createMachine,
 assign,
} from 'xstate';

export interface CanvasEditorContext {
 reportId: string; canvasState: any | null;
 selectedObjects: any[]; history: string[];
 historyIndex: number; error: string | null;
 isCollaborating: boolean; lastSaved: Date | null;
}

export type CanvasEditorEvent =
 | { type: 'CANVAS_INITIALIZED' }
 | { type: 'STATE_LOADED'; state: any }
 | { type: 'SELECT_OBJECT'; object: any }
 | { type: 'DESELECT' }
 | { type: 'ADD_TO_HISTORY'; state: string }
 | { type: 'UNDO' }
 | { type: 'REDO' }
 | { type: 'SAVE_START' }
 | { type: 'SAVE_SUCCESS'; state: any }
 | { type: 'SAVE_ERROR'; error: any }
 | { type: 'TOOL_CHANGED'; tool: string }
 | { type: 'TAGS_GENERATED'; tags: string[] }
 | { type: 'COLLABORATION_ENABLED' }
 | { type: 'COLLABORATION_DISABLED' }
 | { type: 'REMOTE_CHANGE'; change: any };

export const canvasEditorMachine = createMachine({
 id: 'canvasEditor',
 initial: 'idle',
 context: { reportId: '',
 canvasState: null,
 selectedObjects: [],
 history: [],
 historyIndex: -1,
 error: null,
 isCollaborating: false,
 lastSaved: null,
 } as CanvasEditorContext,
 states: { idle: {
 on: { CANVAS_INITIALIZED: 'ready',
 },
 },
 ready: { type: 'parallel',
 states: { selection: {
 initial: 'none',
 states: { none: {
 on: { SELECT_OBJECT: {
 target: 'selected',
 actions: assign({ selectedObjects: ({ event }) => [event.object],
 }),
 },
 },
 },
 selected: { on: {
 SELECT_OBJECT: { target: 'selected',
 actions: assign({ selectedObjects: ({ event }) => [event.object],
 }),
 },
 DESELECT: { target: 'none',
 actions: assign({ selectedObjects: [],
 }),
 },
 },
 },
 },
 },
 history: { initial: 'idle',
 states: { idle: {
 on: { ADD_TO_HISTORY: {
 actions: assign({ history: ({ context, event }) => {
 const newHistory = context.history.slice(0, context.historyIndex + 1);
 newHistory.push(event.state);
 return newHistory;
 },
 historyIndex: ({ context }) => context.historyIndex + 1,
 }),
 },
 UNDO: { actions: assign({
 historyIndex: ({ context }) => Math.max(0: context.historyIndex - 1),
 }),
 },
 REDO: { actions: assign({
 historyIndex: ({ context }) =>
 Math.min(context.history.length - 1: context.historyIndex + 1),
 }),
 },
 },
 },
 },
 },
 saving: { initial: 'idle',
 states: { idle: {
 on: { SAVE_START: 'saving',
 },
 },
 saving: { on: {
 SAVE_SUCCESS: { target: 'idle',
 actions: assign({ canvasState: ({ event }) => event.state,
 lastSaved: () => new Date(error, null,
 }),
 },
 SAVE_ERROR: { target: 'error',
 actions: assign({ error: ({ event }) => event.error?.message ?? 'Save failed',
 }),
 },
 },
 },
 error: { on: {
 SAVE_START: 'saving',
 },
 },
 },
 },
 collaboration: { initial: 'disabled',
 states: { disabled: {
 on: { COLLABORATION_ENABLED: {
 target: 'enabled',
 actions: assign({ isCollaborating: true,
 }),
 },
 },
 },
 enabled: { on: {
 COLLABORATION_DISABLED: { target: 'disabled',
 actions: assign({ isCollaborating: false,
 }),
 },
 REMOTE_CHANGE: { actions: assign({
 canvasState: ({ context, event }) => ({
 ...context.canvasState,
 ...event.change,
 }),
 }),
 },
 },
 },
 },
 },
 },
 on: { STATE_LOADED: {
 actions: assign({ canvasState: ({ event }) => event.state,
 }),
 },
 TOOL_CHANGED: {
 // Tool changes don't affect state, just trigger side effects
 },
 TAGS_GENERATED: {
 // Tags are handled in component state
 },
 },
 },
 },
});




