<script lang="ts">
  /**
   * Fast-AST codebase graph viewer
   *
   * Two rendering modes toggled by the tab bar:
   *   "canvas"  — existing CodebaseGraphCanvas (D3 force layout, ≤500 nodes)
   *   "graphify" — new GraphifyViewer (cluster tiles → ego → paginated table)
   *
   * The Graphify tab also shows:
   *   • Server-computed overview (cluster tiles, stats) via page.server.ts load()
   *   • PageRank top-30 from Redis (or fanIn fallback) via page.server.ts
   *   • GPU Batch panel: triggers /api/codebase-index/batch-gpu and streams progress
   *
   * WebGPU PageRank runs entirely client-side inside GraphifyViewer, cached
   * in sessionStorage for 15 min (RpcCacheResult envelope, transport='gpu').
   */
  import { onMount } from 'svelte';
  import CodebaseGraphCanvas from '../CodebaseGraphCanvas.svelte';
  import GraphExport from '$lib/components/codebase/GraphExport.svelte';
  import GraphifyViewer from '$lib/components/graph/GraphifyViewer.svelte';
  import GlyphAtlasViewer from '$lib/components/graph/GlyphAtlasViewer.svelte';

  // ── SSR props from page.server.ts ─────────────────────────────────────────
  // $derived.by closures so re-runs of load() (invalidate, navigation)
  // reflow into overview/serverPR. Structural types match the actual shape
  // returned by page.server.ts so the template can index properties safely.
  interface OverviewStats {
    sourceFiles?: number;
    sourceDirs?: number;
    ssrUnsafe?: number;
    sv4Legacy?: number;
    avgScore?: number | string;
  }
  interface Overview {
    totalFiles: number;
    totalDirs: number;
    totalClusters: number;
    stats: OverviewStats;
  }
  interface PageRankRow {
    rel: string;
    score: number | string;
    source?: string;
  }
  type LoadedData = { overview?: Overview | null; pageRankTop?: PageRankRow[] };

  let props = $props();
  const overview = $derived.by<Overview | null>(() => ((props.data as LoadedData | undefined)?.overview ?? null));
  const serverPR = $derived.by<PageRankRow[]>(() => ((props.data as LoadedData | undefined)?.pageRankTop ?? []));

  // ── Tab state ─────────────────────────────────────────────────────────────
  type Tab = 'canvas' | 'graphify' | 'pagerank' | 'batch' | 'atlas';
  let activeTab = $state<Tab>('graphify');

  // ── Canvas tab state ──────────────────────────────────────────────────────
  interface ViewerNode { id: string; label: string; type: 'file'|'directory'; path: string; extension: string; size: number; group: number; errorCount: number; filePath: string; cluster: string }
  interface ViewerEdge { source: string; target: string; type: string; weight: number }
  interface Stats { mode: string; createdAt: string|null; sourceFiles: number; sourceDirs: number; renderedNodes: number; renderedEdges: number; dirsOnly: boolean; lowScoreFilter: number|null }

  let nodes      = $state<ViewerNode[]>([]);
  let edges      = $state<ViewerEdge[]>([]);
  let stats      = $state<Stats | null>(null);
  let canvasLoading = $state(false);
  let canvasErr  = $state<string | null>(null);
  let selected   = $state<ViewerNode | null>(null);
  let limit      = $state(500);
  let dirsOnly   = $state(false);
  let lowScore   = $state<number | null>(null);

  // ── Graphify tab: raw files for GraphifyViewer ────────────────────────────
  interface GFile {
    rel: string; tags?: string[]; imports?: string[]; fanIn?: number;
    isRoute?: boolean; isTest?: boolean; hasPairedTest?: boolean;
    ssrUnsafe?: boolean; sv4Legacy?: boolean; clusterId?: number;
    hasAuth?: boolean; hasZod?: boolean; lineCount?: number;
    somBmuRow?: number; somBmuCol?: number; somCluster?: number;
  }
  let graphFiles = $state<GFile[]>([]);
  let graphifyLoading = $state(false);
  let graphifyLoaded  = $state(false);

  // ── Glyph Atlas state ─────────────────────────────────────────────────────
  let atlasManifest  = $state<import('$lib/server/graph/glyph-atlas-builder.js').GlyphAtlasManifest | null>(null);
  let atlasBase64    = $state<string | null>(null);
  let atlasLoaded    = $state(false);

  async function loadAtlas() {
    if (atlasLoaded) return;
    try {
      const res  = await fetch('/api/graph/glyph-atlas', { signal: AbortSignal.timeout(30_000) });
      const body = await res.json();
      atlasManifest = body.manifest ?? null;
      atlasBase64   = body.atlasBase64 ?? null;
    } catch { atlasManifest = null; }
    atlasLoaded = true;
  }

  // ── Batch GPU panel state ─────────────────────────────────────────────────
  let batchRunning  = $state(false);
  let batchStages   = $state<Array<{ name: string; status: 'pending'|'running'|'done'|'error'; ms?: number }>>([]);
  let batchError    = $state('');

  const GPU_STAGES = ['similarity','kmeans','som','pagerank','attention','reward','writeback'];

  // ── Load canvas data on demand ────────────────────────────────────────────
  async function loadCanvas() {
    canvasLoading = true; canvasErr = null;
    try {
      // One-shot URLSearchParams builder, never bound to component state.
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const params = new URLSearchParams({ limit: String(limit) });
      if (dirsOnly)         params.set('dirsOnly', '1');
      if (lowScore != null) params.set('lowScore', String(lowScore));
      const res  = await fetch(`/api/codebase-graph/json?${params}`, { signal: AbortSignal.timeout(30_000) });
      const body = await res.json();
      if (!res.ok) { canvasErr = body.error ?? `HTTP ${res.status}`; nodes = []; edges = []; }
      else { nodes = body.nodes ?? []; edges = body.edges ?? []; stats = body.stats ?? null; }
    } catch (e) { canvasErr = (e as Error).message; }
    finally { canvasLoading = false; }
  }

  // ── Load raw graph files for GraphifyViewer ───────────────────────────────
  async function loadGraphFiles() {
    if (graphifyLoaded) return;
    graphifyLoading = true;
    try {
      const res  = await fetch('/api/codebase-graph/json?limit=5000&raw=1', { signal: AbortSignal.timeout(30_000) });
      const body = await res.json();
      // raw=1 returns the files[] array directly
      graphFiles = body.files ?? body.nodes?.map((n: ViewerNode) => ({ rel: n.path, clusterId: parseInt(n.cluster) || undefined })) ?? [];
      graphifyLoaded = true;
    } catch { graphFiles = []; }
    finally { graphifyLoading = false; }
  }

  // ── Batch GPU: run selected stages via SSE ────────────────────────────────
  async function runBatchGpu(stages: string[]) {
    batchRunning = true;
    batchError   = '';
    batchStages  = GPU_STAGES.map(n => ({
      name: n,
      status: stages.includes(n) ? 'pending' : 'done',
    }));

    try {
      const res = await fetch('/api/codebase-index/batch-gpu', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stages, k: 20, maxChunks: 2000, writeBack: true }),
        signal: AbortSignal.timeout(120_000)
      });
      if (!res.ok || !res.body) { batchError = `HTTP ${res.status}`; return; }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      // SSE pump — exits when reader.read() returns { done: true }.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        for (const line of buf.split('\n')) {
          buf = '';
          if (!line.startsWith('data:')) continue;
          try {
            const ev = JSON.parse(line.slice(5));
            if (ev.stage) {
              batchStages = batchStages.map(s =>
                s.name === ev.stage
                  ? { ...s, status: ev.status === 'done' ? 'done' : ev.status === 'error' ? 'error' : 'running', ms: ev.ms }
                  : s
              );
            }
          } catch { /* partial JSON */ }
        }
      }
    } catch (e) { batchError = (e as Error).message; }
    finally { batchRunning = false; }
  }

  // ── Tab switch side effects ───────────────────────────────────────────────
  function switchTab(t: Tab) {
    activeTab = t;
    if (t === 'canvas' && nodes.length === 0) loadCanvas();
    if (t === 'graphify' || t === 'pagerank') loadGraphFiles();
    if (t === 'atlas') loadAtlas();
  }

  onMount(() => loadGraphFiles());
