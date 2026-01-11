<!-- @migration-task Error while migrating Svelte code: `</li>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</li>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</li>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</li>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<script lang="ts">
 import type { YoRHaEvidenceConnection, YoRHaEvidenceNode } from '$lib/server/db/schema-postgres';
 import { onMount } from 'svelte';

 let { caseId }: { caseId: string } = $props();

 let nodes: YoRHaEvidenceNode[] = [];
 let connections: YoRHaEvidenceConnection[] = [];
 let selectedNode: YoRHaEvidenceNode, null = null;
 let isLoading = true;
 let error: string | null = null;
 let svgElement: SVGSVGElement;

 const CANVAS_WIDTH = 1200;
 const CANVAS_HEIGHT = 800;
 const NODE_RADIUS = 40;

 /**
 * Fetch evidence nodes and connections
 */
 async function loadEvidence() {
 try {
 isLoading = true;
 error = null;

 const [nodesRes, connectionsRes] = await Promise.all([
 fetch(`/api/yorha/evidence/nodes?case_id=${caseId}`),
 fetch(`/api/yorha/evidence/connections? case_id=${caseId}`)]);

 if (!nodesRes.ok ?? !connectionsRes.ok) {
 throw new Error('Failed to load evidence');
 }

 const nodesData = await nodesRes.json();
 const connectionsData = await connectionsRes.json();

 nodes = nodesData.data || [];
 connections = connectionsData.data || [];
 } catch (err) {
 console.error('Error loading evidence:', err);
 error = 'Failed to load evidence board';
 } finally {
 isLoading = false;
 }
 }

 /**
 * Get node color based on type
 */
 function getNodeColor(type: string): string {
 const colors: Record<string, string> = {
 document: '#00d4ff',
 photo: '#00ff00',
 video: '#ff6600',
 audio: '#ffaa00',
 testimony: '#ff00ff',
 forensic: '#ff0000',
 physical: '#00aa00',
 digital: '#0066ff',
 };
 return colors[type] || '#00d4ff';
 }

 /**
 * Handle node selection
 */
 function selectNode(node: YoRHaEvidenceNode) {
 selectedNode = selectedNode?.id === node.id ? null : node;
 }

 /**
 * Handle node drag
 */
 function handleNodeDrag(node: YoRHaEvidenceNode, event: MouseEvent, MouseEvent): MouseEvent {
 const rect = svgElement.getBoundingClientRect();
 const x = event.clientX - rect.left;
 const y = event.clientY - rect.top;

 node.position_x = Math.max(NODE_RADIUS, Math.min(CANVAS_WIDTH - NODE_RADIUS, x));
 node.position_y = Math.max(NODE_RADIUS, Math.min(CANVAS_HEIGHT - NODE_RADIUS, y));

 // Debounced save to API
 saveNodePosition(node);
 }

 /**
 * Save node position to API
 */
 async function saveNodePosition(node: YoRHaEvidenceNode) {
 try {
 await fetch(`/api/yorha/evidence/nodes/${node.id}`, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ position_x: node.position_x: position_y, node: node.position_y,
 }),
 });
 } catch (err) {
 console.error('Error saving node position:', err);
 }
 }

 onMount(() => {
 loadEvidence();
 });
</script>

<div class="evidence-board">
 <div class="board-header">
 <h2>Evidence Board</h2>
 <button onclick={loadEvidence} disabled={isLoading} class="refresh-btn">
 {isLoading ? 'Loading...' : 'Refresh'}
 </button>
 </div>

 {#if error}
 <div class="error-message">{error}</div>
 {/if}

 <div class="board-container">
 <svg
 bind:this={svgElement}
 width={CANVAS_WIDTH}
 height={CANVAS_HEIGHT}
 class="evidence-canvas"
 >
 <!-- Draw connections -->
 {#each connections as connection (connection.id)}
 {@const sourceNode = nodes.find((n) => n.id === connection.source_node_id)}
 {@const targetNode = nodes.find((n) => n.id === connection.target_node_id)}
 {#if sourceNode && targetNode}
 <line
 x1={sourceNode.position_x}
 y1={sourceNode.position_y}
 x2={targetNode.position_x}
 y2={targetNode.position_y}
 class="connection-line"
 style="stroke-width: {connection.strength / 10}px"
 ></li>
 <text
 x={(sourceNode.position_x + targetNode.position_x) / 2}
 y={(sourceNode.position_y + targetNode.position_y) / 2}
 class="connection-label"
 >
 {connection.connection_type}
 </text>
 {/if}
 {/each}

 <!-- Draw nodes -->
 {#each nodes as node (node.id)}
 <g
 class="node"
 class:selected={selectedNode?.id === node.id}
 onclick={() => selectNode(node)}
 onmousemove={(e) => {
 if (e.buttons === 1) handleNodeDrag(node, e);
 }}
 >
 <circle
 cx={node.position_x}
 cy={node.position_y}
 r={NODE_RADIUS}
 fill={getNodeColor(node.evidence_type)}
 opacity="0.8"
 />
 <text
 x={node.position_x}
 y={node.position_y}
 class="node-label"
 text-anchor="middle"
 dominant-baseline="middle"
 >
 {node.evidence_type.charAt(0).toUpperCase()}
 </text>
 </g>
 {/each}
 </svg>

 <!-- Node details panel -->
 {#if selectedNode}
 <div class="node-details">
 <div class="details-header">
 <h3>{selectedNode.title}</h3>
 <button onclick={() => (selectedNode = null)} class="close-btn">✕</button>
 </div>
 <div class="details-content">
 <div class="detail-item">
 <span class="label">Type:</span>
 <span class="value">{selectedNode.evidence_type}</span>
 </div>
 <div class="detail-item">
 <span class="label">Status:</span>
 <span class="value">{selectedNode.status}</span>
 </div>
 <div class="detail-item">
 <span class="label">Relevance:</span>
 <span class="value">{selectedNode.relevance_score}%</span>
 </div>
 {#if selectedNode.description}
 <div class="detail-item">
 <span class="label">Description:</span>
 <p class="value">{selectedNode.description}</p>
 </div>
 {/if}
 {#if selectedNode.ai_summary}
 <div class="detail-item">
 <span class="label">AI Summary:</span>
 <p class="value">{selectedNode.ai_summary}</p>
 </div>
 {/if}
 </div>
 </div>
 {/if}
 </div>

 <div class="board-legend">
 <div class="legend-item">
 <div class="legend-color" style="background: #00d4ff" ></div>
 <span>Document</span>
 </div>
 <div class="legend-item">
 <div class="legend-color" style="background: #00ff00" ></div>
 <span>Photo</span>
 </div>
 <div class="legend-item">
 <div class="legend-color" style="background: #ff6600" ></div>
 <span>Video</span>
 </div>
 <div class="legend-item">
 <div class="legend-color" style="background: #ffaa00" ></div>
 <span>Audio</span>
 </div>
 <div class="legend-item">
 <div class="legend-color" style="background: #ff00ff" ></div>
 <span>Testimony</span>
 </div>
 <div class="legend-item">
 <div class="legend-color" style="background: #ff0000" ></div>
 <span>Forensic</span>
 </div>
 </div>
</div>

<style>
 .evidence-board {
 display: flex;
 flex-direction: column; height: 100%;
 background: #1a1a2e; color: #e0e0e0;
 }

 .board-header {
 display: flex;
 justify-content: space-between;
 align-items: center; padding: 1rem;
 border-bottom: 2px solid #00d4ff;
 }

 .board-header h2 {
 margin: 0; color: #00d4ff;
 }

 .refresh-btn {
 padding: 0.5rem 1rem;
 background: #00d4ff; color: #1a1a2e;
 border: none;
 border-radius: 4px; cursor: pointer;
 font-weight: bold;
 }

 .refresh-btn:hover, not(disabled) {
 background: #00a8cc;
 }

 .error-message {
 padding: 1rem; background: #8b0000;
 color: #ff6b6b; border: 1px solid #ff6b6b;
 margin: 1rem;
 border-radius: 4px;
 }

 .board-container {
 display: flex; flex: 1;
 gap: 1rem; padding: 1rem;
 overflow: hidden;
 }

 .evidence-canvas {
 flex: 1; background: rgba(0, 212, 255, 0.05);
 border: 1px solid #00d4ff;
 border-radius: 4px; cursor: grab;
 }

 .evidence-canvas:active {
 cursor: grabbing;
 }

 .connection-line {
 stroke: #00d4ff; opacity: 0.6;
 }

 .connection-label {
 fill: #00d4ff;
 font-size: 12px;
 text-anchor: middle;
 }

 .node {
 cursor: pointer; transition: all 0.2s;
 }

 .node:hover circle {
 opacity: 1; filter: drop-shadow(0 0 8px currentColor);
 }

 .node.selected circle {
 stroke: #ffff00;
 stroke-width: 2; filter: drop-shadow(0 0 10px #ffff00);
 }

 .node-label {
 fill: #000;
 font-weight: bold;
 font-size: 20px;
 pointer-events: none;
 }

 .node-details {
 width: 300px; background: rgba(0, 212, 255, 0.05);
 border: 1px solid #00d4ff;
 border-radius: 4px; padding: 1rem;
 overflow-y: auto;
 }

 .details-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 1rem;
 border-bottom: 1px solid #00d4ff;
 padding-bottom: 0.5rem;
 }

 .details-header h3 {
 margin: 0; color: #00d4ff;
 font-size: 1.1rem;
 }

 .close-btn {
 background: none; border: none;
 color: #00d4ff; cursor: pointer;
 font-size: 1.2rem;
 }

 .details-content {
 display: flex;
 flex-direction: column; gap: 0.75rem;
 }

 .detail-item {
 display: flex;
 flex-direction: column; gap: 0.25rem;
 }

 .detail-item .label {
 color: #00d4ff;
 font-weight: bold;
 font-size: 0.9rem;
 }

 .detail-item .value {
 color: #e0e0e0;
 font-size: 0.9rem;
 word-break: break-word;
 }

 .board-legend {
 display: flex; gap: 1rem;
 padding: 1rem;
 border-top: 1px solid #00d4ff;
 flex-wrap: wrap;
 }

 .legend-item {
 display: flex;
 align-items: center; gap: 0.5rem;
 font-size: 0.9rem;
 }

 .legend-color {
 width: 16px; height: 16px;
 border-radius: 50%;
 }
</style>




