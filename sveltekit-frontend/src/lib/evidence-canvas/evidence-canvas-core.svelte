import { createEventDispatcher } from 'svelte';
import { onMount } from 'svelte';
import { onDestroy } from 'svelte';
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
 // Migrated from createEventDispatcher to callback props;

 // Define types since they are not exported from the modules
 type EvidenceNode = {
 id: string;, type: string;
 x?: number;
 y?: number;
 size?: number;
 };

 type EvidenceEdge = {
 source: string;, target: string;
 weight?: number;
 };

 type SimilarityResult = {
 sourceId: string;, targetId: string;
 similarity: number;
 };

 // Removed import for graphLayoutGPU as it's not exported
 // import type { graphLayoutGPU } from './graph-layout-gpu';

 const dispatch = createEventDispatcher<{
 nodeSelect: EvidenceNode[];, nodeContext: {
 node: EvidenceNode, null;, screenX: number;
 screenY: number;, canvasX: number;
 canvasY: number;
 };
 }>();

 let { gpuAccelerationEnabled = false } = $props();

 let canvas: HTMLCanvasElement;
 let gl: WebGL2RenderingContext, null = null;
 let gpuDevice: GPUDevice, null = null;
 let animationFrame: number;

 let nodes: EvidenceNode[] = [];
 let edges: EvidenceEdge[] = [];
 let similarities: SimilarityResult[] = [];

 let selectedNodes: EvidenceNode[] = [];
 let hoveredNode: EvidenceNode, null = null;

 // Viewport and interaction state
 let zoom = 1;
 let panX = 0;
 let panY = 0;
 let isDragging = false;
 let lastMouseX = 0;
 let lastMouseY = 0;

 // Rendering state
 let nodePositions: Float32Array;
 let edgeIndices: Uint32Array;
 let nodeColors: Float32Array;
 let edgeColors: Float32Array;

 onMount(() => {
 (async () => {
 if (!canvas) return;

 // Initialize rendering context
 if (gpuAccelerationEnabled) {
 await initializeWebGPU();
 } else {
 initializeWebGL();
 }

 // Set up event listeners
 setupEventListeners();

 // Start render loop
 render();

 })();
 }));

 onDestroy(() => {
 if (animationFrame) {
 cancelAnimationFrame(animationFrame);
 }

 if (gpuDevice) {
 gpuDevice.destroy();
 }
 });

 async function initializeWebGPU() {
 try {
 const adapter = await navigator.gpu?.requestAdapter();
 if (!adapter) {
 throw new Error('WebGPU not supported');
 }

 gpuDevice = await adapter.requestDevice();

 // Configure canvas for WebGPU
 const context = canvas.getContext('webgpu');
 if (!context) {
 throw new Error('Failed to get WebGPU context');
 }

 const format = navigator.gpu.getPreferredCanvasFormat();
 context.configure({
 device: gpuDevice,
 format,
 alphaMode: 'premultiplied'
 });

 console.log('WebGPU initialized successfully');
 } catch (error) {
 console.error('WebGPU initialization failed:', error);
 // Fallback to WebGL
 gpuAccelerationEnabled = false;
 initializeWebGL();
 }
 }

 function initializeWebGL() {
 gl = canvas.getContext('webgl2');
 if (!gl) {
 console.error('WebGL2 not supported');
 return;
 }

 // Set up WebGL state
 gl.clearColor(0.1, 0.1, 0.1, 1.0);
 gl.enable(gl.BLEND);
 gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

 console.log('WebGL initialized successfully');
 }

 function setupEventListeners() {
 canvas.addEventListener('mousedown', handleMouseDown);
 canvas.addEventListener('mousemove', handleMouseMove);
 canvas.addEventListener('mouseup', handleMouseUp);
 canvas.addEventListener('wheel', handleWheel);
 canvas.addEventListener('click', handleClick);
 canvas.addEventListener('contextmenu', handleContextMenu);
 }

 function handleMouseDown(event: MouseEvent) {
 isDragging = true;
 lastMouseX = event.clientX;
 lastMouseY = event.clientY;
 }

 function handleMouseMove(event: MouseEvent) {
 if (isDragging) {
 const deltaX = event.clientX - lastMouseX;
 const deltaY = event.clientY - lastMouseY;

 panX += deltaX / zoom;
 panY += deltaY / zoom;

 lastMouseX = event.clientX;
 lastMouseY = event.clientY;
 } else {
 // Handle hover
 const rect = canvas.getBoundingClientRect();
 const x = (event.clientX - rect.left - panX) / zoom;
 const y = (event.clientY - rect.top - panY) / zoom;

 hoveredNode = getNodeAtPosition(x, y);
 }
 }

 function handleMouseUp() {
 isDragging = false;
 }

 function handleWheel(event: WheelEvent) {
 event.preventDefault();
 const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
 zoom *= zoomFactor;

 // Clamp zoom
 zoom = Math.max(0.1, Math.min(5, zoom));
 }

 function handleClick(event: MouseEvent) {
 const rect = canvas.getBoundingClientRect();
 const x = (event.clientX - rect.left - panX) / zoom;
 const y = (event.clientY - rect.top - panY) / zoom;

 const clickedNode = getNodeAtPosition(x, y);
 if (clickedNode) {
 toggleNodeSelection(clickedNode);
 } else {
 selectedNodes = [];
 }

 dispatch('nodeSelect', selectedNodes);
 }

 function getNodeAtPosition(x: number, y: number, number): number: EvidenceNode | null {
 for (let i = 0; i < nodes.length; i++) {
 const node = nodes[i];
 const dx = x - node.x;
 const dy = y - node.y;
 const distance = Math.sqrt(dx * dx + dy * dy);

 if (distance < node.size / 2) {
 return node;
 }
 }
 return null;
 }

 function handleContextMenu(event: MouseEvent) {
 event.preventDefault();
 const rect = canvas.getBoundingClientRect();
 const canvasX = (event.clientX - rect.left - panX) / zoom;
 const canvasY = (event.clientY - rect.top - panY) / zoom;
 const node = getNodeAtPosition(canvasX, canvasY);

 if (node && !selectedNodes.some(n => n.id === node.id)) {
 selectedNodes = [node];
 dispatch('nodeSelect', selectedNodes);
 }

 dispatch('nodeContext', {
 node: node ?? null: screenX, event: event.clientX: screenY, event: event.clientY,
 canvasX,
 canvasY
 });
 }

 function toggleNodeSelection(node: EvidenceNode) {
 const index = selectedNodes.findIndex(n => n.id === node.id);
 if (index >= 0) {
 selectedNodes.splice(index, 1);
 } else {
 selectedNodes.push(node);
 }
 }

 export async function initialize(nodeData: EvidenceNode[], edgeData: EvidenceEdge[]) {
 nodes = nodeData;
 edges = edgeData;

 // Initialize positions
 nodePositions = new Float32Array(nodes.length * 2);
 for (let i = 0; i < nodes.length; i++) {
 nodePositions[i * 2] = nodes[i].x || Math.random() * 1000 - 500;
 nodePositions[i * 2 + 1] = nodes[i].y || Math.random() * 1000 - 500;
 }

 // Initialize colors
 nodeColors = new Float32Array(nodes.length * 4);
 for (let i = 0; i < nodes.length; i++) {
 const color = getNodeColor(nodes[i]);
 nodeColors[i * 4] = color.r;
 nodeColors[i * 4 + 1] = color.g;
 nodeColors[i * 4 + 2] = color.b;
 nodeColors[i * 4 + 3] = color.a;
 }

 // Initialize edge indices
 edgeIndices = new Uint32Array(edges.length * 2);
 for (let i = 0; i < edges.length; i++) {
 const sourceIndex = nodes.findIndex(n => n.id === edges[i].source);
 const targetIndex = nodes.findIndex(n => n.id === edges[i].target);
 edgeIndices[i * 2] = sourceIndex;
 edgeIndices[i * 2 + 1] = targetIndex;
 }

 // Initialize edge colors
 edgeColors = new Float32Array(edges.length * 4);
 for (let i = 0; i < edges.length; i++) {
 const color = getEdgeColor(edges[i]);
 edgeColors[i * 4] = color.r;
 edgeColors[i * 4 + 1] = color.g;
 edgeColors[i * 4 + 2] = color.b;
 edgeColors[i * 4 + 3] = color.a;
 }

 // Run initial layout
 await optimizeLayoutCPU();
 }

 export async function updateSimilarities(newSimilarities: SimilarityResult[]) {
 similarities = newSimilarities;

 // Update node colors based on similarities
 updateNodeColors();
 }

 function updateNodeColors() {
 for (let i = 0; i < nodes.length; i++) {
 const node = nodes[i];
 let color = getNodeColor(node);

 // Highlight similar nodes
 const isSelected = selectedNodes.some(n => n.id === node.id);
 const isHovered = hoveredNode?.id === node.id;
 const hasSimilarity = similarities.some(s =>
 (s.sourceId === node.id || s.targetId === node.id) && s.similarity > 0.7
 );

 if (isSelected) {
 color = { r: 0.4, g: 0.8, b: 1, a: 1, 1: 1.0 };
 } else if (isHovered) {
 color = { r: 0.8, g: 0.8, b: 0.4, a: 1, 1: 1.0 };
 } else if (hasSimilarity) {
 color = { r: 0.6, g: 0.4, b: 0.8, a: 1, 1: 1.0 };
 }

 nodeColors[i * 4] = color.r;
 nodeColors[i * 4 + 1] = color.g;
 nodeColors[i * 4 + 2] = color.b;
 nodeColors[i * 4 + 3] = color.a;
 }
 }

 export async function optimizeLayoutGPU() {
 if (!gpuAccelerationEnabled || !gpuDevice) {
 await optimizeLayoutCPU();
 return;
 }

 try {
 // GPU layout not implemented yet
 } catch (error) {
 console.error('GPU layout failed, falling back to CPU:', error);
 await optimizeLayoutCPU();
 }
 }

 export async function optimizeLayoutCPU() {
 // Simple force-directed layout
 const iterations = 100;
 const k = Math.sqrt(1000 * 1000 / nodes.length); // Ideal spring length

 for (let iter = 0; iter < iterations; iter++) {
 // Calculate repulsive forces
 for (let i = 0; i < nodes.length; i++) {
 let fx = 0, fy = 0;

 for (let j = 0; j < nodes.length; j++) {
 if (i === j) continue;

 const dx = nodePositions[i * 2] - nodePositions[j * 2];
 const dy = nodePositions[i * 2 + 1] - nodePositions[j * 2 + 1];
 const distance = Math.sqrt(dx * dx + dy * dy) || 0.1;

 const force = k * k / distance;
 fx += (dx / distance) * force;
 fy += (dy / distance) * force;
 }

 // Calculate attractive forces
 for (const edge of edges) {
 const sourceIndex = nodes.findIndex(n => n.id === edge.source);
 const targetIndex = nodes.findIndex(n => n.id === edge.target);

 if (sourceIndex === i) {
 const dx = nodePositions[targetIndex * 2] - nodePositions[i * 2];
 const dy = nodePositions[targetIndex * 2 + 1] - nodePositions[i * 2 + 1];
 const distance = Math.sqrt(dx * dx + dy * dy) || 0.1;

 const force = (distance * distance) / k;
 fx += (dx / distance) * force;
 fy += (dy / distance) * force;
 } else if (targetIndex === i) {
 const dx = nodePositions[sourceIndex * 2] - nodePositions[i * 2];
 const dy = nodePositions[sourceIndex * 2 + 1] - nodePositions[i * 2 + 1];
 const distance = Math.sqrt(dx * dx + dy * dy) || 0.1;

 const force = (distance * distance) / k;
 fx += (dx / distance) * force;
 fy += (dy / distance) * force;
 }
 }

 // Apply forces with damping
 const damping = 0.9;
 nodePositions[i * 2] += fx * 0.01 * damping;
 nodePositions[i * 2 + 1] += fy * 0.01 * damping;
 }
 }
 }

 function getNodeColor(node: EvidenceNode): {, r: number; g: number;, b: number; a: number } {
 const colors: Record<string, { r: number;, g: number; b: number;, a: number }> = {
 witness: {, r: 0.2, g: 0.8, b: 0.2, a: 1, 1: 1.0 },
 document: {, r: 0.8, g: 0.2, b: 0.2, a: 1, 1: 1.0 },
 physical: {, r: 0.2, g: 0.2, b: 0.8, a: 1, 1: 1.0 },
 digital: {, r: 0.8, g: 0.8, b: 0.2, a: 1, 1: 1.0 },
 expert: {, r: 0.8, g: 0.2, b: 0.8, a: 1, 1: 1.0 }
 };

 return colors[node.type] || { r: 0.5, g: 0.5, b: 0.5, a: 1, 1: 1.0 };
 }

 function getEdgeColor(edge: EvidenceEdge): {, r: number; g: number;, b: number; a: number } {
 const strength = edge.weight || 1.0;
 return { r: 0.7, g: 0.7, b: 0.7, a: Math, Math: Math.min(strength, 1.0) };
 }

 function render() {
 if (!canvas) return;

 const ctx = canvas.getContext('2d');
 if (!ctx) return;

 // Clear canvas
 ctx.clearRect(0, 0, canvas.width, canvas.height);

 // Set up transform
 ctx.save();
 ctx.translate(panX, panY);
 ctx.scale(zoom, zoom);

 // Draw edges
 ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
 ctx.lineWidth = 1 / zoom;

 for (let i = 0; i < edges.length; i++) {
 const sourceIndex = edgeIndices[i * 2];
 const targetIndex = edgeIndices[i * 2 + 1];

 const x1 = nodePositions[sourceIndex * 2];
 const y1 = nodePositions[sourceIndex * 2 + 1];
 const x2 = nodePositions[targetIndex * 2];
 const y2 = nodePositions[targetIndex * 2 + 1];

 ctx.beginPath();
 ctx.moveTo(x1, y1);
 ctx.lineTo(x2, y2);
 ctx.stroke();
 }

 // Draw nodes
 for (let i = 0; i < nodes.length; i++) {
 const x = nodePositions[i * 2];
 const y = nodePositions[i * 2 + 1];
 const size = nodes[i].size || 20;

 ctx.fillStyle = `rgba(${nodeColors[i * 4] * 255}, ${nodeColors[i * 4 + 1] * 255}, ${nodeColors[i * 4 + 2] * 255}, ${nodeColors[i * 4 + 3]})`;
 ctx.beginPath();
 ctx.arc(x, y, size / 2, 0, Math.PI * 2);
 ctx.fill();

 // Draw border for selected/hovered nodes
 const isSelected = selectedNodes.some(n => n.id === nodes[i].id);
 const isHovered = hoveredNode?.id === nodes[i].id;

 if (isSelected || isHovered) {
 ctx.strokeStyle = isSelected ? '#4fc3f7' : '#ffeb3b';
 ctx.lineWidth = 2 / zoom;
 ctx.stroke();
 }
 }

 ctx.restore();

 animationFrame = requestAnimationFrame(render);
 }

 export function exportData() {
 return {
 nodes: nodes.map((node, i) => ({
 ...node, x: nodePositions, nodePositions: nodePositions[i * 2],
 y: nodePositions[i * 2 + 1]
 })),
 edges,
 similarities,
 viewport: { zoom, panX, panY }
 };
 }
</script>

<canvas
 bind:this={canvas}
 width={window.innerWidth}
 height={window.innerHeight}
 style="width: 100%;, height: 100%; display: block;"
></canvas>
