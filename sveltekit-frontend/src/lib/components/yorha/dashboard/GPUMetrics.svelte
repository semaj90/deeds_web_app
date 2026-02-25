<script lang="ts">
  import { browser } from '$app/environment';

  /** Real WebGPU capabilities detected from the browser */
  interface GPUCapabilities {
    available: boolean;
    backend: 'webgpu' | 'none';
    vendor: string;
    architecture: string;
    device: string;
    description: string;
    features: string[];
    limits: Record<string, number>;
  }

  /** Compute pipeline metrics from gpu-compute-pipeline.ts */
  interface ComputeMetrics {
    backend: string;
    shadersLoaded: number;
    pipelinesCached: number;
  }

  let capabilities = $state<GPUCapabilities | null>(null);
  let computeMetrics = $state<ComputeMetrics | null>(null);
  let loading = $state(true);
  let error: string | null = $state(null);

  /** Performance history for cosine similarity operations */
  let performanceHistory = $state(Array.from({ length: 20 }, () => ({
    time: 0,
    durationMs: 0
  })));

  async function detectGPU() {
    if (!browser) {
      capabilities = { available: false, backend: 'none', vendor: '', architecture: '', device: '', description: '', features: [], limits: {} };
      loading = false;
      return;
    }

    try {
      loading = true;
      error = null;

      // Detect real WebGPU capabilities from browser
      if (typeof navigator !== 'undefined' && navigator.gpu) {
        const gpu = navigator.gpu as GPU;
        const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });

        if (adapter) {
          const info = await adapter.requestAdapterInfo();
          const features = Array.from(adapter.features) as string[];

          capabilities = {
            available: true,
            backend: 'webgpu',
            vendor: info.vendor || 'Unknown',
            architecture: info.architecture || '',
            device: info.device || '',
            description: info.description || '',
            features,
            limits: {
              maxBufferSize: adapter.limits.maxBufferSize,
              maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
              maxComputeWorkgroupsPerDimension: adapter.limits.maxComputeWorkgroupsPerDimension,
              maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup,
              maxComputeWorkgroupSizeX: adapter.limits.maxComputeWorkgroupSizeX,
              maxComputeWorkgroupSizeY: adapter.limits.maxComputeWorkgroupSizeY,
              maxComputeWorkgroupSizeZ: adapter.limits.maxComputeWorkgroupSizeZ,
            }
          };
        } else {
          capabilities = { available: false, backend: 'none', vendor: '', architecture: '', device: '', description: 'No WebGPU adapter found', features: [], limits: {} };
        }
      } else {
        capabilities = { available: false, backend: 'none', vendor: '', architecture: '', device: '', description: 'WebGPU not supported', features: [], limits: {} };
      }

      // Try to load DeedsGPUCompute pipeline info
      try {
        const { getGPUCompute } = await import('$lib/gpu/gpu-compute-pipeline.js');
        const compute = await getGPUCompute();
        computeMetrics = {
          backend: compute.backend ?? 'unknown',
          shadersLoaded: 3, // cosine, normalize, matmul
          pipelinesCached: 0,
        };
      } catch {
        computeMetrics = null;
      }
    } catch (err) {
      console.error('GPU detection failed:', err);
      error = 'GPU detection failed';
      capabilities = { available: false, backend: 'none', vendor: '', architecture: '', device: '', description: '', features: [], limits: {} };
    } finally {
      loading = false;
    }
  }

  /** Run a benchmark cosine similarity to measure real GPU perf */
  async function runBenchmark() {
    if (!browser || !capabilities?.available) return;

    try {
      const { getGPUCompute } = await import('$lib/gpu/gpu-compute-pipeline.js');
      const compute = await getGPUCompute();

      // 768-dim vectors (same as embeddinggemma)
      const query = new Float32Array(768).map(() => Math.random());
      const docs = new Float32Array(768 * 10).map(() => Math.random());

      const start = performance.now();
      await compute.cosineSimilarity(query, docs, 10);
      const durationMs = performance.now() - start;

      performanceHistory = [
        ...performanceHistory.slice(1),
        { time: Date.now(), durationMs: Math.round(durationMs * 100) / 100 }
      ];
    } catch (err) {
      console.warn('Benchmark failed:', err);
    }
  }

  $effect(() => {
    detectGPU();
  });

  function formatBytes(bytes: number): string {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
    return `${bytes} B`;
  }
</script>

