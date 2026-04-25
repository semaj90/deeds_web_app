<script lang="ts">
  import { goto } from '$app/navigation';
  import * as d3 from 'd3';
  import { onDestroy, onMount } from 'svelte';

  export let data: PageData;

  type GraphNode = (typeof data.graph.nodes)[number] & {
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
  };
  type GraphLink = (typeof data.graph.links)[number] & {
    source: GraphNode | string;
    target: GraphNode | string;
  };

const graph = {
  nodes: data.graph.nodes as GraphNode[],
  links: data.graph.links as GraphLink[]
};
const graphError = data.error ?? (data.graph as any)?.error ?? null;

  let container: HTMLDivElement | null = null;
  let tooltip: d3.Selection<HTMLDivElement, unknown, HTMLElement, any> | null = null;
  let svg: d3.Selection<SVGSVGElement, unknown, HTMLElement, any> | null = null;
  let nodeSelection:
    | d3.Selection<SVGTextElement, GraphNode, SVGGElement, unknown>
    | null = null;
  let linkSelection:
    | d3.Selection<SVGLineElement, GraphLink, SVGGElement, unknown>
    | null = null;
  let simulationRef: d3.Simulation<GraphNode, undefined> | null = null;
  let width = 0;
  let height = 0;

  let searchQuery = '';
  let focusedNodeId: string | null = null;

  let minScore = 0.45;
  let selectedTypeFilters = new Set<string>();
  let selectedCaseFilters = new Set<string>();
  let selectedTags = new Set<string>();

  const iconMap: Record<string, string> = {
    pdf: '📄',
    document: '📄',
    image: '🖼️',
    photo: '📸',
    audio: '🎧',
    video: '🎞️',
    witness: '🗣️',
    text: '📝',
    evidence: '🔍',
    default: '◆'
  };

  const availableTypes = Array.from(
    new Set(graph.nodes.map((node) => node.type ?? 'evidence'))
  ).sort();

  const availableTags = Array.from(
    new Set(
      graph.nodes.flatMap((node) => {
        const raw = node.meta?.tags;
        if (Array.isArray(raw)) return raw.map(String);
        if (typeof raw === 'string') return raw.split(',').map((t) => t.trim());
        return [];
      })
    )
  ).filter(Boolean);

  const availableCases = Array.from(
    new Set(
      graph.nodes
        .map((node) => (node.meta?.caseId as string | undefined) ?? null)
        .filter(Boolean)
    )
  );

  const scoreColor = d3
    .scaleLinear<string>()
    .domain([0.3, 0.6, 0.9])
    .range(['#312e81', '#0ea5e9', '#67e8f9']);

  function destroyGraph() {
    svg?.remove();
    svg = null;
    tooltip?.remove();
    tooltip = null;
    simulationRef?.stop();
    simulationRef = null;
    nodeSelection = null;
    linkSelection = null;
  }

  function nodeTags(node: GraphNode) {
    const raw = node.meta?.tags;
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === 'string') return raw.split(',').map((t) => t.trim());
    return [];
  }

  function nodeCase(node: GraphNode) {
    return (node.meta?.caseId as string | undefined) ?? null;
  }

  const searchableFields = (node: GraphNode) => {
    const textFields: string[] = [];
    if (node.label) textFields.push(node.label);
    if (node.meta?.description) textFields.push(String(node.meta.description));
    if (node.meta?.ocrText) textFields.push(String(node.meta.ocrText));
    if (node.meta?.summary) textFields.push(String(node.meta.summary));
    textFields.push(...nodeTags(node));
    return textFields.join(' ').toLowerCase();
  };

  function matchesSearch(node: GraphNode, query: string) {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      node.label.toLowerCase().includes(q) ||
      (node.type ?? '').toLowerCase().includes(q) ||
      searchableFields(node).includes(q)
    );
  }

  let searchMatches = $derived(searchQuery.trim()
    ? graph.nodes.filter((node) => matchesSearch(node, searchQuery))
    : []);

  let matchedNodeIds = $derived(searchQuery.trim()
    ? new Set(searchMatches.map((n) => n.id))
    : new Set(graph.nodes.map((n) => n.id)));

  function nodePassesFilters(node: GraphNode) {
    if (selectedTypeFilters.size && !selectedTypeFilters.has(node.type ?? 'evidence')) {
      return false;
    }
    if (selectedCaseFilters.size) {
      const caseId = nodeCase(node);
      if (!caseId || !selectedCaseFilters.has(caseId)) {
        return false;
      }
    }
    if (selectedTags.size) {
      const nodeTagSet = new Set(nodeTags(node));
      let hasAll = true;
      for (const tag of selectedTags) {
        if (!nodeTagSet.has(tag)) {
          hasAll = false;
          break;
        }
      }
      if (!hasAll) return false;
    }
    return true;
  }

  function isNodeActive(node: GraphNode) {
    const searchOk = matchedNodeIds.has(node.id);
    return searchOk && nodePassesFilters(node);
  }

  function linkVisible(link: GraphLink) {
    const scoreOk = link.score >= minScore;
    const sourceNode = link.source as GraphNode;
    const targetNode = link.target as GraphNode;
    return scoreOk && isNodeActive(sourceNode) && isNodeActive(targetNode);
  }

  function updateVisualState() {
    if (!nodeSelection || !linkSelection) return;
    nodeSelection
      .classed('node-dimmed', (d) => !isNodeActive(d))
      .classed('node-focused', (d) => d.id === focusedNodeId);

    linkSelection
      .classed('link-hidden', (d) => !linkVisible(d))
      .style('stroke', (d) => scoreColor(d.score));
  }

  function renderGraph() {
    if (!container || graph.nodes.length === 0) return;
    destroyGraph();

    tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'yorha-tooltip')
      .style('opacity', 0);

    width = container.clientWidth;
    height = Math.max(container.clientHeight, 520);

    svg = d3
      .select(container)
      .append('svg')
      .attr('class', 'graph-surface')
      .attr('width', width)
      .attr('height', height);

    simulationRef = d3
      .forceSimulation(graph.nodes)
      .force(
        'link',
        d3
          .forceLink(graph.links)
          .id((d: any) => d.id)
          .distance(150)
          .strength(0.4)
      )
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter(width / 2, height / 2));

    linkSelection = svg
      .append('g')
      .attr('stroke-opacity', 0.45)
      .selectAll('line')
      .data(graph.links)
      .join('line')
      .attr('stroke-width', (d) => 1 + d.score * 2)
      .attr('class', 'graph-link animate-pulse-slow')
      .style('stroke', (d) => scoreColor(d.score));

    nodeSelection = svg
      .append('g')
      .selectAll('text')
      .data(graph.nodes)
      .join('text')
      .attr('class', 'node-icon')
      .attr('text-anchor', 'middle')
      .attr('font-size', 18)
      .text((d) => iconMap[d.type] ?? iconMap.default)
      .call(
        d3
          .drag<SVGTextElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) simulationRef?.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (_event, d) => {
            if (!simulationRef) return;
            if (!simulationRef.alpha()) simulationRef.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      )
      .on('mouseenter', (_event, d) => {
        tooltip
          ?.style('opacity', 1)
          .html(
            `<strong>${d.label}</strong><br/>
             <span class="text-xs uppercase tracking-wide">${d.type}</span>
             ${nodeCase(d) ? `<br/><span class="text-gray-400">Case ${nodeCase(d)}</span>` : ''}`
          );
      })
      .on('mousemove', (event) => {
        tooltip
          ?.style('left', `${event.clientX + 12}px`)
          .style('top', `${event.clientY + 12}px`);
      })
      .on('mouseleave', () => tooltip?.style('opacity', 0))
      .on('click', (_event, d) => {
        focusNode(d.id);
      });

    simulationRef.on('tick', () => {
      linkSelection
        ?.attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      nodeSelection?.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y);
    });

    updateVisualState();
  }

  async function focusNode(nodeId: string) {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node || !simulationRef) return;
    focusedNodeId = nodeId;
    simulationRef.alphaTarget(0.4).restart();
    node.fx = width / 2;
    node.fy = height / 2;
    setTimeout(() => {
      node.fx = null;
      node.fy = null;
      simulationRef?.alphaTarget(0);
      focusedNodeId = null;
    }, 1500);
  }

