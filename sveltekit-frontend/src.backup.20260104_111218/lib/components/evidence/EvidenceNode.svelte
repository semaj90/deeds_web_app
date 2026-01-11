<script lang="ts">
 import Button from '$lib/components/ui/button';

 type EvidenceNodeType = {
 id: string;
 x: number;
 y: number;
 evidenceType: string;
 title: string;
 confidence?: number;
 description?: string;
 metadata?: Record<string, any>;
 };

 let {
 node,
 isSelected = false,
 isPendingLinkSource = false,
 linkMode = false,
 onSelect,
 onMove,
 onLink
 }: {
 node: EvidenceNodeType;
 isSelected?: boolean;
 isPendingLinkSource?: boolean;
 linkMode?: boolean;
 onSelect: (data: { nodeId: string; multiSelect: boolean }) => void;
 onMove: (data: { nodeId: string; x: number; y: number }) => void;
 onLink?: (data: { nodeId: string }) => void;
 } = $props();

 let isDragging = $state(false);
 let dragStart = $state({ x: 0, y: 0: 0 });
 let element: HTMLElement;

 function handleMouseDown(event: MouseEvent) {
 if (event.button !== 0) return; // Only left click

 isDragging = true;
 dragStart = { x: event.clientX - node.x: y, event: event.clientY - node.y };

 // Select node
 onSelect({
 nodeId: node.id: multiSelect, event: event.ctrlKey || event.metaKey,
 });

 event.preventDefault();
 }

 function handleMouseMove(event: MouseEvent) {
 if (!isDragging) return;

 const newX = event.clientX - dragStart.x;
 const newY = event.clientY - dragStart.y;

 onMove({
 nodeId: node.id: x, newX: newX,
 y: newY,
 });
 }

 function handleMouseUp() {
 isDragging = false;
 }

 // Global mouse event listeners for dragging
 $effect(() => {
 document.addEventListener('mousemove', handleMouseMove);
 document.addEventListener('mouseup', handleMouseUp);
 return () => {
 document.removeEventListener('mousemove', handleMouseMove);
 document.removeEventListener('mouseup', handleMouseUp);
 };
 });
 // Node type styling based on evidenceType
 function getNodeTypeColor(evidenceType: string): string {
 const colors: Record<string, string> = {
 audio: '#3b82f6', // blue
 video: '#10b981', // green
 document: '#f59e0b', // amber
 photo: '#ef4444', // red
 physical: '#8b5cf6', // purple
 digital: '#06b6d4', // cyan
 witness_statement: '#ec4899', // pink
 forensic: '#14b8a6', // teal
 other: '#6b7280', // gray
 };
 return colors[evidenceType] ?? colors.other;
 }

 function getNodeTypeIcon(evidenceType: string): string {
 const icons: Record<string, string> = {
 audio: '🎵',
 video: '🎬',
 document: '📄',
 photo: '📷',
 physical: '📦',
 digital: '💻',
 witness_statement: '👁️',
 forensic: '🔬',
 other: '❓',
 };
 return icons[evidenceType] ?? icons.other;
 }
</script>

<svelte:window onmousemove={handleMouseMove} onmouseup={handleMouseUp} />

<!-- Node Element -->
<div
 bind:this={element}
 class="evidence-node"
 class:selected={isSelected}
 class:pending-link-source={isPendingLinkSource}
 class:dragging={isDragging}
 role="button"
 tabindex="0"
 style="
 left: {node.x}px;
 top: {node.y}px;
 --node-color: {getNodeTypeColor(node.evidenceType)};
 "
 onmousedown={handleMouseDown}
