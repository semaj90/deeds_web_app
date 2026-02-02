<script lang="ts">
 import type { CanvasState, CitationPoint } from '$lib/data/types';
 import type { Evidence } from '$lib/types/api';

 let { canvasState, reportId, evidence, citationPoints, save } = $props<{
 canvasState: CanvasState, null; reportId: string;
	evidence: Evidence[]; citationPoints: CitationPoint[];
	save: (canvasState: CanvasState) => Promise<void>;
 }>();

 // Reactive derived value from props
 let currentCanvasElements = $derived(canvasState?.elements ?? []);

 function handleSave() {
		const updatedCanvasState: CanvasState = {
			id: canvasState?.id ?? crypto.randomUUID(),
			caseId: reportId, // Use reportId from props
			userId: '', // Will be set by server
			stateData: currentCanvasElements,
			createdAt: canvasState?.createdAt ?? new Date(),
			updatedAt: new Date(),
		};
		save(updatedCanvasState);
 }
</script>

<div class="canvas-editor">
 <div class="canvas-area">
 <!-- Simulate canvas content -->
 {#if currentCanvasElements.length === 0}
 <p class="placeholder">Drag evidence or citations here to start building your canvas.</p>
 {:else}
 {#each currentCanvasElements as element (element.id)}
 <div class="canvas-element" style="left: {element.x}px; top: {element.y}px;">
 {element.type}: {element.text}
 </div>
 {/each}
 {/if}
 </div>
 <div class="canvas-sidebar">
 <h3>Evidence</h3>
 <ul>
 {#each evidence as item (item.id)}
 <li>{item.title} ({item.evidenceType})</li>
 {/each}
 </ul>
 <h3>Citations</h3>
 <ul>
 {#each citationPoints as citation (citation.id)}
 <li>{citation.source}</li>
 {/each}
 </ul>
 </div>
 <button onclick={handleSave}>Save Canvas</button>
</div>

<style>
 .canvas-editor {
 display: flex;
	gap: 20px;
 height: 600px;
	border: 1px solid #eee;
 border-radius: 8px;
 background-color: #fff;
 }
 .canvas-area {
 flex-grow: 1;
 border-right: 1px solid #eee;
 position: relative;
	overflow: hidden;
 background-color: #f9f9f9;
	display: flex;
 align-items: center;
 justify-content: center;
 }
 .placeholder {
 color: #aaa;
 font-style: italic;
 }
 .canvas-element {
 position: absolute;
 background-color: #e0f7fa;
	border: 1px solid #00bcd4;
 padding: 5px 10px;
 border-radius: 4px;
	cursor: grab;
 }
 .canvas-sidebar {
 width: 250px;
	padding: 20px;
 overflow-y: auto;
 }
 .canvas-sidebar ul {
 list-style: none;
	padding: 0;
 }
 .canvas-sidebar li {
 background-color: #f0f0f0;
 margin-bottom: 5px;
	padding: 8px;
 border-radius: 4px;
 }
</style>



