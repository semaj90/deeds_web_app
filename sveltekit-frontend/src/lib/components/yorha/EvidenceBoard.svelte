<script lang="ts">
import { onMount } from "svelte";
  // Migrated to $effect

  interface Node { id: string, title: string;
    type: string;
	x: number;
    y: number;
  }

  interface Connection { id: string, from_id: string;
    to_id: string;
  }

  let {
    caseId = ''
  }: {
    caseId?: string
  } = $props();

  let nodes = $state<Node[]>([]);
  let connections = $state<Connection[]>([]);
  let selectedNode = $state<Node | null>(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let svgElement = $state<SVGSVGElement | null>(null);

  let isDragging = $state(false);
  let draggedNode = $state<Node | null>(null);

  const CANVAS_WIDTH = 1200;
  const CANVAS_HEIGHT = 800;
  const NODE_RADIUS = 30;

  async function loadEvidence() {
    try {
      isLoading = true;
      const [nodesRes, connRes] = await Promise.all([
        fetch(`/api/yorha/evidence/nodes?case_id=${caseId}`),
        fetch(`/api/yorha/evidence/connections?case_id=${caseId}`)
      ]);

      if (!nodesRes.ok || !connRes.ok) throw new Error('Failed to load data');

      const nData = await nodesRes.json();
      const cData = await connRes.json();

      nodes = nData.data || [];
      connections = cData.data || [];
    } catch (err) {
      error = 'System failure: Evidence data retrieval aborted.';
    } finally {
      isLoading = false;
    }
  }

  function getNodeColor(type: string): string {
    const map: Record<string, string> = {
      document: '#22d3ee',
      photo: '#4ade80',
      video: '#fb923c',
      audio: '#facc15',
      testimony: '#c084fc',
      forensic: '#f43f5e'
    };
    return map[type] || '#22d3ee';
  }

  function handleMouseDown(node: Node, e: MouseEvent) {
    isDragging = true;
    draggedNode = node;
    selectedNode = node;
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging || !draggedNode || !svgElement) return;

    const rect = svgElement.getBoundingClientRect();
    draggedNode.x = Math.max(NODE_RADIUS, Math.min(CANVAS_WIDTH - NODE_RADIUS, e.clientX - rect.left));
    draggedNode.y = Math.max(NODE_RADIUS, Math.min(CANVAS_HEIGHT - NODE_RADIUS, e.clientY - rect.top));
  }

  function handleMouseUp() {
    isDragging = false;
    draggedNode = null;
  }

  onMount(loadEvidence);
</script>