</script>

<svelte:head><title>Fast-AST Codebase Graph</title></svelte:head>

<div class="page">
  <!-- ── Header ───────────────────────────────────────────────────────────── -->
  <header class="hdr">
    <h1>🗺️ Graphify — Codebase Intelligence</h1>
    {#if overview}
      <div class="overview-pills">
        <span class="pill">{overview.totalFiles.toLocaleString()} files</span>
        <span class="pill">{overview.totalDirs} dirs</span>
        <span class="pill">{overview.totalClusters} clusters</span>
        {#if overview.stats.ssrUnsafe}<span class="pill warn">🔴 {overview.stats.ssrUnsafe} SSR-unsafe</span>{/if}
        {#if overview.stats.sv4Legacy}<span class="pill warn">🟠 {overview.stats.sv4Legacy} Sv4</span>{/if}
        <span class="pill">⚡ avg score {overview.stats.avgScore}</span>
      </div>
    {/if}
  </header>

  <!-- ── Tab bar ──────────────────────────────────────────────────────────── -->
  <nav class="tabs">
    {#each (['graphify','atlas','pagerank','batch','canvas'] as Tab[]) as t (t)}
      <button class="tab" class:active={activeTab === t} onclick={() => switchTab(t)}>
        {{ graphify:'🗂️ Cluster View', atlas:'🧩 Glyph Atlas', pagerank:'⚡ PageRank', batch:'🔧 GPU Batch', canvas:'🔵 Canvas' }[t]}
      </button>
    {/each}
  </nav>

  <!-- ── Graphify tab ──────────────────────────────────────────────────────── -->
  {#if activeTab === 'graphify'}
    {#if graphifyLoading}
      <div class="loading">Loading graph files…</div>
    {:else}
      <GraphifyViewer graphFiles={graphFiles} />
    {/if}

  <!-- ── Glyph Atlas tab ──────────────────────────────────────────────────── -->
  {:else if activeTab === 'atlas'}
    <GlyphAtlasViewer manifest={atlasManifest} atlasBase64={atlasBase64} />

  <!-- ── PageRank tab ──────────────────────────────────────────────────────── -->
  {:else if activeTab === 'pagerank'}
    <div class="pr-panel">
      <h2>PageRank Top Nodes</h2>
      {#if serverPR.length}
        <p class="dim">Source: <code>{serverPR[0]?.source ?? '?'}</code> (Redis computed or fanIn fallback). Run GPU Batch → pagerank to update.</p>
        <table class="pr-table">
          <thead><tr><th>#</th><th>Score</th><th>File</th></tr></thead>
          <tbody>
            {#each serverPR as r, i (r.rel)}
              <tr>
                <td class="rank">{i + 1}</td>
                <td class="score">{typeof r.score === 'number' ? r.score.toExponential(3) : r.score}</td>
                <td class="rel" title={r.rel}>{r.rel}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="dim">No PageRank scores yet. Run <strong>GPU Batch → pagerank</strong> or <code>npm run index:codebase:fast</code>.</p>
      {/if}
    </div>

  <!-- ── GPU Batch tab ─────────────────────────────────────────────────────── -->
  {:else if activeTab === 'batch'}
    <div class="batch-panel">
      <h2>GPU Batch Analysis</h2>
      <p class="dim">Runs PyTorch GPU ops over all 32,753 Qdrant vectors. Writes back to Qdrant payloads + Neo4j. VRAM: RTX 3060 Ti (8GB).</p>

      <div class="stage-grid">
        {#each GPU_STAGES as stage (stage)}
          {@const s = batchStages.find(x => x.name === stage)}
          <div class="stage-card" class:done={s?.status==='done'} class:running={s?.status==='running'} class:error={s?.status==='error'}>
            <span class="sname">{stage}</span>
            {#if s?.status === 'running'}<span class="spin">⏳</span>
            {:else if s?.status === 'done'}<span class="ok">✅ {s.ms ? s.ms+'ms' : ''}</span>
            {:else if s?.status === 'error'}<span class="err">❌</span>
            {:else}<span class="dim">–</span>{/if}
          </div>
        {/each}
      </div>

      {#if batchError}<div class="err-box">⚠️ {batchError}</div>{/if}

      <div class="batch-btns">
        <button class="btn-gpu" disabled={batchRunning} onclick={() => runBatchGpu(['pagerank'])}>
          ⚡ PageRank only
        </button>
        <button class="btn-gpu" disabled={batchRunning} onclick={() => runBatchGpu(['kmeans','som','pagerank'])}>
          🔢 Cluster + SOM + PageRank
        </button>
        <button class="btn-gpu" disabled={batchRunning} onclick={() => runBatchGpu(GPU_STAGES)}>
          🔧 Full GPU pipeline
        </button>
        {#if batchRunning}<span class="dim spin-txt">Running…</span>{/if}
      </div>
    </div>

  <!-- ── Canvas tab (existing D3 view) ─────────────────────────────────────── -->
  {:else if activeTab === 'canvas'}
    <form class="ctrl" onsubmit={(e) => { e.preventDefault(); loadCanvas(); }}>
      <label>Node limit <input type="number" min="10" max="5000" step="10" bind:value={limit} /></label>
      <label><input type="checkbox" bind:checked={dirsOnly} /> dirs only</label>
      <label>Low-score ≤ <input type="number" min="0" max="100" step="5" bind:value={lowScore} /></label>
      <button type="submit" disabled={canvasLoading}>{canvasLoading ? 'Loading…' : 'Reload'}</button>
      <GraphExport
        nodes={nodes.map(n => ({ id: n.id, label: n.label, type: n.type, errorCount: n.errorCount, filePath: n.filePath, cluster: n.cluster }))}
        edges={edges.map(e => ({ source: e.source, target: e.target, type: e.type }))}
        filename="codebase-graph-fast-ast"
      />
    </form>

    {#if stats}
      <div class="stats">
        <span>mode=<code>{stats.mode}</code></span>
        <span>files=<code>{stats.sourceFiles?.toLocaleString()}</code></span>
        <span>rendered=<code>{stats.renderedNodes}</code> nodes / <code>{stats.renderedEdges}</code> edges</span>
        {#if stats.createdAt}<span class="dim">indexed {stats.createdAt}</span>{/if}
      </div>
    {/if}
    {#if canvasErr}<div class="err-box">⚠️ {canvasErr}</div>{/if}

    <div class="canvas-wrap">
      {#if canvasLoading}
        <div class="loading">Loading graph…</div>
      {:else if nodes.length}
        {@const canvasNodes = nodes.map(n => ({ id: n.id, label: n.label, type: n.type, path: n.path, extension: n.extension, size: n.size, group: n.group }))}
        <CodebaseGraphCanvas nodes={canvasNodes} {edges} onNodeClick={(n: { id: string }) => { selected = nodes.find(vn => vn.id === n.id) ?? null; }} />
      {:else}
        <div class="empty">No nodes. Try <code>npm run index:codebase:fast</code> then Reload.</div>
      {/if}
    </div>

    {#if selected}
      <aside class="detail">
        <h3>{selected.label}</h3>
        <p class="dim mono">{selected.path}</p>
        <ul>
          <li>Type: <code>{selected.type}</code></li>
          <li>Group: <code>{selected.group}</code></li>
          <li>Cluster: <code>{selected.cluster}</code></li>
          <li>Errors: <code>{selected.errorCount}</code></li>
        </ul>
        <button onclick={() => (selected = null)}>Close</button>
      </aside>
    {/if}
  {/if}
</div>

<style>
  .page { padding: 1rem; max-width: 1600px; margin: 0 auto; color: var(--t-fg, #ddd); }
  .hdr h1 { margin: 0 0 .5rem; }
  .overview-pills { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: .75rem; }
  .pill { padding: 2px 10px; border-radius: 12px; background: #1a1a2e; border: 1px solid #334; font-size: .78rem; }
  .pill.warn { border-color: #833; background: #200; }
  .dim { opacity: .65; }

  /* Tabs */
  .tabs { display: flex; gap: 4px; margin-bottom: 1rem; border-bottom: 1px solid #222; }
  .tab { padding: 6px 16px; background: none; border: 1px solid transparent; border-bottom: none; border-radius: 4px 4px 0 0; cursor: pointer; color: #aaa; font-size: .85rem; }
  .tab:hover { background: #1a1a1a; color: #eee; }
  .tab.active { background: #0d0d1a; border-color: #334; border-bottom-color: #0d0d1a; color: #88f; }

  /* PageRank table */
  .pr-panel { padding: 1rem 0; }
  .pr-table { width: 100%; border-collapse: collapse; font-size: .8rem; font-family: ui-monospace, monospace; }
  .pr-table th { text-align: left; padding: 4px 8px; background: #0a0a14; color: #88f; border-bottom: 1px solid #222; position: sticky; top: 0; }
  .pr-table td { padding: 3px 8px; border-bottom: 1px solid #111; }
  .pr-table tr:hover td { background: #111; }
  .rank { color: #666; width: 2rem; }
  .score { color: #4af; width: 7rem; font-variant-numeric: tabular-nums; }
  .rel { color: #ccc; word-break: break-all; }

  /* Batch panel */
  .batch-panel { padding: 1rem 0; }
  .stage-grid { display: flex; flex-wrap: wrap; gap: 8px; margin: 1rem 0; }
  .stage-card { padding: 8px 14px; border: 1px solid #333; border-radius: 6px; background: #111; display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 100px; font-size: .8rem; font-family: ui-monospace, monospace; }
  .stage-card.done    { border-color: #264; background: #091209; }
  .stage-card.running { border-color: #448; background: #0a0a1a; }
  .stage-card.error   { border-color: #833; background: #180808; }
  .sname { color: #aaa; font-size: .75rem; }
  .ok { color: #4f4; }
  .spin { animation: pulse 1s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
  .batch-btns { display: flex; gap: .75rem; flex-wrap: wrap; margin-top: 1rem; }
  .btn-gpu { padding: 6px 16px; background: #1a1a2e; border: 1px solid #448; border-radius: 6px; color: #88f; cursor: pointer; font-size: .85rem; }
  .btn-gpu:hover:not(:disabled) { background: #222244; }
  .btn-gpu:disabled { opacity: .4; cursor: default; }
  .spin-txt { color: #88f; animation: pulse 1s infinite; }

  /* Canvas tab */
  .ctrl { display: flex; flex-wrap: wrap; gap: .75rem; align-items: center; margin: 1rem 0; padding: .75rem; border: 1px solid #333; border-radius: 6px; }
  .ctrl label { display: inline-flex; gap: .35rem; align-items: center; font-size: .9rem; }
  .ctrl input[type="number"] { width: 5rem; padding: .25rem .4rem; background: #111; border: 1px solid #333; color: #eee; border-radius: 4px; }
  .stats { display: flex; flex-wrap: wrap; gap: 1rem; font-size: .85rem; padding: .5rem 0; }
  .canvas-wrap { border: 1px solid #333; border-radius: 6px; min-height: 600px; position: relative; }
  .loading, .empty { padding: 4rem; text-align: center; opacity: .6; }
  .err-box { padding: .75rem; background: #4a1f1f; border: 1px solid #8b3a3a; border-radius: 4px; margin: .5rem 0; }
  .detail { position: fixed; right: 1rem; top: 6rem; width: 280px; padding: 1rem; background: var(--t-panel,#1a1a1a); border: 1px solid #333; border-radius: 6px; z-index: 10; }
  .detail h3 { margin: 0 0 .25rem; }
  .detail ul { list-style: none; padding: 0; margin: .5rem 0; font-size: .85rem; }
  .mono { font-family: ui-monospace,monospace; font-size: .8rem; word-break: break-all; }
  code { background: #1a1a2e; padding: .1rem .3rem; border-radius: 3px; }
</style>
