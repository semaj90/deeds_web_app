<script lang="ts">
import { onMount, onDestroy } from 'svelte';
import Icon from '$lib/components/ui/Icon.svelte';

export const ssr = false;

// ── Types ─────────────────────────────────────────────────────────────────────
interface GraphNode {
  id: string;
  label: string;
  title: string;
  properties: Record<string, unknown>;
  // D3 simulation mixin
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
}

// ── State ─────────────────────────────────────────────────────────────────────
let svgEl: SVGSVGElement;
let containerEl: HTMLDivElement;

let allNodes = $state<GraphNode[]>([]);
let allEdges = $state<GraphEdge[]>([]);
let stats = $state<{ nodeCount: number; edgeCount: number; byLabel: Record<string, number> }>({
  nodeCount: 0,
  edgeCount: 0,
  byLabel: {},
});

let loading = $state(true);
let error = $state<string | null>(null);
let searchQuery = $state('');
let selectedNode = $state<GraphNode | null>(null);
let activeLabels = $state<Set<string>>(new Set(['Case', 'Evidence', 'Person', 'GlossaryTerm', 'Statute']));
let simulation: unknown = null;

const LABEL_COLORS: Record<string, string> = {
  Case: '#3b82f6',
  Evidence: '#f97316',
  Person: '#a855f7',
  GlossaryTerm: '#10b981',
  Statute: '#eab308',
  Unknown: '#6b7280',
};

const LABEL_RADIUS: Record<string, number> = {
  Case: 10,
  Evidence: 8,
  Person: 9,
  GlossaryTerm: 7,
  Statute: 7,
  Unknown: 6,
};

function nodeColor(label: string): string {
  return LABEL_COLORS[label] ?? LABEL_COLORS.Unknown;
}
function nodeRadius(label: string): number {
  return LABEL_RADIUS[label] ?? 6;
}

// ── Filtered data ─────────────────────────────────────────────────────────────
let filteredNodes = $derived.by(() => {
  const q = searchQuery.toLowerCase().trim();
  return allNodes.filter((n) => {
    if (!activeLabels.has(n.label)) return false;
    if (q && !n.title.toLowerCase().includes(q)) return false;
    return true;
  });
});

let filteredNodeIds = $derived(new Set(filteredNodes.map((n) => n.id)));

let filteredEdges = $derived(
  allEdges.filter(
    (e) =>
      filteredNodeIds.has(typeof e.source === 'string' ? e.source : (e.source as GraphNode).id) &&
      filteredNodeIds.has(typeof e.target === 'string' ? e.target : (e.target as GraphNode).id)
  )
);

// ── Load graph data ───────────────────────────────────────────────────────────
async function loadGraph() {
  loading = true;
  error = null;
  try {
    const res = await fetch('/api/graph/cases?limit=600');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allNodes = data.nodes ?? [];
    allEdges = data.edges ?? [];
    stats = data.stats ?? { nodeCount: 0, edgeCount: 0, byLabel: {} };
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load graph';
  } finally {
    loading = false;
  }
}

// ── D3 force simulation ───────────────────────────────────────────────────────
let d3Loaded = false;
let d3: typeof import('d3') | null = null;

async function initD3() {
  if (d3Loaded) return;
  d3 = await import('d3');
  d3Loaded = true;
}

$effect(() => {
  if (!loading && !error && filteredNodes.length > 0 && svgEl) {
    renderGraph();
  }
});

