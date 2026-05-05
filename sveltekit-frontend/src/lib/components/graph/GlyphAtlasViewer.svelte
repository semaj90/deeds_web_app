<script lang="ts">
  import type { GlyphDescriptor, GlyphAtlasManifest } from '$lib/server/graph/glyph-atlas-builder.js';

  interface Props {
    manifest: GlyphAtlasManifest | null;
    atlasBase64: string | null;
  }

  let { manifest, atlasBase64 }: Props = $props();

  // ── State ───────────────────────────────────────────────────────────────────
  let selectedA = $state<number | null>(null);
  let selectedB = $state<number | null>(null);
  let compareResult = $state<null | {
    glyphA: GlyphDescriptor;
    glyphB: GlyphDescriptor;
    comparison: {
      cosineSimilarity: number;
      l2Distance: number;
      topDivergingTerms: Array<{ term: string; aWeight: number; bWeight: number; delta: number }>;
      scalarDiff: {
        pageRank: number;
        ssrRisk: number;
        auditScore: number;
        pairedTest: number;
        somDistance: number;
      };
    };
  }>(null);
  let compareLoading = $state(false);
  let atlasBuilding  = $state(false);
  let buildResult    = $state<{ clusterCount: number; durationMs: number } | null>(null);
  let buildError     = $state<string | null>(null);
  let sortKey        = $state<'clusterId' | 'fileCount' | 'auditScore' | 'ssrRisk' | 'pageRankMean'>('fileCount');
  let sortAsc        = $state(false);
  let filterTerm     = $state('');

  // ── WebGPU upload state ─────────────────────────────────────────────────────
  let gpuUploaded = $state(false);
  let gpuBuffer: GPUBuffer | null = null;
  let gpuDevice: GPUDevice | null = null;

  // ── Derived ─────────────────────────────────────────────────────────────────
  let glyphs = $derived.by(() => {
    if (!manifest?.glyphs) return [];
    let list = manifest.glyphs;
    if (filterTerm.trim()) {
      const q = filterTerm.toLowerCase();
      list = list.filter(
        (g) =>
          g.topic.toLowerCase().includes(q) ||
          g.topDirs.some((d) => d.toLowerCase().includes(q)) ||
          g.terms.some((t) => t.includes(q))
      );
    }
    return [...list].sort((a, b) => {
      const va = a[sortKey] as number;
      const vb = b[sortKey] as number;
      return sortAsc ? va - vb : vb - va;
    });
  });

  let similarityGrid = $derived.by(() => {
    if (!manifest?.similarity || !manifest.glyphs) return null;
    const n = manifest.glyphs.length;
    // Reconstruct full NxN from upper triangle
    const grid: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    let k = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        grid[i][j] = grid[j][i] = manifest.similarity[k++] ?? 0;
      }
    }
    return grid;
  });

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function buildAtlas(force = false) {
    atlasBuilding = true;
    buildError = null;
    try {
      const res = await fetch('/api/graph/glyph-atlas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceRebuild: force }),
      });
      const data = await res.json();
      if (!res.ok) { buildError = data.error ?? 'Build failed'; return; }
      buildResult = { clusterCount: data.manifest?.clusterCount ?? 0, durationMs: data.durationMs };
      // Reload page to get fresh manifest
      window.location.reload();
    } catch (e) {
      buildError = (e as Error).message;
    } finally {
      atlasBuilding = false;
    }
  }

  async function runCompare() {
    if (selectedA == null || selectedB == null) return;
    compareLoading = true;
    compareResult = null;
    try {
      const res = await fetch('/api/graph/glyph-atlas/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterIdA: selectedA, clusterIdB: selectedB }),
      });
      const data = await res.json();
      if (res.ok) compareResult = data;
    } finally {
      compareLoading = false;
    }
  }

  async function uploadToGPU() {
    if (!atlasBase64 || !navigator.gpu) return;
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return;
      gpuDevice = await adapter.requestDevice();
      const bytes = Uint8Array.from(atob(atlasBase64), (c) => c.charCodeAt(0));
      const f32   = new Float32Array(bytes.buffer);
      gpuBuffer = gpuDevice.createBuffer({
        size:  f32.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        label: 'glyph-atlas',
      });
      gpuDevice.queue.writeBuffer(gpuBuffer, 0, f32);
      gpuUploaded = true;
    } catch { /* WebGPU unavailable */ }
  }

  function selectGlyph(cid: number) {
    if (selectedA == null || (selectedA != null && selectedB != null)) {
      selectedA = cid;
      selectedB = null;
      compareResult = null;
    } else if (cid !== selectedA) {
      selectedB = cid;
    }
  }

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) { sortAsc = !sortAsc; } else { sortKey = key; sortAsc = false; }
  }

  function fmtPct(v: number) { return `${(v * 100).toFixed(1)}%`; }
  function fmtDelta(v: number) {
    const sign = v > 0 ? '+' : '';
    return `${sign}${(v * 100).toFixed(1)}%`;
  }
  function simColor(v: number): string {
    // green → red scale for similarity matrix
    const r = Math.round((1 - v) * 200);
    const g = Math.round(v * 180);
    return `rgb(${r},${g},60)`;
  }
