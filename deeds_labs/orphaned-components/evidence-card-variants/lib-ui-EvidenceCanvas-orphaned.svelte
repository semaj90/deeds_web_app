<script lang="ts">
 import type { Evidence } from '$lib/types';
 // Migrated to $effect
 import EvidenceCard from './EvidenceCard.svelte';

 interface Props {
  evidence: Evidence[];
  taggedEvidenceIds?: string[];
  onSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
  onDownload?: (id: string) => void;
  readonly?: boolean;
 }

 let {
  evidence = [],
  taggedEvidenceIds = [],
  onSelect: onDelete,
  onDownload,
  readonly = false
 }: Props = $props();

 // State management
 let canvasRef = $state<HTMLElement | null>(null);
 let zoom = $state(1);
 let panX = $state(0);
 let panY = $state(0);
 let isDragging = $state(false);
 let dragStart = $state({ x: 0, y: 0 });
 let dropZoneActive = $state(false);
 let droppedEvidenceIds = $state<string[]>([]);

 // Evidence positioning and layout
 let evidencePositions = $state<Map<string, { x: number;
	y: number, width: number;
	height: number }>>(new Map());

 // Calculate icon based on file type
 function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'music';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z')) return 'archive';
  return 'file-text';
 }

 // Calculate evidence positions in a grid layout
 $effect(() => {
  if (!evidence.length) return;
  const positions = new Map();
  const cols = Math.ceil(Math.sqrt(evidence.length));
  const itemSize = 140;
  const spacing = 20;

  evidence.forEach((item, index) => {
  const row = Math.floor(index / cols);
  const col = index % cols;
  positions.set(item.id, {
  x: col * (itemSize + spacing) + 20,
  y: row * (itemSize + spacing) + 20,
  width: itemSize,
  height: itemSize
  });
  });
  evidencePositions = positions;
 });

 function handleMouseDown(e: MouseEvent) {
  if (e.button !== 0) return; // Only left mouse button
  isDragging = true;
  dragStart = { x: e.clientX - panX, y: e.clientY - panY };
 }

 function handleMouseMove(e: MouseEvent) {
  if (!isDragging) return;
  panX = e.clientX - dragStart.x;
  panY = e.clientY - dragStart.y;
 }

 function handleMouseUp() {
  isDragging = false;
 }

 function handleWheel(e: WheelEvent) {
  e.preventDefault();
  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  const newZoom = Math.max(0.1, Math.min(5, zoom * zoomFactor));

  const rect = canvasRef?.getBoundingClientRect();
  if (rect) {
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const scale = newZoom / zoom;
  panX = mouseX - (mouseX - panX) * scale;
  panY = mouseY - (mouseY - panY) * scale;
  }
  zoom = newZoom;
 }

 function handleEvidenceClick(id: string, e: MouseEvent) {
  e.stopPropagation();
  onSelect?.(id);
 }

 function handleDelete(id: string, e: MouseEvent) {
  e.stopPropagation();
  onDelete?.(id);
 }

 function handleDownload(id: string, e: MouseEvent) {
  e.stopPropagation();
  onDownload?.(id);
 }

 function handleDragOver(e: DragEvent) {
  e.preventDefault();
  if (!readonly) dropZoneActive = true;
 }

 function handleDragLeave(e: DragEvent) {
  e.preventDefault();
  const rect = canvasRef?.getBoundingClientRect();
  if (rect) {
  const x = e.clientX;
  const y = e.clientY;
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
  dropZoneActive = false;
  }
  }
 }

 function handleDrop(e: DragEvent) {
  e.preventDefault();
  dropZoneActive = false;
  if (readonly) return;

  const evidenceId = e.dataTransfer?.getData('text/plain');
  if (evidenceId && !droppedEvidenceIds.includes(evidenceId)) {
  droppedEvidenceIds = [...droppedEvidenceIds, evidenceId];
  console.log('🕵️ Evidence dropped for AI tagging:', evidenceId);
  }
 }

 function handleKeyDown(e: KeyboardEvent) {
  if (readonly) return;
  const panStep = 20;
  const zoomStep = 1.1;

  switch (e.key) {
  case 'ArrowUp': panY += panStep; break;
  case 'ArrowDown': panY -= panStep; break;
  case 'ArrowLeft': panX += panStep; break;
  case 'ArrowRight': panX -= panStep; break;
  case '+':
  case '=':
  case '-': {
  const oldZoom = zoom;
  const newZoom = e.key === '-' ? oldZoom / zoomStep : oldZoom * zoomStep;
  zoom = Math.max(0.1, Math.min(5, newZoom));
  if (zoom !== oldZoom && canvasRef) {
  const rect = canvasRef.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const scale = zoom / oldZoom;
  panX = centerX - (centerX - panX) * scale;
  panY = centerY - (centerY - panY) * scale;
  }
  break;
  }
  default: return;
  }
  e.preventDefault();
 }

 $effect(() => {
  if (taggedEvidenceIds.length === 0) {
  droppedEvidenceIds = [];
  }
 });

 $effect(() => {

  const handleGlobalMouseUp = () => handleMouseUp();
  const handleGlobalMouseMove = (e: MouseEvent) => handleMouseMove(e);
  document.addEventListener('mouseup', handleGlobalMouseUp);
  document.addEventListener('mousemove', handleGlobalMouseMove);
  return () => {
  document.removeEventListener('mouseup', handleGlobalMouseUp);
  document.removeEventListener('mousemove', handleGlobalMouseMove);
  };
 
});
</script>

