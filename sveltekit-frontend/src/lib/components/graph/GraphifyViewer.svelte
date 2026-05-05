<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { computePageRankWebGPU, graphJsonToPageRankInput } from '$lib/gpu/webgpu-pagerank.js';
  import type { PageRankOutput } from '$lib/gpu/webgpu-pagerank.js';
  import type { RpcCacheResult } from '$lib/types/rpc-cache.js';
  import BagOfWordsTexturePanel from './BagOfWordsTexturePanel.svelte';

  interface GraphFile {
    rel: string;
    tags?: string[];
    imports?: string[];
    fanIn?: number;
    isRoute?: boolean;
    isTest?: boolean;
    hasPairedTest?: boolean;
    ssrUnsafe?: boolean;
    sv4Legacy?: boolean;
    clusterId?: number;
    hasAuth?: boolean;
    hasZod?: boolean;
    lineCount?: number;
  }

  interface ClusterSummary {
    id: number;
    label?: string;
    topTags?: string[];
    fileCount: number;
    ssrRisk: number;
    pairedPct: number;
    topFiles: GraphFile[];
  }

  interface TraverseNode {
    id: string;
    label: string;
    pageRankScore?: number;
    clusterId?: number;
    isCenter?: boolean;
    tags?: string[];
    ssrUnsafe?: boolean;
    sv4Legacy?: boolean;
  }

  interface TraverseEdge {
    source: string;
    target: string;
  }

  interface TraverseResult {
    nodes: TraverseNode[];
    edges: TraverseEdge[];
    total: number;
    truncated: boolean;
    meta?: { error?: string; gemma4Summary?: string };
  }

  let { graphFiles = [] }: { graphFiles: GraphFile[] } = $props();

  // ── State ──────────────────────────────────────────────────────────────────
  let pageRankResult  = $state<PageRankOutput | null>(null);
  let prCache         = $state<RpcCacheResult<PageRankOutput>['cache'] | null>(null);
  let prLoading       = $state(false);
  let prError         = $state('');
  let selectedCluster = $state<number | null>(null);
  let searchQuery     = $state('');
  let page            = $state(0);
  const PAGE_SIZE     = 50;

  // Traversal state
  let selectedFile    = $state<string | null>(null);
  let traverseResult  = $state<TraverseResult | null>(null);
  let traverseLoading = $state(false);
  let traverseHops    = $state(2);
  let traverseMode    = $state<'ego' | 'bfs' | 'cluster'>('ego');
  let clusterSummary  = $state('');
  let summaryLoading  = $state(false);
  let canvasEl        = $state<HTMLCanvasElement | null>(null);

  // Layout worker state
  let layoutStatus    = $state<'idle' | 'running' | 'done'>('idle');
  let layoutJobSeq    = 0;   // sequence counter — stale replies dropped

  // BoW panel state
  let showBow         = $state(false);
  let bowClusterId    = $state<number | undefined>(undefined);

  // ── Derived ────────────────────────────────────────────────────────────────
  let showCanvas = $derived(
    !!traverseResult && traverseResult.nodes.length > 0 && traverseResult.nodes.length <= 50
  );

  let clusters = $derived.by((): ClusterSummary[] => {
    const map = new Map<number, GraphFile[]>();
    for (const f of graphFiles) {
      const cid = f.clusterId ?? -1;
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid)!.push(f);
    }
    return [...map.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([id, files]) => ({
        id,
        fileCount: files.length,
        ssrRisk:   files.filter(f => f.ssrUnsafe).length,
        pairedPct: files.length
          ? Math.round(files.filter(f => f.hasPairedTest).length / files.length * 100)
          : 0,
        topTags: [...new Set(files.flatMap(f => f.tags ?? []))].slice(0, 5),
        topFiles: files.slice(0, 25),
      }));
  });

  let clusterFiles = $derived.by((): GraphFile[] => {
    const source = selectedCluster !== null
      ? graphFiles.filter(f => (f.clusterId ?? -1) === selectedCluster)
      : graphFiles;
    const q = searchQuery.toLowerCase();
    return q ? source.filter(f => f.rel.toLowerCase().includes(q)) : source;
  });

  let pageCount    = $derived(Math.ceil(clusterFiles.length / PAGE_SIZE));
  let visibleFiles = $derived(clusterFiles.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));

  let scoreMap = $derived.by((): Map<string, number> => {
    if (!pageRankResult) return new Map();
    return new Map(pageRankResult.nodeOrder.map((id, i) => [id, pageRankResult!.scores[i]]));
  });

  function prScore(rel: string): string {
    const s = scoreMap.get(rel);
    return s !== undefined ? s.toExponential(2) : '—';
  }

  let egoGraph = $derived.by((): Array<{ file: GraphFile; score: number }> => {
    if (selectedCluster === null) return [];
    const files = graphFiles.filter(f => (f.clusterId ?? -1) === selectedCluster);
    return files
      .map(f => ({ file: f, score: scoreMap.get(f.rel) ?? 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 25);
  });

  // ── Web Worker for force layout ───────────────────────────────────────────
  let layoutWorker: Worker | null = null;

  // ── WebGPU PageRank + Worker init ──────────────────────────────────────────
  onMount(async () => {
    layoutWorker = new Worker(
      new URL('$lib/workers/graph-layout.worker.ts', import.meta.url),
      { type: 'module' }
    );

    if (!graphFiles.length) return;
    prLoading = true;
    try {
      const input  = graphJsonToPageRankInput(graphFiles);
      const result = await computePageRankWebGPU(input, { iters: 40 });
      pageRankResult = result.value;
      prCache        = result.cache;
      prError = '';
    } catch (e) {
      prError = (e as Error).message;
    } finally {
      prLoading = false;
    }
  });

  onDestroy(() => { layoutWorker?.terminate(); });

  // ── Canvas draw (positions computed by worker) ─────────────────────────────
  function drawPositions(
    canvas: HTMLCanvasElement,
    nodes: TraverseNode[],
    edges: TraverseEdge[],
    positions: Array<{ x: number; y: number }>
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const idxMap = new Map(nodes.map((n, i) => [n.id, i]));

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = '#334';
    ctx.lineWidth = 1;
    for (const e of edges) {
      const si = idxMap.get(e.source), ti = idxMap.get(e.target);
      if (si === undefined || ti === undefined) continue;
      ctx.beginPath();
      ctx.moveTo(positions[si].x, positions[si].y);
      ctx.lineTo(positions[ti].x, positions[ti].y);
      ctx.stroke();
    }

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const p = positions[i];
      const r = n.isCenter ? 8 : 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = n.isCenter ? '#88f' : n.ssrUnsafe ? '#833' : '#335';
      ctx.fill();
      if (n.isCenter || nodes.length <= 15) {
        ctx.fillStyle = '#aaa';
        ctx.font = '9px monospace';
        ctx.fillText((n.label.split('/').pop() ?? n.label).slice(0, 22), p.x + r + 2, p.y + 3);
      }
    }
  }

  // ── Debounced worker dispatch with sequence guard ─────────────────────────
  $effect(() => {
    if (!showCanvas || !canvasEl || !traverseResult || !layoutWorker) return;
    const canvas = canvasEl;
    const data   = traverseResult;

    // Bump sequence — any older reply with a lower seq is dropped
    const mySeq = ++layoutJobSeq;
    layoutStatus = 'running';

    const handler = (e: MessageEvent<{ type: string; seq?: number; positions?: Array<{ x: number; y: number }> }>) => {
      if (e.data.type !== 'done') return;
      // Drop stale replies
      if ((e.data.seq ?? mySeq) !== mySeq) return;
      layoutWorker!.removeEventListener('message', handler);
      if (e.data.positions) {
        drawPositions(canvas, data.nodes, data.edges, e.data.positions);
        layoutStatus = 'done';
      }
    };

    layoutWorker.addEventListener('message', handler);
    layoutWorker.postMessage({
      type:  'layout',
      seq:   mySeq,
      nodes: data.nodes.map(n => ({ id: n.id })),
      edges: data.edges,
      W:     canvas.width,
      H:     canvas.height,
    });
  });

  // ── Traversal + cluster summary fetches ───────────────────────────────────
  async function loadFileTraversal(filePath: string) {
    selectedFile = filePath;
    traverseResult = null;
    traverseLoading = true;
    layoutStatus = 'idle';
    try {
      const params = new URLSearchParams({
        nodeId: filePath,
        hops:   String(traverseHops),
        mode:   traverseMode,
        limit:  '50',
      });
      const res = await fetch(`/api/graph/traverse?${params}`);
      traverseResult = await res.json() as TraverseResult;
    } catch (e) {
      traverseResult = { nodes: [], edges: [], total: 0, truncated: false, meta: { error: (e as Error).message } };
    } finally {
      traverseLoading = false;
    }
  }

  async function loadClusterSummary(clusterId: number) {
    if (clusterId < 0) return;
    clusterSummary = '';
    summaryLoading = true;
    try {
      const res = await fetch(`/api/graph/traverse?nodeId=cluster:${clusterId}&mode=cluster&limit=1`);
      const data = await res.json() as TraverseResult;
      clusterSummary = data.meta?.gemma4Summary ?? '';
    } catch {
      clusterSummary = '';
    } finally {
      summaryLoading = false;
    }
  }

  function selectCluster(id: number) {
    selectedCluster = selectedCluster === id ? null : id;
    page = 0;
    searchQuery = '';
    if (selectedCluster !== null) {
      loadClusterSummary(id);
      bowClusterId = id;
      showBow = true;
    } else {
      clusterSummary = '';
      bowClusterId = undefined;
      showBow = false;
    }
  }

  function flag(f: GraphFile) {
    const out: string[] = [];
    if (f.ssrUnsafe)    out.push('🔴SSR');
    if (f.sv4Legacy)    out.push('🟠Sv4');
    if (!f.hasPairedTest && f.isRoute) out.push('⚠️NoTest');
    if (f.hasAuth)      out.push('🔒Auth');
    return out.join(' ');
  }

  // Status summary for cache pill
  let prStatus = $derived.by(() => {
    if (prLoading) return { label: '⏳ PageRank…', cls: 'loading' };
    if (prError)   return { label: '⚠️ PR failed', cls: 'err' };
    if (!pageRankResult) return null;
    const cached = prCache?.hit ? ' (cached)' : ' (computed)';
    return {
      label: `⚡ PR via ${pageRankResult.backend} ${pageRankResult.durationMs.toFixed(0)}ms${cached}`,
      cls: 'ok',
    };
  });

  let layoutPill = $derived.by(() => {
    if (layoutStatus === 'running') return { label: '⏳ Layout…', cls: 'loading' };
    if (layoutStatus === 'done')    return { label: '✓ Layout done', cls: 'ok' };
    return null;
  });
</script>

<div class="graphify-viewer">
  <!-- ── Header ──────────────────────────────────────────────────────────── -->
  <div class="viewer-header">
    <span class="title">Graphify — {graphFiles.length} files · {clusters.length} clusters</span>
    {#if prStatus}
      <span class="pr-badge {prStatus.cls}" title={prError || undefined}>{prStatus.label}</span>
    {/if}
    {#if layoutPill}
      <span class="pr-badge {layoutPill.cls}">{layoutPill.label}</span>
    {/if}
    {#if prCache}
      <span class="cache-hint">{prCache.hitLevel}{prCache.hit ? '' : ' miss'}</span>
    {/if}
  </div>

  <!-- ── Level 0: Cluster tiles ─────────────────────────────────────────── -->
  <div class="cluster-grid">
    {#each clusters.slice(0, 100) as c (c.id)}
      <button
        class="cluster-tile"
        class:selected={selectedCluster === c.id}
        class:hot={c.ssrRisk > 0}
        onclick={() => selectCluster(c.id)}
        title="Cluster {c.id} · {c.fileCount} files · {c.ssrRisk} SSR risks"
      >
        <span class="cid">#{c.id}</span>
        <span class="cfiles">{c.fileCount}</span>
        {#if c.ssrRisk}  <span class="ssr-badge">🔴{c.ssrRisk}</span> {/if}
        {#if c.pairedPct < 20}  <span class="test-badge">⚠️{c.pairedPct}%</span> {/if}
        <span class="ctags">{c.topTags?.slice(0,3).join(' ')}</span>
      </button>
    {/each}
  </div>

  <!-- ── Gemma4 cluster summary + BoW panel (side by side when both visible) -->
  {#if selectedCluster !== null}
    <div class="cluster-detail-row">
      <!-- Summary -->
      {#if summaryLoading || clusterSummary}
        <div class="cluster-summary">
          {#if summaryLoading}
            <span class="summary-loading">💬 Loading Gemma4 summary…</span>
          {:else}
            <p class="summary-text">{clusterSummary}</p>
          {/if}
        </div>
      {/if}

      <!-- BoW Texture Panel -->
      {#if showBow && bowClusterId !== undefined}
        <div class="bow-wrap">
          <div class="bow-toggle-row">
            <span class="bow-label">Bag-of-Words</span>
            <button class="bow-close" onclick={() => { showBow = false; }}>✕</button>
          </div>
          <BagOfWordsTexturePanel clusterId={bowClusterId} />
        </div>
      {:else if selectedCluster !== null}
        <button class="bow-open-btn" onclick={() => { bowClusterId = selectedCluster!; showBow = true; }}>
          📊 Show BoW Texture
        </button>
      {/if}
    </div>
  {/if}

  <!-- ── Level 1: Ego graph for selected cluster ────────────────────────── -->
  {#if selectedCluster !== null && egoGraph.length > 0}
    <div class="ego-graph">
      <h3>Cluster {selectedCluster} — top files by PageRank</h3>
      <div class="ego-list">
        {#each egoGraph as { file, score }}
          <button
            class="ego-row"
            class:active={selectedFile === file.rel}
            onclick={() => loadFileTraversal(file.rel)}
          >
            <span class="score">{score.toExponential(2)}</span>
            <span class="rel" title={file.rel}>{file.rel}</span>
            <span class="flags">{flag(file)}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- ── Traversal panel (shown when a file is selected) ───────────────── -->
  {#if selectedFile}
    <div class="traversal-panel">
      <div class="traversal-header">
        <span class="tfile" title={selectedFile}>{selectedFile}</span>
        <select bind:value={traverseMode} onchange={() => loadFileTraversal(selectedFile!)}>
          <option value="ego">Ego</option>
          <option value="bfs">BFS</option>
          <option value="cluster">Cluster</option>
        </select>
        <label class="hops-label">
          Hops
          <input type="number" min="1" max="4" bind:value={traverseHops}
            onchange={() => loadFileTraversal(selectedFile!)} />
        </label>
        {#if traverseLoading}
          <span class="t-status">⏳ loading…</span>
        {:else if traverseResult}
          <span class="t-status">{traverseResult.total} nodes{traverseResult.truncated ? ' (trunc)' : ''}</span>
        {/if}
        <!-- Layout status badge -->
        {#if layoutStatus === 'running'}
          <span class="t-status layout-status">⚙️ layout…</span>
        {:else if layoutStatus === 'done' && showCanvas}
          <span class="t-status layout-status ok">✓ layout</span>
        {/if}
      </div>

      <!-- Canvas: spring-charge layout off-thread via Web Worker -->
      {#if showCanvas && traverseResult}
        <canvas bind:this={canvasEl} class="force-canvas" width="600" height="300"></canvas>
      {/if}

      <!-- Traversal node table -->
      {#if traverseResult && traverseResult.nodes.length > 0}
        <div class="traverse-table-wrap">
          <table class="file-table">
            <thead>
              <tr><th>PageRank</th><th>File</th><th>Flags</th></tr>
            </thead>
            <tbody>
              {#each traverseResult.nodes as n (n.id)}
                <tr class:center-node={n.isCenter} class:ssr={n.ssrUnsafe}>
                  <td class="score-cell">{n.pageRankScore?.toExponential(2) ?? '—'}</td>
                  <td class="rel-cell" title={n.id}><span class="rel-path">{n.label}</span></td>
                  <td>{n.ssrUnsafe ? '🔴SSR' : ''}{n.sv4Legacy ? ' 🟠Sv4' : ''}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else if traverseResult?.meta?.error}
        <p class="traverse-err">⚠️ {traverseResult.meta.error}</p>
      {/if}
    </div>
  {/if}

  <!-- ── Level 2: Paginated file list ───────────────────────────────────── -->
  <div class="file-panel">
    <div class="search-bar">
      <input
        type="search"
        placeholder="Filter files…"
        bind:value={searchQuery}
        oninput={() => { page = 0; }}
      />
      <span class="result-count">{clusterFiles.length} files</span>
    </div>

    <div class="file-table-wrap">
      <table class="file-table">
        <thead>
          <tr>
            <th>PageRank</th>
            <th>File</th>
            <th>Lines</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {#each visibleFiles as f (f.rel)}
            <tr
              class:ssr={f.ssrUnsafe}
              class:sv4={f.sv4Legacy}
              class:active-file={selectedFile === f.rel}
            >
              <td class="score-cell">{prScore(f.rel)}</td>
              <td class="rel-cell" title={f.rel}>
                <button class="rel-btn" onclick={() => loadFileTraversal(f.rel)}>{f.rel}</button>
              </td>
              <td>{f.lineCount ?? '—'}</td>
              <td>{flag(f)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if pageCount > 1}
      <div class="pagination">
        <button disabled={page === 0} onclick={() => page--}>← Prev</button>
        <span>Page {page + 1} / {pageCount}</span>
        <button disabled={page >= pageCount - 1} onclick={() => page++}>Next →</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .graphify-viewer {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    font-size: 0.8rem;
    font-family: var(--font-mono, monospace);
  }
  .viewer-header { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; font-weight: 600; }
  .pr-badge { padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; }
  .pr-badge.loading { background: #334; color: #aaf; }
  .pr-badge.ok      { background: #143; color: #4f4; }
  .pr-badge.err     { background: #431; color: #f84; }
  .cache-hint { font-size: 0.68rem; color: #556; font-weight: 400; }

  .cluster-grid { display: flex; flex-wrap: wrap; gap: 4px; }
  .cluster-tile {
    display: flex; flex-direction: column; align-items: center;
    width: 72px; padding: 4px; border: 1px solid #333; border-radius: 4px;
    background: #111; cursor: pointer; font-size: 0.65rem; gap: 2px;
    transition: border-color 0.15s;
  }
  .cluster-tile:hover   { border-color: #668; }
  .cluster-tile.selected { border-color: #88f; background: #1a1a2e; }
  .cluster-tile.hot     { border-color: #833; }
  .cid    { font-weight: 700; color: #88f; }
  .cfiles { color: #aaa; }
  .ssr-badge  { color: #f66; }
  .test-badge { color: #fa0; }
  .ctags { color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; text-align: center; }

  /* Cluster detail row: summary + BoW panel side by side */
  .cluster-detail-row {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .cluster-summary {
    flex: 1;
    min-width: 200px;
    border: 1px solid #223; border-radius: 4px; padding: 0.5rem 0.75rem;
    background: #0d0d1a; color: #99b; font-size: 0.75rem; line-height: 1.5;
  }
  .summary-loading { color: #66a; font-style: italic; }
  .summary-text { margin: 0; }
  .bow-wrap {
    width: 320px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .bow-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2px;
  }
  .bow-label { font-size: 0.7rem; color: #668; }
  .bow-close {
    background: none; border: none; color: #556; cursor: pointer; font-size: 0.75rem;
    padding: 0 4px;
  }
  .bow-close:hover { color: #f84; }
  .bow-open-btn {
    align-self: flex-start;
    padding: 4px 10px; background: #111; border: 1px solid #334; color: #88f;
    border-radius: 4px; cursor: pointer; font-size: 0.72rem;
  }
  .bow-open-btn:hover { background: #1a1a2e; border-color: #668; }

  .ego-graph { border: 1px solid #223; border-radius: 6px; padding: 0.75rem; background: #0d0d1a; }
  .ego-graph h3 { margin: 0 0 0.5rem; font-size: 0.8rem; color: #88f; }
  .ego-list { display: flex; flex-direction: column; gap: 2px; }
  .ego-row {
    display: grid; grid-template-columns: 80px 1fr auto; gap: 8px; align-items: center;
    background: none; border: 1px solid transparent; border-radius: 3px;
    padding: 2px 4px; cursor: pointer; text-align: left; color: inherit; font: inherit;
  }
  .ego-row:hover { border-color: #446; background: #111; }
  .ego-row.active { border-color: #88f; background: #1a1a2e; }
  .score { color: #4af; font-variant-numeric: tabular-nums; }

  .traversal-panel {
    border: 1px solid #336; border-radius: 6px; padding: 0.75rem;
    background: #0a0a1a; display: flex; flex-direction: column; gap: 0.5rem;
  }
  .traversal-header { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .tfile { flex: 1; color: #88f; font-size: 0.75rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .traversal-header select,
  .traversal-header input[type="number"] {
    background: #111; border: 1px solid #334; color: #eee;
    padding: 2px 4px; border-radius: 3px; font-size: 0.75rem;
  }
  .hops-label { color: #888; font-size: 0.75rem; display: flex; align-items: center; gap: 4px; }
  .hops-label input { width: 40px; }
  .t-status { color: #668; font-size: 0.72rem; }
  .layout-status    { color: #66a; }
  .layout-status.ok { color: #4a4; }
  .force-canvas {
    width: 100%; max-width: 600px; height: 300px; border: 1px solid #223;
    border-radius: 4px; background: #0a0a14; display: block;
  }
  .traverse-table-wrap { max-height: 240px; overflow-y: auto; border: 1px solid #222; border-radius: 4px; }
  .traverse-err { color: #f84; font-size: 0.75rem; margin: 0; }

  .file-panel { display: flex; flex-direction: column; gap: 0.5rem; }
  .search-bar { display: flex; align-items: center; gap: 0.5rem; }
  .search-bar input { flex: 1; padding: 4px 8px; background: #111; border: 1px solid #333; color: #eee; border-radius: 4px; }
  .result-count { color: #666; font-size: 0.75rem; white-space: nowrap; }

  .file-table-wrap { overflow-x: auto; max-height: 420px; overflow-y: auto; border: 1px solid #222; border-radius: 4px; }
  .file-table { width: 100%; border-collapse: collapse; }
  .file-table th { position: sticky; top: 0; background: #0a0a14; padding: 4px 8px; text-align: left; color: #88f; border-bottom: 1px solid #222; }
  .file-table td { padding: 3px 8px; border-bottom: 1px solid #111; }
  .file-table tr:hover td { background: #111; }
  .file-table tr.ssr td  { background: #1a0808; }
  .file-table tr.sv4 td  { background: #1a1000; }
  .file-table tr.active-file td { background: #1a1a2e; }
  .file-table tr.center-node td { background: #0d0d2a; font-weight: 600; }
  .score-cell { color: #4af; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .rel-cell { max-width: 400px; }
  .rel-path { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #ccc; }
  .rel-btn {
    background: none; border: none; padding: 0; color: #ccc; cursor: pointer;
    font: inherit; text-align: left; display: block; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
  }
  .rel-btn:hover { color: #aaf; text-decoration: underline; }
  .flags { white-space: nowrap; color: #aaa; }

  .pagination { display: flex; align-items: center; gap: 1rem; justify-content: center; }
  .pagination button { padding: 4px 12px; background: #111; border: 1px solid #333; color: #eee; border-radius: 4px; cursor: pointer; }
  .pagination button:disabled { opacity: 0.3; cursor: default; }
  .pagination span { color: #666; font-size: 0.75rem; }
</style>