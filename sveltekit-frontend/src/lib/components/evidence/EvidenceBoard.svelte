<script lang="ts">

 import Button from '$lib/components/ui/Button.svelte';
 import EvidenceBoardToolbar from './EvidenceBoardToolbar.svelte';
 import EvidenceConnections from './EvidenceConnections.svelte';
 import EvidenceNode from './EvidenceNode.svelte';
 import RelationshipInspector from './RelationshipInspector.svelte';

 // Define types locally to avoid importing server schema in browser
 type EvidenceNodeType = { id: string, caseId: string;
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
 y: number };

 type EvidenceConnection = { id: string, caseId: string;
 fromEvidenceId: string;
	toEvidenceId: string;
 connectionType: string;
 label?: string;
 notes?: string;
	strength: number;
 isVisible: boolean;
 createdBy?: number;
	createdAt: string;
 updatedAt: string };
 type BoardMode = 'grid' | 'free' | 'magnetic';

 let { caseId, initialNodes = [], initialConnections = [] }: {
	caseId: string;
 initialNodes?: EvidenceNodeType[];
 initialConnections?: EvidenceConnection[]
 } = $props();

 // Board state — Svelte 5 runes (no writable stores)
 let nodes = $state<EvidenceNodeType[]>(initialNodes);
 let connections = $state<EvidenceConnection[]>(initialConnections);
 let boardMode = $state<BoardMode>('free');
 let linkMode = $state(false);
 let selectedNodes = $state<Set<string>>(new Set());
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

 // Grid snapping
 const GRID_SIZE = 50;
 function snapToGrid(x: number, y: number): { x: number, y: number } {
 return {
 x: Math.round(x / GRID_SIZE) * GRID_SIZE,
 y: Math.round(y / GRID_SIZE) * GRID_SIZE,
 };
 }

 // Magnetic mode physics
 async function applyMagneticForces() {
 try {
 const response = await fetch('/api/evidence/ai/magnetize', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
 nodes, connections,
 caseId,
 }),
 });

 const { forces } = await response.json();

 // Apply forces to nodes
 nodes = nodes.map(node => {
 const force = forces.find((f: any) => f.id === node.id);
 if (force) {
 return {
 ...node,
 x: node.x + force.dx,
 y: node.y + force.dy,
 };
 }
 return node;
 });
 } catch (error) {
 console.error('Failed to apply magnetic forces:', error);
 }
 }

 // Node selection
 function selectNode(nodeId: string, multiSelect: boolean = false) {
 const newSelection = new Set(selectedNodes);
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
 selectedNodes = newSelection;

 if (!multiSelect) {
 selectedEvidenceForInspector = nodeId;
 }
 }

 // Node movement
 function moveNode(nodeId: string, newX: number, newY: number) {
 if (boardMode === 'grid') {
 const snapped = snapToGrid(newX, newY);
 newX = snapped.x;
 newY = snapped.y;
 }

 nodes = nodes.map(node =>
 node.id === nodeId ? { ...node, x: newX, y: newY } : node
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
 const selected = Array.from(selectedNodes);
 if (selected.length === 2) {
 try {
 const response = await fetch('/api/evidence/connections', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
 fromNodeId: selected[0],
 toNodeId: selected[1],
 caseId,
 strength: 0.5,
 }),
 });

 const newConnection = await response.json();
 connections = [...connections, newConnection];
 selectedNodes = new Set();
 } catch (error) {
 console.error('Failed to create connection:', error);
 }
 }
 }

 // Create relationship between evidence items
 async function createRelationship(fromEvidenceId: string, toEvidenceId: string, relationshipType: string = selectedRelationshipType) {
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
 pendingLinkSource = null;
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
 pendingLinkSource = nodeId;
 selectNode(nodeId, false);
 } else if (pendingLinkSource === nodeId) {
 pendingLinkSource = null;
 selectedNodes = new Set();
 } else {
 createRelationship(pendingLinkSource, nodeId);
 selectedNodes = new Set();
 }
 }

 // Delete selected nodes
 async function deleteSelectedNodes() {
 const selected = Array.from(selectedNodes);
 for (const nodeId of selected) {
 try {
 await fetch(`/api/evidence/nodes/${nodeId}`, { method: 'DELETE' });
 } catch (error) {
 console.error('Failed to delete node:', error);
 }
 }

 nodes = nodes.filter(node => !selected.includes(node.id));
 selectedNodes = new Set();
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
 console.log('attach selected nodes', Array.from(selectedNodes));
 break;
 case 'pin':
 console.log('pin selected nodes', Array.from(selectedNodes));
 break;
 case 'connect':
 linkMode = !linkMode;
 pendingLinkSource = null;
 selectedNodes = new Set();
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
 default: break;
 }
 }

 let canvasElement: HTMLDivElement;

 $effect(() => {
 const magneticInterval = setInterval(() => {
 if (boardMode === 'magnetic') {
 applyMagneticForces();
 }
 }, 2000);

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
 <Button class="bits-btn"
 variant={linkMode ? "default" : "outline"}
 onclick={() => { linkMode = !linkMode; pendingLinkSource = null; selectedNodes = new Set(); }}
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

 <Button class="bits-btn"
 variant="outline"
 onclick={createConnection}
 disabled={selectedNodes.size !== 2}
 >
 Connect Nodes
 </Button>
 <Button class="bits-btn"
 variant="destructive"
 onclick={deleteSelectedNodes}
 disabled={selectedNodes.size === 0}
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
 {#each nodes as evidenceNode (evidenceNode.id)}
 <EvidenceNode
 node={evidenceNode}
 isSelected={selectedNodes.has(evidenceNode.id)}
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
 background: #f8f9fa;}

 .board-toolbar {
 display: flex;
 justify-content: space-between;
 align-items: center;
	padding: 1rem;
 background: white;
 border-bottom: 1px solid #e9ecef;
 gap: 1rem;}

 .mode-selector {
 min-width: 150px;}

 .actions { display: flex;
		gap: 0.5rem;
 align-items: center;}

 .relationship-selector {
 display: flex;
 align-items: center;
	gap: 0.5rem;
 background: #f0f9ff;
	padding: 0.5rem;
 border-radius: 0.375rem;
	border: 1px solid #0ea5e9;}

 .relationship-label {
 font-size: 0.875rem;
 font-weight: 500;
	color: #0c4a6e;
 white-space: nowrap;}

 .relationship-select {
 padding: 0.25rem 0.5rem;
 border: 1px solid #cbd5e1;
 border-radius: 0.25rem;
	background: white;
 font-size: 0.875rem;
 min-width: 140px;}

 .board-main-content { flex: 1;
		display: flex;}

 .board-canvas { flex: 1;
		position: relative;
 overflow: hidden;
	background: white;}

 .board-canvas.grid-mode {
 background-image:
 linear-gradient(rgba(0,0,0,.1) 1px, transparent 1px),
 linear-gradient(90deg, rgba(0,0,0,.1) 1px, transparent 1px);
 background-size: 50px 50px;}

 .board-canvas.magnetic-mode {
 background: radial-gradient(circle at center, rgba(59, 130, 246, 0.1) 0%, transparent 70%);
 }
</style>
