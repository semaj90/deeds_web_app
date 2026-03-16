<script lang="ts">
 import type { BoardSnapshotSchema } from '$lib/schemas/board';

 interface CanvasElement {
   id: string;
   x: number;
   y: number;
   type: BoardSnapshotSchema['nodes'][number]['kind'];
   text: string;
   evidenceId?: string;
   color?: string;
 }

 interface CitationPoint {
   id: string;
   source: string;
 }

 interface EvidenceItem {
   id: string;
   title: string;
   evidenceType: string;
 }

 interface Props {
   canvasState: BoardSnapshotSchema | null;
   reportId: string;
   evidence?: EvidenceItem[];
   citationPoints?: CitationPoint[];
   save: (canvasState: BoardSnapshotSchema) => Promise<void>;
 }

 let { canvasState, reportId, evidence = [], citationPoints = [], save }: Props = $props();

 function toCanvasElement(node: BoardSnapshotSchema['nodes'][number]): CanvasElement {
    return {
      id: node.id,
      x: node.x,
      y: node.y,
      type: node.kind,
      text: node.title ?? node.body ?? node.kind,
      evidenceId: node.evidenceId,
      color: node.color,
    };
 }

 function toBoardKind(type: string): BoardSnapshotSchema['nodes'][number]['kind'] {
    switch (type) {
      case 'note':
      case 'image':
      case 'pdf':
      case 'link':
      case 'evidence':
        return type;
      default:
        return 'note';
    }
 }

 let currentCanvasElements = $derived((canvasState?.nodes ?? []).map(toCanvasElement));

 async function handleSave() {
    const updatedCanvasState: BoardSnapshotSchema = {
      version: canvasState?.version ?? 1,
      viewport: canvasState?.viewport ?? {
        pan: { x: 0, y: 0 },
        zoom: 1,
      },
      nodes: currentCanvasElements.map((element) => ({
        id: element.id,
        kind: toBoardKind(element.type),
        x: element.x,
        y: element.y,
        w: 240,
        h: 96,
        title: element.text,
        body: element.text,
        evidenceId: element.type === 'evidence' ? (element.evidenceId ?? element.id) : undefined,
        color: element.color,
      })),
      edges: canvasState?.edges ?? [],
      updatedAt: new Date().toISOString(),
    };

    try {
      await save(updatedCanvasState);
    } catch (error) {
      console.error('Failed to save canvas:', error);
    }
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