function renderGraph() {
  if (!d3 || !svgEl) return;

  const D3 = d3;
  const w = containerEl?.clientWidth || 900;
  const h = containerEl?.clientHeight || 600;

  // Stop previous simulation
  if (simulation) (simulation as { stop: () => void }).stop();

  // Clear SVG
  D3.select(svgEl).selectAll('*').remove();
  D3.select(svgEl).attr('width', w).attr('height', h);

  const svg = D3.select(svgEl);

  // Zoom — declare typed var to avoid inline generic in .call()
  const g = svg.append('g');
  const zoom = D3.zoom().scaleExtent([0.1, 8]).on('zoom', (event: { transform: unknown }) =>
    g.attr('transform', event.transform as string)
  );
  (svg as unknown as { call: (z: unknown) => void }).call(zoom);

  // Deep-copy nodes so D3 can mutate positions
  const simNodes: GraphNode[] = filteredNodes.map((n) => ({ ...n }));
  const nodeById = new Map(simNodes.map((n) => [n.id, n]));

  const simEdges = filteredEdges
    .map((e) => ({
      ...e,
      source: nodeById.get(typeof e.source === 'string' ? e.source : (e.source as GraphNode).id) ?? e.source,
      target: nodeById.get(typeof e.target === 'string' ? e.target : (e.target as GraphNode).id) ?? e.target,
    }))
    .filter(
      (e) =>
        typeof e.source === 'object' &&
        typeof e.target === 'object'
    );

  // Force simulation — use unknown casts to avoid Svelte generic-in-call errors
  const linkForce = D3.forceLink(simEdges as unknown[])
    .id((d: unknown) => (d as GraphNode).id)
    .distance(80)
    .strength(0.5);

  simulation = D3.forceSimulation(simNodes as unknown[])
    .force('link', linkForce)
    .force('charge', D3.forceManyBody().strength(-150))
    .force('center', D3.forceCenter(w / 2, h / 2))
    .force('collide', D3.forceCollide((d: unknown) => nodeRadius((d as GraphNode).label) + 4));

  // Edges
  const link = g
    .append('g')
    .attr('class', 'links')
    .selectAll('line')
    .data(simEdges)
    .join('line')
    .attr('stroke', '#334155')
    .attr('stroke-opacity', 0.5)
    .attr('stroke-width', 1.5);

  // Edge labels (small)
  const edgeLabel = g
    .append('g')
    .attr('class', 'edge-labels')
    .selectAll('text')
    .data(simEdges)
    .join('text')
    .attr('font-size', 8)
    .attr('fill', '#94a3b8')
    .attr('text-anchor', 'middle')
    .attr('pointer-events', 'none')
    .text((d: unknown) => (d as { type: string }).type);

  // Nodes — declare drag separately to avoid generic-in-call error
  const dragBehavior = D3.drag()
    .on('start', (event: { active: boolean }, d: unknown) => {
      const node = d as GraphNode;
      if (!event.active && simulation) (simulation as { alphaTarget: (a: number) => { restart: () => void } }).alphaTarget(0.3).restart();
      node.fx = node.x;
      node.fy = node.y;
    })
    .on('drag', (event: { x: number; y: number }, d: unknown) => {
      const node = d as GraphNode;
      node.fx = event.x;
      node.fy = event.y;
    })
    .on('end', (event: { active: boolean }, d: unknown) => {
      const node = d as GraphNode;
      if (!event.active && simulation) (simulation as { alphaTarget: (a: number) => void }).alphaTarget(0);
      node.fx = null;
      node.fy = null;
    });

  const node = g
    .append('g')
    .attr('class', 'nodes')
    .selectAll('g')
    .data(simNodes)
    .join('g')
    .attr('cursor', 'pointer')
    .on('click', (_event: unknown, d: unknown) => {
      const gn = d as GraphNode;
      selectedNode = allNodes.find((n) => n.id === gn.id) ?? null;
    })
    .call(dragBehavior as unknown as (selection: unknown) => void);

  node
    .append('circle')
    .attr('r', (d) => nodeRadius(d.label))
    .attr('fill', (d) => nodeColor(d.label))
    .attr('stroke', '#1e293b')
    .attr('stroke-width', 1.5);

  node
    .append('text')
    .attr('x', (d) => nodeRadius(d.label) + 3)
    .attr('y', 4)
    .attr('font-size', 9)
    .attr('fill', '#cbd5e1')
    .attr('pointer-events', 'none')
    .text((d) => d.title.length > 28 ? d.title.slice(0, 26) + '…' : d.title);

  // Tick
  (simulation as { on: (event: string, cb: () => void) => void }).on('tick', () => {
    link
      .attr('x1', (d) => (d.source as unknown as GraphNode).x ?? 0)
      .attr('y1', (d) => (d.source as unknown as GraphNode).y ?? 0)
      .attr('x2', (d) => (d.target as unknown as GraphNode).x ?? 0)
      .attr('y2', (d) => (d.target as unknown as GraphNode).y ?? 0);

    edgeLabel
      .attr(
        'x',
        (d) =>
          (((d.source as unknown as GraphNode).x ?? 0) + ((d.target as unknown as GraphNode).x ?? 0)) / 2
      )
      .attr(
        'y',
        (d) =>
          (((d.source as unknown as GraphNode).y ?? 0) + ((d.target as unknown as GraphNode).y ?? 0)) / 2
      );

    node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
  });
}

