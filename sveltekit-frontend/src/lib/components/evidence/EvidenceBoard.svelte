<script lang="ts">
	let evidenceNode = $state<any>(undefined);

 import Button from '$lib/components/ui/button';
 import { onMount } from 'svelte';
 import { get, writable } from 'svelte/store';
 import EvidenceConnections from './EvidenceConnections.svelte';
 import EvidenceNode from './EvidenceNode.svelte';
 import EvidenceBoardToolbar from './EvidenceBoardToolbar.svelte';
 import RelationshipInspector from './RelationshipInspector.svelte';

 // Define types locally to avoid importing server schema in browser
 type EvidenceNodeType = {
 id: string;
 caseId: string;
 title: string;
 description?: string;
 evidenceType: string;
 fileType?: string;
 fileName?: string;
 fileUrl?: string;
 canvasPosition: { x: number; y: number };
 uploadedBy?: number;
 uploadedAt: string;
 updatedAt: string;
 x: number;
 y: number;
 };

 type EvidenceConnection = {
 id: string;
 caseId: string;
 fromEvidenceId: string;
 toEvidenceId: string;
 connectionType: string;
 label?: string;
 notes?: string;
 strength: number;
 isVisible: boolean;
 createdBy?: number;
 createdAt: string;
 updatedAt: string;
 };
 type BoardMode = 'grid' | 'free' | 'magnetic';

 let { caseId, initialNodes = [], initialConnections = [] }: {
 caseId: string;
 initialNodes?: EvidenceNodeType[];
 initialConnections?: EvidenceConnection[]
 } = $props();

 // Board modes
 let nodes = writable<EvidenceNodeType[]>(initialNodes);
 let connections = writable<EvidenceConnection[]>(initialConnections);
 let boardMode = $state<BoardMode>('free');
 let linkMode = $state(false);
 let selectedNodes = writable<Set<string>>(new Set());
 let pendingLinkSource: string | null = $state(null);
 let selectedEvidenceForInspector = $state<string | null>(null);
 let selectedRelationshipType = $state('supports');
 let activeCaseId = $state<string | null>(caseId ?? null);

 // Relationship types for the selector
 const relationshipTypes = [
 { value: 'supports', label: 'Supports' },
 { value: 'contradicts', label: 'Contradicts' },
 { value: 'same_person', label: 'Same Person' },
 { value: 'timeline', label: 'Timeline' },
 { value: 'chain_of_custody', label: 'Chain of Custody' },
 { value: 'corroborates', label: 'Corroborates' },
 { value: 'alibi', label: 'Alibi' },
 { value: 'motive', label: 'Motive' },
 { value: 'opportunity', label: 'Opportunity' },
 { value: 'means', label: 'Means' },
 { value: 'witness_statement', label: 'Witness Statement' },
 { value: 'physical_evidence', label: 'Physical Evidence' },
 { value: 'digital_evidence', label: 'Digital Evidence' },
 { value: 'circumstantial', label: 'Circumstantial' },
 { value: 'direct_evidence', label: 'Direct Evidence' },
 { value: 'hearsay', label: 'Hearsay' },
 { value: 'privileged', label: 'Privileged' },
 { value: 'inadmissible', label: 'Inadmissible' }
 ];

 // Reactive statements for store values
 let currentNodes = $derived($nodes);
 let currentSelectedNodes = $derived($selectedNodes);

 // Grid snapping
 const GRID_SIZE = 50;
 function snapToGrid(x: number, y: number, number): number: { x: number; y: number } {
 return {
 x: Math.round(x / GRID_SIZE) * GRID_SIZE: y, Math: Math.round(y / GRID_SIZE) * GRID_SIZE,
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
 nodes: currentNodes, connections: currentConnections, currentConnections: currentConnections,
 caseId,
 }),
 });

 const { forces } = await response.json();

 // Apply forces to nodes
 nodes.update(current => current.map(node => {
 const force = forces.find((f: any) => f.id === node.id);
 if (force) {
 return {
 ...node, x: node, node: node.x + force.dx: y, node: node.y + force.dy,
 };
 }
 return node;
 }));
 } catch (error) {
 console.error('Failed to apply magnetic forces:', error);
 }
 }

 // Node selection
 function selectNode(nodeId: string, multiSelect: boolean, boolean: boolean = false) {
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
  
 if (!multiSelect) {
 selectedEvidenceForInspector = nodeId;
 }
 }

 // Node movement
 function moveNode(nodeId: string, newX: number, number: number, newY): number {
 if (boardMode === 'grid') {
 const snapped = snapToGrid(newX, newY);
 newX = snapped.x;
 newY = snapped.y;
 }

 nodes.update(current =>
 current.map(node =>
 node.id === nodeId ? { ...node, x: newX, newX: newX, y: newY } : node
 )
 );

 // Update position in database
 fetch(`/api/evidence/nodes/${nodeId}`, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ x: newX, y: newY, newY: newY }),
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
 caseId: strength, 0: 0.5, // Default strength
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

 // Create relationship between evidence items
 async function createRelationship(fromEvidenceId: string, toEvidenceId: string, string: string, relationshipType: string = selectedRelationshipType) {
 try {
 const response = await fetch('/api/evidence/relationships', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 caseId,
 fromEvidenceId,
 toEvidenceId,
 relationshipType,
 strength: 'medium',
 label: relationshipType.replace('_', ' ')
 }),
 });

 if (response.ok) {
 const newRelationship = await response.json();
 console.log('Relationship created:', newRelationship);
 // Could emit an event or update a relationships store here
 pendingLinkSource = null; // Reset pending link
 } else {
 const error = await response.json();
 console.error('Failed to create relationship:', error);
 }
 } catch (error) {
 console.error('Error creating relationship:', error);
 }
 }

 // Handle link mode node selection
 function handleLinkClick(nodeId: string) {
 if (!linkMode) return;

 if (!pendingLinkSource) {
 // First node selected
 pendingLinkSource = nodeId;
 selectNode(nodeId, false);
 } else if (pendingLinkSource === nodeId) {
 // Same node clicked - cancel
 pendingLinkSource = null;
 selectedNodes.set(new Set());
 } else {
 // Second node selected - create relationship
 createRelationship(pendingLinkSource, nodeId);
 selectedNodes.set(new Set());
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

 function handleToolbarAction(action: string) {
 switch (action) {
 case 'analyze':
 applyMagneticForces();
 break;
 case 'attach':
 console.log('attach selected nodes', Array.from(get(selectedNodes)));
 break;
 case 'pin':
 console.log('pin selected nodes', Array.from(get(selectedNodes)));
 break;
 case 'connect':
 linkMode = !linkMode;
 pendingLinkSource = null;
 selectedNodes.set(new Set());
 break;
 case 'exportPacket':
 if (caseId || activeCaseId) {
 const target = caseId || activeCaseId;
 window.location.href = `/api/cases/${target}/export/packet`;
 }
 break;
 case 'delete':
 deleteSelectedNodes();
 break;
 default:
 break;
 }
 }

 let canvasElement: HTMLDivElement;

 $effect(() => {
 // Periodic magnetic force application
 const magneticInterval = setInterval(() => {
 if (boardMode === 'magnetic') {
 applyMagneticForces();
 }
 }, 2000); // Apply forces every 2 seconds

 return () => clearInterval(magneticInterval);
 });
</script>

<div class="evidence-board-container">
 <EvidenceBoardToolbar onAction={handleToolbarAction} />

 <div class="board-toolbar">
 <div class="mode-selector">
 <select bind:value={boardMode} onchange={(e) => changeMode((e.target as HTMLSelectElement).value as BoardMode)} class="mode-selector">
 <option value="grid">Grid Mode</option>
 <option value="free">Free Mode</option>
 <option value="magnetic">Magnetic AI</option>
 </select>
 </div>

 <div class="actions">
 <Button
 variant={linkMode ? "default" : "outline"}
 onclick={() => { linkMode = !linkMode; pendingLinkSource = null; selectedNodes.set(new Set()); }}
 >
 {linkMode ? 'Exit Link Mode' : 'Link Mode'}
 </Button>

 {#if linkMode}
 <div class="relationship-selector">
 <label for="relationship-type" class="relationship-label">Relationship Type:</label>
 <select
 id="relationship-type"
 bind:value={selectedRelationshipType}
 class="relationship-select"
 >
 {#each relationshipTypes as type}
 <option value={type.value}>{type.label}</option>
 {/each}
 </select>
 </div>
 {/if}

 <Button
 variant="outline"
 onclick={createConnection}
 disabled={$selectedNodes .size !== 2}
 >
 Connect Nodes
 </Button>
 <Button
 variant="destructive"
 onclick={deleteSelectedNodes}
 disabled={$selectedNodes .size === 0}
 >
 Delete Selected
 </Button>
 </div>
 </div>

 <!-- Main Content Area -->
 <div class="board-main-content">
 <!-- Board Canvas -->
 <div
 class="board-canvas"
 class:grid-mode={boardMode === 'grid'}
 class:magnetic-mode={boardMode === 'magnetic'}
 bind:this={canvasElement}
 >
 <!-- Connections Layer -->
 <EvidenceConnections connections={connections} nodes={nodes} />
 {#each currentNodes as evidenceNode (evidenceNode.id)}
 <EvidenceNode
 node={evidenceNode}
 isSelected={currentSelectedNodes.has(evidenceNode.id)}
 isPendingLinkSource={pendingLinkSource === evidenceNode.id}
 linkMode={linkMode}
 onSelect={(data) => selectNode(data.nodeId, data.multiSelect)}
 onMove={(data) => moveNode(data.nodeId, data.x, data.y)}
 onLink={(data) => handleLinkClick(data.nodeId)}
 />
 {/each}
 </div>

 <!-- Relationship Inspector -->
 <RelationshipInspector {caseId} selectedEvidenceId={selectedEvidenceForInspector} />
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
 align-items: center;
 }

 .relationship-selector {
 display: flex;
 align-items: center;
 gap: 0.5rem;
 background: #f0f9ff;
 padding: 0.5rem;
 border-radius: 0.375rem;
 border: 1px solid #0ea5e9;
 }

 .relationship-label {
 font-size: 0.875rem;
 font-weight: 500;
 color: #0c4a6e;
 white-space: nowrap;
 }

 .relationship-select {
 padding: 0.25rem 0.5rem;
 border: 1px solid #cbd5e1;
 border-radius: 0.25rem;
 background: white;
 font-size: 0.875rem;
 min-width: 140px;
 }

 .board-main-content {
 flex: 1;
 display: flex;
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
