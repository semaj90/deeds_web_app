<script lang="ts">
  import { browser } from '$app/environment';
  import * as d3 from 'd3';
  import { onDestroy, onMount } from 'svelte';

  interface GraphNode {
    id: string;
    label?: string;
    type?: string;
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
  }

  interface GraphLink {
    source: string | GraphNode;
    target: string | GraphNode;
  }

  // Use Svelte runes-style props() instead of `export let`.
  let { nodes = [], links = [], width = undefined, height = undefined, onNodeClick = undefined, onNodeRightClick = undefined, caseId = null, query = null } = $props<{
    nodes?: GraphNode[];
    links?: GraphLink[];
    width?: number;
    height?: number;
    onNodeClick?: (node: GraphNode) => void;
    onNodeRightClick?: (event: MouseEvent, node: GraphNode) => void;
    caseId?: string | null;
    query?: string | null;
  }>();

  const props = { nodes, links, width, height, onNodeClick, onNodeRightClick, caseId, query };

  // Provide defaults when props are missing
  const defaultWidth = 800;
  const defaultHeight = 600;

  let svg: SVGSVGElement;
  let simulation: any;

  let isSignalsPanelOpen = $state(false);
  let isSignalsLoading = $state(false);
  let predictiveSummary = $state('');
  let predictiveSignals = $state <string[]>([]);
  let graphRecommendations = $state <Array<{ title: string; rationale: string; confidence: string }>>(
    []
  );
  let didYouMean = $state <string[]>([]);
  let signalsError = $state <string | null>(null);
  let lastQueryUsed = $state('');
  let lastSignalKey = '';

  const DEFAULT_QUERY = 'graph intelligence overview';

  onMount(() => {
    initializeGraph();
    setupKeyboardShortcuts();
  });

  onDestroy(() => {
    teardownKeyboardShortcuts();
  });

  function initializeGraph() {
    const nodes = props.nodes ?? [];
    const links = props.links ?? [];

    simulation = d3.forceSimulation(nodes as any)
      .force('link', d3.forceLink(links as any).id((d: any) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter((props.width ?? defaultWidth) / 2, (props.height ?? defaultHeight) / 2))
      .force('collision', d3.forceCollide().radius(30));

    const link = d3.select(svg)
      .selectAll('.link')
      .data(links as any)
      .enter().append('line')
      .attr('class', 'link')
      .attr('stroke', '#67e8f9')
      .attr('stroke-width', 2);

    const node = d3.select(svg)
      .selectAll('.node')
      .data(nodes as any)
      .enter().append('g')
      .attr('class', 'node')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    node.append('circle')
      .attr('r', (d: any) => d.type === 'contradiction' ? 15 : 10)
      .attr('fill', (d: any) => getNodeColor(d))
      .attr('stroke', '#ffe066')
      .attr('stroke-width', 2);

    node.append('text')
      .attr('dx', 12)
      .attr('dy', '.35em')
      .text((d: any) => d.label)
      .attr('fill', '#ffffff')
      .attr('font-size', '12px');

    node.on('click', (event: any, d: GraphNode) => props.onNodeClick?.(d))
       .on('contextmenu', (event: MouseEvent, d: GraphNode) => {
         event.preventDefault();
         props.onNodeRightClick?.(event, d);
       });

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => (d.source as any).x)
        .attr('y1', (d: any) => (d.source as any).y)
        .attr('x2', (d: any) => (d.target as any).x)
        .attr('y2', (d: any) => (d.target as any).y);

      node
        .attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });
  }

  function getNodeColor(node: GraphNode) {
    switch (node.type) {
      case 'evidence': return '#10b981';
      case 'witness': return '#3b82f6';
      case 'contradiction': return '#ef4444';
      case 'location': return '#f59e0b';
      default: return '#6b7280';
    }
  }

  function dragstarted(event: any, d: GraphNode) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event: any, d: GraphNode) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event: any, d: GraphNode) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  $effect(() => {
    if ((props.nodes ?? []).length > 0 && simulation) {
      simulation.nodes(props.nodes as any);
      (simulation.force('link') as any).links(props.links as any);
      simulation.alpha(1).restart();
    }
  });

  $effect(() => {
    if (browser) {
      const key = `${props.caseId ?? 'global'}::${props.query ?? DEFAULT_QUERY}`;
      if (key !== lastSignalKey) {
        lastSignalKey = key;
        loadPredictiveSignals();
      }
    }
  });

  function setupKeyboardShortcuts() {
    if (!browser) return;
    window.addEventListener('keydown', handleKeydown);
  }

  function teardownKeyboardShortcuts() {
    if (!browser) return;
    window.removeEventListener('keydown', handleKeydown);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.shiftKey && event.code === 'KeyP') {
      event.preventDefault();
      isSignalsPanelOpen = !isSignalsPanelOpen;
    }
  }

  async function loadPredictiveSignals(seed?: string) {
    if (!browser) return;
    const query = (seed ?? props.query ?? DEFAULT_QUERY).trim() || DEFAULT_QUERY;
    const body = {
      query,
      caseId: props.caseId ?? undefined
    };

    lastQueryUsed = query;
    signalsError = null;
    isSignalsLoading = true;

    try {
      const response = await fetch('/api/graph/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error ?? 'Unable to load predictive signals');
      }

      predictiveSummary = data.summary ?? '';
      predictiveSignals = data.predictiveSignals ?? [];
      graphRecommendations = data.recommendations ?? [];
      didYouMean = data.didYouMean ?? [];
    } catch (error) {
      console.error('Predictive signals failed:', error);
      signalsError = 'Unable to load predictive intelligence right now.';
    } finally {
      isSignalsLoading = false;
    }
  }
</script>

