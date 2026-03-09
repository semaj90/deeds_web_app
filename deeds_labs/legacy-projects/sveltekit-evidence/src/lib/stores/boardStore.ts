/**
 * Board Store - Manages Fabric.js draggable objects and canvas state
 */
import { writable } from "svelte/store";
import type { BoardObject } from "$lib/types";

// Board objects and canvas state
export const boardObjects = writable<BoardObject[]>([]);
export const selectedObjects = writable<string[]>([]);
export const canvasSize = writable({ width: 1200, height: 800 });
export const zoomLevel = writable(1);
export const canvasPosition = writable({ x: 0, y: 0 });

export const currentBoardId = writable<string | null>(null);

// Board actions
export const boardActions = {
  // Add a new object to the board
  addObject(object: BoardObject) {
    boardObjects.update((objects) => [...objects, object]);
  },

  // Update an existing object
  updateObject(id: string, updates: Partial<BoardObject>) {
    boardObjects.update((objects) =>
      objects.map((obj) => (obj.id === id ? { ...obj, ...updates } : obj)),
    );
  },

  // Remove object(s) from the board
  removeObject(id: string) {
    boardObjects.update((objects) => objects.filter((obj) => obj.id !== id));
    selectedObjects.update((selected) => selected.filter((s) => s !== id));
  },

  // Select object(s)
  selectObject(id: string, multiSelect = false) {
    if (multiSelect) {
      selectedObjects.update((selected) =>
        selected.includes(id)
          ? selected.filter((s) => s !== id)
          : [...selected, id],
      );
    } else {
      selectedObjects.set([id]);
    }
  },

  // Clear selection
  clearSelection() {
    selectedObjects.set([]);
  },

  // Create connection between objects
  createConnection(fromId: string, toId: string) {
    boardObjects.update((objects) =>
      objects.map((obj) => {
        if (obj.id === fromId) {
          return {
            ...obj,
            connections: [...(obj.connections || []), toId],
          };
        }
        return obj;
      }),
    );
  },

  // Remove connection between objects
  removeConnection(fromId: string, toId: string) {
    boardObjects.update((objects) =>
      objects.map((obj) => {
        if (obj.id === fromId) {
          return {
            ...obj,
            connections: (obj.connections || []).filter((id) => id !== toId),
          };
        }
        return obj;
      }),
    );
  },

  // Add evidence as board object
  addEvidenceToBoard(
    evidenceId: string,
    evidenceUrl: string,
    evidenceType: string,
    position = { x: 100, y: 100 },
  ) {
    const boardObject: BoardObject = {
      id: crypto.randomUUID(),
      type: evidenceType === "image" ? "image" : "text",
      position,
      url: evidenceType === "image" ? evidenceUrl : undefined,
      content: evidenceType !== "image" ? `Evidence: ${evidenceId}` : undefined,
      evidenceId,
      metadata: {
        createdAt: new Date().toISOString(),
      },
    };

    this.addObject(boardObject);
    return boardObject.id;
  },

  // Add text note to board
  addTextNote(content: string, position = { x: 200, y: 200 }) {
    const boardObject: BoardObject = {
      id: crypto.randomUUID(),
      type: "note",
      position,
      content,
      size: { width: 200, height: 100 },
      metadata: {
        createdAt: new Date().toISOString(),
      },
    };

    this.addObject(boardObject);
    return boardObject.id;
  },

  // Update canvas viewport
  updateViewport(position: { x: number; y: number }, zoom: number) {
    canvasPosition.set(position);
    zoomLevel.set(zoom);
  },

  // Resize canvas
  resizeCanvas(width: number, height: number) {
    canvasSize.set({ width, height });
  },

  // Auto-arrange objects in a grid
  autoArrange() {
    boardObjects.update((objects) => {
      const cols = Math.ceil(Math.sqrt(objects.length));
      return objects.map((obj, index) => ({
        ...obj,
        position: {
          x: (index % cols) * 250 + 50,
          y: Math.floor(index / cols) * 200 + 50,
        },
      }));
    });
  },

  // Clear all objects
  clearBoard() {
    boardObjects.set([]);
    selectedObjects.set([]);
    currentBoardId.set(null);
  },

  // Save board state to the API
  async saveBoard(caseId: string) {
    let boardId: string | null = null;
    currentBoardId.subscribe(id => boardId = id)();

    boardObjects.subscribe(async (objects) => {
      try {
        if (boardId) {
          // Ensure 'boardId' is consistently used for updating existing boards.
          const response = await fetch(`/api/evidence-boards/${boardId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ layout: objects }),
          });
          if (!response.ok) throw new Error(`Failed to save board: ${response.statusText}`);
        } else {
          // Create new board
          const response = await fetch('/api/evidence-boards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              caseId,
              name: `Evidence Board for Case ${caseId}`,
              layout: objects,
            }),
          });
          if (!response.ok) throw new Error(`Failed to create board: ${response.statusText}`);
          const newBoard = await response.json();
          if (newBoard.success && newBoard.data) {
            currentBoardId.set(newBoard.data.id);
          }
        }
      } catch (error) {
        console.error("Failed to save board state:", error);
      }
    })();
  },

  // Load board state from the API
  async loadBoard(caseId: string) {
    try {
      const response = await fetch(`/api/evidence-boards?caseId=${caseId}`);
      if (!response.ok) throw new Error(`Failed to load board: ${response.statusText}`);
      
      const result = await response.json();
      if (result.success && result.data.length > 0) {
        const board = result.data[0].board;
        currentBoardId.set(board.id);
        if (board.layout) {
          boardObjects.set(board.layout);
        } else {
          boardObjects.set([]);
        }
      } else {
        boardObjects.set([]);
        currentBoardId.set(null);
      }
    } catch (error) {
      console.error("Failed to load board state:", error);
      boardObjects.set([]);
      currentBoardId.set(null);
    }
  },
};

// Derived stores for computed values
import { derived } from "svelte/store";

export const selectedObjectsData = derived(
  [boardObjects, selectedObjects],
  ([$objects, $selected]) =>
    $objects.filter((obj) => $selected.includes(obj.id)),
);

export const objectsByType = derived([boardObjects], ([$objects]) => ({
  images: $objects.filter((obj) => obj.type === "image"),
  text: $objects.filter((obj) => obj.type === "text"),
  notes: $objects.filter((obj) => obj.type === "note"),
  connections: $objects.filter((obj) => obj.type === "connection"),
}));

export const boardStats = derived([boardObjects], ([$objects]) => ({
  totalObjects: $objects.length,
  imageCount: $objects.filter((obj) => obj.type === "image").length,
  textCount: $objects.filter((obj) => obj.type === "text").length,
  noteCount: $objects.filter((obj) => obj.type === "note").length,
  connectionCount: $objects.reduce(
    (acc, obj) => acc + (obj.connections?.length || 0),
    0,
  ),
}));