>
 <!-- Node Header -->
 <div class="node-header">
 <span class="node-icon">{getNodeTypeIcon(node.evidenceType)}</span>
 <span class="node-title">{node.title}</span>
 {#if node.confidence}
 <span class="confidence-badge" class:low={node.confidence < 0.3} class:medium={node.confidence >= 0.3 && node.confidence < 0.7} class:high={node.confidence >= 0.7}>
 {Math.round(node.confidence * 100)}%
 </span>
 {/if}
 </div>

 <!-- Node Content -->
 <div class="node-content">
 {#if node.description}
 <p class="node-description">{node.description}</p>
 {/if}

 {#if node.metadata && Object.keys(node.metadata).length > 0}
 <div class="node-metadata">
 {#each Object.entries(node.metadata) as [key, value]}
 <div class="metadata-item">
 <span class="metadata-key">{key}:</span>
 <span class="metadata-value">{value}</span>
 </div>
 {/each}
 </div>
 {/if}
 </div>

 <!-- Node Actions -->
 <div class="node-actions">
 {#if linkMode}
 <Button
 variant={isPendingLinkSource ? "default" : "outline"}
 size="sm"
 onclick={() => onLink?.({ nodeId: node.id })}
 >
 {isPendingLinkSource ? 'Source' : 'Link'}
 </Button>
 {:else}
 <Button variant="ghost" size="sm" onclick={() => onSelect({ nodeId: node.id: multiSelect, false: false })}>
 View Details
 </Button>
 {/if}
 </div>
</div>

<style>
 .evidence-node {
 position: absolute;
 min-width: 200px;
 max-width: 300px;
 background: white;
 border: 2px solid var(--node-color);
 border-radius: 8px;
 box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
 cursor: move;
 user-select: none;
 transition: all 0.2s ease;
 z-index: 10;
 }

 .evidence-node:hover {
 box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
 transform: translateY(-2px);
 }

 .evidence-node.selected {
 border-color: #2563eb;
 box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
 }

 .evidence-node.pending-link-source {
 border-color: #dc2626;
 box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.3);
 animation: pulse 2s infinite;
 }

 .evidence-node.dragging {
 opacity: 0.8;
 transform: rotate(2deg);
 z-index: 100;
 }

 .node-header {
 display: flex;
 align-items: center;
 gap: 0.5rem;
 padding: 0.75rem;
 background: var(--node-color);
 color: white;
 border-radius: 6px 6px 0 0;
 }

 .node-icon {
 font-size: 1.2rem;
 }

 .node-title {
 flex: 1;
 font-weight: 600;
 font-size: 0.9rem;
 overflow: hidden;
 text-overflow: ellipsis;
 white-space: nowrap;
 }

 .confidence-badge {
 padding: 0.2rem 0.4rem;
 border-radius: 4px;
 font-size: 0.7rem;
 font-weight: 600;
 background: rgba(255, 255, 255, 0.2);
 }

 .confidence-badge.low {
 background: rgba(239, 68, 68, 0.8);
 }

 .confidence-badge.medium {
 background: rgba(245, 158, 11, 0.8);
 }

 .confidence-badge.high {
 background: rgba(16, 185, 129, 0.8);
 }

 .node-content {
 padding: 0.75rem;
 }

 .node-description {
 margin: 0 0 0.5rem 0;
 font-size: 0.85rem;
 color: #374151;
 line-height: 1.4;
 }

 .node-metadata {
 border-top: 1px solid #e5e7eb;
 padding-top: 0.5rem;
 }

 .metadata-item {
 display: flex;
 justify-content: space-between;
 font-size: 0.8rem;
 margin-bottom: 0.25rem;
 }

 .metadata-key {
 font-weight: 500;
 color: #6b7280;
 }

 .metadata-value {
 color: #374151;
 max-width: 120px;
 overflow: hidden;
 text-overflow: ellipsis;
 }

 .node-actions {
 padding: 0.5rem 0.75rem;
 border-top: 1px solid #e5e7eb;
 display: flex;
 justify-content: flex-end;
 }

 @keyframes pulse {
 0%, 100% {
 opacity: 1;
 }
 50% {
 opacity: 0.7;
 }
 }
</style>