</script>

<div class="atlas-root">
  <!-- Header toolbar -->
  <div class="toolbar">
    <span class="title">
      Glyph Atlas
      {#if manifest}
        <span class="badge">{manifest.clusterCount} clusters · {manifest.totalFiles} files</span>
      {/if}
    </span>

    <input
      type="text"
      placeholder="Filter by topic, dir, or term…"
      bind:value={filterTerm}
      class="filter-input"
    />

    {#if atlasBase64 && 'gpu' in navigator}
      <button
        class="btn-gpu"
        onclick={uploadToGPU}
        disabled={gpuUploaded}
      >
        {gpuUploaded ? '✓ GPU' : '⬆ Upload to WebGPU'}
      </button>
    {/if}

    <button
      class="btn-build"
      onclick={() => buildAtlas(false)}
      disabled={atlasBuilding}
    >
      {atlasBuilding ? 'Building…' : manifest ? '↺ Refresh' : '⚡ Build Atlas'}
    </button>

    {#if manifest}
      <button class="btn-force" onclick={() => buildAtlas(true)} disabled={atlasBuilding}>
        Force Rebuild
      </button>
    {/if}
  </div>

  {#if buildError}
    <div class="error-bar">{buildError}</div>
  {/if}
  {#if buildResult}
    <div class="info-bar">
      Built {buildResult.clusterCount} cluster glyphs in {buildResult.durationMs}ms
    </div>
  {/if}

  {#if !manifest}
    <div class="empty">
      No atlas built yet. Click <strong>⚡ Build Atlas</strong> to run the MapReduce pipeline.
      <br/>Requires: <code>npm run graphify:daily</code> + <code>npm run graphify:bow-tiles</code>
    </div>
  {:else}
    <div class="main-layout">

      <!-- Left: cluster grid table -->
      <div class="cluster-table-wrap">
        <div class="compare-hint">
          {#if selectedA == null}
            Click a row to select cluster A for comparison
          {:else if selectedB == null}
            A = C{selectedA} · click another row for B
          {:else}
            A = C{selectedA} · B = C{selectedB}
            <button class="btn-compare" onclick={runCompare} disabled={compareLoading}>
              {compareLoading ? 'Comparing…' : 'Compare →'}
            </button>
          {/if}
        </div>

        <table class="cluster-table">
          <thead>
            <tr>
              <th onclick={() => toggleSort('clusterId')}>
                C# {sortKey === 'clusterId' ? (sortAsc ? '↑' : '↓') : ''}
              </th>
              <th>Topic</th>
              <th onclick={() => toggleSort('fileCount')}>
                Files {sortKey === 'fileCount' ? (sortAsc ? '↑' : '↓') : ''}
              </th>
              <th onclick={() => toggleSort('auditScore')}>
                Audit {sortKey === 'auditScore' ? (sortAsc ? '↑' : '↓') : ''}
              </th>
              <th onclick={() => toggleSort('ssrRisk')}>
                SSR {sortKey === 'ssrRisk' ? (sortAsc ? '↑' : '↓') : ''}
              </th>
              <th onclick={() => toggleSort('pageRankMean')}>
                PR {sortKey === 'pageRankMean' ? (sortAsc ? '↑' : '↓') : ''}
              </th>
              <th>Top Terms</th>
            </tr>
          </thead>
          <tbody>
            {#each glyphs as g (g.clusterId)}
              {@const isA = selectedA === g.clusterId}
              {@const isB = selectedB === g.clusterId}
              <tr
                class:selected-a={isA}
                class:selected-b={isB}
                onclick={() => selectGlyph(g.clusterId)}
              >
                <td class="cid">C{g.clusterId}</td>
                <td class="topic" title={g.topDirs.join('\n')}>{g.topic}</td>
                <td class="num">{g.fileCount}</td>
                <td class="num" class:warn={g.auditScore < 0.6}>{fmtPct(g.auditScore)}</td>
                <td class="num" class:warn={g.ssrRisk > 0.1}>{fmtPct(g.ssrRisk)}</td>
                <td class="num">{g.pageRankMean.toFixed(3)}</td>
                <td class="terms">{g.terms.slice(0, 5).join(' · ')}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Right: detail panels -->
      <div class="detail-panel">

        <!-- Compare result -->
        {#if compareResult}
          {@const c = compareResult.comparison}
          <div class="compare-panel">
            <h3>
              C{compareResult.glyphA.clusterId} vs C{compareResult.glyphB.clusterId}
              <span class="sim-badge" style="background:{simColor(c.cosineSimilarity)}">
                cos={c.cosineSimilarity.toFixed(3)}
              </span>
            </h3>

            <div class="scalar-row">
              <div class="scalar-cell">
                <span class="label">PageRank Δ</span>
                <span class:pos={c.scalarDiff.pageRank > 0} class:neg={c.scalarDiff.pageRank < 0}>
                  {fmtDelta(c.scalarDiff.pageRank)}
                </span>
              </div>
              <div class="scalar-cell">
                <span class="label">Audit Δ</span>
                <span class:pos={c.scalarDiff.auditScore > 0} class:neg={c.scalarDiff.auditScore < 0}>
                  {fmtDelta(c.scalarDiff.auditScore)}
                </span>
              </div>
              <div class="scalar-cell">
                <span class="label">SSR Risk Δ</span>
                <span class:neg={c.scalarDiff.ssrRisk > 0} class:pos={c.scalarDiff.ssrRisk < 0}>
                  {fmtDelta(c.scalarDiff.ssrRisk)}
                </span>
              </div>
              <div class="scalar-cell">
                <span class="label">Tests Δ</span>
                <span class:pos={c.scalarDiff.pairedTest > 0} class:neg={c.scalarDiff.pairedTest < 0}>
                  {fmtDelta(c.scalarDiff.pairedTest)}
                </span>
              </div>
              <div class="scalar-cell">
                <span class="label">SOM dist</span>
                <span>{c.scalarDiff.somDistance.toFixed(3)}</span>
              </div>
            </div>

            <h4>Top diverging terms (L2 distance = {c.l2Distance.toFixed(3)})</h4>
            <div class="diverge-list">
              {#each c.topDivergingTerms.slice(0, 12) as row}
                {@const maxW = Math.max(row.aWeight, row.bWeight, 0.001)}
                <div class="diverge-row">
                  <span class="dterm">{row.term}</span>
                  <div class="bar-pair">
                    <div class="bar-a" style="width:{(row.aWeight / maxW * 100).toFixed(1)}%"></div>
                    <div class="bar-b" style="width:{(row.bWeight / maxW * 100).toFixed(1)}%"></div>
                  </div>
                  <span class="ddelta">Δ{row.delta.toFixed(3)}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Similarity heatmap (top 12 × 12) -->
        {#if similarityGrid && manifest}
          {@const topN = Math.min(12, manifest.glyphs.length)}
          {@const topGlyphs = manifest.glyphs.slice(0, topN)}
          <div class="heatmap-wrap">
            <h4>Cluster similarity (top {topN})</h4>
            <div class="heatmap" style="grid-template-columns: repeat({topN}, 1fr)">
              {#each topGlyphs as row, i}
                {#each topGlyphs as col, j}
                  {@const sim = similarityGrid[i][j]}
                  <div
                    class="heat-cell"
                    style="background:{simColor(sim)}"
                    title="C{row.clusterId}×C{col.clusterId}: {sim.toFixed(3)}"
                  >
                    {i === j ? '' : sim.toFixed(2)}
                  </div>
                {/each}
              {/each}
            </div>
            <div class="heatmap-labels">
              {#each topGlyphs as g}
                <span>C{g.clusterId}</span>
              {/each}
            </div>
          </div>
        {/if}

        <!-- WebGPU status -->
        {#if gpuUploaded}
          <div class="gpu-status">
            ✓ Atlas buffer uploaded to WebGPU
            <code>GPUBuffer: {manifest?.clusterCount} × {manifest?.stride} f32
            = {((manifest?.clusterCount ?? 0) * (manifest?.stride ?? 0) * 4 / 1024).toFixed(1)} KB</code>
          </div>
        {/if}

      </div>
    </div>
  {/if}
</div>

<style>
  .atlas-root { display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.85rem; }
  .toolbar { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .title { font-weight: 700; font-size: 1rem; }
  .badge { background: var(--t-panel-soft, #333); border-radius: 4px; padding: 1px 6px; font-size: 0.75rem; margin-left: 0.4rem; }
  .filter-input { flex: 1; min-width: 180px; padding: 4px 8px; border: 1px solid var(--t-border, #555); border-radius: 4px; background: var(--t-bg, #1a1a1a); color: inherit; }
  .btn-build, .btn-force, .btn-compare, .btn-gpu {
    padding: 4px 10px; border-radius: 4px; cursor: pointer; border: 1px solid var(--t-border, #555);
    background: var(--t-accent, #4a90d9); color: #fff;
  }
  .btn-force { background: var(--t-panel, #2a2a2a); color: inherit; }
  .btn-gpu   { background: #2d6a4f; }
  .btn-build:disabled, .btn-compare:disabled { opacity: 0.5; cursor: default; }
  .error-bar { background: #5c1e1e; padding: 6px 10px; border-radius: 4px; }
  .info-bar  { background: #1e3a1e; padding: 6px 10px; border-radius: 4px; }
  .empty { padding: 2rem; text-align: center; color: #888; }

  .main-layout { display: flex; gap: 1rem; align-items: flex-start; }
  .cluster-table-wrap { flex: 1; min-width: 0; overflow-x: auto; }
  .detail-panel { width: 380px; flex-shrink: 0; display: flex; flex-direction: column; gap: 1rem; }

  .compare-hint { margin-bottom: 0.4rem; color: #aaa; font-size: 0.8rem; }
  .cluster-table { width: 100%; border-collapse: collapse; }
  .cluster-table th {
    text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--t-border, #444);
    cursor: pointer; user-select: none; white-space: nowrap; color: #aaa;
  }
  .cluster-table th:hover { color: #fff; }
  .cluster-table td { padding: 3px 8px; border-bottom: 1px solid var(--t-border, #2a2a2a); }
  .cluster-table tr { cursor: pointer; }
  .cluster-table tr:hover td { background: var(--t-panel, #222); }
  tr.selected-a td { background: #1a3050 !important; }
  tr.selected-b td { background: #1a4030 !important; }
  .cid  { font-weight: 700; color: #7ab; white-space: nowrap; }
  .topic { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .num  { font-family: monospace; text-align: right; }
  .terms { color: #888; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .warn { color: #f0a040; }

  /* Compare panel */
  .compare-panel { border: 1px solid var(--t-border, #444); border-radius: 6px; padding: 0.75rem; }
  .compare-panel h3 { margin: 0 0 0.5rem; font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem; }
  .sim-badge { padding: 2px 6px; border-radius: 3px; font-size: 0.75rem; color: #fff; }
  .scalar-row { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem; }
  .scalar-cell { background: var(--t-panel, #222); border-radius: 4px; padding: 4px 8px; display: flex; flex-direction: column; min-width: 70px; }
  .scalar-cell .label { font-size: 0.7rem; color: #888; }
  .pos { color: #4ade80; }
  .neg { color: #f87171; }
  .compare-panel h4 { margin: 0.5rem 0 0.3rem; font-size: 0.8rem; color: #aaa; }
  .diverge-list { display: flex; flex-direction: column; gap: 3px; }
  .diverge-row { display: flex; align-items: center; gap: 6px; }
  .dterm { width: 90px; font-family: monospace; font-size: 0.75rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #bbb; }
  .bar-pair { flex: 1; display: flex; flex-direction: column; gap: 1px; }
  .bar-a { height: 5px; background: #4a90d9; border-radius: 2px; min-width: 2px; }
  .bar-b { height: 5px; background: #4ade80; border-radius: 2px; min-width: 2px; }
  .ddelta { font-family: monospace; font-size: 0.7rem; color: #888; white-space: nowrap; }

  /* Heatmap */
  .heatmap-wrap h4 { margin: 0 0 0.4rem; font-size: 0.8rem; color: #aaa; }
  .heatmap { display: grid; gap: 1px; }
  .heat-cell { width: 28px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: 0.6rem; color: rgba(255,255,255,0.7); cursor: default; }
  .heatmap-labels { display: flex; gap: 1px; margin-top: 2px; }
  .heatmap-labels span { width: 28px; text-align: center; font-size: 0.6rem; color: #888; overflow: hidden; }

  /* GPU status */
  .gpu-status { background: #1e3a2a; padding: 6px 10px; border-radius: 4px; font-size: 0.8rem; }
  .gpu-status code { display: block; margin-top: 4px; color: #4ade80; font-size: 0.75rem; }
</style>