<div class="bg-panel border border-sand/20 rounded-lg overflow-hidden flex flex-col h-[800px]">
  <!-- Header -->
  <div class="p-4 bg-panel border-b border-sand/20 flex justify-between items-center">
    <span class="text-xs font-bold text-sand/40 tracking-[0.2em] uppercase">NEURAL EVIDENCE NETWORK</span>
    {#if selectedNode}
      <div class="px-3 py-1 bg-info/10 border border-info/50 rounded text-info text-[10px] font-mono">
        SELECTED: {selectedNode.title}
      </div>
    {/if}
  </div>

  <div class="relative flex-1 bg-[radial-gradient(#1e293b_1px transparent_1px)] bg-[size:40px_40px]">
    {#if isLoading}
      <div class="absolute inset-0 flex items-center justify-center text-info font-mono text-xs animate-pulse">
        CALIBRATING VISUAL ARRAY...
      </div>
    {:else if error}
      <div class="absolute inset-0 flex items-center justify-center text-danger font-mono text-xs">
        {error}
      </div>
    {:else}
      <svg
        bind:this={svgElement}
        viewBox="0 0 {CANVAS_WIDTH} {CANVAS_HEIGHT}"
        class="w-full h-full cursor-grab active:cursor-grabbing"
        onmousemove={handleMouseMove}
        onmouseup={handleMouseUp}
        onmouseleave={handleMouseUp}
        role="presentation"
      >
        <!-- Connections -->
        {#each connections as conn}
          {@const from = nodes.find(n => n.id === conn.from_id)}
          {@const to = nodes.find(n => n.id === conn.to_id)}
          {#if from && to}
            <line
              x1={from.x} y1={from.y}
              x2={to.x} y2={to.y}
              stroke="#334155"
              stroke-width="1"
              stroke-dasharray="4,4"
            />
          {/if}
        {/each}

        <!-- Nodes -->
        {#each nodes as node}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <g
            class="group cursor-pointer"
            onmousedown={(e) => handleMouseDown(node, e)}
          >
            <!-- Glow -->
            <circle
              cx={node.x} cy={node.y} r={NODE_RADIUS + 5}
              fill={getNodeColor(node.type)}
              class="opacity-0 group-hover:opacity-10 transition-opacity"
            />
            <!-- Outer Ring -->
            <circle
              cx={node.x} cy={node.y} r={NODE_RADIUS}
              fill="#0f172a"
              stroke={getNodeColor(node.type)}
              stroke-width={selectedNode?.id === node.id ? 3 : 1}
              class="transition-all"
            />
            <!-- Inner Icon Indicator -->
            <rect
              x={node.x - 10} y={node.y - 10}
              width="20" height="20"
              fill={getNodeColor(node.type)}
              class="opacity-20"
            />
            <!-- Label -->
            <text
              x={node.x} y={node.y + NODE_RADIUS + 15}
              text-anchor="middle"
              fill="#94a3b8"
              class="text-[10px] font-mono select-none uppercase pointer-events-none"
            >
              {node.title}
            </text>
          </g>
        {/each}
      </svg>
    {/if}
  </div>

  <!-- Legend -->
  <div class="p-3 bg-panel border-t border-sand/20 flex gap-4 overflow-x-auto">
    {#each ['document', 'photo', 'video', 'testimony'] as type}
      <div class="flex items-center gap-2 flex-shrink-0">
        <div class="w-2 h-2 rounded-full" style="background: {getNodeColor(type)}"></div>
        <span class="text-[9px] text-sand/60 font-mono uppercase">{type}</span>
      </div>
    {/each}
  </div>
</div>

<style>
 .bg-panel {
 background-color: #1e293b;
 }

 .border-sand-20 {
 border-color: #334155;
 }

 .rounded-lg {
 border-radius: 0.5rem;
 }

 .overflow-hidden {
 overflow: hidden;
 }

 .flex {
 display: flex;
 }

 .flex-col {
 flex-direction: column;
 }

 .p-4 {
 padding: 1rem;
 }

 .bg-panel {
 background-color: #0f172a;
 }

 .border-b {
 border-bottom-width: 1px;
 }

 .gap-4 {
 gap: 1rem;
 }

 .cursor-grab {
 cursor: grab;
 }

 .transition-opacity {
 transition-property: opacity;
 transition-duration: 150ms;
 }

 .transition-all {
 transition-property: all;
 transition-duration: 150ms;
 }

 .text-xs {
 font-size: 0.75rem;
 }

 .font-bold {
 font-weight: 700;
 }

 .uppercase {
 text-transform: uppercase;
 }

 .absolute {
 position: absolute;
 }

 .inset-0 { top: 0;
		right: 0;
 bottom: 0;
	left: 0;
 }

 .flex-1 {
 flex: 1;
 }

 .animate-pulse {
 animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
 }

 @keyframes pulse {
 0% {
 opacity: 1;
 }
 50% {
 opacity: 0.5;
 }
 100% {
 opacity: 1;
 }
 }

 .opacity-0 {
 opacity: 0;
 }

 .text-info {
 color: #22d3ee;
 }

 .font-mono {
 font-family: monospace;
 }

 .text-danger {
 color: #f43f5e;
 }

 .w-full {
 width: 100%;
 }

 .h-full {
 height: 100%;
 }

 .rounded-full {
 border-radius: 9999px;
 }

 .select-none {
 user-select: none;
 }

 .pointer-events-none {
 pointer-events: none;
 }

 .opacity-20 {
 opacity: 0.2;
 }

 .gap-2 {
 gap: 0.5rem;
 }

 .flex-shrink-0 {
 flex-shrink: 0;
 }

 .text-sand-60 {
 color: #94a3b8;
 }
</style>




