<script lang="ts">
  let cacheEntries = $state<Array<{ key: string; size: number; hits: number; tier: string; ttl: number }>>([
    { key: "embedding:case-187", size: 3072, hits: 42, tier: "L0 (LokiJS)", ttl: 300 },
    { key: "rag:query-hash-a1b2", size: 8192, hits: 18, tier: "L1 (IndexedDB)", ttl: 604800 },
    { key: "vector:evidence-chunk-55", size: 6144, hits: 7, tier: "L2 (Memory)", ttl: 300 },
    { key: "inference:gemma3-resp", size: 12288, hits: 3, tier: "L3 (Redis)", ttl: 3600 },
    { key: "model:onnx-session", size: 418000, hits: 156, tier: "L0 (GPU VRAM)", ttl: -1 },
    { key: "index:qdrant-768d", size: 24576, hits: 89, tier: "L4 (Qdrant)", ttl: -1 },
  ]);

  let gpuMetrics = $state({
    vramUsed: 2.4,
    vramTotal: 8.0,
    utilization: 67,
    temperature: 72,
    cacheHitRate: 94.2,
  });

  let selectedEntry = $state<typeof cacheEntries[0] | null>(null);
  let simulateActive = $state(false);

  function formatBytes(bytes: number): string {
    if (bytes >= 1000000) return `${(bytes / 1000000).toFixed(1)}MB`;
    if (bytes >= 1000) return `${(bytes / 1000).toFixed(1)}KB`;
    return `${bytes}B`;
  }

  function simulateTraffic() {
    simulateActive = true;
    const interval = setInterval(() => {
      cacheEntries = cacheEntries.map(e => ({
        ...e,
        hits: e.hits + Math.floor(Math.random() * 5),
      }));
      gpuMetrics.utilization = Math.min(100, Math.max(20, gpuMetrics.utilization + (Math.random() - 0.5) * 10));
      gpuMetrics.temperature = Math.min(95, Math.max(55, gpuMetrics.temperature + (Math.random() - 0.5) * 3));
      gpuMetrics.cacheHitRate = Math.min(100, Math.max(80, gpuMetrics.cacheHitRate + (Math.random() - 0.5) * 2));
    }, 800);
    setTimeout(() => { clearInterval(interval); simulateActive = false; }, 8000);
  }
</script>

<div class="gpu-cache-demo">
  <div class="demo-header">
    <h3>GPU Cache Integration</h3>
    <div class="gpu-bar">
      <span class="gpu-label">VRAM: {gpuMetrics.vramUsed.toFixed(1)}/{gpuMetrics.vramTotal}GB</span>
      <div class="bar-track">
        <div class="bar-fill" style="width: {(gpuMetrics.vramUsed / gpuMetrics.vramTotal) * 100}%"></div>
      </div>
    </div>
  </div>

  <div class="metrics-row">
    <div class="metric">
      <span class="metric-value">{gpuMetrics.utilization.toFixed(0)}%</span>
      <span class="metric-label">GPU Util</span>
    </div>
    <div class="metric">
      <span class="metric-value">{gpuMetrics.temperature.toFixed(0)}C</span>
      <span class="metric-label">Temp</span>
    </div>
    <div class="metric">
      <span class="metric-value">{gpuMetrics.cacheHitRate.toFixed(1)}%</span>
      <span class="metric-label">Cache Hit</span>
    </div>
    <div class="metric">
      <button class="sim-btn" onclick={simulateTraffic} disabled={simulateActive}>
        {simulateActive ? "Running..." : "Simulate"}
      </button>
    </div>
  </div>

  <div class="cache-table">
    <div class="table-header">
      <span>Key</span>
      <span>Size</span>
      <span>Hits</span>
      <span>Tier</span>
      <span>TTL</span>
    </div>
    {#each cacheEntries as entry}
      <button
        class="table-row"
        class:selected={selectedEntry === entry}
        onclick={() => (selectedEntry = selectedEntry === entry ? null : entry)}
      >
        <span class="key-cell">{entry.key}</span>
        <span>{formatBytes(entry.size)}</span>
        <span class="hits-cell">{entry.hits}</span>
        <span class="tier-cell">{entry.tier}</span>
        <span>{entry.ttl === -1 ? "Persist" : `${entry.ttl}s`}</span>
      </button>
    {/each}
  </div>

  {#if selectedEntry}
    <div class="detail-panel">
      <h4>{selectedEntry.key}</h4>
      <p>Tier: <strong>{selectedEntry.tier}</strong> | Hits: <strong>{selectedEntry.hits}</strong> | Size: <strong>{formatBytes(selectedEntry.size)}</strong></p>
    </div>
  {/if}
</div>

<style>
  .gpu-cache-demo {
    background: #0a0a1a;
    border: 1px solid #2a2a4a;
    border-radius: 4px;
    padding: 1rem;
    font-family: "Courier New", monospace;
    color: #c0c0e0;
    font-size: 0.8rem;
  }
  .demo-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
  .demo-header h3 { color: #80ff80; font-size: 0.9rem; margin: 0; }
  .gpu-bar { display: flex; align-items: center; gap: 0.5rem; }
  .gpu-label { font-size: 0.7rem; color: #a0a0c0; white-space: nowrap; }
  .bar-track { width: 80px; height: 8px; background: #1a1a3a; border-radius: 2px; overflow: hidden; }
  .bar-fill { height: 100%; background: linear-gradient(90deg, #40c040, #c0c040); transition: width 0.3s; }
  .metrics-row { display: flex; gap: 1rem; margin-bottom: 0.75rem; align-items: center; }
  .metric { display: flex; flex-direction: column; align-items: center; }
  .metric-value { font-size: 1rem; font-weight: bold; color: #e0e0ff; }
  .metric-label { font-size: 0.6rem; color: #808090; text-transform: uppercase; }
  .sim-btn {
    background: #304060; color: #c0d0ff; border: 1px solid #4060a0;
    padding: 4px 12px; font-family: inherit; font-size: 0.7rem; cursor: pointer; border-radius: 2px;
  }
  .sim-btn:hover:not(:disabled) { background: #405080; }
  .sim-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .cache-table { border: 1px solid #2a2a4a; border-radius: 2px; overflow: hidden; }
  .table-header {
    display: grid; grid-template-columns: 2fr 1fr 1fr 1.5fr 1fr;
    background: #1a1a3a; padding: 6px 8px; font-size: 0.65rem; text-transform: uppercase; color: #8080a0; gap: 4px;
  }
  .table-row {
    display: grid; grid-template-columns: 2fr 1fr 1fr 1.5fr 1fr;
    padding: 6px 8px; border: none; background: transparent; color: #c0c0e0;
    font-family: inherit; font-size: 0.75rem; cursor: pointer; text-align: left; width: 100%; gap: 4px;
    border-bottom: 1px solid #1a1a2a;
  }
  .table-row:hover { background: #1a1a30; }
  .table-row.selected { background: #20204a; border-left: 2px solid #6060c0; }
  .key-cell { color: #80c0ff; overflow: hidden; text-overflow: ellipsis; }
  .hits-cell { color: #80ff80; }
  .tier-cell { color: #c0a060; font-size: 0.7rem; }
  .detail-panel { margin-top: 0.5rem; padding: 0.5rem; background: #15152a; border: 1px solid #3030a0; border-radius: 2px; }
  .detail-panel h4 { color: #80c0ff; margin: 0 0 4px; font-size: 0.8rem; }
  .detail-panel p { margin: 0; font-size: 0.75rem; color: #a0a0c0; }
</style>
