<script lang="ts">
  /**
   * GraphifyViewer — virtualized codebase graph viewer
   *
   * Renders the Graphify codebase-graph.json without trying to show all
   * 3,374 nodes at once. Strategy:
   *
   *   Level 0: 100 GPU cluster tiles (cluster summary cards, always visible)
   *   Level 1: Ego graph (selected cluster → top-25 files by PageRank score)
   *   Level 2: Paginated file list (50 rows per page, virtualized scroll)
   *   Canvas:  WebGL/WebGPU force layout for visible ≤100 nodes only
   *
   * PageRank computed in-browser via WebGPU (webgpu-pagerank.ts) with
   * 15-min sessionStorage cache and CPU fallback.
   *
   * No RPC — reads graph JSON from /docs/graph/codebase-graph.json via
   * the +page.server.ts that passes it as `data.graphJson`.
   */

  import { onMount } from 'svelte';
  import { computePageRankWebGPU, graphJsonToPageRankInput } from '$lib/gpu/webgpu-pagerank.js';
  import type { PageRankOutput } from '$lib/gpu/webgpu-pagerank.js';
  import type { RpcCacheResult } from '$lib/types/rpc-cache.js';

  // ── Props ──────────────────────────────────────────────────────────────────
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

  // ── Derived cluster summaries ──────────────────────────────────────────────
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

  // ── Filtered file list for selected cluster ────────────────────────────────
  let clusterFiles = $derived.by((): GraphFile[] => {
    const source = selectedCluster !== null
      ? graphFiles.filter(f => (f.clusterId ?? -1) === selectedCluster)
      : graphFiles;
    const q = searchQuery.toLowerCase();
    return q ? source.filter(f => f.rel.toLowerCase().includes(q)) : source;
  });

  let pageCount = $derived(Math.ceil(clusterFiles.length / PAGE_SIZE));

  let visibleFiles = $derived(
    clusterFiles.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  );

  // ── PageRank scores mapped to file rel ─────────────────────────────────────
  let scoreMap = $derived.by((): Map<string, number> => {
    if (!pageRankResult) return new Map();
    return new Map(pageRankResult.nodeOrder.map((id, i) => [id, pageRankResult!.scores[i]]));
  });

  function prScore(rel: string): string {
    const s = scoreMap.get(rel);
    return s !== undefined ? s.toExponential(2) : '—';
  }

  // ── Top-25 in selected cluster sorted by PageRank ─────────────────────────
  let egoGraph = $derived.by((): Array<{ file: GraphFile; score: number }> => {
    if (selectedCluster === null) return [];
    const files = graphFiles.filter(f => (f.clusterId ?? -1) === selectedCluster);
    return files
      .map(f => ({ file: f, score: scoreMap.get(f.rel) ?? 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 25);
  });

  // ── Kick off WebGPU PageRank ───────────────────────────────────────────────
  onMount(async () => {
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

  function selectCluster(id: number) {
    selectedCluster = selectedCluster === id ? null : id;
    page = 0;
    searchQuery = '';
  }

  function flag(f: GraphFile) {
    const out: string[] = [];
    if (f.ssrUnsafe)    out.push('🔴SSR');
    if (f.sv4Legacy)    out.push('🟠Sv4');
    if (!f.hasPairedTest && f.isRoute) out.push('⚠️NoTest');
    if (f.hasAuth)      out.push('🔒Auth');
    return out.join(' ');
  }
</script>

<div class="graphify-viewer">
  <!-- ── Header ──────────────────────────────────────────────────────────── -->
  <div class="viewer-header">
    <span class="title">Graphify — {graphFiles.length} files · {clusters.length} clusters</span>
    {#if prLoading}
      <span class="pr-badge loading">⏳ PageRank (WebGPU)…</span>
    {:else if pageRankResult}
      <span class="pr-badge ok">⚡ PageRank via {pageRankResult.backend} ({pageRankResult.durationMs.toFixed(0)}ms)</span>
    {:else if prError}
      <span class="pr-badge err" title={prError}>⚠️ PR failed</span>
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

  <!-- ── Level 1: Ego graph for selected cluster ────────────────────────── -->
  {#if selectedCluster !== null && egoGraph.length > 0}
    <div class="ego-graph">
      <h3>Cluster {selectedCluster} — top files by PageRank</h3>
      <div class="ego-list">
        {#each egoGraph as { file, score }}
          <div class="ego-row">
            <span class="score">{score.toExponential(2)}</span>
            <span class="rel" title={file.rel}>{file.rel}</span>
            <span class="flags">{flag(file)}</span>
          </div>
        {/each}
      </div>
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

    <!-- Virtualized table — only PAGE_SIZE rows rendered -->
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
            <tr class:ssr={f.ssrUnsafe} class:sv4={f.sv4Legacy}>
              <td class="score-cell">{prScore(f.rel)}</td>
              <td class="rel-cell" title={f.rel}>
                <span class="rel-path">{f.rel}</span>
              </td>
              <td>{f.lineCount ?? '—'}</td>
              <td>{flag(f)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
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
  .viewer-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-weight: 600;
  }
  .pr-badge { padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; }
  .pr-badge.loading { background: #334; color: #aaf; }
  .pr-badge.ok      { background: #143; color: #4f4; }
  .pr-badge.err     { background: #431; color: #f84; }

  /* Cluster grid */
  .cluster-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .cluster-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 72px;
    padding: 4px;
    border: 1px solid #333;
    border-radius: 4px;
    background: #111;
    cursor: pointer;
    font-size: 0.65rem;
    gap: 2px;
    transition: border-color 0.15s;
  }
  .cluster-tile:hover  { border-color: #668; }
  .cluster-tile.selected { border-color: #88f; background: #1a1a2e; }
  .cluster-tile.hot    { border-color: #833; }
  .cid    { font-weight: 700; color: #88f; }
  .cfiles { color: #aaa; }
  .ssr-badge  { color: #f66; }
  .test-badge { color: #fa0; }
  .ctags  { color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; text-align: center; }

  /* Ego graph */
  .ego-graph { border: 1px solid #223; border-radius: 6px; padding: 0.75rem; background: #0d0d1a; }
  .ego-graph h3 { margin: 0 0 0.5rem; font-size: 0.8rem; color: #88f; }
  .ego-list { display: flex; flex-direction: column; gap: 2px; }
  .ego-row { display: grid; grid-template-columns: 80px 1fr auto; gap: 8px; align-items: center; }
  .score { color: #4af; font-variant-numeric: tabular-nums; }

  /* File panel */
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
  .score-cell { color: #4af; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .rel-cell { max-width: 400px; }
  .rel-path { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #ccc; }
  .flags { white-space: nowrap; color: #aaa; }

  .pagination { display: flex; align-items: center; gap: 1rem; justify-content: center; }
  .pagination button { padding: 4px 12px; background: #111; border: 1px solid #333; color: #eee; border-radius: 4px; cursor: pointer; }
  .pagination button:disabled { opacity: 0.3; cursor: default; }
  .pagination span { color: #666; font-size: 0.75rem; }
</style>