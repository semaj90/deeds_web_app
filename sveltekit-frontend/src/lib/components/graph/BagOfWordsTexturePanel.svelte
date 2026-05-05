<script lang="ts">
  import { getBagOfWordsTexture, type BowTextureArgs, type BowTextureResult, type BowTextureTile } from '$lib/graph/graph.remote.js';

  // ── Props ──────────────────────────────────────────────────────────────────
  let {
    clusterId     = undefined,
    chunkId       = undefined,
    som           = undefined,
    queryTerms    = [],   // optional query bag for scoring visible tiles
    visibleTiles  = [],   // optional array of BowTextureTile to score against query
  }: {
    clusterId?:    number;
    chunkId?:      string;
    som?:          { x: number; y: number };
    queryTerms?:   string[];
    visibleTiles?: BowTextureTile[];
  } = $props();

  // ── State ──────────────────────────────────────────────────────────────────
  let result       = $state<BowTextureResult | null>(null);
  let loading      = $state(false);
  let error        = $state('');
  let showAll      = $state(false);
  let gpuScores    = $state<Array<{ tileId: string; score: number }>>([]);
  let gpuBackend   = $state<'webgpu' | 'js' | null>(null);
  let scoringMs    = $state<number | null>(null);

  // ── Derived query args ─────────────────────────────────────────────────────
  let queryArgs = $derived.by((): BowTextureArgs | null => {
    if (chunkId)                 return { chunkId, clusterId, som };
    if (clusterId !== undefined) return { clusterId };
    if (som)                     return { som };
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

  // ── WebGPU / JS cosine scoring for visible tiles ────────────────────────────
  $effect(() => {
    const tiles = visibleTiles;
    const query = queryTerms;
    if (!tiles.length || !query.length) { gpuScores = []; return; }

    scoreVisibleTiles(tiles, query).then(({ scores, backend, ms }) => {
      gpuScores  = scores;
      gpuBackend = backend;
      scoringMs  = ms;
    });
  });

  async function scoreVisibleTiles(
    tiles: BowTextureTile[],
    query: string[]
  ): Promise<{ scores: Array<{ tileId: string; score: number }>; backend: 'webgpu' | 'js'; ms: number }> {
    const t0 = performance.now();

    // Build vocabulary from all tiles + query
    const vocab = new Map<string, number>();
    const allTerms = [...new Set([...query, ...tiles.flatMap(t => t.terms)])];
    allTerms.forEach((term, i) => vocab.set(term, i));
    const D = vocab.size;

    // Vectorise query
    const qVec = new Float32Array(D);
    for (const term of query) {
      const idx = vocab.get(term);
      if (idx !== undefined) qVec[idx] = 1;
    }
    const qNorm = Math.sqrt(qVec.reduce((s, v) => s + v * v, 0)) || 1;
    for (let i = 0; i < D; i++) qVec[i] /= qNorm;

    // Try WebGPU first
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      try {
        const scores = await webgpuCosine(qVec, tiles, vocab, D);
        return {
          scores: tiles.map((t, i) => ({ tileId: t.tileId, score: scores[i] })),
          backend: 'webgpu',
          ms: performance.now() - t0,
        };
      } catch { /* fall through to JS */ }
    }

    // JS fallback
    const scores = tiles.map(tile => {
      const tVec = new Float32Array(D);
      for (let i = 0; i < tile.terms.length; i++) {
        const idx = vocab.get(tile.terms[i]);
        if (idx !== undefined) tVec[idx] = tile.weights[i] ?? 0;
      }
      const tNorm = Math.sqrt(tVec.reduce((s, v) => s + v * v, 0)) || 1;
      let dot = 0;
      for (let i = 0; i < D; i++) dot += qVec[i] * (tVec[i] / tNorm);
      return dot;
    });

    return {
      scores: tiles.map((t, i) => ({ tileId: t.tileId, score: scores[i] })),
      backend: 'js',
      ms: performance.now() - t0,
    };
  }

  async function webgpuCosine(
    qVec: Float32Array,
    tiles: BowTextureTile[],
    vocab: Map<string, number>,
    D: number
  ): Promise<number[]> {
    const adapter = await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter();
    if (!adapter) throw new Error('no adapter');
    const device = await (adapter as { requestDevice(): Promise<GPUDevice> }).requestDevice();

    const N = tiles.length;

    // Build tile matrix [N × D]
    const tileData = new Float32Array(N * D);
    for (let ti = 0; ti < N; ti++) {
      const tile = tiles[ti];
      let norm = 0;
      for (let i = 0; i < tile.terms.length; i++) {
        const idx = vocab.get(tile.terms[i]);
        if (idx !== undefined) {
          tileData[ti * D + idx] = tile.weights[i] ?? 0;
          norm += (tile.weights[i] ?? 0) ** 2;
        }
      }
      norm = Math.sqrt(norm) || 1;
      for (let d = 0; d < D; d++) tileData[ti * D + d] /= norm;
    }

    const qBuf     = device.createBuffer({ size: qVec.byteLength,         usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const tBuf     = device.createBuffer({ size: tileData.byteLength,     usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const outBuf   = device.createBuffer({ size: N * 4,                   usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const readBuf  = device.createBuffer({ size: N * 4,                   usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const metaBuf  = device.createBuffer({ size: 8,                       usage: GPUBufferUsage.UNIFORM  | GPUBufferUsage.COPY_DST });

    device.queue.writeBuffer(qBuf,    0, qVec.buffer as ArrayBuffer,    qVec.byteOffset,    qVec.byteLength);
    device.queue.writeBuffer(tBuf,    0, tileData.buffer as ArrayBuffer, tileData.byteOffset, tileData.byteLength);
    const metaArr = new Uint32Array([N, D]);
    device.queue.writeBuffer(metaBuf, 0, metaArr.buffer as ArrayBuffer, 0, 8);

    const shader = device.createShaderModule({ code: `
      @group(0) @binding(0) var<storage, read>       q   : array<f32>;
      @group(0) @binding(1) var<storage, read>       t   : array<f32>;
      @group(0) @binding(2) var<storage, read_write> out : array<f32>;
      @group(0) @binding(3) var<uniform>             meta: vec2u;  // N, D

      @compute @workgroup_size(64)
      fn main(@builtin(global_invocation_id) gid: vec3u) {
        let i = gid.x;
        let N = meta.x; let D = meta.y;
        if (i >= N) { return; }
        var dot: f32 = 0.0;
        for (var d: u32 = 0u; d < D; d++) {
          dot += q[d] * t[i * D + d];
        }
        out[i] = dot;
      }
    ` });

    const pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: shader, entryPoint: 'main' },
    });

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0) as GPUBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: qBuf } },
        { binding: 1, resource: { buffer: tBuf } },
        { binding: 2, resource: { buffer: outBuf } },
        { binding: 3, resource: { buffer: metaBuf } },
      ],
    });

    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(N / 64));
    pass.end();
    enc.copyBufferToBuffer(outBuf, 0, readBuf, 0, N * 4);
    device.queue.submit([enc.finish()]);

    await readBuf.mapAsync(GPUMapMode.READ);
    const result = [...new Float32Array(readBuf.getMappedRange())];
    readBuf.unmap();
    device.destroy();
    return result;
  }

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
    return r.cache.hit ? 'L1_REDIS (cached)' : 'MISS → computed';
  }

  // Sort visible tiles by GPU score descending
  let rankedTiles = $derived(
    gpuScores.length > 0
      ? [...gpuScores].sort((a, b) => b.score - a.score).slice(0, 10)
      : []
  );
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

  <!-- ── WebGPU scoring results ─────────────────────────────────────────── -->
  {#if rankedTiles.length > 0}
    <div class="gpu-scores">
      <div class="gpu-header">
        <span>Top matches</span>
        {#if gpuBackend}
          <span class="gpu-badge {gpuBackend}">{gpuBackend === 'webgpu' ? '⚡ WebGPU' : '🔵 JS'} {scoringMs?.toFixed(1)}ms</span>
        {/if}
      </div>
      {#each rankedTiles.slice(0, 8) as { tileId, score }}
        <div class="score-row">
          <span class="tile-id" title={tileId}>{tileId.replace(/^(cluster|texture:bow:chunk):/, '')}</span>
          <div class="bar-track">
            <div class="bar-fill score-bar" style="width:{Math.round(score * 100)}%"></div>
          </div>
          <span class="weight">{score.toFixed(3)}</span>
        </div>
      {/each}
    </div>
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
  .term-row, .score-row {
    display: grid;
    grid-template-columns: 110px 1fr 52px;
    align-items: center;
    gap: 6px;
  }
  .term, .tile-id {
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
  .score-bar { background: #4af; }
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

  .gpu-scores {
    border-top: 1px solid #1a1a2e;
    padding-top: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .gpu-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #666;
    font-size: 0.7rem;
    margin-bottom: 2px;
  }
  .gpu-badge {
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 0.65rem;
  }
  .gpu-badge.webgpu { background: #1a1a33; color: #88f; }
  .gpu-badge.js     { background: #1a2033; color: #48f; }
</style>