function toggleType(type: string) {
  const next = new Set(selectedTypeFilters);
  if (next.has(type)) next.delete(type);
  else next.add(type);
  selectedTypeFilters = next;
}

function toggleCase(caseId: string) {
  const next = new Set(selectedCaseFilters);
  if (next.has(caseId)) next.delete(caseId);
  else next.add(caseId);
  selectedCaseFilters = next;
}

function toggleTag(tag: string) {
  const next = new Set(selectedTags);
  if (next.has(tag)) next.delete(tag);
  else next.add(tag);
  selectedTags = next;
}

  function handleSearchSubmit() {
    if (searchMatches.length > 0) {
      focusNode(searchMatches[0].id);
    }
  }

  function openEvidence(node: GraphNode) {
    goto(`/yorha/evidence?id=${encodeURIComponent(node.id)}`);
  }

  function compareEvidence(node: GraphNode) {
    goto(`/yorha/cases/compare?focus=${encodeURIComponent(nodeCase(node) ?? node.id)}`);
  }

  function openTimeline(node: GraphNode) {
    goto(`/yorha/timeline?evidenceId=${encodeURIComponent(node.id)}`);
  }

  $effect(() => {
    if (graph.nodes.length > 0) {
      renderGraph();
    }

    return () => destroyGraph();
  });

  $effect(() => {
    if (nodeSelection && linkSelection) {
      updateVisualState();
    }
  });
