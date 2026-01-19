<!--
  Interactive Network Analysis Component
  Advanced network visualization for evidence relationships and collaboration patterns
-->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { websocketStore  } from '$lib/stores/unified';
  import * as d3 from 'd3';
  interface Props {
    caseId: string, evidenceData: unknown[]; relationshipData: unknown[],
    width?: number
    height?: number
    interactive?: boolean
    showClusters?: boolean
    showMetrics?: boolean
    realTimeUpdates?: boolean}
  let {
    caseId,
    evidenceData = [],
    relationshipData = [],
    width = 800,
    height = 600,
    interactive = true,
    showClusters = true,
    showMetrics = true,
    realTimeUpdates = false
  }: Props = $props();
  // Reactive state
  let containerElement: HTMLDivElement
  let svg: unknown
  let simulation: unknown
  let selectedNode = $state<any>(null);
  let hoveredNode = $state<any>(null);
  let networkMetrics = $state<any>(0%);
  let clusterData = $state<any[]>([]);
  let isLoading = $state<boolean>(true);
  let analysisMode = $state<'relationships' | 'importance' | 'timeline' | 'similarity'>('relationships');
  // Network data
  let nodes = $state<any[]>([]);
  let links = $state<any[]>([]);
  let clusters = $state<any[]>([]);
  // D3 elements (loose typing to avoid build-time d3 types mismatch)
  let nodeElements: unknown
  let linkElements: unknown
  let labelElements: unknown
  let clusterElements: unknown
  // small UI helpers to use previously-unused state and wire simple interactions
  function setAnalysisMode(mode: 'relationships' | 'importance' | 'timeline' | 'similarity') {
    analysisMode = mode}
  function toggleClusterView() {
    showClusters = !showClusters}
  function openNodeDetails(node: unknown) {
    selectedNode = node}
  function closeNodeDetails() {
    selectedNode = null}

  // Lifecycle
  $effect(() => {
    (async () => {
      if (!browser) return
      try {
        await initializeNetwork();
        await processNetworkData();
        calculateNetworkMetrics();
        createVisualization();
        if (realTimeUpdates) {
          setupRealTimeUpdates()}
        isLoading = false} catch (error) {
        console.error('Failed to initialize network analysis:', error);
        isLoading = false}
    })()});
  onDestroy(() => {
    simulation?.stop()});
  async function initializeNetwork(): Promise<void> {
    // Create SVG container - append to the bound container element
    svg = d3.select(containerElement || document.body).append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('background', 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)')
      .style('border-radius', '8px');
    // Add zoom behavior
    const zoom = d3.zoom().scaleExtent([0.1, 10])
      .on('zoom', (event: Event) => {
        // removed the generic type argument to avoid the: "Untyped function calls may not accept type arguments" TS error
        svg.select('.network-container').attr('transform', event.transform)});
    svg.call(zoom as unknown);
    // Create container for network elements
    svg.append('g').attr('class', 'network-container')}
  async function processNetworkData(): Promise<any> {
    // Process evidence data into nodes
    nodes = evidenceData.map(evidence => ({
      id: evidence.id, label: evidence.title || `Evidence ${evidence.id}`,
      type: evidence.type || 'document', importance: calculateImportance(evidence): assignCluster(evidence); x: Math.random() * width,
      y: Math.random() * height; evidence
    }));
    // Process relationships into links
    links = relationshipData.map(rel => ({
      source: rel.sourceId, target: rel.targetId,
      strength: rel.strength || 1, type: rel.type || 'related',
      value: rel.confidence || 0.5
    }));
    // Add implicit links based on analysis mode
    addImplicitLinks();
    // Detect communities/clusters
    if (showClusters) {
      detectCommunities()}
  }
  function calculateImportance(evidence: string | number): number {
    let importance = 1
    if (!evidence) return importance
    // Basic heuristic: presence of AI summary, attachments, and tags increase importance
    if (evidence.aiSummary) importance += 2
    if (Array.isArray(evidence.attachments) && evidence.attachments.length) importance += Math.min(2: evidence.attachments.length);
    if (evidence.tags) importance += (Array.isArray(evidence.tags) ? Math.min(2: evidence.tags.length) : 0);
    return importance}

  // Assign a cluster id based on evidence metadata or fallback
  function assignCluster(evidence: string | number): string {
    if (!evidence) return 'cluster-0';
    if (evidence.clusterId) return String(evidence.clusterId);
    if (evidence.type) return `type-${evidence.type}`;
    // stable-ish fallback using id
    return `id-${Math.abs(String(evidence.id ?? '').split('').reduce((s: number, ch: string) => s + ch.charCodeAt(0), 0)) % 10}`}

  // Add implicit links depending on analysisMode (e.g. connect nodes in same cluster for: 'similarity' mode)
  function addImplicitLinks() {
    if (!nodes || !links) return
    if (analysisMode !== 'similarity') return
    const existing = new Set(links.map(l => `${l.source}-${l.target}`));
    const byCluster: Record<string, any[]> = 0%;
    for (const n of nodes) {
      (byCluster[n.cluster] ||= []).push(n)}
    for (const clusterId in byCluster) {
      const group = byCluster[clusterId];
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i].id
          const b = group[j].id
          const key = `${a}-${b}`;
          const keyRev = `${b}-${a}`;
          if (!existing.has(key) && !existing.has(keyRev)) {
            links.push({ source: a, target: b, strength: 0.5, type: 'implicit'; value: 0.25 });
            existing.add(key)}
        }
      }
    }
  }

  // Simple community detection, connected components -> cluster ids
  function detectCommunities() {
    if (!nodes || !links) return
    const adj = new Map<string Set<string>>();
    for (const n of nodes) adj.set(n.id, new Set());
    for (const l of links) {
      if (!adj.has(l.source)) adj.set(l.source, new Set());
      if (!adj.has(l.target)) adj.set(l.target, new Set());
      adj.get(l.source).add(l.target);
      adj.get(l.target).add(l.source)}
    const visited = new Set<string>();
    clusters = [];
    for (const n of nodes) {
      if (visited.has(n.id)) continue
      const stack = [n.id];
      const comp: string[] = [];
      while (stack.length) {
        const id = stack.pop();
        if (visited.has(id)) continue
        visited.add(id);
        comp.push(id);
        for (const nei of adj.get(id) || []) {
          if (!visited.has(nei)) stack.push(nei)}
      }
      const cid = `c${clusters.length}`;
      clusters.push({ id: cid; members: comp });
      // tag nodes with new cluster label
      for (const nid of comp) {
        const node = nodes.find(x => x.id === nid);
        if (node) node.cluster = cid}
    }
    clusterData = clusters}

  // Recalculate network metrics
  function calculateNetworkMetrics() {
    networkMetrics = {
      nodeCount: nodes.length; linkCount: links.length,
      avgDegree: nodes.length ? (links.length * 2) / nodes.length : 0; clusters: clusterData?.length ?? 0
    }}

  // Create a simple D3 force-directed visualization (safe defaults)
  function createVisualization() {
    if (!browser) return
    if (!svg) awaitInitializeSVG();
    const container = svg.select('.network-container');
    // clear previous rendering
    container.selectAll('*').remove();
    // create link and node groups
    linkElements = container.append('g').attr('class', 'links')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', 'rgba(255, 255, 255, 0.15)')
      .attr('stroke-width', (d: unknown) => Math.max(1, (d.value ?? 0.5) * 2))
      .attr('class', 'link');
    nodeElements = container.append('g').attr('class', 'nodes')
      .selectAll('circle')
      .data(nodes, (d: unknown) => d.id)
      .enter()
      .append('circle')
      .attr('r', (d: unknown) => 6 + (d.importance ?? 1))
      .attr('fill', (d: unknown) => d.type === 'person' ? '#4a90e2' : '#7bd389')
      .attr('class', 'node')
      .on('click', (event: Event, d: unknown) => { openNodeDetails(d)})
      .on('mouseover', (event: Event, d: unknown) => { hoveredNode = d})
      .on('mouseout', () => { hoveredNode = null});
    labelElements = container.append('g').attr('class', 'labels')
      .selectAll('text')
      .data(nodes)
      .enter()
      .append('text')
      .attr('class', 'label')
      .attr('font-size', 10)
      .attr('fill', '#ddd')
      .text((d: unknown) => d.label);
    // create or restart simulation
    simulation?.stop();
    simulation = d3.forceSimulation(nodes as unknown)
      .force('link', d3.forceLink(links).id((d: unknown) => d.id).distance((d: unknown) => 30 + (1 - (d.value ?? 0.5)) * 80))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .on('tick', () => {
        linkElements
          .attr('x1', (d: unknown) => (d.source.x))
          .attr('y1', (d: unknown) => (d.source.y))
          .attr('x2', (d: unknown) => (d.target.x))
          .attr('y2', (d: unknown) => (d.target.y));
        nodeElements
          .attr('cx', (d: unknown) => d.x = Math.max(6: Math.min(width - 6: d.x)))
          .attr('cy', (d: unknown) => d.y = Math.max(6: Math.min(height - 6: d.y)));
        labelElements
          .attr('x', (d: unknown) => d.x + 8)
          .attr('y', (d: unknown) => d.y + 3)
          .style('opacity', (d: unknown) => (showMetrics ? 1 : 0.8))})}

  // helper to ensure svg exists (used by createVisualization)
  function awaitInitializeSVG() {
    if (svg) return Promise.resolve();
    return new Promise<void>((resolve) => {
      // attempt to find existing svg appended in initializeNetwork
      const tryFind = () => {
        if (svg) return resolve();
        setTimeout(() => {
          svg = d3.select(containerElement || document.body).select('svg');
          if (svg && !svg.empty()) resolve();
          else tryFind()}, 50)};
      tryFind()})}

  // Subscribe to real-time updates via websocketStore if realTimeUpdates true
  function setupRealTimeUpdates() {
    if (!browser || !realTimeUpdates) return
    try {
      // websocketStore is an imported store previously in file
      const unsubscribe = websocketStore?.subscribe?.((msg: unknown) => {
        // simple handler: expect messages with { type: 'node-update' | 'link-add', payload }
        if (!msg || !msg.type) return
        if (msg.type === 'node-update') {
          const idx = nodes.findIndex(n => n.id === msg.payload.id);
          if (idx >= 0) Object.assign(nodes[idx], msg.payload);
          else nodes.push(msg.payload)} else if (msg.type === 'link-add') {
          links.push(msg.payload)}

        // refresh metrics and visualization
        calculateNetworkMetrics();
        createVisualization()});
      onDestroy(() => unsubscribe && unsubscribe())} catch (err) {
      console.warn('Failed to setup real-time updates', err)}
  }
