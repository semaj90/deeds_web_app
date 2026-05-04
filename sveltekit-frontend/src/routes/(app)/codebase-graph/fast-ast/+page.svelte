<script lang="ts">
  /**
   * Fast-AST codebase graph viewer
   * Reads docs/graph/codebase-graph.json (Karpathy/Graphify-style map)
   * via /api/codebase-graph/json and renders with CodebaseGraphCanvas.
   *
   * No new dependencies — reuses CodebaseGraphCanvas + GraphExport.
   */
  import { onMount } from 'svelte';
  import CodebaseGraphCanvas from '../CodebaseGraphCanvas.svelte';
  import GraphExport from '$lib/components/codebase/GraphExport.svelte';

  interface ViewerNode { id: string; label: string; type: 'file' | 'directory'; path: string; extension: string; size: number; group: number; errorCount: number; filePath: string; cluster: string }
  interface ViewerEdge { source: string; target: string; type: string; weight: number }
  interface Stats      { mode: string; createdAt: string | null; sourceFiles: number; sourceDirs: number; renderedNodes: number; renderedEdges: number; dirsOnly: boolean; lowScoreFilter: number | null }

  let nodes      = $state<ViewerNode[]>([]);
  let edges      = $state<ViewerEdge[]>([]);
  let stats      = $state<Stats | null>(null);
  let loading    = $state(true);
  let errorMsg   = $state<string | null>(null);
  let selected   = $state<ViewerNode | null>(null);

  // Filter state
  let limit      = $state(500);
  let dirsOnly   = $state(false);
  let lowScore   = $state<number | null>(null);

  async function load() {
    loading = true;
    errorMsg = null;
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (dirsOnly)        params.set('dirsOnly', '1');
      if (lowScore != null) params.set('lowScore', String(lowScore));
      const res = await fetch(`/api/codebase-graph/json?${params}`);
      const body = await res.json();
      if (!res.ok) {
        errorMsg = body.error ?? `HTTP ${res.status}`;
        nodes = []; edges = []; stats = null;
      } else {
        nodes = body.nodes ?? [];
        edges = body.edges ?? [];
        stats = body.stats ?? null;
      }
    } catch (e) {
      errorMsg = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(load);

  function applyFilter(e: SubmitEvent) {
    e.preventDefault();
    load();
  }
</script>

<svelte:head>
  <title>Fast-AST Codebase Graph</title>
</svelte:head>

<div class="page">
  <header class="hdr">
    <h1>🗺️ Fast-AST Codebase Graph</h1>
    <p class="dim">
      Reads <code>docs/graph/codebase-graph.json</code> (Graphify/Karpathy fast-AST map).
      Run <code>npm run index:codebase:fast</code> to refresh.
    </p>
  </header>

  <form class="ctrl" onsubmit={applyFilter}>
    <label>
      Node limit
      <input type="number" min="10" max="5000" step="10" bind:value={limit} />
    </label>
    <label>
      <input type="checkbox" bind:checked={dirsOnly} /> directories only
    </label>
    <label>
      Low-score filter
      <input type="number" min="0" max="100" step="5" placeholder="≤" bind:value={lowScore} />
    </label>
    <button type="submit" disabled={loading}>{loading ? 'Loading…' : 'Reload'}</button>
    <GraphExport
      nodes={nodes.map((n) => ({ id: n.id, label: n.label, type: n.type, errorCount: n.errorCount, filePath: n.filePath, cluster: n.cluster }))}
      edges={edges.map((e) => ({ source: e.source, target: e.target, type: e.type }))}
      filename="codebase-graph-fast-ast"
    />
  </form>

  {#if stats}
    <div class="stats">
      <span>mode=<code>{stats.mode}</code></span>
      <span>source files=<code>{stats.sourceFiles.toLocaleString()}</code></span>
      <span>source dirs=<code>{stats.sourceDirs.toLocaleString()}</code></span>
      <span>rendered=<code>{stats.renderedNodes}</code> nodes / <code>{stats.renderedEdges}</code> edges</span>
      {#if stats.createdAt}<span class="dim">indexed {stats.createdAt}</span>{/if}
    </div>
  {/if}

  {#if errorMsg}
    <div class="err">⚠️ {errorMsg}</div>
  {/if}

  <div class="canvas-wrap">
    {#if loading}
      <div class="loading">Loading graph…</div>
    {:else if nodes.length}
      {@const canvasNodes = nodes.map((n) => ({ id: n.id, label: n.label, type: n.type, path: n.path, extension: n.extension, size: n.size, group: n.group }))}
      <CodebaseGraphCanvas
        nodes={canvasNodes}
        {edges}
        onNodeClick={(n: { id: string }) => {
          const found: ViewerNode | undefined = nodes.find((vn) => vn.id === n.id);
          selected = found ?? null;
        }}
      />
    {:else}
      <div class="empty">No nodes. Try `npm run index:codebase:fast` then Reload.</div>
    {/if}
  </div>

  {#if selected}
    <aside class="detail">
      <h3>{selected.label}</h3>
      <p class="dim mono">{selected.path}</p>
      <ul>
        <li>Type: <code>{selected.type}</code></li>
        <li>Group: <code>{selected.group}</code></li>
        <li>Size: <code>{selected.size}</code></li>
        <li>Error count: <code>{selected.errorCount}</code></li>
        {#if selected.cluster}<li>Cluster: <code>{selected.cluster}</code></li>{/if}
      </ul>
      <button onclick={() => (selected = null)}>Close</button>
    </aside>
  {/if}
</div>

<style>
  .page    { padding: 1rem; max-width: 1400px; margin: 0 auto; color: var(--t-fg, #ddd); }
  .hdr h1  { margin: 0 0 .25rem; }
  .dim     { opacity: .65; }
  .ctrl    { display: flex; flex-wrap: wrap; gap: .75rem; align-items: center; margin: 1rem 0; padding: .75rem; border: 1px solid var(--t-border, #333); border-radius: 6px; }
  .ctrl label { display: inline-flex; gap: .35rem; align-items: center; font-size: .9rem; }
  .ctrl input[type="number"] { width: 5rem; padding: .25rem .4rem; }
  .stats   { display: flex; flex-wrap: wrap; gap: 1rem; font-size: .85rem; padding: .5rem 0; }
  .err     { padding: .75rem; background: #4a1f1f; border: 1px solid #8b3a3a; border-radius: 4px; margin: .5rem 0; }
  .canvas-wrap { border: 1px solid var(--t-border, #333); border-radius: 6px; min-height: 600px; position: relative; }
  .loading, .empty { padding: 4rem; text-align: center; opacity: .6; }
  .detail  { position: fixed; right: 1rem; top: 6rem; width: 280px; padding: 1rem; background: var(--t-panel, #1a1a1a); border: 1px solid var(--t-border, #333); border-radius: 6px; }
  .detail h3   { margin: 0 0 .25rem; }
  .detail ul   { list-style: none; padding: 0; margin: .5rem 0; font-size: .85rem; }
  .detail li   { padding: .15rem 0; }
  .mono    { font-family: ui-monospace, monospace; font-size: .8rem; word-break: break-all; }
  code     { background: var(--t-panel-soft, #2a2a2a); padding: .1rem .3rem; border-radius: 3px; }
</style>
