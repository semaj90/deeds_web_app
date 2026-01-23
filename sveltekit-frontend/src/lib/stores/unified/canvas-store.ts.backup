/**
 * CanvasStore - Unified Evidence Canvas & Collaboration
 *
 * Phase 8 Consolidation: Merges
 * - canvas-state.ts
 * - canvas-store.ts
 * - canvas-sync.ts
 * - canvas-collaboration.ts
 *
 * Usage:
 * import { canvasStore } from '$lib/stores/unified';
 *
 * canvasStore.addElement('node', { x: 100, y: 100 });
 * $: canvas = $canvasStore.canvasData;
 */

import { derived, writable } from 'svelte/store';

/**
 * Types
 */
export type ElementType = 'node' | 'connection' | 'label' | 'image' | 'annotation';

export interface CanvasElement {
    id: string;
    type: ElementType;
    x: number;
    y: number;
    width: number;
    height: number;
    data?: Record<string, unknown>;
    style?: Record<string, unknown>;
    locked?: boolean;
    lockedBy?: string;
}

export interface CanvasConnection {
    id: string;
    fromId: string;
    toId: string;
    type: string;
    label?: string;
    style?: Record<string, unknown>;
}

export interface CanvasState {
    id: string;
    elements: CanvasElement[];
    connections: CanvasConnection[];
    version: number;
    createdAt: number;
    updatedAt: number;
}

export interface CollaboratorCursor {
    userId: string;
    name: string;
    x: number;
    y: number;
    color: string;
    timestamp: number;
}

export interface CanvasHistoryEntry {
    version: number;
    action: string;
    timestamp: number;
    userId: string;
    changes: unknown;
}

/**
 * Canvas Store State
 */
interface CanvasStoreState {
    // Canvas data
    canvasId: string | null;
    canvasData: CanvasState | null;
    elements: CanvasElement[];
    connections: CanvasConnection[];
    // Selection
    selectedElementId: string | null;
    selectedElementIds: string[];
    // Collaboration
    collaborators: CollaboratorCursor[];
    locks: Map<string, string>; // element ID -> user ID
    // Undo/Redo
    history: CanvasHistoryEntry[];
    historyIndex: number;
    isDirty: boolean;
    // WebSocket state
    isConnected: boolean;
    isSyncing: boolean;
    // UI state
    zoomLevel: number;
    panX: number;
    panY: number;
    // Metadata
    isLoading: boolean;
    error: string | null;
    lastUpdated: number;
}

const initialState: CanvasStoreState = {
    canvasId: null,
    canvasData: null,
    elements: [],
    connections: [],
    selectedElementId: null,
    selectedElementIds: [],
    collaborators: [],
    locks: new Map(),
    history: [],
    historyIndex: -1,
    isDirty: false,
    isConnected: false,
    isSyncing: false,
    zoomLevel: 1,
    panX: 0,
    panY: 0,
    isLoading: false,
    error: null,
    lastUpdated: 0
};

/**
 * Canvas Store Class
 */
class CanvasStore {
    private store = writable<CanvasStoreState>(initialState);
    public subscribe = this.store.subscribe;
    public update = this.store.update;

