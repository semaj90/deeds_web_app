<!-- @migration-task Error while migrating Svelte code: `</li>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</li>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</li>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</li>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<script lang="ts">
 import Button from './Button.svelte';

 type GraphNode = {
  id: string;
  label: string;
  type: 'person' | 'evidence' | 'location' | 'case';
  x: number;
  y: number;
 };

 type GraphEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  strength: 'strong' | 'medium' | 'weak';
 };

 let { nodes = [], edges = [] } = $props<{
  nodes?: GraphNode[];
  edges?: GraphEdge[];
 }>();

 // Local state derived from props
 let displayNodes = $derived(nodes.length > 0 ? nodes : [
  { id: 'POI-001', label: 'Marcus Chen', type: 'person', x: 200, y: 150 },
  { id: 'POI-003', label: 'David Morrison', type: 'person', x: 450, y: 180 },
  { id: 'POI-002', label: 'Keiko Ito', type: 'person', x: 320, y: 350 },
  { id: 'EV-001', label: 'Security Footage', type: 'evidence', x: 550, y: 320 },
  { id: 'EV-003', label: 'Access Log', type: 'evidence', x: 100, y: 280 },
  { id: 'LOC-001', label: 'Server Room', type: 'location', x: 320, y: 80 }
 ]);

 let displayEdges = $derived(edges.length > 0 ? edges : [
  { id: 'E-1', from: 'POI-001', to: 'POI-003', label: 'Associate', strength: 'strong' },
  { id: 'E-2', from: 'POI-001', to: 'EV-001', label: 'Captured on', strength: 'strong' },
  { id: 'E-3', from: 'POI-001', to: 'EV-003', label: 'Used credentials', strength: 'strong' },
  { id: 'E-4', from: 'POI-002', to: 'EV-001', label: 'Witnessed', strength: 'medium' },
  { id: 'E-5', from: 'POI-003', to: 'LOC-001', label: 'Access to', strength: 'weak' },
  { id: 'E-6', from: 'LOC-001', to: 'EV-003', label: 'Location of', strength: 'medium' }
 ]);

 let activeId = $state<string | null>(null);
 let selectedNode = $state<string | null>(null);
 let boardEl = $state<HTMLElement | null>(null);
 const NODE_RADIUS = 40;

 function onNodePointerDown(e: PointerEvent, id: string) {
  activeId = id;
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
 }

 function onPointerUp(e: PointerEvent) {
  activeId = null;
 }

 function nodeColor(type: GraphNode['type']): string {
  if (type === 'person') return '#ef4444';
  if (type === 'evidence') return '#38bdf8';
  if (type === 'location') return '#facc15';
  return '#4ade80';
 }

 function edgeStyle(strength: GraphEdge['strength']) {
  if (strength === 'strong') return { width: 3, dash: '0' };
  if (strength === 'medium') return { width: 2, dash: '4 2' };
  return { width: 1, dash: '2 2' };
 }

 function getNodeCenter(id: string) {
  const node = displayNodes.find(n => n.id === id);
  return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
 }
</script>

<div class="panel p-3 flex flex-col gap-3">
 <div class="flex items-center justify-between">
  <div class="heading-sub">Relationship Graph</div>
  <div class="flex gap-2">
  <Button class="bits-btn" variant="secondary">
  <span class="i-heroicons-arrow-path mr-1" ></span>
  Auto Layout
  </Button>
  <Button class="bits-btn" variant="primary">
  <span class="i-heroicons-plus-20-solid mr-1" ></span>
  Add Node
  </Button>
  </div>
 </div>

 <div class="text-[10px] font-mono tracking-[0.18em] uppercase text-black/60 px-1">
 Drag nodes to rearrange • {displayNodes.length} nodes • {displayEdges.length} connections
 </div>

 <!-- Graph Canvas -->
 <div
  bind:this={boardEl}
  class="relative w-full h-[600px] evidence-grid overflow-hidden"
 >
  <!-- SVG Layer for Edges -->
  <svg class="absolute inset-0 pointer-events-none" style="z-index: 5;">
  {#each displayEdges as edge (edge.id)}
  {@const from = getNodeCenter(edge.from)}
  {@const to = getNodeCenter(edge.to)}
  {@const style = edgeStyle(edge.strength)}
  {@const midX = (from.x + to.x) / 2}
  {@const midY = (from.y + to.y) / 2}

  <line
  x1={from.x}
  y1={from.y}
  x2={to.x}
  y2={to.y}
  stroke="#111"
  stroke-width={style.width}
  stroke-dasharray={style.dash}
  stroke-linecap="round"
  />

  {#if edge.label}
  <rect
  x={midX - 50}
  y={midY - 12}
  width="100"
  height="24"
  fill="#2f2a22"
  stroke="#111"
  stroke-width="1"
  rx="4"
  />
  <text
  x={midX}
  y={midY + 4}
  text-anchor="middle"
  fill="#d4c7a3"
  font-size="10"
  font-family="monospace"
  class="uppercase tracking-wider"
  >
  {edge.label}
  </text>
  {/if}
  {/each}
  </svg>

  <!-- Nodes -->
  {#each displayNodes as node (node.id)}
  <div
  class="absolute select-none cursor-grab active:cursor-grabbing
  {activeId === node.id ? 'z-50' : 'z-10'}"
  style="transform: translate({node.x - NODE_RADIUS}px: {node.y - NODE_RADIUS}px);"
  onpointerdown={(e) => onNodePointerDown(e, node.id)}
  onclick={() => selectedNode = node.id}
  role="presentation"
  >
  <div class="relative">
  <!-- Node circle -->
  <div
  class="w-20 h-20 rounded-full border-2 border-black flex flex-col items-center justify-center
  {activeId === node.id ? 'scale-110 shadow-lg' : ''}"
  style="background-color: {nodeColor(node.type)}; transition: transform 0.2s;"
  >
  <!-- Icon -->
  <span class="text-white text-xl mb-0.5
  {node.type === 'person' ? 'i-heroicons-user' :
  node.type === 'evidence' ? 'i-heroicons-document-text' :
  node.type === 'location' ? 'i-heroicons-map-pin' : 'i-heroicons-folder-open'}" ></span>

  <!-- ID -->
  <div class="text-[8px] font-mono text-white uppercase tracking-wider">
  {node.id}
  </div>
  </div>

  <!-- Label below -->
  <div class="absolute top-20 left-1/2 -translate-x-1/2 w-32 text-center">
  <div class="panel-soft px-2 py-1">
  <div class="text-[10px] font-mono uppercase tracking-wider truncate">
  {node.label}
  </div>
  </div>
  </div>
  </div>
  </div>
  {/each}
 </div>

 <!-- Legend -->
 <div class="panel-soft p-3">
 <div class="text-[10px] font-mono uppercase tracking-wider text-black/60 mb-2">Legend</div>
 <div class="grid grid-cols-4 gap-2 text-xs">
 <div class="flex items-center gap-2">
 <div class="w-4 h-4 rounded-full border border-black" style="background-color: #ef4444;" ></div>
 <span class="text-[10px] font-mono">Person</span>
 </div>
 <div class="flex items-center gap-2">
 <div class="w-4 h-4 rounded-full border border-black" style="background-color: #38bdf8;" ></div>
 <span class="text-[10px] font-mono">Evidence</span>
 </div>
 <div class="flex items-center gap-2">
 <div class="w-4 h-4 rounded-full border border-black" style="background-color: #facc15;" ></div>
 <span class="text-[10px] font-mono">Location</span>
 </div>
 <div class="flex items-center gap-2">
 <div class="w-4 h-4 rounded-full border border-black" style="background-color: #4ade80;" ></div>
 <span class="text-[10px] font-mono">Case</span>
 </div>
 </div>

 <div class="mt-2 flex gap-4 text-[10px] font-mono text-black/70">
 <div class="flex items-center gap-2">
 <div class="w-8 h-0.5 bg-black" ></div>
 <span>Strong</span>
 </div>
 <div class="flex items-center gap-2">
 <svg width="32" height="2"><line x1="0" y1="1" x2="32" y2="1" stroke="#000" stroke-width="2" stroke-dasharray="4 2" /></svg>
 <span>Medium</span>
 </div>
 <div class="flex items-center gap-2">
 <svg width="32" height="2"><line x1="0" y1="1" x2="32" y2="1" stroke="#000" stroke-width="1" stroke-dasharray="2 2" /></svg>
 <span>Weak</span>
 </div>
 </div>
 </div>
</div>

<style>
 .evidence-grid {
 background-color: #d4c7a3;
 background-image: radial-gradient(circle at 1px 1px, rgba(0, 0, 0, 0.25) 1px, transparent 0);
 background-size: 24px 24px;
 border: 1px solid rgba(0, 0, 0, 0.6);
 box-shadow: 0 0 0 2px #000;
 }
</style>




