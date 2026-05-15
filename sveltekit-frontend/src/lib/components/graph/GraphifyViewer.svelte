<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { computePageRankWebGPU, graphJsonToPageRankInput } from '$lib/gpu/webgpu-pagerank.js';
  import type { PageRankOutput } from '$lib/gpu/webgpu-pagerank.js';
  import type { RpcCacheResult } from '$lib/types/rpc-cache.js';
  import type { GlyphDescriptor, GlyphAtlasManifest } from '$lib/server/graph/glyph-atlas-builder.js';
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
    somBmuRow?: number;
    somBmuCol?: number;
    somCluster?: number;
  }

  interface ClusterSummary {
    id: number;
    label?: string;
    topTags?: string[];
    fileCount: number;
    ssrRisk: number;
    pairedPct: number;
    topFiles: GraphFile[];
    somRow?: number;
    somCol?: number;
  }

  interface GlyphInfo {
    qdrantPointCount: number;
    llmSource?: string;
    topTerms: string[];
    somRow?: number;
    somCol?: number;
    aceSmokeOk: boolean;
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

  // SOM grid panel state
  let showSomGrid     = $state(false);

  // Hottest LLM-output paths (path-keyed L1 cache leaderboard)
  interface HottestPath { path: string; hitCount: number }
  let hottestPaths    = $state<HottestPath[]>([]);
  let showHottest     = $state(false);
  let hottestLoading  = $state(false);

  async function loadHottest() {
    if (hottestLoading) return;
    hottestLoading = true;
    try {
      const r = await fetch('/api/codebase-index/llm-output?hottest=20');
      if (r.ok) {
        const d = await r.json();
        hottestPaths = Array.isArray(d.hottest) ? d.hottest : [];
      }
    } catch { /* non-fatal */ }
    hottestLoading = false;
  }

  // Per-cluster LLM-hit counts (decorate cluster tiles with usage density)
  let clusterHits = $state<Record<number, number>>({});
  let clusterHitsMax = $derived.by(() => {
    let m = 0;
    for (const v of Object.values(clusterHits)) if (v > m) m = v;
    return m;
  });

  async function loadClusterHits() {
    try {
      const r = await fetch('/api/codebase-index/llm-output?clusterStats=1');
      if (r.ok) {
        const d = await r.json();
        clusterHits = (d.clusterHits ?? {}) as Record<number, number>;
      }
    } catch { /* non-fatal */ }
  }

  $effect(() => { loadClusterHits(); });

  interface SomCell {
    row: number;
    col: number;
    clusters: number[];        // cluster IDs occupying this cell
    fileCount: number;
    ssrRisk: number;
    dominantCluster: number | null;
  }

  let somGrid = $derived.by((): SomCell[][] => {
    const rows = 10, cols = 10;
    const grid: SomCell[][] = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => ({
        row: r, col: c, clusters: [], fileCount: 0, ssrRisk: 0, dominantCluster: null,
      }))
    );
    for (const f of graphFiles) {
      if (f.somBmuRow == null || f.somBmuCol == null) continue;
      const r = Math.min(Math.max(f.somBmuRow, 0), rows - 1);
      const c = Math.min(Math.max(f.somBmuCol, 0), cols - 1);
      const cell = grid[r][c];
      cell.fileCount++;
      if (f.ssrUnsafe) cell.ssrRisk++;
      if (f.clusterId != null && !cell.clusters.includes(f.clusterId)) {
        cell.clusters.push(f.clusterId);
      }
    }
    // Dominant cluster = most frequent cluster in each cell
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (!cell.clusters.length) continue;
        const freq = new Map<number, number>();
        for (const f of graphFiles) {
          if (f.somBmuRow !== r || f.somBmuCol !== c || f.clusterId == null) continue;
          freq.set(f.clusterId, (freq.get(f.clusterId) ?? 0) + 1);
        }
        let best = -1, bestCount = 0;
        for (const [cid, cnt] of freq) { if (cnt > bestCount) { best = cid; bestCount = cnt; } }
        cell.dominantCluster = best >= 0 ? best : null;
      }
    }
    return grid;
  });

  let somMaxFiles = $derived.by(() => {
    let m = 0;
    for (const row of somGrid) for (const cell of row) if (cell.fileCount > m) m = cell.fileCount;
    return m || 1;
  });

  // BoW panel state
  let showBow         = $state(false);
  let bowClusterId    = $state<number | undefined>(undefined);

  // Glyph info panel state
  let glyphInfo       = $state<GlyphInfo | null>(null);
  let glyphLoading    = $state(false);

  // ── Glyph Atlas (manifest + compare) ──────────────────────────────────────
  let atlasManifest   = $state<GlyphAtlasManifest | null>(null);
  let atlasLoading    = $state(false);
  let atlasError      = $state<string | null>(null);

  let selectedAtlasGlyph = $derived.by((): GlyphDescriptor | null => {
    if (!atlasManifest || selectedCluster == null) return null;
    return atlasManifest.glyphs.find(g => g.clusterId === selectedCluster) ?? null;
  });

  let compareCandidates = $derived.by((): GlyphDescriptor[] => {
    if (!atlasManifest || selectedCluster == null) return [];
    return atlasManifest.glyphs.filter(g => g.clusterId !== selectedCluster);
  });

  let compareTargetCluster = $state<number | null>(null);
  let compareLoading       = $state(false);
  let compareResult        = $state<{
    glyphA: GlyphDescriptor;
    glyphB: GlyphDescriptor;
    comparison: {
      cosineSimilarity: number;
      l2Distance: number;
      topDivergingTerms: Array<{ term: string; weightA: number; weightB: number; diff: number }>;
      scalarDiff: { pageRank: number; ssrRisk: number; auditScore: number; pairedTest: number; somDistance: number };
    };
  } | null>(null);
  let compareError         = $state<string | null>(null);

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
      .map(([id, files]) => {
        // Derive SOM position from first file that has coords
        const somFile = files.find(f => f.somBmuRow !== undefined);
        return {
          id,
          fileCount: files.length,
          ssrRisk:   files.filter(f => f.ssrUnsafe).length,
          pairedPct: files.length
            ? Math.round(files.filter(f => f.hasPairedTest).length / files.length * 100)
            : 0,
          topTags: [...new Set(files.flatMap(f => f.tags ?? []))].slice(0, 5),
          topFiles: files.slice(0, 25),
          somRow:  somFile?.somBmuRow,
          somCol:  somFile?.somBmuCol,
        };
      });
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

  // ── Glyph Atlas fetch + compare ───────────────────────────────────────────
  async function loadGlyphAtlas(force = false) {
    atlasLoading = true;
    atlasError   = null;
    try {
      const url = force ? '/api/graph/glyph-atlas?force=1' : '/api/graph/glyph-atlas';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Glyph atlas ${res.status}`);
      atlasManifest = await res.json();
    } catch (err) {
      atlasError = err instanceof Error ? err.message : String(err);
    } finally {
      atlasLoading = false;
    }
  }

  async function compareSelectedGlyph() {
    if (selectedCluster == null || compareTargetCluster == null) return;
    compareLoading = true;
    compareError   = null;
    compareResult  = null;
    try {
      const res = await fetch('/api/graph/glyph-atlas/compare', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ clusterIdA: selectedCluster, clusterIdB: compareTargetCluster }),
      });
      if (!res.ok) throw new Error(`Compare ${res.status}`);
      compareResult = await res.json();
    } catch (err) {
      compareError = err instanceof Error ? err.message : String(err);
    } finally {
      compareLoading = false;
    }
  }

  // ── Web Worker for force layout ───────────────────────────────────────────
  let layoutWorker: Worker | null = null;

  // ── WebGPU PageRank + Worker init ──────────────────────────────────────────
  onMount(async () => {
    layoutWorker = new Worker(
      new URL('$lib/workers/graph-layout.worker.ts', import.meta.url),
      { type: 'module' }
    );

    // Eagerly load glyph atlas manifest (non-blocking)
    void loadGlyphAtlas(false);

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

  // Rich cluster narrative from cluster_summaries × code_llm_index join
  interface ClusterNarrative {
    summary: string;
    purpose?: string | null;
    patterns: string[];
    warnings: string[];
    tags: string[];
    bowTerms: string[];
    representativePaths: string[];
    memberCount: number;
    llmPathCount: number;
    llmTotalHits: number;
    summaryModel?: string | null;
  }
  let clusterNarrative = $state<ClusterNarrative | null>(null);

  async function loadClusterSummary(clusterId: number) {
    if (clusterId < 0) return;
    clusterSummary = '';
    clusterNarrative = null;
    summaryLoading = true;
    try {
      const res = await fetch(`/api/graph/cluster-summaries?cluster=${clusterId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.cluster) {
          clusterNarrative = data.cluster as ClusterNarrative;
          clusterSummary   = data.cluster.summary ?? '';
          summaryLoading = false;
          return;
        }
      }
      // Fallback to legacy gemma4Summary path
      const legacy = await fetch(`/api/graph/traverse?nodeId=cluster:${clusterId}&mode=cluster&limit=1`);
      const data = await legacy.json() as TraverseResult;
      clusterSummary = data.meta?.gemma4Summary ?? '';
    } catch {
      clusterSummary = '';
    } finally {
      summaryLoading = false;
    }
  }

  async function loadGlyphInfo(clusterId: number) {
    if (clusterId < 0) return;
    glyphInfo = null;
    glyphLoading = true;
    try {
      // Fetch BoW tile for this cluster (checks Redis texture:bow:cluster:*)
      const bowRes = await fetch('/api/graph/bow-texture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'cluster', clusterId }),
      });
      const bowData = bowRes.ok ? await bowRes.json() : null;

      // Count Qdrant glyph_atlas points for this cluster via scroll filter
      let qdrantCount = 0;
      try {
        const qRes = await fetch('/api/graph/traverse?nodeId=cluster:' + clusterId + '&mode=cluster&limit=1');
        if (qRes.ok) {
          const qData = await qRes.json() as TraverseResult;
          // nodes array contains cluster members from Neo4j graph
          qdrantCount = qData.total ?? 0;
        }
      } catch { /* non-fatal */ }

      // SOM coords from the cluster summary entry we have in state
      const clusterEntry = clusters.find(c => c.id === clusterId);

      glyphInfo = {
        qdrantPointCount: qdrantCount,
        llmSource: (bowData?.tile as { source?: string } | null)?.source ?? (bowData?.cache?.hit ? 'redis' : undefined),
        topTerms:  (bowData?.tile as { terms?: string[] } | null)?.terms?.slice(0, 8) ?? [],
        somRow:    clusterEntry?.somRow,
        somCol:    clusterEntry?.somCol,
        aceSmokeOk: bowData?.tile !== null && bowData?.tile !== undefined,
      };
    } catch {
      glyphInfo = null;
    } finally {
      glyphLoading = false;
    }
  }

  function selectCluster(id: number) {
    selectedCluster = selectedCluster === id ? null : id;
    page = 0;
    searchQuery = '';
    // Reset compare state on every cluster change
    compareResult = null;
    compareError  = null;
    if (selectedCluster !== null) {
      loadClusterSummary(id);
      loadGlyphInfo(id);
      bowClusterId = id;
      showBow = true;
      // Lazily hydrate atlas if not yet loaded
      if (!atlasManifest && !atlasLoading) void loadGlyphAtlas(false);
    } else {
      clusterSummary = '';
      glyphInfo = null;
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
      {@const hits = clusterHits[c.id] ?? 0}
      {@const hitIntensity = clusterHitsMax > 0 ? hits / clusterHitsMax : 0}
      <button
        class="cluster-tile"
        class:selected={selectedCluster === c.id}
        class:hot={c.ssrRisk > 0}
        class:has-hits={hits > 0}
        style={hits > 0 ? `--hit-intensity: ${hitIntensity}` : ''}
        onclick={() => selectCluster(c.id)}
        title="Cluster {c.id} · {c.fileCount} files · {c.ssrRisk} SSR risks · {hits} LLM hits{c.somRow !== undefined ? ` · SOM (${c.somRow},${c.somCol})` : ''}"
      >
        <span class="cid">#{c.id}</span>
        <span class="cfiles">{c.fileCount}</span>
        {#if c.somRow !== undefined}
          <span class="som-pos">{c.somRow},{c.somCol}</span>
        {/if}
        {#if hits > 0}  <span class="hit-badge">⚡{hits}</span> {/if}
        {#if c.ssrRisk}  <span class="ssr-badge">🔴{c.ssrRisk}</span> {/if}
        {#if c.pairedPct < 20}  <span class="test-badge">⚠️{c.pairedPct}%</span> {/if}
        <span class="ctags">{c.topTags?.slice(0,3).join(' ')}</span>
      </button>
    {/each}
  </div>

  <!-- ── SOM Grid Heat Map ────────────────────────────────────────────────── -->
  {#if graphFiles.some(f => f.somBmuRow != null)}
    <div class="som-section">
      <button class="som-toggle" onclick={() => (showSomGrid = !showSomGrid)}>
        {showSomGrid ? '▾' : '▸'} SOM Grid ({graphFiles.filter(f => f.somBmuRow != null).length} files placed)
      </button>
      {#if showSomGrid}
        <div class="som-grid">
          {#each somGrid as row, r}
            {#each row as cell (r + ',' + cell.col)}
              {@const intensity = cell.fileCount / somMaxFiles}
              {@const isSelected = selectedCluster !== null && cell.dominantCluster === selectedCluster}
              <button
                class="som-cell"
                class:som-cell-active={isSelected}
                class:som-cell-ssr={cell.ssrRisk > 0}
                style="--intensity: {intensity}; background: rgba({cell.ssrRisk > 0 ? '160,40,40' : '40,80,160'},{intensity * 0.85 + 0.05})"
                title="{cell.fileCount} files · {cell.clusters.length} clusters · {cell.ssrRisk} SSR risks · row {r} col {cell.col}{cell.dominantCluster != null ? ' · dom #' + cell.dominantCluster : ''}"
                onclick={() => { if (cell.dominantCluster != null) selectCluster(cell.dominantCluster); }}
                disabled={cell.fileCount === 0}
              >
                {#if cell.fileCount > 0}
                  <span class="som-count">{cell.fileCount}</span>
                  {#if cell.dominantCluster != null}
                    <span class="som-cid">#{cell.dominantCluster}</span>
                  {/if}
                {/if}
              </button>
            {/each}
          {/each}
        </div>
        <div class="som-legend">
          <span class="som-leg-item"><span class="som-leg-swatch" style="background:rgba(40,80,160,0.7)"></span> low SSR risk</span>
          <span class="som-leg-item"><span class="som-leg-swatch" style="background:rgba(160,40,40,0.7)"></span> SSR risk</span>
          <span class="som-leg-item"><span class="som-leg-swatch som-leg-active"></span> selected cluster</span>
          <span class="som-leg-item dim">intensity = file density</span>
        </div>
      {/if}
    </div>
  {/if}

  <!-- ── Hottest LLM-Output Paths (Redis L1 leaderboard) ─────────────────── -->
  <div class="hottest-section">
    <button class="som-toggle" onclick={() => { showHottest = !showHottest; if (showHottest && !hottestPaths.length) loadHottest(); }}>
      {showHottest ? '▾' : '▸'} Hottest LLM Outputs {hottestPaths.length ? `(${hottestPaths.length})` : ''}
    </button>
    {#if showHottest}
      {#if hottestLoading}
        <div class="hottest-loading">loading…</div>
      {:else if hottestPaths.length === 0}
        <div class="hottest-empty">No cached LLM outputs yet. Records appear here as ACE/Gemma4/RAG hit the cache.</div>
      {:else}
        <ol class="hottest-list">
          {#each hottestPaths as h, i}
            <li class="hottest-item">
              <span class="hottest-rank">#{i + 1}</span>
              <span class="hottest-path" title={h.path}>{h.path.split('/').slice(-3).join('/')}</span>
              <span class="hottest-count">{h.hitCount}×</span>
            </li>
          {/each}
        </ol>
      {/if}
    {/if}
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
            {#if clusterNarrative}
              <div class="narrative-meta">
                {#if clusterNarrative.purpose}
                  <div class="narrative-row"><span class="nm-label">Purpose</span> {clusterNarrative.purpose}</div>
                {/if}
                {#if clusterNarrative.patterns.length}
                  <div class="narrative-row"><span class="nm-label">Patterns</span> {clusterNarrative.patterns.join(' · ')}</div>
                {/if}
                {#if clusterNarrative.warnings.length}
                  <div class="narrative-row narrative-warn"><span class="nm-label">⚠ Warnings</span> {clusterNarrative.warnings.join('; ')}</div>
                {/if}
                {#if clusterNarrative.bowTerms.length}
                  <div class="narrative-chips">
                    {#each clusterNarrative.bowTerms as term}
                      <span class="narrative-chip">{term}</span>
                    {/each}
                  </div>
                {/if}
                {#if clusterNarrative.representativePaths.length}
                  <details class="narrative-paths">
                    <summary>Representative paths ({clusterNarrative.representativePaths.length})</summary>
                    {#each clusterNarrative.representativePaths as p}
                      <div class="narrative-path">{p}</div>
                    {/each}
                  </details>
                {/if}
                <div class="narrative-stats">
                  <span>{clusterNarrative.memberCount} members</span>
                  {#if clusterNarrative.llmPathCount}<span>· ⚡{clusterNarrative.llmPathCount} LLM paths</span>{/if}
                  {#if clusterNarrative.llmTotalHits > 0}<span>· {clusterNarrative.llmTotalHits} hits</span>{/if}
                  {#if clusterNarrative.summaryModel}<span class="nm-model">{clusterNarrative.summaryModel}</span>{/if}
                </div>
              </div>
            {/if}
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

  <!-- ── Glyph atlas info panel ────────────────────────────────────────── -->
  {#if selectedCluster !== null && (glyphLoading || glyphInfo)}
    <div class="glyph-info-panel">
      <span class="glyph-title">Glyph Atlas — Cluster #{selectedCluster}</span>
      {#if glyphLoading}
        <span class="glyph-loading">⏳ loading…</span>
      {:else if glyphInfo}
        <div class="glyph-chips">
          {#if glyphInfo.somRow !== undefined}
            <span class="glyph-chip som">🗺 SOM ({glyphInfo.somRow},{glyphInfo.somCol})</span>
          {/if}
          {#if glyphInfo.llmSource}
            <span class="glyph-chip src" title="LLM source for Gemma4 summary">
              {glyphInfo.llmSource === 'turbo' ? '⚡ TurboQuant' : glyphInfo.llmSource === 'ollama' ? '🦙 Ollama' : glyphInfo.llmSource === 'redis' ? '🔴 Redis' : glyphInfo.llmSource}
            </span>
          {/if}
          <span class="glyph-chip ace" class:ace-ok={glyphInfo.aceSmokeOk} class:ace-miss={!glyphInfo.aceSmokeOk}
            title="ACE smoke: BoW tile present in Redis">
            {glyphInfo.aceSmokeOk ? '✅ ACE BoW' : '⚠️ No BoW tile'}
          </span>
        </div>
        {#if glyphInfo.topTerms.length > 0}
          <div class="glyph-terms">
            {#each glyphInfo.topTerms as term}
              <span class="glyph-term">{term}</span>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  {/if}

  <!-- ── Glyph Atlas Descriptor panel ───────────────────────────────────── -->
  {#if selectedCluster != null}
    <section class="atlas-panel">
      <div class="panel-header">
        <h3>🧩 Glyph Atlas — Cluster #{selectedCluster}</h3>
        <button onclick={() => loadGlyphAtlas(true)} disabled={atlasLoading}>
          {atlasLoading ? 'Refreshing…' : 'Rebuild / Refresh'}
        </button>
      </div>

      {#if atlasError}
        <p class="atlas-error">Glyph atlas unavailable: {atlasError}</p>
      {:else if !selectedAtlasGlyph}
        <p class="atlas-muted">
          No glyph descriptor for cluster {selectedCluster}. Run
          <code>npm run graphify:bow-tiles:fast</code> then rebuild the atlas.
        </p>
      {:else}
        <div class="atlas-grid">
          <div>
            <strong>Topic</strong>
            <span>{selectedAtlasGlyph.topic || '—'}</span>
          </div>
          <div>
            <strong>SOM centroid</strong>
            <span>
              ({selectedAtlasGlyph.somRowCentroid.toFixed(2)},
               {selectedAtlasGlyph.somColCentroid.toFixed(2)})
            </span>
          </div>
          <div>
            <strong>PageRank mean</strong>
            <span>{selectedAtlasGlyph.pageRankMean.toFixed(4)}</span>
          </div>
          <div>
            <strong>Audit score</strong>
            <span>{selectedAtlasGlyph.auditScore.toFixed(2)}</span>
          </div>
          <div>
            <strong>SSR risk</strong>
            <span>{selectedAtlasGlyph.ssrRisk.toFixed(2)}</span>
          </div>
          <div>
            <strong>Paired-test ratio</strong>
            <span>{selectedAtlasGlyph.pairedTestRatio.toFixed(2)}</span>
          </div>
          <div>
            <strong>Files / dirs</strong>
            <span>{selectedAtlasGlyph.fileCount} / {selectedAtlasGlyph.dirCount}</span>
          </div>
        </div>

        {#if selectedAtlasGlyph.terms?.length}
          <div class="atlas-terms">
            <strong>Top BoW terms</strong>
            <div class="atlas-term-list">
              {#each selectedAtlasGlyph.terms.slice(0, 12) as term, i}
                <span title={`weight ${selectedAtlasGlyph.weights[i]?.toFixed(3) ?? '0'}`}>
                  {term}
                </span>
              {/each}
            </div>
          </div>
        {/if}

        <div class="atlas-compare-row">
          <label>
            Compare with cluster
            <select bind:value={compareTargetCluster}>
              <option value={null}>—</option>
              {#each compareCandidates.slice(0, 50) as g (g.clusterId)}
                <option value={g.clusterId}>#{g.clusterId} {g.topic}</option>
              {/each}
            </select>
          </label>
          <button
            onclick={compareSelectedGlyph}
            disabled={compareLoading || compareTargetCluster == null}
          >
            {compareLoading ? 'Comparing…' : 'Compare'}
          </button>
        </div>

        {#if compareError}
          <p class="atlas-error">{compareError}</p>
        {/if}

        {#if compareResult}
          {@const cmp = compareResult.comparison}
          <div class="atlas-compare-result">
            <h4>
              #{compareResult.glyphA.clusterId} vs #{compareResult.glyphB.clusterId}
              <span class="cosine-sim">cos {cmp.cosineSimilarity.toFixed(3)}</span>
              <span class="l2-dist">L2 {cmp.l2Distance.toFixed(3)}</span>
            </h4>
            <div class="scalar-diffs">
              {#each Object.entries(cmp.scalarDiff) as [k, v]}
                <span class="scalar-diff" class:pos={(v as number) > 0} class:neg={(v as number) < 0}>
                  {k}: {(v as number).toFixed(3)}
                </span>
              {/each}
            </div>
            {#if cmp.topDivergingTerms?.length}
              <div class="diverge-terms">
                <strong>Top diverging terms</strong>
                {#each cmp.topDivergingTerms.slice(0, 10) as t (t.term)}
                  <div class="diverge-row">
                    <span class="diverge-term">{t.term}</span>
                    <span class="diverge-bar">
                      <span class="bar-a" style="width:{(t.weightA * 100).toFixed(1)}%"></span>
                      <span class="bar-b" style="width:{(t.weightB * 100).toFixed(1)}%"></span>
                    </span>
                    <span class="diverge-diff">{t.diff > 0 ? '+' : ''}{t.diff.toFixed(2)}</span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      {/if}
    </section>
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
  .cluster-tile.has-hits {
    background: rgba(80, 180, 120, calc(var(--hit-intensity, 0) * 0.22 + 0.04));
    border-color: rgba(80, 180, 120, calc(var(--hit-intensity, 0) * 0.6 + 0.25));
  }
  .hit-badge { color: #6c6; font-weight: 600; }
  .cid    { font-weight: 700; color: #88f; }
  .cfiles { color: #aaa; }
  .ssr-badge  { color: #f66; }
  .test-badge { color: #fa0; }
  .ctags { color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; text-align: center; }
  .som-pos { color: #4a8; font-size: 0.6rem; font-variant-numeric: tabular-nums; }

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
  .summary-text { margin: 0 0 0.5rem 0; color: #ccd; }

  .narrative-meta { display: flex; flex-direction: column; gap: 4px; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed #223; }
  .narrative-row { font-size: 0.7rem; color: #99a; }
  .narrative-warn { color: #c95; }
  .nm-label { color: #6b7; font-weight: 600; margin-right: 6px; }
  .nm-model { color: #557; font-family: ui-monospace, monospace; }
  .narrative-chips { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }
  .narrative-chip {
    background: #1a1a2e; border: 1px solid #223; color: #88a;
    padding: 1px 6px; border-radius: 3px; font-size: 0.65rem;
    font-family: ui-monospace, monospace;
  }
  .narrative-paths { font-size: 0.68rem; color: #889; margin-top: 4px; }
  .narrative-paths summary { cursor: pointer; color: #6b7; }
  .narrative-path {
    color: #99a; font-family: ui-monospace, monospace;
    padding: 1px 0 1px 12px; word-break: break-all;
  }
  .narrative-stats {
    display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;
    font-size: 0.68rem; color: #67a; font-variant-numeric: tabular-nums;
  }
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

  /* Glyph info panel */
  .glyph-info-panel {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem;
    border: 1px solid #1a2a1a; border-radius: 6px; padding: 0.4rem 0.75rem;
    background: #0a120a; font-size: 0.72rem;
  }
  .glyph-title { color: #4a8; font-weight: 600; margin-right: 0.25rem; white-space: nowrap; }
  .glyph-loading { color: #66a; font-style: italic; }
  .glyph-chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .glyph-chip {
    padding: 1px 6px; border-radius: 3px; font-size: 0.68rem; white-space: nowrap;
    border: 1px solid #234;
  }
  .glyph-chip.som   { background: #0a1a1a; color: #4a8; border-color: #1a3a2a; }
  .glyph-chip.src   { background: #0a0a1a; color: #88f; border-color: #224; }
  .glyph-chip.ace   { background: #0a0a0a; border-color: #333; }
  .glyph-chip.ace-ok   { color: #4d4; border-color: #1a3a1a; background: #0a160a; }
  .glyph-chip.ace-miss { color: #d84; border-color: #3a2a1a; background: #160f0a; }
  .glyph-terms { display: flex; flex-wrap: wrap; gap: 3px; }
  .glyph-term {
    padding: 1px 5px; background: #111a11; border: 1px solid #1a2a1a;
    border-radius: 3px; color: #6a6; font-size: 0.65rem;
  }

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

  /* Glyph Atlas panel */
  .atlas-panel {
    margin-top: 0.25rem;
    padding: 0.85rem 1rem;
    border: 1px solid rgba(136, 136, 255, 0.18);
    border-radius: 12px;
    background: rgba(20, 20, 30, 0.75);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
  }
  .panel-header h3 { margin: 0; font-size: 0.82rem; color: #88f; }
  .panel-header button {
    padding: 3px 10px; background: #111; border: 1px solid #334; color: #aaa;
    border-radius: 4px; cursor: pointer; font-size: 0.72rem;
  }
  .panel-header button:hover:not(:disabled) { background: #1a1a2e; border-color: #668; color: #eee; }
  .panel-header button:disabled { opacity: 0.4; cursor: default; }
  .atlas-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.6rem;
  }
  .atlas-grid > div {
    padding: 0.5rem 0.65rem;
    border-radius: 8px;
    background: rgba(255,255,255,0.05);
  }
  .atlas-grid strong {
    display: block;
    font-size: 0.68rem;
    opacity: 0.65;
    margin-bottom: 0.2rem;
    color: #99b;
  }
  .atlas-grid span { font-size: 0.78rem; color: #dde; font-variant-numeric: tabular-nums; }
  .atlas-terms { display: flex; flex-direction: column; gap: 0.3rem; }
  .atlas-terms strong { font-size: 0.68rem; color: #99b; opacity: 0.8; }
  .atlas-term-list { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
  .atlas-term-list span {
    padding: 2px 7px; border-radius: 999px;
    background: rgba(136, 136, 255, 0.15); border: 1px solid rgba(136,136,255,0.2);
    font-size: 0.72rem; color: #aaf;
  }
  .atlas-compare-row {
    display: flex; align-items: flex-end; gap: 0.65rem; flex-wrap: wrap; margin-top: 0.25rem;
  }
  .atlas-compare-row label { font-size: 0.72rem; color: #99b; display: flex; flex-direction: column; gap: 3px; }
  .atlas-compare-row input {
    width: 90px; padding: 3px 6px; background: #111; border: 1px solid #334;
    color: #eee; border-radius: 4px; font-size: 0.75rem;
  }
  .atlas-compare-row button {
    padding: 4px 12px; background: #111; border: 1px solid #334; color: #88f;
    border-radius: 4px; cursor: pointer; font-size: 0.75rem;
  }
  .atlas-compare-row button:hover:not(:disabled) { background: #1a1a2e; border-color: #668; }
  .atlas-compare-row button:disabled { opacity: 0.35; cursor: default; }
  .atlas-compare-result {
    margin-top: 0.5rem;
    padding: 0.6rem;
    border-radius: 6px;
    background: rgba(0,0,0,0.3);
    border: 1px solid #234;
    display: flex; flex-direction: column; gap: 0.45rem;
  }
  .atlas-compare-result h4 {
    margin: 0; font-size: 0.78rem; color: #88f;
    display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
  }
  .cosine-sim, .l2-dist {
    font-size: 0.7rem; padding: 1px 6px; border-radius: 3px;
    background: #112; color: #aaf; font-weight: 400;
  }
  .scalar-diffs { display: flex; flex-wrap: wrap; gap: 4px; }
  .scalar-diff {
    padding: 1px 6px; border-radius: 3px; font-size: 0.7rem;
    background: #111; border: 1px solid #223; color: #99b;
    font-variant-numeric: tabular-nums;
  }
  .scalar-diff.pos { color: #4d4; border-color: #1a3a1a; background: #0a160a; }
  .scalar-diff.neg { color: #f66; border-color: #3a1a1a; background: #160a0a; }
  .diverge-terms { display: flex; flex-direction: column; gap: 3px; }
  .diverge-terms strong { font-size: 0.68rem; color: #99b; opacity: 0.8; }
  .diverge-row {
    display: grid; grid-template-columns: 110px 1fr 50px;
    align-items: center; gap: 6px; font-size: 0.7rem;
  }
  .diverge-term { color: #cce; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .diverge-bar {
    position: relative; height: 8px; background: #050510;
    border-radius: 2px; overflow: hidden; display: flex;
  }
  .diverge-bar .bar-a { background: #4af; height: 100%; opacity: 0.7; }
  .diverge-bar .bar-b { background: #4d4; height: 100%; opacity: 0.7; }
  .diverge-diff {
    text-align: right; color: #aaf;
    font-variant-numeric: tabular-nums; font-size: 0.68rem;
  }
  .atlas-compare-row select {
    background: #111; border: 1px solid #334; color: #eee;
    padding: 3px 6px; border-radius: 4px; font-size: 0.75rem; min-width: 200px;
  }
  .atlas-error { color: #ff8a8a; margin: 0; font-size: 0.75rem; }
  .atlas-muted  { opacity: 0.65; margin: 0; font-size: 0.75rem; }

  /* Hottest LLM outputs */
  .hottest-section { display: flex; flex-direction: column; gap: 0.4rem; margin-top: 0.5rem; }
  .hottest-loading, .hottest-empty {
    font-size: 0.72rem; color: #778; padding: 0.5rem 0.75rem;
    background: #0f1020; border: 1px solid #223; border-radius: 4px;
  }
  .hottest-list {
    list-style: none; padding: 0; margin: 0;
    background: #0f1020; border: 1px solid #223; border-radius: 4px;
    max-height: 280px; overflow-y: auto;
  }
  .hottest-item {
    display: grid; grid-template-columns: 32px 1fr 48px;
    gap: 6px; align-items: center;
    padding: 4px 8px; font-size: 0.72rem;
    border-bottom: 1px solid #1a1a2a;
  }
  .hottest-item:last-child { border-bottom: none; }
  .hottest-rank { color: #667; font-variant-numeric: tabular-nums; }
  .hottest-path {
    color: #ccd; font-family: ui-monospace, monospace;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .hottest-count {
    color: #6b6; text-align: right; font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  /* SOM grid */
  .som-section { display: flex; flex-direction: column; gap: 0.4rem; }
  .som-toggle {
    align-self: flex-start; background: none; border: 1px solid #334; border-radius: 4px;
    color: #88f; font-size: 0.72rem; padding: 2px 8px; cursor: pointer;
  }
  .som-toggle:hover { background: #1a1a2e; }
  .som-grid {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 2px;
    max-width: 440px;
  }
  .som-cell {
    aspect-ratio: 1;
    border: 1px solid transparent;
    border-radius: 2px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    cursor: pointer; padding: 0; overflow: hidden; transition: border-color 0.1s;
  }
  .som-cell:disabled { cursor: default; opacity: 0.25; }
  .som-cell:not(:disabled):hover { border-color: #88f; }
  .som-cell-active { border-color: #88f !important; outline: 1px solid #88f; }
  .som-count { font-size: 0.5rem; color: rgba(255,255,255,0.85); line-height: 1; }
  .som-cid   { font-size: 0.42rem; color: rgba(200,200,255,0.7); line-height: 1; }
  .som-legend {
    display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center;
    font-size: 0.65rem; color: #888;
  }
  .som-leg-item { display: flex; align-items: center; gap: 4px; }
  .som-leg-swatch {
    width: 10px; height: 10px; border-radius: 2px; display: inline-block;
  }
  .som-leg-active { background: #1a1a2e; border: 1px solid #88f; }
  .dim { opacity: 0.6; }
</style>