<div class="graph-shell">
  <div class="graph-stage">
    <button
      class="signals-toggle"
      type="button"
      onclick={() => isSignalsPanelOpen = !isSignalsPanelOpen}
      title="Toggle predictive signals (Shift+P)"
    >
      🔮 Signals
      <span>Shift+P</span>
    </button>
    <svg bind:this={svg} width={props.width ?? defaultWidth} height={props.height ?? defaultHeight}></svg>
  </div>

  <aside class={`predictive-panel ${isSignalsPanelOpen ? 'open' : ''}`}>
    <header>
      <div>
        <p class="title">Predictive Signals</p>
        <p class="meta">Query: {lastQueryUsed || DEFAULT_QUERY}</p>
      </div>
      <button
        class="refresh"
        type="button"
        onclick={() => loadPredictiveSignals(lastQueryUsed)}
        disabled={isSignalsLoading}
      >
        {isSignalsLoading ? 'Refreshing…' : 'Refresh'}
      </button>
    </header>

    {#if signalsError}
      <p class="error">{signalsError}</p>
    {:else}
      <section class="summary">
        <p>{predictiveSummary || 'AI summary pending. Run a refresh to sync with the knowledge graph.'}</p>
      </section>

      {#if didYouMean.length}
        <section class="chips">
          <p class="label">Did you mean</p>
          <div class="chip-row">
            {#each didYouMean as suggestion (suggestion)}
              <span>{suggestion}</span>
            {/each}
          </div>
        </section>
      {/if}

      {#if graphRecommendations.length}
        <section class="recommendations">
          <p class="label">Graph recommendations</p>
          <div class="stack">
            {#each graphRecommendations as rec (rec.title + rec.rationale)}
              <article>
                <div class="row">
                  <span class="confidence">{rec.confidence?.toUpperCase?.() ?? 'CONF'}</span>
                  <p class="headline">{rec.title}</p>
                </div>
                <p class="body">{rec.rationale}</p>
              </article>
            {/each}
          </div>
        </section>
      {/if}

      <section class="signals-list">
        <p class="label">Graph signals</p>
        <ul>
          {#if predictiveSignals.length}
            {#each predictiveSignals as signal (signal)}
              <li>• {signal}</li>
            {/each}
          {:else}
            <li class="placeholder">Signals will appear after AI finishes harvesting the knowledge graph.</li>
          {/if}
        </ul>
      </section>
    {/if}
  </aside>
</div>

<style>
  .graph-shell {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    background: #020617;
    border-radius: 0.75rem;
    overflow: hidden;
  }

  .graph-stage {
    position: relative;
    flex: 1;
    background: #020617;
  }

  .signals-toggle {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    z-index: 10;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(148, 163, 184, 0.35);
    color: #f8fafc;
    font-size: 0.85rem;
    padding: 0.35rem 0.9rem;
    border-radius: 999px;
    display: flex;
    gap: 0.4rem;
    align-items: center;
    cursor: pointer;
  }

  .signals-toggle span {
    font-size: 0.7rem;
    color: #94a3b8;
  }

  svg {
    display: block;
  }

  .link {
    stroke-opacity: 0.6;
  }

  .node {
    cursor: pointer;
  }

  .node:hover circle {
    stroke-width: 4;
  }

  .predictive-panel {
    width: 0;
    max-width: 360px;
    background: rgba(2, 6, 23, 0.95);
    border-left: 1px solid rgba(59, 130, 246, 0.35);
    color: #e2e8f0;
    overflow: hidden;
    transition: width 0.3s ease;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0;
  }

  .predictive-panel.open {
    width: clamp(260px, 28vw, 360px);
    padding: 1rem;
  }

  .predictive-panel header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }

  .predictive-panel .title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #c7d2fe;
  }

  .predictive-panel .meta {
    margin: 0;
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .predictive-panel .refresh {
    border: 1px solid rgba(148, 163, 184, 0.4);
    background: rgba(15, 23, 42, 0.8);
    color: #e2e8f0;
    padding: 0.35rem 0.8rem;
    border-radius: 0.5rem;
    font-size: 0.8rem;
  }

  .predictive-panel section {
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 0.6rem;
    padding: 0.75rem;
  }

  .predictive-panel .summary {
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .predictive-panel .chips .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .predictive-panel .chips span {
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.35);
    border-radius: 999px;
    padding: 0.15rem 0.6rem;
    font-size: 0.75rem;
  }

  .predictive-panel .recommendations .stack {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .predictive-panel .recommendations article {
    background: rgba(2, 6, 23, 0.85);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 0.5rem;
    padding: 0.65rem;
  }

  .predictive-panel .recommendations .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .predictive-panel .recommendations .confidence {
    font-size: 0.7rem;
    letter-spacing: 0.05em;
    color: #facc15;
  }

  .predictive-panel .recommendations .headline {
    margin: 0;
    font-weight: 600;
    color: #f8fafc;
  }

  .predictive-panel .recommendations .body {
    margin: 0.35rem 0 0;
    font-size: 0.85rem;
    color: #cbd5f5;
  }

  .predictive-panel .signals-list ul {
    margin: 0;
    padding-left: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.85rem;
  }

  .predictive-panel .label {
    margin: 0 0 0.4rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #94a3b8;
  }

  .predictive-panel .placeholder {
    color: #94a3b8;
    font-style: italic;
  }

  .predictive-panel .error {
    color: #f87171;
    margin: 0;
  }

  @media (max-width: 1024px) {
    .predictive-panel.open {
      width: 100%;
      max-width: none;
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      z-index: 20;
    }

    .graph-shell {
      flex-direction: column;
    }

    .graph-stage {
      min-height: 400px;
    }
  }
</style>