function toggleLabel(label: string) {
  const next = new Set(activeLabels);
  if (next.has(label)) {
    next.delete(label);
  } else {
    next.add(label);
  }
  activeLabels = next;
}

onMount(async () => {
  await initD3();
  await loadGraph();
});

onDestroy(() => {
  if (simulation) (simulation as { stop: () => void }).stop();
});
</script>

<div class="case-graph-root">
  <!-- Header -->
  <div class="graph-header">
    <div class="header-left">
      <Icon name="git-fork" />
      <h1>Case Relationship Graph</h1>
      <span class="stats-badge">{stats.nodeCount} nodes · {stats.edgeCount} edges</span>
    </div>
    <div class="header-right">
      <button class="btn-refresh" onclick={loadGraph} disabled={loading}>
        <Icon name="refresh-cw" />
        Refresh
      </button>
    </div>
  </div>

  <!-- Controls -->
  <div class="graph-controls">
    <div class="search-wrap">
      <Icon name="search" />
      <input
        type="text"
        placeholder="Filter by title…"
        bind:value={searchQuery}
        class="search-input"
      />
    </div>
    <div class="label-filters">
      {#each Object.entries(LABEL_COLORS) as [label, color]}
        {#if label !== 'Unknown'}
          <button
            class="label-chip"
            class:active={activeLabels.has(label)}
            style="--chip-color: {color}"
            onclick={() => toggleLabel(label)}
          >
            <span class="chip-dot"></span>
            {label}
            <span class="chip-count">{stats.byLabel[label] ?? 0}</span>
          </button>
        {/if}
      {/each}
    </div>
    <span class="filter-summary">
      {filteredNodes.length} / {allNodes.length} nodes · {filteredEdges.length} edges
    </span>
  </div>

  <!-- Main content -->
  <div class="graph-body">
    <!-- SVG canvas -->
    <div class="graph-canvas" bind:this={containerEl}>
      {#if loading}
        <div class="overlay-msg">
          <Icon name="loader-2" />
          Loading Neo4j graph…
        </div>
      {:else if error}
        <div class="overlay-msg error">
          <Icon name="alert-triangle" />
          {error}
        </div>
      {:else if filteredNodes.length === 0}
        <div class="overlay-msg">
          <Icon name="info" />
          No nodes match current filters
        </div>
      {/if}
      <svg bind:this={svgEl} class="d3-svg"></svg>
    </div>

    <!-- Side panel -->
    {#if selectedNode}
      <div class="side-panel">
        <div class="panel-header">
          <span
            class="node-badge"
            style="background: {nodeColor(selectedNode.label)}22; color: {nodeColor(selectedNode.label)}; border-color: {nodeColor(selectedNode.label)}44"
          >
            {selectedNode.label}
          </span>
          <button class="btn-close" onclick={() => (selectedNode = null)}>
            <Icon name="x" />
          </button>
        </div>
        <h2 class="panel-title">{selectedNode.title}</h2>
        <div class="panel-props">
          {#each Object.entries(selectedNode.properties).filter(([, v]) => v != null && v !== '') as [key, value]}
            <div class="prop-row">
              <span class="prop-key">{key}</span>
              <span class="prop-val">{value}</span>
            </div>
          {/each}
          <div class="prop-row">
            <span class="prop-key">Internal ID</span>
            <span class="prop-val mono">{selectedNode.id.slice(0, 32)}…</span>
          </div>
        </div>
        <a
          href={selectedNode.label === 'Case'
            ? `/cases/${selectedNode.properties.pgId}`
            : selectedNode.label === 'Evidence'
              ? `/evidence/${selectedNode.properties.pgId}`
              : selectedNode.label === 'Person'
                ? `/persons-of-interest/${selectedNode.properties.pgId}`
                : '#'}
          class="panel-link"
        >
          <Icon name="external-link" />
          Open in app
        </a>
      </div>
    {/if}
  </div>
</div>

<style>
  .case-graph-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #0f172a;
    color: #e2e8f0;
    font-family: inherit;
  }

  .graph-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid #1e293b;
    gap: 1rem;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  h1 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
  }
  .stats-badge {
    background: #1e293b;
    color: #94a3b8;
    font-size: 0.7rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    border: 1px solid #334155;
  }
  .btn-refresh {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: #1e293b;
    border: 1px solid #334155;
    color: #94a3b8;
    padding: 0.35rem 0.75rem;
    border-radius: 6px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-refresh:hover {
    background: #334155;
    color: #e2e8f0;
  }
  .btn-refresh:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .graph-controls {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
    padding: 0.6rem 1.25rem;
    border-bottom: 1px solid #1e293b;
    background: #0f172a;
  }
  .search-wrap {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 0.25rem 0.6rem;
    min-width: 180px;
  }
  .search-input {
    background: none;
    border: none;
    outline: none;
    color: #e2e8f0;
    font-size: 0.82rem;
    width: 140px;
  }
  .search-input::placeholder {
    color: #475569;
  }
  .label-filters {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .label-chip {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    background: #1e293b;
    border: 1px solid #334155;
    color: #94a3b8;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .label-chip.active {
    background: color-mix(in srgb, var(--chip-color) 18%, #1e293b);
    border-color: color-mix(in srgb, var(--chip-color) 50%, transparent);
    color: var(--chip-color);
  }
  .chip-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--chip-color);
  }
  .chip-count {
    font-size: 0.65rem;
    background: #0f172a;
    padding: 0 4px;
    border-radius: 999px;
    color: #64748b;
  }
  .filter-summary {
    margin-left: auto;
    font-size: 0.75rem;
    color: #475569;
    white-space: nowrap;
  }

  .graph-body {
    display: flex;
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  .graph-canvas {
    flex: 1;
    position: relative;
    overflow: hidden;
    background: #0a0f1a;
    background-image: radial-gradient(circle at 1px 1px, #1e293b 1px, transparent 0);
    background-size: 24px 24px;
  }

  .d3-svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .overlay-msg {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: #475569;
    font-size: 0.9rem;
    z-index: 2;
    pointer-events: none;
  }
  .overlay-msg.error {
    color: #ef4444;
  }

  /* Side panel */
  .side-panel {
    width: 280px;
    background: #0f172a;
    border-left: 1px solid #1e293b;
    display: flex;
    flex-direction: column;
    padding: 1rem;
    gap: 0.75rem;
    overflow-y: auto;
  }
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .node-badge {
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    border: 1px solid;
  }
  .btn-close {
    background: none;
    border: none;
    color: #475569;
    cursor: pointer;
    display: flex;
    padding: 2px;
  }
  .btn-close:hover {
    color: #e2e8f0;
  }
  .panel-title {
    font-size: 0.9rem;
    font-weight: 600;
    margin: 0;
    color: #e2e8f0;
    line-height: 1.4;
    word-break: break-word;
  }
  .panel-props {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .prop-row {
    display: flex;
    gap: 0.5rem;
    font-size: 0.76rem;
  }
  .prop-key {
    color: #64748b;
    min-width: 80px;
    flex-shrink: 0;
    text-transform: capitalize;
  }
  .prop-val {
    color: #cbd5e1;
    word-break: break-all;
  }
  .prop-val.mono {
    font-family: monospace;
    font-size: 0.68rem;
    color: #475569;
  }
  .panel-link {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: #3b82f6;
    font-size: 0.8rem;
    text-decoration: none;
    margin-top: auto;
    padding-top: 0.5rem;
    border-top: 1px solid #1e293b;
  }
  .panel-link:hover {
    color: #60a5fa;
  }
</style>
