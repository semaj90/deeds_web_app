<script lang="ts">
  import Button from '$lib/components/ui/button';
  import Select from '$lib/components/ui/select';
  import { evidence, evidenceConnections } from '$lib/server/db/schema-postgres';
  import { onMount } from 'svelte';
  import { get, writable } from 'svelte/store';
  import EvidenceConnections from './EvidenceConnections.svelte';
  import EvidenceNode from './EvidenceNode.svelte';

  let { caseId, initialNodes = [], initialConnections = [] }: { caseId: string; initialNodes?: EvidenceNodeType[]; initialConnections?: EvidenceConnection[] } = $props();
  type EvidenceConnection = typeof evidenceConnections.$inferSelect;

  let { caseId, initialNodes = [], initialConnections = [] }: { caseId: string; initialNodes?: (typeof EvidenceNodeType)[]; initialConnections?: any[] } = $props();

  // Board modes
  let nodes = writable<EvidenceNodeType[]>(initialNodes);
  let connections = writable<EvidenceConnection[]>(initialConnections);
  let boardMode: BoardMode = 'free';
  let nodes = writable<(typeof EvidenceNodeType)[]>(initialNodes);
  let connections = writable<any[]>(initialConnections);
  let selectedNodes = writable<Set<string>>(new Set());

  // Reactive statements for store values
  let currentNodes = $derived(() => $nodes);
  let currentSelectedNodes = $derived(() => $selectedNodes);

  // Grid snapping
  const GRID_SIZE = 50;
  function snapToGrid(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.round(x / GRID_SIZE) * GRID_SIZE,
      y: Math.round(y / GRID_SIZE) * GRID_SIZE,
    };
  }

  // Magnetic mode physics
  async function applyMagneticForces() {
    const currentNodes = get(nodes);
    const currentConnections = get(connections);

    try {
      const response = await fetch('/api/evidence/ai/magnetize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: currentNodes,
          connections: currentConnections,
          caseId,
        }),
      });

      const { forces } = await response.json();

      // Apply forces to nodes
      nodes.update(current => current.map(node => {
        const force = forces.find((f: any) => f.id === node.id);
        if (force) {
          return {
            ...node,
            x: node.x + force.dx,
            y: node.y + force.dy,
          };
        }
        return node;
      }));
    } catch (error) {
      console.error('Failed to apply magnetic forces:', error);
    }
  }

  // Node selection
  function selectNode(nodeId: string, multiSelect: boolean = false) {
    selectedNodes.update(current => {
      const newSelection = new Set(current);
      if (multiSelect) {
        if (newSelection.has(nodeId)) {
          newSelection.delete(nodeId);
        } else {
          newSelection.add(nodeId);
        }
      } else {
        newSelection.clear();
        newSelection.add(nodeId);
      }
      return newSelection;
    });
  }

  // Node movement
  function moveNode(nodeId: string, newX: number, newY: number) {
    if (boardMode === 'grid') {
      const snapped = snapToGrid(newX, newY);
      newX = snapped.x;
      newY = snapped.y;
    }

    nodes.update(current =>
      current.map(node =>
        node.id === nodeId ? { ...node, x: newX, y: newY } : node
      )
    );

    // Update position in database
    fetch(`/api/evidence/nodes/${nodeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: newX, y: newY }),
    });
  }

  // Create connection between selected nodes
  async function createConnection() {
    const selected = Array.from(get(selectedNodes));
    if (selected.length === 2) {
      try {
        const response = await fetch('/api/evidence/connections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromNodeId: selected[0],
            toNodeId: selected[1],
            caseId,
            strength: 0.5, // Default strength
          }),
        });

        const newConnection = await response.json();
        connections.update(current => [...current, newConnection]);
        selectedNodes.set(new Set()); // Clear selection
      } catch (error) {
        console.error('Failed to create connection:', error);
      }
    }
  }

  // Delete selected nodes
  async function deleteSelectedNodes() {
    const selected = Array.from(get(selectedNodes));
    for (const nodeId of selected) {
      try {
        await fetch(`/api/evidence/nodes/${nodeId}`, { method: 'DELETE' });
      } catch (error) {
        console.error('Failed to delete node:', error);
      }
    }

    nodes.update(current => current.filter(node => !selected.includes(node.id)));
    selectedNodes.set(new Set());
  }

  // Mode change handler
  function changeMode(newMode: BoardMode) {
    boardMode = newMode;
    if (newMode === 'magnetic') {
      applyMagneticForces();
    }
  }

  onMount(() => {
    // Periodic magnetic force application
    const magneticInterval = setInterval(() => {
      if (boardMode === 'magnetic') {
        applyMagneticForces();
      }
    }, 2000); // Apply forces every 2 seconds

    return () => clearInterval(magneticInterval);
  });
</script>

    <div class="mode-selector">
      <select bind:value={boardMode} on:change={(e) => changeMode(e.target.value as BoardMode)} class="mode-selector">
        <option value="grid">Grid Mode</option>
        <option value="free">Free Mode</option>
        <option value="magnetic">Magnetic AI</option>
      </select>
    </div>ption value="free">Free Mode</option>
        <option value="magnetic">Magnetic AI</option>
      </Select>
    </div>

    <div class="actions">
      <Button
        variant="outline"
        on:click={createConnection}
        disabled={$selectedNodes.size !== 2}
      >
        Connect Nodes
      </Button>
      <Button
        variant="destructive"
        on:click={deleteSelectedNodes}
        disabled={$selectedNodes.size === 0}
      >
        Delete Selected
      </Button>
    </div>
  </div>

  <!-- Board Canvas -->
  <div
    class="board-canvas"
    class:grid-mode={boardMode === 'grid'}
    class:magnetic-mode={boardMode === 'magnetic'}
    bind:this={canvasElement}
  >
    <!-- Connections Layer -->
    <EvidenceConnections connections={connections} nodes={nodes} />
      <EvidenceNode
        {...node}
        isSelected={currentSelectedNodes.has(node.id)}
        mode={boardMode}
        on:select={(e: CustomEvent<{nodeId: string; multiSelect: boolean}>) => selectNode(e.detail.nodeId, e.detail.multiSelect)}
        on:move={(e: CustomEvent<{nodeId: string; x: number; y: number}>) => moveNode(e.detail.nodeId, e.detail.x, e.detail.y)}
      />mode={boardMode}
        on:select={(e) => selectNode(e.detail.nodeId, e.detail.multiSelect)}
        on:move={(e) => moveNode(e.detail.nodeId, e.detail.x, e.detail.y)}
      />
    {/each}
  </div>
</div>

<style>
  .evidence-board-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #f8f9fa;
  }

  .board-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: white;
    border-bottom: 1px solid #e9ecef;
    gap: 1rem;
  }

  .mode-selector {
    min-width: 150px;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .board-canvas {
    flex: 1;
    position: relative;
    overflow: hidden;
    background: white;
  }

  .board-canvas.grid-mode {
    background-image:
      linear-gradient(rgba(0,0,0,.1) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,0,0,.1) 1px, transparent 1px);
    background-size: 50px 50px;
  }

  .board-canvas.magnetic-mode {
    background: radial-gradient(circle at center, rgba(59, 130, 246, 0.1) 0%, transparent 70%);
  }
</style>