    // ========== LOAD CANVAS ==========
    loadCanvas = async (canvasId: string) => {
        this.update(s => ({ ...s, isLoading: true, error: null }));
        try {
            const response = await fetch(`/api/canvas/${canvasId}`);
            if (response.ok) {
                const data = await response.json();
                const canvasData: CanvasState = data.canvas;
                this.update(s => ({
                    ...s,
                    canvasId,
                    canvasData,
                    elements: canvasData.elements,
                    connections: canvasData.connections,
                    isLoading: false,
                    lastUpdated: Date.now()
                }));
            } else {
                throw new Error('Failed to load canvas');
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Failed to load canvas';
            this.update(s => ({ ...s, error: errorMsg, isLoading: false }));
        }
    };

    // ========== ELEMENT MANAGEMENT ==========
    addElement = (type: ElementType, element: Omit<CanvasElement, 'id' | 'type'>) => {
        const id = `elem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newElement: CanvasElement = { ...element, id, type };
        this.update(s => ({
            ...s,
            elements: [...s.elements, newElement],
            isDirty: true
        }));
        this._addToHistory(s => `Added element: ${type}`);
        return id;
    };

    updateElement = (id: string, updates: Partial<CanvasElement>) => {
        this.update(s => {
            const index = s.elements.findIndex(e => e.id === id);
            if (index === -1) return s;
            const newElements = [...s.elements];
            newElements[index] = { ...newElements[index], ...updates };
            return {
                ...s,
                elements: newElements,
                isDirty: true
            };
        });
        this._addToHistory(() => `Updated element: ${id}`);
    };

    removeElement = (id: string) => {
        this.update(s => ({
            ...s,
            elements: s.elements.filter(e => e.id !== id),
            connections: s.connections.filter(c => c.fromId !== id && c.toId !== id),
            isDirty: true
        }));
        this._addToHistory(() => `Removed element: ${id}`);
    };

    lockElement = (elementId: string, userId: string) => {
        this.update(s => ({
            ...s,
            locks: new Map(s.locks).set(elementId, userId)
        }));
    };

    unlockElement = (elementId: string) => {
        this.update(s => {
            const newLocks = new Map(s.locks);
            newLocks.delete(elementId);
            return { ...s, locks: newLocks };
        });
    };

    // ========== CONNECTIONS ==========
    createConnection = (fromId: string, toId: string, type: string = 'default', label?: string) => {
        const id = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const connection: CanvasConnection = { id, fromId, toId, type, label };
        this.update(s => ({
            ...s,
            connections: [...s.connections, connection],
            isDirty: true
        }));
        return id;
    };

    removeConnection = (id: string) => {
        this.update(s => ({
            ...s,
            connections: s.connections.filter(c => c.id !== id),
            isDirty: true
        }));
    };

    updateConnection = (id: string, updates: Partial<CanvasConnection>) => {
        this.update(s => ({
            ...s,
            connections: s.connections.map(c => (c.id === id ? { ...c, ...updates } : c)),
            isDirty: true
        }));
    };

    // ========== SELECTION ==========
    selectElement = (id: string) => {
        this.update(s => ({ ...s, selectedElementId: id, selectedElementIds: [id] }));
    };

    selectElements = (ids: string[]) => {
        this.update(s => ({ ...s, selectedElementId: ids[0] ?? null, selectedElementIds: ids }));
    };

    clearSelection = () => {
        this.update(s => ({ ...s, selectedElementId: null, selectedElementIds: [] }));
    };

    // ========== VIEWPORT ==========
    setZoom = (level: number) => {
        this.update(s => ({ ...s, zoomLevel: Math.max(0.1, Math.min(5, level)) }));
    };

    pan = (deltaX: number, deltaY: number) => {
        this.update(s => ({ ...s, panX: s.panX + deltaX, panY: s.panY + deltaY }));
    };

    resetViewport = () => {
        this.update(s => ({ ...s, zoomLevel: 1, panX: 0, panY: 0 }));
    };

    // ========== SAVE & SYNC ==========
    saveCanvas = async () => {
        let stateSnapshot: { canvasId: string | null; elements: CanvasElement[]; connections: CanvasConnection[] } = {
            canvasId: null,
            elements: [],
            connections: []
        };

        const unsubscribe = this.subscribe(s => {
            stateSnapshot.canvasId = s.canvasId;
            stateSnapshot.elements = s.elements;
            stateSnapshot.connections = s.connections;
        });
        unsubscribe(); // Immediately unsubscribe as we just wanted the current state

        if (!stateSnapshot.canvasId) return;

        this.update(s => ({ ...s, isSyncing: true }));
        try {
            const response = await fetch(`/api/canvas/${stateSnapshot.canvasId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    elements: stateSnapshot.elements,
                    connections: stateSnapshot.connections
                })
            });
            if (response.ok) {
                this.update(s => ({ ...s, isDirty: false, isSyncing: false, lastUpdated: Date.now() }));
            }
        } catch (error) {
            console.error('Save error: ', error);
            this.update(s => ({ ...s, isSyncing: false }));
        }
    };

    // ========== COLLABORATION ==========
    updateCollaboratorCursor = (cursor: CollaboratorCursor) => {
        this.update(s => {
            const idx = s.collaborators.findIndex(c => c.userId === cursor.userId);
            if (idx >= 0) {
                const updated = [...s.collaborators];
                updated[idx] = cursor;
                return { ...s, collaborators: updated };
            }
            return { ...s, collaborators: [...s.collaborators, cursor] };
        });
    };

    removeCollaborator = (userId: string) => {
        this.update(s => {
             const newLocks = new Map(s.locks);
             for (const [elemId, lockedBy] of newLocks.entries()) {
                 if (lockedBy === userId) newLocks.delete(elemId);
             }
             return {
                 ...s,
                 collaborators: s.collaborators.filter(c => c.userId !== userId),
                 locks: newLocks
             };
        });
    };

    // ========== UNDO/REDO ==========
    undo = () => {
        this.update(s => {
            if (s.historyIndex <= 0) return s;
            return { ...s, historyIndex: s.historyIndex - 1 };
        });
    };

    redo = () => {
        this.update(s => {
            if (s.historyIndex >= s.history.length - 1) return s;
            return { ...s, historyIndex: s.historyIndex + 1 };
        });
    };

    clearHistory = () => {
        this.update(s => ({ ...s, history: [], historyIndex: -1 }));
    };

    // ========== EXPORT ==========
    exportCanvas = async (format: 'svg' | 'png' | 'json') => {
        // Implementation simplified for fix
        console.log(`Exporting as ${format}`);
    };

    shareCanvas = async (userIds: string[]) => {
       // Implementation simplified for fix
       console.log(`Sharing with ${userIds.length} users`);
    };

    // ========== PRIVATE HELPERS ==========
    private _addToHistory = (getAction: (state: CanvasStoreState) => string) => {
        this.update(s => {
            const action = getAction(s);
            const entry: CanvasHistoryEntry = {
                version: s.history.length,
                action,
                timestamp: Date.now(),
                userId: 'current-user', // Should get from context
                changes: { elements: s.elements, connections: s.connections }
            };
            const newHistory = [...s.history.slice(0, s.historyIndex + 1), entry];
            return {
                ...s,
                history: newHistory,
                historyIndex: newHistory.length - 1
            };
        });
    };
}

/**
 * Export singleton instance
 */
export const canvasStore = new CanvasStore();

/**
 * Derived stores
 */
export const canvasElements = derived(canvasStore, $store => $store.elements);
export const canvasConnections = derived(canvasStore, $store => $store.connections);
export const selectedElements = derived(canvasStore, $store => $store.selectedElementIds.map((id: string) => $store.elements.find((e: CanvasElement) => e.id === id)).filter(Boolean));