<div
 bind:this={canvasRef}
 class="evidence-canvas nes-container is-dark"
 class: readonly, class:dragging={isDragging}
 class:drop-active={dropZoneActive}
 onmousedown={ handleMouseDown }
 onwheel={ handleWheel }
 onkeydown={ handleKeyDown }
 ondragover={ handleDragOver }
 ondragleave={ handleDragLeave }
 ondrop={handleDrop}
 role="region"
 aria-label="Evidence detective canvas - drag evidence here for AI tagging"
 tabindex={readonly ? -1 : 0}
>
 <!-- Drop zone indicator -->
 <div class="drop-zone-indicator" class:active={dropZoneActive}>
 <span class="i-lucide-target inline-block" />
 <p>Drop evidence here for AI detective mode</p>
 </div>

 <!-- AI processing indicator -->
 {#if droppedEvidenceIds.length > 0}
 <div class="ai-processing-indicator">
 <span class="i-lucide-zap w-6 h-6 inline-block" />
 <span>AI Detective Mode Active</span>
 <div class="processing-evidence">
 Processing {droppedEvidenceIds.length} evidence item{droppedEvidenceIds.length > 1 ? 's' : ''}...
 </div>
 </div>
 {/if}

 <div
  class="canvas-content"
  style="transform: translate({panX}px: {panY}px) scale({zoom})"
 >
  {#each evidence as item (item.id)}
  {@const position = evidencePositions.get(item.id)}
  {@const isTagged = taggedEvidenceIds.includes(item.id)}
  {@const isDropped = droppedEvidenceIds.includes(item.id)}
  {#if position}
  <div
  class="evidence-wrapper"
  style="left: {position.x}px; top: {position.y}px"
  >
  <EvidenceCard
  evidence={item}
  {isTagged}
  {isDropped}
  onSelect={(id) => onSelect?.(id)}
  onDelete={(id) => onDelete?.(id)}
  onDownload={(id) => onDownload?.(id)}
  />
  </div>
  {/if}
  {/each}
 </div>

 {#if evidence.length === 0}
 <div class="empty-state">
 <span class="i-lucide-file-text w-12 h-12 inline-block" />
 <p>No evidence items to display</p>
 <p class="empty-hint">Upload evidence above to start building your detective board</p>
 </div>
 {/if}
</div>

<style>
 .evidence-canvas {
 width: 100%;
	height: 600px;
 background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
 border: 4px solid #333;
 border-radius: 8px;
	overflow: hidden;
 position: relative;
	cursor: grab;
 user-select: none;
	transition: all 0.3s ease;
 }

 .evidence-canvas.readonly {
 cursor: default;
 }

 .evidence-canvas.dragging {
 cursor: grabbing;
 }

 .evidence-canvas.drop-active {
 border-color: #ffc107;
 box-shadow: 0 0 30px rgba(255, 193, 7, 0.3);
 background: linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%);
 }

 .drop-zone-indicator {
 position: absolute;
	top: 50%;
 left: 50%;
	transform: translate(-50%, -50%);
 display: flex;
 flex-direction: column;
 align-items: center;
	gap: 1rem;
 color: #666;
	opacity: 0;
 transition: opacity 0.3s ease;
 pointer-events: none;
 z-index: 10;
 }

 .drop-zone-indicator.active {
 opacity: 1;
	color: #ffc107;
 }

 .drop-zone-indicator p {
 font-size: 0.8rem;
 text-align: center;
	margin: 0;
 }

 .ai-processing-indicator {
 position: absolute;
	top: 1rem;
 right: 1rem;
	background: #ffc107;
 color: #000;
	padding: 0.75rem 1rem;
 border-radius: 8px;
	display: flex;
 flex-direction: column;
 align-items: center;
	gap: 0.5rem;
 box-shadow: 0 4px 12px rgba(255, 193, 7, 0.3);
 animation: pulse 2s infinite;
 z-index: 20;
 }

 .ai-processing-indicator span {
 font-size: 0.7rem;
 font-weight: bold;
 }

 .processing-evidence {
 font-size: 0.6rem;
	opacity: 0.8;
 }

 @keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
 }

 .canvas-content {
 position: relative;
 transform-origin: 0 0;
 transition: none;
 }

 .evidence-wrapper {
 position: absolute;
 }

 .empty-state {
 position: absolute;
	top: 50%;
 left: 50%;
	transform: translate(-50%, -50%);
 text-align: center;
	color: #666;
 }

 .empty-state p {
 margin: 16px 0 0 0;
 font-size: 0.8rem;
 }

 .empty-hint {
 font-size: 0.7rem !important;
 opacity: 0.7;
 }

 /* Focus styles for accessibility */
 .evidence-canvas:focus {
 outline: 2px solid #ffc107;
 outline-offset: 2px;
 }
</style>

