/**
 * CanvasStore — Svelte 5 Runes (Session 27)
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

class CanvasStore {
  canvasId = $state<string | null>(null);
  elements = $state<CanvasElement[]>([]);
  connections = $state<CanvasConnection[]>([]);
  selectedElementId = $state<string | null>(null);
  selectedElementIds = $state<string[]>([]);
  collaborators = $state<CollaboratorCursor[]>([]);
  locks = $state<Map<string, string>>(new Map());
  history = $state<CanvasHistoryEntry[]>([]);
  historyIndex = $state(-1);
  isDirty = $state(false);
  isConnected = $state(false);
  isSyncing = $state(false);
  zoomLevel = $state(1);
  panX = $state(0);
  panY = $state(0);
  isLoading = $state(false);
  error = $state<string | null>(null);
  lastUpdated = $state(0);

  selectedElements = $derived.by(() =>
    this.selectedElementIds
      .map(id => this.elements.find(e => e.id === id))
      .filter((e): e is CanvasElement => !!e)
  );

  canUndo = $derived(this.historyIndex > 0);
  canRedo = $derived(this.historyIndex < this.history.length - 1);

  async loadCanvas(canvasId: string) {
    this.isLoading = true;
    this.error = null;
    try {
      const response = await fetch(`/api/canvas/${canvasId}`);
      if (response.ok) {
        const data = await response.json();
        this.canvasId = canvasId;
        this.elements = data.canvas?.elements || [];
        this.connections = data.canvas?.connections || [];
        this.lastUpdated = Date.now();
      } else {
        throw new Error('Failed to load canvas');
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load canvas';
    } finally {
      this.isLoading = false;
    }
  }

  addElement(type: ElementType, element: Omit<CanvasElement, 'id' | 'type'>) {
    const id = `elem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newElement: CanvasElement = { ...element, id, type };
    this.elements = [...this.elements, newElement];
    this.isDirty = true;
    this._addToHistory(`Added element: ${type}`);
    return id;
  }

  updateElement(id: string, updates: Partial<CanvasElement>) {
    this.elements = this.elements.map(e =>
      e.id === id ? { ...e, ...updates } : e
    );
    this.isDirty = true;
    this._addToHistory(`Updated element: ${id}`);
  }

  removeElement(id: string) {
    this.elements = this.elements.filter(e => e.id !== id);
    this.connections = this.connections.filter(c => c.fromId !== id && c.toId !== id);
    this.isDirty = true;
    this._addToHistory(`Removed element: ${id}`);
  }

  lockElement(elementId: string, userId: string) {
    const newLocks = new Map(this.locks);
    newLocks.set(elementId, userId);
    this.locks = newLocks;
  }

  unlockElement(elementId: string) {
    const newLocks = new Map(this.locks);
    newLocks.delete(elementId);
    this.locks = newLocks;
  }

  createConnection(fromId: string, toId: string, type = 'default', label?: string) {
    const id = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const connection: CanvasConnection = { id, fromId, toId, type, label };
    this.connections = [...this.connections, connection];
    this.isDirty = true;
    return id;
  }

  removeConnection(id: string) {
    this.connections = this.connections.filter(c => c.id !== id);
    this.isDirty = true;
  }

  updateConnection(id: string, updates: Partial<CanvasConnection>) {
    this.connections = this.connections.map(c =>
      c.id === id ? { ...c, ...updates } : c
    );
    this.isDirty = true;
  }

  selectElement(id: string) {
    this.selectedElementId = id;
    this.selectedElementIds = [id];
  }

  selectElements(ids: string[]) {
    this.selectedElementId = ids[0] ?? null;
    this.selectedElementIds = ids;
  }

  clearSelection() {
    this.selectedElementId = null;
    this.selectedElementIds = [];
  }

  setZoom(level: number) {
    this.zoomLevel = Math.max(0.1, Math.min(5, level));
  }

  pan(deltaX: number, deltaY: number) {
    this.panX += deltaX;
    this.panY += deltaY;
  }

  resetViewport() {
    this.zoomLevel = 1;
    this.panX = 0;
    this.panY = 0;
  }

  async saveCanvas() {
    if (!this.canvasId) return;
    this.isSyncing = true;
    try {
      const response = await fetch(`/api/canvas/${this.canvasId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          elements: this.elements,
          connections: this.connections
        })
      });
      if (response.ok) {
        this.isDirty = false;
        this.lastUpdated = Date.now();
      }
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      this.isSyncing = false;
    }
  }

  updateCollaboratorCursor(cursor: CollaboratorCursor) {
    const idx = this.collaborators.findIndex(c => c.userId === cursor.userId);
    if (idx >= 0) {
      const updated = [...this.collaborators];
      updated[idx] = cursor;
      this.collaborators = updated;
    } else {
      this.collaborators = [...this.collaborators, cursor];
    }
  }

  removeCollaborator(userId: string) {
    this.collaborators = this.collaborators.filter(c => c.userId !== userId);
    const newLocks = new Map(this.locks);
    for (const [elemId, lockedBy] of newLocks.entries()) {
      if (lockedBy === userId) newLocks.delete(elemId);
    }
    this.locks = newLocks;
  }

  undo() {
    if (this.historyIndex > 0) this.historyIndex--;
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) this.historyIndex++;
  }

  clearHistory() {
    this.history = [];
    this.historyIndex = -1;
  }

  async exportCanvas(format: 'svg' | 'png' | 'json') {
    console.log(`Exporting as ${format}`);
  }

  async shareCanvas(userIds: string[]) {
    console.log(`Sharing with ${userIds.length} users`);
  }

  private _addToHistory(action: string) {
    const entry: CanvasHistoryEntry = {
      version: this.history.length,
      action,
      timestamp: Date.now(),
      userId: 'current-user',
      changes: { elements: this.elements, connections: this.connections }
    };
    this.history = [...this.history.slice(0, this.historyIndex + 1), entry];
    this.historyIndex = this.history.length - 1;
  }
}

export const canvasStore = new CanvasStore();
