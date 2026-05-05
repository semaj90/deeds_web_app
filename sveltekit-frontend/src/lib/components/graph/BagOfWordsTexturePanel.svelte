<script lang="ts">
  import { getBagOfWordsTexture, type BowTextureArgs, type BowTextureResult } from '$lib/graph/graph.remote.js';

  // ── Props ──────────────────────────────────────────────────────────────────
  let {
    clusterId = undefined,
    chunkId   = undefined,
    som       = undefined,
  }: {
    clusterId?: number;
    chunkId?:   string;
    som?:       { x: number; y: number };
  } = $props();

  // ── State ──────────────────────────────────────────────────────────────────
  let result   = $state<BowTextureResult | null>(null);
  let loading  = $state(false);
  let error    = $state('');
  let showAll  = $state(false);

  // ── Derived query args ─────────────────────────────────────────────────────
  let queryArgs = $derived.by((): BowTextureArgs | null => {
    if (chunkId)             return { chunkId, clusterId, som };
    if (clusterId !== undefined) return { clusterId };
    if (som)                 return { som };
    return null;
  });

  // ── Fetch on args change ───────────────────────────────────────────────────
  $effect(() => {
    const args = queryArgs;
    if (!args) { result = null; error = ''; return; }

    let cancelled = false;
    const ctrl = new AbortController();

    loading = true;
    error   = '';

    getBagOfWordsTexture(args, { signal: ctrl.signal })
      .then(r => { if (!cancelled) { result = r; loading = false; } })
      .catch(e => { if (!cancelled) { error = (e as Error).message; loading = false; } });

    return () => { cancelled = true; ctrl.abort(); };
  });

  // ── Display helpers ────────────────────────────────────────────────────────
  const MAX_DISPLAY = 20;
  let visibleTerms = $derived(
    result?.tile
      ? (showAll ? result.tile.terms : result.tile.terms.slice(0, MAX_DISPLAY))
      : []
  );
  let maxWeight = $derived(result?.tile?.weights[0] ?? 1);

  function barWidth(w: number) {
    return `${Math.round((w / maxWeight) * 100)}%`;
  }

  function cacheLabel(r: BowTextureResult) {
    return r.cache.hit ? `L1_REDIS (cached)` : `MISS → computed`;
  }
</script>

<div class="bow-panel">
  <!-- ── Header ──────────────────────────────────────────────────────────── -->
  <div class="bow-header">
    <span class="bow-title">
      {#if chunkId}chunk: {chunkId.slice(0, 16)}…
      {:else if clusterId !== undefined}cluster #{clusterId}
      {:else if som}SOM ({som.x},{som.y})
      {:else}BoW Texture{/if}
    </span>

    {#if loading}
      <span class="badge loading">⏳ loading…</span>
    {:else if result}
      <span class="badge {result.cache.hit ? 'hit' : 'miss'}">{cacheLabel(result)}</span>
    {:else if error}
      <span class="badge err" title={error}>⚠️ error</span>
    {/if}
  </div>

  <!-- ── Term bars ───────────────────────────────────────────────────────── -->
  {#if result?.tile?.terms.length}
    <div class="term-list">
      {#each visibleTerms as term, i}
        {@const w = result.tile.weights[i] ?? 0}
        <div class="term-row">
          <span class="term">{term}</span>
          <div class="bar-track">
            <div class="bar-fill" style="width:{barWidth(w)}"></div>
          </div>
          <span class="weight">{w.toFixed(3)}</span>
        </div>
      {/each}

      {#if result.tile.terms.length > MAX_DISPLAY}
        <button class="show-more" onclick={() => { showAll = !showAll; }}>
          {showAll ? '▲ show less' : `▼ ${result.tile.terms.length - MAX_DISPLAY} more`}
        </button>
      {/if}
    </div>

    <!-- ── Metadata ──────────────────────────────────────────────────────── -->
    <div class="meta">
      <span>{result.tile.sourceChunkIds.length} chunk{result.tile.sourceChunkIds.length !== 1 ? 's' : ''}</span>
      <span>{result.tile.terms.length} terms</span>
      <span class="cache-key" title={result.cache.key}>{result.cache.key.slice(0, 40)}…</span>
    </div>
  {:else if !loading && !error}
    <p class="empty">Select a cluster, SOM cell, or chunk ID to view the bag-of-words texture.</p>
  {/if}
</div>

<style>
  .bow-panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.75rem;
    font-family: var(--font-mono, monospace);
    background: #0d0d1a;
    border: 1px solid #223;
    border-radius: 6px;
    padding: 0.75rem;
  }
  .bow-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .bow-title {
    font-weight: 600;
    color: #88f;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .badge {
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 0.7rem;
    white-space: nowrap;
  }
  .badge.loading { background: #334; color: #aaf; }
  .badge.hit     { background: #143; color: #4f4; }
  .badge.miss    { background: #331; color: #fa4; }
  .badge.err     { background: #431; color: #f84; }

  .term-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 320px;
    overflow-y: auto;
  }
  .term-row {
    display: grid;
    grid-template-columns: 110px 1fr 52px;
    align-items: center;
    gap: 6px;
  }
  .term {
    color: #ccc;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar-track {
    height: 6px;
    background: #1a1a2e;
    border-radius: 3px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    background: #55f;
    border-radius: 3px;
    transition: width 0.2s;
  }
  .weight {
    color: #4af;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .show-more {
    background: none;
    border: none;
    color: #668;
    cursor: pointer;
    font-size: 0.7rem;
    padding: 2px 0;
    text-align: left;
  }
  .show-more:hover { color: #88f; }

  .meta {
    display: flex;
    gap: 0.75rem;
    color: #444;
    font-size: 0.68rem;
    border-top: 1px solid #1a1a2e;
    padding-top: 0.4rem;
  }
  .cache-key {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty { color: #444; margin: 0; }
</style>