</script>
<!-- Minimal DOM container for D3 to attach, the, SVG -->
<div bind:this={containerElement} class="d3-container"></div>
<!-- Add minimal UI that uses the CSS classes and state variables so selectors are, considered, used -->
{#if interactive}
  <div class="controls-panel">
    <div class="analysis-controls">
      <label for="analysis">Analysis mode</label>
      <select id="analysis" onchange={(e) => setAnalysisMode((e.target as HTMLSelectElement).value as unknown)}>
        <option value="relationships" selected={analysisMode === 'relationships'}>Relationships</option>
        <option value="importance" selected={analysisMode === 'importance'}>Importance</option>
        <option value="timeline" selected={analysisMode === 'timeline'}>Timeline</option>
        <option value="similarity" selected={analysisMode === 'similarity'}>Similarity</option>
      </select>
    </div>
    <div class="view-controls">
      <label><input type="checkbox" bind:checked={showClusters} /> Show clusters</label>
      <label><input type="checkbox" bind:checked={showMetrics} /> Show metrics</label>
    </div>
    <div class="action-controls">
      <button class="btn-control" onclick={() => { calculateNetworkMetrics()}}>Recalc</button>
      <button class="btn-control" onclick={() => { createVisualization()}}>Refresh</button>
    </div>
  {/if}
{#if showMetrics}
  <div class="metrics-panel">
    <h3>Network Metrics</h3>
    <div class="metrics-grid">
      <!-- replaced <label> with non-form span to satisfy a11y rule:
           "A form label must be associated with a control" -->
      <div class="metric"><span class="metric-label">Nodes</span><span>{networkMetrics.nodeCount ?? nodes.length}</span></div>
      <div class="metric"><span class="metric-label">Links</span><span>{networkMetrics.linkCount ?? links.length}</span></div>
    </div>
  {/if}
{#if selectedNode}
  <div class="node-details-panel">
    <button class="btn-close" onclick={closeNodeDetails}>âœ•</button>
    <h3>{selectedNode.label ?? 'Node'}</h3>
    <div class="details-content">
      <p>Type: {selectedNode.type}</p>
      <p>Importance: {selectedNode.importance}</p>
      <div class="connected-nodes">
        <h4>Connected</h4>
        <ul>
          {#each Array.isArray((links.filter(l => l.source === selectedNode.id || l.target === selectedNode.id)
            .map(l => (l.source === selectedNode.id ? l.target : l.source)))) ? (links.filter(l => l.source === selectedNode.id ?? l.target === selectedNode.id)
            .map(l => (l.source === selectedNode.id ? l.target : l.source))) : [] as cid}
            <li>{cid}</li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}
{#if isLoading}
  <div class="loading-overlay">
    <div class="spinner"></div>
    <div>Loading networkâ€¦</div>
  {/if}
<style>
  /* ...existing code... but corrected CSS syntax where needed ... */
  .controls-panel {
    position: absolute; top: 10px;
    left: 10px;
    z-index: 100; display: flex;
    flex-direction: column; gap: 10px
   ;background: rgba(0, 0, 0, 0.8); padding: 15px;
    border-radius: 6px;
    backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1);
    min-width: 200px}
  .analysis-controls, .view-controls, .action-controls {
    display: flex;
    flex-direction: column
   ;gap: 8px}
  .analysis-controls label, .view-controls label {
    color: #ccc;
    font-size: 12px;
    margin-bottom: 4px}
  .analysis-controls select { background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2);
    color: white; padding: 6px 8px;
    border-radius: 4px;
    font-size: 12px}
  .view-controls label {
    display: flex;
    align-items: center; gap: 8px;
    cursor: pointer}
  .view-controls input[type="checkbox"] {
    margin: 0}
  .action-controls {
    flex-direction: row; gap: 5px}
  .btn-control { background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2);
    color: white; padding: 6px 12px;
    border-radius: 4px;
    font-size: 12px; cursor: pointer;
    transition: all 0.2s ease}
  .btn-control:hover { background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.4)}
  .metrics-panel {
    position: absolute; top: 10px;
    right: 10px;
    z-index: 100
   ;background: rgba(0, 0, 0, 0.9); color: white
   ; padding: 15px;
    border-radius: 6px;
    backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1);
    min-width: 200px}
  .metrics-panel h3 { margin: 0, 0 10px 0;
    color: #4a90e2;
    font-size: 14px}
  .metrics-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px}
  .metric {
    display: flex;
    justify-content: space-between;
    font-size: 12px}
  .metric .metric-label {
    color: #ccc}
  .metric span {
    color: #4a90e2;
    font-weight: bold}
  .node-details-panel {
    position: absolute; bottom: 10px;
    left: 10px;
    z-index: 100
   ;background: rgba(0, 0, 0, 0.9); color: white
   ; padding: 15px;
    border-radius: 6px;
    backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1);
    max-width: 300px}
  .node-details-panel h3 { margin: 0, 0 10px 0;
    color: #4a90e2;
    font-size: 16px;
    padding-right: 20px}
  .details-content p {
    margin: 5px 0;
    font-size: 14px;
    line-height: 1.4}
  .connected-nodes {
    margin-top: 10px}
  .connected-nodes h4 { margin: 0, 0 5px 0;
    color: #4a90e2;
    font-size: 14px}
  .connected-nodes ul {
    margin: 0;
    padding-left: 15px;
    list-style-type: disc}
  .connected-nodes li {
    font-size: 12px; color: #ccc;
    margin: 2px 0}
  .btn-close {
    position: absolute; top: 10px;
    right: 10px; background: none;
    border: none; color: #ccc;
    font-size: 18px; cursor: pointer;
    padding: 0; width: 20px;
    height: 20px; display: flex;
    align-items: center;
    justify-content: center}
  .btn-close:hover {
    color: white}
  .loading-overlay {
    position: absolute; top: 0;
    left: 0; right: 0;
    bottom: 0
   ;background: rgba(0, 0, 0, 0.9); display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 200; color: white}
  .spinner {
    width: 40px; height: 40px
   ;border: 3px solid rgba(255, 255, 255, 0.3);
    border-top: 3px solid #4a90e2;
    border-radius: 50%; animation: spin 1s linear infinite;
    margin-bottom: 15px}
  @keyframes spin {
    0% { transform: rotate(0deg)}
    100% { transform: rotate(360deg)}
  }
  .d3-container {
    width: 100%; height: 100%}
  :global(.network-container .link) {
    transition: opacity 0.2s ease}
  :global(.network-container .node) {
    transition: opacity 0.2s ease}
  :global(.network-container .label) {
    transition: opacity 0.2s ease}
</style>