<div class="bg-panelSoft/50 backdrop-blur rounded-lg p-6 border border-sand/50">
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-xl font-semibold text-info">GPU Status</h2>
    <div class="flex items-center gap-2">
      {#if capabilities?.available}
        <button onclick={runBenchmark} class="px-2 py-1 text-xs bg-info/20 text-info rounded hover:bg-info/30 transition-colors">
          Benchmark
        </button>
      {/if}
      {#if loading}
        <div class="w-4 h-4 border-2 border-info/80 border-t-transparent rounded-full animate-spin"></div>
      {/if}
    </div>
  </div>

  {#if error}
    <div class="text-center py-4 mb-4">
      <div class="text-danger/80 text-sm">{error}</div>
    </div>
  {/if}

  {#if capabilities}
    <!-- Status Badge -->
    <div class="flex items-center gap-2 mb-4">
      <div class="w-2 h-2 rounded-full {capabilities.available ? 'bg-green-400' : 'bg-red-400'}"></div>
      <span class="text-sm {capabilities.available ? 'text-green-400' : 'text-danger/80'}">
        {capabilities.available ? 'WebGPU Active' : 'WebGPU Unavailable'}
      </span>
      {#if capabilities.vendor}
        <span class="text-xs text-sand/40">({capabilities.vendor})</span>
      {/if}
    </div>

    {#if capabilities.available}
      <!-- Adapter Info -->
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-panelSoft/30 rounded-lg p-3">
            <div class="text-xs text-sand/40 mb-1">Vendor</div>
            <div class="text-sm font-medium text-sand">{capabilities.vendor || 'Unknown'}</div>
          </div>
          <div class="bg-panelSoft/30 rounded-lg p-3">
            <div class="text-xs text-sand/40 mb-1">Architecture</div>
            <div class="text-sm font-medium text-sand">{capabilities.architecture || 'N/A'}</div>
          </div>
        </div>

        {#if capabilities.device || capabilities.description}
          <div class="bg-panelSoft/30 rounded-lg p-3">
            <div class="text-xs text-sand/40 mb-1">Device</div>
            <div class="text-sm font-medium text-sand">{capabilities.description || capabilities.device || 'N/A'}</div>
          </div>
        {/if}

        <!-- Compute Limits -->
        <div class="pt-3 border-t border-sand/50">
          <h3 class="text-sm font-medium text-sand/40 mb-2">Compute Limits</h3>
          <div class="grid grid-cols-2 gap-2 text-xs">
            {#if capabilities.limits.maxBufferSize}
              <div class="flex justify-between">
                <span class="text-sand/40">Max Buffer</span>
                <span class="text-sand">{formatBytes(capabilities.limits.maxBufferSize)}</span>
              </div>
            {/if}
            {#if capabilities.limits.maxStorageBufferBindingSize}
              <div class="flex justify-between">
                <span class="text-sand/40">Max Storage</span>
                <span class="text-sand">{formatBytes(capabilities.limits.maxStorageBufferBindingSize)}</span>
              </div>
            {/if}
            {#if capabilities.limits.maxComputeWorkgroupSizeX}
              <div class="flex justify-between">
                <span class="text-sand/40">Workgroup X</span>
                <span class="text-sand">{capabilities.limits.maxComputeWorkgroupSizeX}</span>
              </div>
            {/if}
            {#if capabilities.limits.maxComputeInvocationsPerWorkgroup}
              <div class="flex justify-between">
                <span class="text-sand/40">Invocations/WG</span>
                <span class="text-sand">{capabilities.limits.maxComputeInvocationsPerWorkgroup}</span>
              </div>
            {/if}
          </div>
        </div>

        <!-- Compute Pipeline Status -->
        {#if computeMetrics}
          <div class="pt-3 border-t border-sand/50">
            <h3 class="text-sm font-medium text-sand/40 mb-2">Compute Pipeline</h3>
            <div class="grid grid-cols-3 gap-3 text-center">
              <div class="bg-panelSoft/30 rounded-lg p-2">
                <div class="text-lg font-bold text-info/80">{computeMetrics.backend}</div>
                <div class="text-xs text-sand/40">Backend</div>
              </div>
              <div class="bg-panelSoft/30 rounded-lg p-2">
                <div class="text-lg font-bold text-accent">{computeMetrics.shadersLoaded}</div>
                <div class="text-xs text-sand/40">Shaders</div>
              </div>
              <div class="bg-panelSoft/30 rounded-lg p-2">
                <div class="text-lg font-bold text-info/80">{computeMetrics.pipelinesCached}</div>
                <div class="text-xs text-sand/40">Cached</div>
              </div>
            </div>
          </div>
        {/if}

        <!-- Benchmark History -->
        {#if performanceHistory.some(p => p.durationMs > 0)}
          <div class="pt-3 border-t border-sand/50">
            <h3 class="text-sm font-medium text-sand/40 mb-2">Cosine Similarity Benchmark (768-dim x 10)</h3>
            <div class="h-16 bg-panelSoft/30 rounded flex items-end space-x-1 p-2">
              {#each performanceHistory as point}
                {#if point.durationMs > 0}
                  {@const maxMs = Math.max(...performanceHistory.map(p => p.durationMs))}
                  <div
                    class="bg-info/60 rounded-sm flex-1 transition-all duration-200"
                    style="height: {(point.durationMs / (maxMs || 1)) * 100}%"
                    title="{point.durationMs}ms"
                  ></div>
                {:else}
                  <div class="bg-panelSoft/20 rounded-sm flex-1" style="height: 2px"></div>
                {/if}
              {/each}
            </div>
            <div class="flex justify-between text-xs text-sand/40 mt-1">
              <span>Duration (ms)</span>
              <span>{performanceHistory.filter(p => p.durationMs > 0).at(-1)?.durationMs ?? 0}ms latest</span>
            </div>
          </div>
        {/if}

        <!-- Features -->
        <div class="pt-3 border-t border-sand/50">
          <h3 class="text-sm font-medium text-sand/40 mb-2">Adapter Features ({capabilities.features.length})</h3>
          <div class="flex flex-wrap gap-1">
            {#each capabilities.features.slice(0, 12) as feature}
              <span class="px-2 py-1 bg-info/20 text-info text-xs rounded">{feature}</span>
            {/each}
            {#if capabilities.features.length > 12}
              <span class="px-2 py-1 bg-sand/20 text-sand/60 text-xs rounded">+{capabilities.features.length - 12} more</span>
            {/if}
          </div>
        </div>
      </div>

    {:else}
      <!-- No GPU Available -->
      <div class="text-center py-6">
        <div class="text-sand/40 text-sm mb-2">{capabilities.description || 'WebGPU is not available in this browser'}</div>
        <div class="text-xs text-sand/30">Compute operations will use WASM SIMD or CPU fallback</div>
      </div>
    {/if}
  {/if}
</div>