</script>

<section class="graph-layout">
  <div class="control-stack">
    <div class="nes-container is-dark control-panel">
      <p class="title">Evidence Graph Search</p>
      <div class="search-group">
        <input
          type="text"
          class="nes-input search-input"
          placeholder="Search evidence, tags, OCR..."
          bind:value={searchQuery}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              handleSearchSubmit();
            }
          }}
        />
        <button class="nes-btn is-primary" onclick={handleSearchSubmit}>Focus</button>
      </div>
      {#if searchQuery && searchMatches.length === 0}
        <p class="muted">No evidence matches “{searchQuery}”.</p>
      {/if}
      {#if searchMatches.length > 0}
        <div class="search-results">
          {#each searchMatches.slice(0, 5) as node}
            <div class="result-card">
              <div>
                <p class="result-title">{node.label}</p>
                <p class="result-meta">{node.type}{nodeCase(node) ? ` • Case ${nodeCase(node)}` : ''}</p>
              </div>
              <div class="result-actions">
                <button class="nes-btn is-warning" onclick={() => openEvidence(node)}>Open</button>
                <button class="nes-btn is-primary" onclick={() => compareEvidence(node)}>Compare</button>
                <button class="nes-btn is-success" onclick={() => openTimeline(node)}>Timeline</button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="nes-container is-dark filter-panel">
      <p class="title">Filters</p>
      <div class="filter-section">
        <p class="filter-label">Similarity Threshold</p>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={minScore}
          oninput={(event) => {
            const target = event.currentTarget as HTMLInputElement;
            minScore = Number(target.value);
          }}
        />
        <p class="muted">{minScore.toFixed(2)}</p>
      </div>

      <div class="filter-section">
        <p class="filter-label">Evidence Type</p>
        <div class="pill-group">
          {#each availableTypes as type}
            <button
              class={`pill ${selectedTypeFilters.has(type) ? 'active' : ''}`}
              onclick={() => toggleType(type)}
            >
              {type}
            </button>
          {/each}
        </div>
      </div>

      {#if availableCases.length > 0}
        <div class="filter-section">
          <p class="filter-label">Case</p>
          <div class="pill-group">
            {#each availableCases as caseId}
              <button
                class={`pill ${selectedCaseFilters.has(caseId) ? 'active' : ''}`}
                onclick={() => toggleCase(caseId)}
              >
                Case {caseId}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#if availableTags.length > 0}
        <div class="filter-section">
          <p class="filter-label">Tags</p>
          <div class="pill-group">
            {#each availableTags as tag}
              <button
                class={`pill ${selectedTags.has(tag) ? 'active' : ''}`}
                onclick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>

  <div class="graph-wrapper">
    <header class="graph-header nes-container is-dark">
      <p class="title">Neo4j Evidence Graph</p>
      <div class="stats">
        <div>
          <span class="stat-label">Nodes</span>
          <span class="stat-value">{graph.nodes.length}</span>
        </div>
        <div>
          <span class="stat-label">Links</span>
          <span class="stat-value">{graph.links.length}</span>
        </div>
      </div>
      {#if graphError}
        <p class="error-text">{graphError}</p>
      {/if}
    </header>

    <div class="graph-container" bind:this={container}>
      {#if graph.nodes.length === 0}
        <div class="fallback">
          <p>No graph data available. Ensure Neo4j ingestion is running.</p>
        </div>
      {/if}
    </div>
  </div>
</section>

<style>
  .graph-layout {
    display: grid;
    grid-template-columns: 360px 1fr;
    gap: 1.5rem;
    padding: 1.5rem;
    min-height: 100vh;
    background: radial-gradient(circle at top, #0f172a, #020617);
    color: #f8fafc;
  }

  .control-stack {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .control-panel,
  .filter-panel {
    background: rgba(2, 6, 23, 0.85);
    border: 2px solid rgba(103, 232, 249, 0.2);
    border-radius: 1rem;
  }

  .search-group {
    display: flex;
    gap: 0.5rem;
  }

  .search-input {
    flex: 1;
  }

  .search-results {
    margin-top: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 240px;
    overflow-y: auto;
  }

  .result-card {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.65rem;
    border: 1px dashed rgba(103, 232, 249, 0.4);
    border-radius: 0.75rem;
    background: rgba(15, 23, 42, 0.8);
  }

  .result-title {
    margin: 0;
    font-weight: 600;
  }

  .result-meta {
    margin: 0;
    font-size: 0.8rem;
    color: #94a3b8;
  }

  .result-actions {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .filter-section {
    margin-top: 1rem;
  }

  .filter-label {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #94a3b8;
  }

  .pill-group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.5rem;
  }

  .pill {
    padding: 0.2rem 0.75rem;
    border-radius: 9999px;
    border: 1px solid rgba(103, 232, 249, 0.35);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .pill.active {
    background: rgba(14, 165, 233, 0.25);
    border-color: rgba(14, 165, 233, 0.8);
  }

  .graph-wrapper {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .graph-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border-radius: 1rem;
    background: rgba(2, 6, 23, 0.9);
  }

  .stats {
    display: flex;
    gap: 1.5rem;
  }

  .stat-label {
    font-size: 0.75rem;
    color: #94a3b8;
    letter-spacing: 0.1em;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: #e0f2fe;
    margin-left: 0.15rem;
  }

  .graph-container {
    flex: 1;
    min-height: 620px;
    background: #020617;
    border: 2px solid rgba(103, 232, 249, 0.3);
    border-radius: 1rem;
    position: relative;
    overflow: hidden;
  }

  .graph-surface {
    width: 100%;
    height: 100%;
    background: radial-gradient(
      circle,
      rgba(14, 165, 233, 0.07),
      transparent 60%
    );
  }

  .node-icon {
    fill: #fef9c3;
    cursor: pointer;
    filter: drop-shadow(0 0 6px rgba(250, 204, 21, 0.35));
  }

  .node-dimmed {
    opacity: 0.15;
  }

  .node-focused {
    animation: focusPing 1.5s ease-in-out;
  }

  .graph-link {
    transition: opacity 0.25s ease;
  }

  .link-hidden {
    opacity: 0.05;
  }

  .yorha-tooltip {
    position: fixed;
    min-width: 180px;
    background: rgba(2, 6, 23, 0.92);
    border: 1px solid rgba(103, 232, 249, 0.5);
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
    pointer-events: none;
    font-size: 0.85rem;
    font-family: 'JetBrains Mono', monospace;
    z-index: 50;
  }

  .fallback {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #94a3b8;
    font-size: 0.95rem;
  }

  .muted {
    color: #94a3b8;
    font-size: 0.85rem;
  }

  .error-text {
    color: #f87171;
    font-size: 0.85rem;
    margin: 0;
  }

  @keyframes focusPing {
    0% {
      filter: drop-shadow(0 0 0 rgba(14, 165, 233, 0));
    }
    100% {
      filter: drop-shadow(0 0 12px rgba(14, 165, 233, 0.8));
    }
  }

  @media (max-width: 1100px) {
    .graph-layout {
      grid-template-columns: 1fr;
    }

    .control-stack {
      order: 2;
    }
  }
</style>
