<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { GlyphTileAtlas, GlyphTile } from '$lib/server/cartridge/glyph-tile-engine.js';

  // ── Props ──────────────────────────────────────────────────────────────────
  interface Props {
    caseId: string;
    /** Tile grid size (default 16) */
    gridSize?: number;
    /** Poll interval in ms — 0 to disable (default 30000) */
    pollMs?: number;
    /** Called when user clicks a tile — passes tile data + search results */
    onTileSelect?: (tile: GlyphTile, glyphs: SearchHit[]) => void;
    /** Called when ACE context is assembled */
    onContextReady?: (context: string) => void;
  }

  let {
    caseId,
    gridSize = 16,
    pollMs = 30_000,
    onTileSelect,
    onContextReady,
  }: Props = $props();

  // ── Types ──────────────────────────────────────────────────────────────────
  interface SearchHit {
    glyphId: string;
    score: number;
    stage: 'topology' | 'centroid' | 'rerank';
    attnWeight?: number;
    rewardScore?: number;
  }

  interface SearchResult {
    hits: SearchHit[];
    context: string;
    contextSource: 'cache' | 'fresh';
    source: string;
    atlas: string;
    tileMatches: number[];
    glyphCount: number;
    metrics: Record<string, number>;
  }

  interface PipelineMetrics {
    embedMs: number;
    atlasMs: number;
    dbMs: number;
    searchMs: number;
    aceMs: number;
    totalMs: number;
  }

  // ── Section palette (NES CHR97 colours — 8 palette entries) ──────────────
  const SECTION_COLOR: Record<string, string> = {
    FACTS:           '#2563eb',   // blue
    LEGAL_AUTHORITY: '#7c3aed',   // violet
    CLAIMS:          '#dc2626',   // red
    PRAYER_HOLDING:  '#059669',   // emerald
    PARTIES:         '#d97706',   // amber
    JURISDICTION:    '#0891b2',   // cyan
    UNKNOWN:         '#6b7280',   // gray
  };

  const SECTION_LABEL: Record<string, string> = {
    FACTS: 'FAC', LEGAL_AUTHORITY: 'LAW', CLAIMS: 'CLM',
    PRAYER_HOLDING: 'PRA', PARTIES: 'PAR', JURISDICTION: 'JUR', UNKNOWN: '???',
  };

  // ── State ──────────────────────────────────────────────────────────────────
  let atlas = $state<GlyphTileAtlas | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let selectedTile = $state<GlyphTile | null>(null);
  let searchQuery = $state('');
  let searchLoading = $state(false);
  let searchResult = $state<SearchResult | null>(null);
  let hoveredTile = $state<GlyphTile | null>(null);

  // Canvas ref
  let canvasEl = $state<HTMLCanvasElement | null>(null);

  // Derived metrics
  let sectionDist = $derived.by(() => {
    if (!atlas) return {} as Record<string, number>;
    const dist: Record<string, number> = {};
    for (const tile of atlas.tiles) {
      const sec = tileSection(tile);
      dist[sec] = (dist[sec] ?? 0) + tile.runeCount;
    }
    return dist;
  });

  let totalRunes = $derived(atlas?.tiles.reduce((s, t) => s + t.runeCount, 0) ?? 0);
  let avgConfidence = $derived.by(() => {
    if (!atlas || atlas.tiles.length === 0) return 0;
    return atlas.tiles.reduce((s, t) => s + t.confidence, 0) / atlas.tiles.length;
  });

  let cacheLabel = $derived.by(() => {
    const s = atlas?.source;
    if (s === 'redis') return { text: 'L1 Redis', color: '#10b981' };
    if (s === 'grpc')  return { text: 'gRPC',     color: '#8b5cf6' };
    if (s === 'gpu')   return { text: 'GPU built', color: '#f59e0b' };
    return { text: 'CPU built', color: '#6b7280' };
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function tileSection(tile: GlyphTile): string {
    for (const e of tile.entities) {
      if (e in SECTION_COLOR) return e;
    }
    return 'UNKNOWN';
  }

  function tileAt(gx: number, gy: number): GlyphTile | undefined {
    return atlas?.tiles.find(t => t.gridX === gx && t.gridY === gy);
  }

  // ── Canvas render ──────────────────────────────────────────────────────────
  function renderAtlas() {
    if (!canvasEl || !atlas) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const W = canvasEl.width;
    const H = canvasEl.height;
    const tw = W / gridSize;
    const th = H / gridSize;

    ctx.clearRect(0, 0, W, H);

    // Background grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gridSize; i++) {
      ctx.beginPath(); ctx.moveTo(i * tw, 0); ctx.lineTo(i * tw, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * th); ctx.lineTo(W, i * th); ctx.stroke();
    }

    // Tile fills
    for (const tile of atlas.tiles) {
      const x = tile.gridX * tw;
      const y = tile.gridY * th;
      const sec = tileSection(tile);
      const color = SECTION_COLOR[sec] ?? '#6b7280';

      // Base fill — opacity tied to confidence
      ctx.globalAlpha = 0.15 + tile.confidence * 0.75;
      ctx.fillStyle = color;
      ctx.fillRect(x + 1, y + 1, tw - 2, th - 2);

      // Selected/hovered highlight
      const isSelected = selectedTile?.clusterId === tile.clusterId;
      const isHovered  = hoveredTile?.clusterId  === tile.clusterId;
      if (isSelected) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, tw - 2, th - 2);
      } else if (isHovered) {
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 1, y + 1, tw - 2, th - 2);
      }

      ctx.globalAlpha = 1;

      // Rune count (small monospace text)
      if (tile.runeCount > 0 && tw >= 20) {
        const fontSize = Math.max(7, Math.min(tw * 0.28, 11));
        ctx.font = `${fontSize}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(String(tile.runeCount), x + tw / 2, y + th / 2);
      }
    }
  }

  // ── Canvas mouse events ────────────────────────────────────────────────────
  function canvasCoords(e: MouseEvent): { gx: number; gy: number } {
    const rect = canvasEl!.getBoundingClientRect();
    const tw = rect.width  / gridSize;
    const th = rect.height / gridSize;
    return {
      gx: Math.floor((e.clientX - rect.left) / tw),
      gy: Math.floor((e.clientY - rect.top)  / th),
    };
  }

  function handleCanvasMove(e: MouseEvent) {
    const { gx, gy } = canvasCoords(e);
    hoveredTile = tileAt(gx, gy) ?? null;
    renderAtlas();
  }

  function handleCanvasClick(e: MouseEvent) {
    const { gx, gy } = canvasCoords(e);
    const tile = tileAt(gx, gy);
    if (!tile) { selectedTile = null; return; }
    selectedTile = tile;
    renderAtlas();
    // Trigger search for this tile's cluster section
    if (tile.entities.length > 0) {
      searchQuery = tile.entities.filter(e => e in SECTION_COLOR).join(' ') ||
                   tile.entities.slice(0, 3).join(' ');
      runSearch();
    }
    onTileSelect?.(tile, searchResult?.hits ?? []);
  }

  function handleCanvasLeave() {
    hoveredTile = null;
    renderAtlas();
  }

  // ── Data loading ───────────────────────────────────────────────────────────
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  async function loadAtlas(force = false) {
    if (!UUID_RE.test(caseId)) return;
    loading = true;
    error = null;
    try {
      const params = new URLSearchParams({ caseId });
      if (force) params.set('skipCache', '1');
      const res = await fetch(`/api/glyph/tile-atlas?${params}`);
      if (res.ok) {
        const { atlas: data } = await res.json() as { atlas: GlyphTileAtlas | null };
        atlas = data;
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function runSearch() {
    if (!searchQuery.trim() || !UUID_RE.test(caseId)) return;
    searchLoading = true;
    try {
      const res = await fetch('/api/glyph/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          caseId,
          topK: 10,
          sectionBias: selectedTile ? tileSection(selectedTile) : undefined,
          minReward: 0.2,
        }),
      });
      if (res.ok) {
        searchResult = await res.json() as SearchResult;
        if (searchResult?.context) onContextReady?.(searchResult.context);
      }
    } catch { /* non-fatal */ }
    searchLoading = false;
  }

  async function triggerRebuild() {
    if (!UUID_RE.test(caseId)) return;
    await fetch('/api/glyph/tile-atlas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId, reason: 'manual-rebuild' }),
    });
    await loadAtlas(true);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    loadAtlas();
    if (pollMs > 0) {
      pollTimer = setInterval(() => loadAtlas(), pollMs);
    }
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
  });

  // Re-render when atlas or selection changes
  $effect(() => {
    if (atlas && canvasEl) {
      // small delay to ensure canvas is sized
      requestAnimationFrame(renderAtlas);
    }
  });
</script>

<!-- ── Panel shell ──────────────────────────────────────────────────────────── -->
<div class="glyph-panel">

  <!-- Header bar -->
  <div class="panel-header">
    <span class="header-title">
      <span class="nes-icon">▓</span>
      NES Glyph Atlas
    </span>

    <div class="header-meta">
      {#if atlas}
        <span class="badge" style="--bc: {cacheLabel.color}">{cacheLabel.text}</span>
        <span class="badge mono">{atlas.tileCount} tiles · {totalRunes} runes</span>
        {#if atlas.buildMs > 0}
          <span class="badge mono">{atlas.buildMs}ms</span>
        {/if}
      {/if}
    </div>

    <div class="header-actions">
      <button
        class="icon-btn"
        title="Force rebuild"
        disabled={loading}
        onclick={triggerRebuild}
      >⟳</button>
    </div>
  </div>

  <!-- Main grid + sidebar layout -->
  <div class="panel-body">

    <!-- Left: NES tile canvas -->
    <div class="tile-grid-wrap">
      {#if loading && !atlas}
        <div class="loading-grid">
          <div class="loading-text">Building atlas…</div>
          <div class="nes-loading-bar"><div class="bar-fill"></div></div>
        </div>
      {:else if !atlas || atlas.tileCount === 0}
        <div class="empty-grid">
          <span class="empty-icon">▒</span>
          <span>No tile data for this case</span>
          <button class="rebuild-btn" onclick={triggerRebuild}>Trigger Build</button>
        </div>
      {:else}
        <canvas
          bind:this={canvasEl}
          width="384"
          height="384"
          class="tile-canvas"
          onmousemove={handleCanvasMove}
          onclick={handleCanvasClick}
          onmouseleave={handleCanvasLeave}
        ></canvas>

        <!-- Hovered tile tooltip -->
        {#if hoveredTile}
          <div class="tile-tooltip">
            <div class="tt-header">
              <span style="color: {SECTION_COLOR[tileSection(hoveredTile)]}">
                {SECTION_LABEL[tileSection(hoveredTile)] ?? '???'}
              </span>
              · cluster {hoveredTile.clusterId}
            </div>
            <div class="tt-stat">
              <span>{hoveredTile.runeCount} runes</span>
              <span>conf {(hoveredTile.confidence * 100).toFixed(0)}%</span>
            </div>
            {#if hoveredTile.entities.length > 0}
              <div class="tt-entities">
                {hoveredTile.entities.filter(e => !(e in SECTION_COLOR)).slice(0, 4).join(', ')}
              </div>
            {/if}
          </div>
        {/if}
      {/if}
    </div>

    <!-- Right: metrics + search -->
    <div class="side-panel">

      <!-- Section distribution legend -->
      {#if atlas && atlas.tileCount > 0}
        <div class="metrics-card">
          <div class="card-title">Section Distribution</div>
          <div class="section-bars">
            {#each Object.entries(sectionDist) as [sec, count]}
              <div class="section-row">
                <span class="sec-dot" style="background:{SECTION_COLOR[sec]}"></span>
                <span class="sec-label">{SECTION_LABEL[sec] ?? sec}</span>
                <div class="sec-bar-wrap">
                  <div
                    class="sec-bar"
                    style="width:{Math.round((count / Math.max(totalRunes, 1)) * 100)}%;background:{SECTION_COLOR[sec]}"
                  ></div>
                </div>
                <span class="sec-count">{count}</span>
              </div>
            {/each}
          </div>

          <div class="confidence-row">
            <span>Avg confidence</span>
            <span class="conf-value">{(avgConfidence * 100).toFixed(1)}%</span>
          </div>
        </div>
      {/if}

      <!-- 3-stage search -->
      <div class="search-card">
        <div class="card-title">3-Stage Search</div>

        <div class="search-input-row">
          <input
            class="search-input"
            type="text"
            placeholder="Query glyphs…"
            bind:value={searchQuery}
            onkeydown={(e) => e.key === 'Enter' && runSearch()}
          />
          <button
            class="search-btn"
            disabled={searchLoading || !searchQuery.trim()}
            onclick={runSearch}
          >
            {searchLoading ? '…' : '▶'}
          </button>
        </div>

        <!-- Search result metrics -->
        {#if searchResult}
          <div class="search-meta">
            <div class="meta-row">
              <span class="meta-label">Hits</span>
              <span class="meta-val">{searchResult.hits.length} / {searchResult.glyphCount}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Source</span>
              <span class="meta-val">{searchResult.source}</span>
            </div>
            {#if searchResult.metrics.totalMs}
              <div class="meta-row">
                <span class="meta-label">Total</span>
                <span class="meta-val">{searchResult.metrics.totalMs}ms</span>
              </div>
            {/if}
            {#if searchResult.contextSource}
              <div class="meta-row">
                <span class="meta-label">ACE ctx</span>
                <span
                  class="meta-val"
                  style="color: {searchResult.contextSource === 'cache' ? '#10b981' : '#f59e0b'}"
                >{searchResult.contextSource}</span>
              </div>
            {/if}
          </div>

          <!-- Stage breakdown timeline -->
          <div class="stage-timeline">
            {#each [
              { key: 'embedMs',  label: 'Embed',    color: '#6366f1' },
              { key: 'atlasMs', label: 'Atlas',    color: '#8b5cf6' },
              { key: 'dbMs',    label: 'DB',       color: '#06b6d4' },
              { key: 'searchMs',label: 'Search',   color: '#f59e0b' },
              { key: 'aceMs',   label: 'ACE',      color: '#10b981' },
            ] as stage}
              {#if searchResult.metrics[stage.key]}
                <div class="stage-row">
                  <span class="stage-lbl">{stage.label}</span>
                  <div class="stage-bar-wrap">
                    <div
                      class="stage-bar"
                      style="width:{Math.min(100, (searchResult.metrics[stage.key] / Math.max(searchResult.metrics.totalMs, 1)) * 100)}%;background:{stage.color}"
                    ></div>
                  </div>
                  <span class="stage-ms">{searchResult.metrics[stage.key]}ms</span>
                </div>
              {/if}
            {/each}
          </div>

          <!-- Top search hits -->
          {#if searchResult.hits.length > 0}
            <div class="hits-list">
              {#each searchResult.hits.slice(0, 5) as hit}
                <div class="hit-row">
                  <span class="hit-score">{hit.rewardScore?.toFixed(3) ?? hit.score.toFixed(3)}</span>
                  <span class="hit-id">{hit.glyphId.slice(0, 12)}…</span>
                  <span class="hit-stage" title={hit.stage}>
                    {hit.stage === 'rerank' ? '★' : hit.stage === 'centroid' ? '◆' : '●'}
                  </span>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>

      <!-- Selected tile detail -->
      {#if selectedTile}
        <div class="tile-detail-card">
          <div class="card-title" style="color:{SECTION_COLOR[tileSection(selectedTile)]}">
            Cluster {selectedTile.clusterId} · {tileSection(selectedTile)}
          </div>
          <div class="detail-grid">
            <span>Grid</span><span>({selectedTile.gridX}, {selectedTile.gridY})</span>
            <span>Runes</span><span>{selectedTile.runeCount}</span>
            <span>Conf</span><span>{(selectedTile.confidence * 100).toFixed(1)}%</span>
            <span>M4</span><span class="mono">[{selectedTile.manifold4.map(v => v.toFixed(2)).join(', ')}]</span>
          </div>
          {#if selectedTile.entities.filter(e => !(e in SECTION_COLOR)).length > 0}
            <div class="detail-entities">
              {selectedTile.entities.filter(e => !(e in SECTION_COLOR)).slice(0, 8).join(' · ')}
            </div>
          {/if}
        </div>
      {/if}

    </div><!-- /side-panel -->
  </div><!-- /panel-body -->
</div>

<style>
  .glyph-panel {
    display: flex;
    flex-direction: column;
    background: var(--t-panel, #1a1a2e);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    overflow: hidden;
    font-family: ui-monospace, 'Cascadia Code', monospace;
    font-size: 12px;
    color: var(--t-text, #e2e8f0);
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(255,255,255,0.04);
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .header-title {
    font-weight: 700;
    letter-spacing: 0.04em;
    font-size: 11px;
    text-transform: uppercase;
  }

  .nes-icon { color: #8b5cf6; margin-right: 4px; }

  .header-meta { display: flex; gap: 6px; flex: 1; }

  .badge {
    padding: 2px 6px;
    border-radius: 3px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    font-size: 10px;
    white-space: nowrap;
    color: var(--bc, #94a3b8);
  }

  .mono { font-family: ui-monospace, monospace; }

  .icon-btn {
    background: none;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 3px;
    color: #94a3b8;
    padding: 2px 6px;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
  }
  .icon-btn:hover { border-color: rgba(255,255,255,0.3); color: #fff; }
  .icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .panel-body {
    display: flex;
    gap: 0;
    min-height: 384px;
  }

  /* ── Tile grid ──────────────────────────────────────────────────────────── */
  .tile-grid-wrap {
    position: relative;
    flex-shrink: 0;
    width: 384px;
    height: 384px;
    background: #0d0d1a;
  }

  .tile-canvas {
    display: block;
    width: 100%;
    height: 100%;
    cursor: crosshair;
    image-rendering: pixelated;
  }

  .loading-grid, .empty-grid {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    gap: 12px;
    color: #4b5563;
  }

  .empty-icon { font-size: 32px; opacity: 0.3; }

  .loading-text { font-size: 11px; color: #6b7280; }

  .nes-loading-bar {
    width: 120px; height: 4px;
    background: rgba(255,255,255,0.06);
    border-radius: 2px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    background: #6366f1;
    animation: nes-scan 1.2s ease-in-out infinite;
  }
  @keyframes nes-scan {
    0%   { width: 0%; margin-left: 0; }
    50%  { width: 60%; }
    100% { width: 0%; margin-left: 100%; }
  }

  .rebuild-btn {
    padding: 4px 10px;
    background: rgba(99,102,241,0.15);
    border: 1px solid rgba(99,102,241,0.4);
    border-radius: 3px;
    color: #818cf8;
    cursor: pointer;
    font-size: 11px;
  }
  .rebuild-btn:hover { background: rgba(99,102,241,0.25); }

  /* ── Tooltip ────────────────────────────────────────────────────────────── */
  .tile-tooltip {
    position: absolute;
    bottom: 8px;
    left: 8px;
    background: rgba(0,0,0,0.85);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    padding: 6px 8px;
    pointer-events: none;
    font-size: 10px;
    line-height: 1.5;
    max-width: 180px;
    backdrop-filter: blur(4px);
  }
  .tt-header { font-weight: 700; margin-bottom: 2px; }
  .tt-stat { display: flex; gap: 8px; color: #94a3b8; }
  .tt-entities { color: #6b7280; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* ── Side panel ─────────────────────────────────────────────────────────── */
  .side-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow-y: auto;
    border-left: 1px solid rgba(255,255,255,0.06);
    max-height: 384px;
  }

  .metrics-card, .search-card, .tile-detail-card {
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }

  .card-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #64748b;
    margin-bottom: 8px;
  }

  /* Section bars */
  .section-bars { display: flex; flex-direction: column; gap: 4px; }
  .section-row { display: flex; align-items: center; gap: 5px; }
  .sec-dot { width: 6px; height: 6px; border-radius: 1px; flex-shrink: 0; }
  .sec-label { width: 26px; font-size: 9px; color: #64748b; }
  .sec-bar-wrap { flex: 1; height: 6px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden; }
  .sec-bar { height: 100%; border-radius: 2px; transition: width 0.3s ease; opacity: 0.7; }
  .sec-count { width: 28px; text-align: right; font-size: 9px; color: #475569; }

  .confidence-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid rgba(255,255,255,0.05);
    color: #64748b;
    font-size: 10px;
  }
  .conf-value { color: #94a3b8; font-weight: 600; }

  /* Search */
  .search-input-row { display: flex; gap: 6px; margin-bottom: 8px; }
  .search-input {
    flex: 1;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 3px;
    padding: 4px 7px;
    color: #e2e8f0;
    font-size: 11px;
    font-family: inherit;
    outline: none;
  }
  .search-input:focus { border-color: rgba(99,102,241,0.5); }
  .search-btn {
    padding: 4px 8px;
    background: rgba(99,102,241,0.2);
    border: 1px solid rgba(99,102,241,0.4);
    border-radius: 3px;
    color: #818cf8;
    cursor: pointer;
    font-size: 12px;
    min-width: 28px;
  }
  .search-btn:hover:not(:disabled) { background: rgba(99,102,241,0.35); }
  .search-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* Metrics */
  .search-meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px 8px;
    margin-bottom: 8px;
  }
  .meta-row { display: contents; }
  .meta-label { font-size: 9px; color: #475569; align-self: center; }
  .meta-val { font-size: 10px; color: #94a3b8; font-family: ui-monospace, monospace; align-self: center; }

  /* Stage timeline */
  .stage-timeline { display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px; }
  .stage-row { display: flex; align-items: center; gap: 5px; }
  .stage-lbl { width: 38px; font-size: 9px; color: #475569; flex-shrink: 0; }
  .stage-bar-wrap { flex: 1; height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden; }
  .stage-bar { height: 100%; border-radius: 2px; min-width: 2px; }
  .stage-ms { width: 34px; text-align: right; font-size: 9px; color: #475569; font-family: ui-monospace, monospace; }

  /* Hits list */
  .hits-list { display: flex; flex-direction: column; gap: 2px; }
  .hit-row { display: flex; align-items: center; gap: 6px; font-size: 10px; }
  .hit-score { font-family: ui-monospace, monospace; color: #f59e0b; width: 40px; }
  .hit-id { flex: 1; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hit-stage { color: #475569; width: 12px; text-align: center; }

  /* Selected tile detail */
  .detail-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 3px 10px;
    font-size: 10px;
    margin-bottom: 6px;
  }
  .detail-grid > *:nth-child(odd) { color: #475569; }
  .detail-grid > *:nth-child(even) { color: #94a3b8; font-family: ui-monospace, monospace; }

  .detail-entities {
    font-size: 9px;
    color: #475569;
    line-height: 1.5;
    border-top: 1px solid rgba(255,255,255,0.04);
    padding-top: 4px;
    word-break: break-word;
  }
</style>
