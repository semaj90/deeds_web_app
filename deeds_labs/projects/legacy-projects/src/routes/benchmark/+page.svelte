<script lang="ts">
  import { onMount } from 'svelte';
  import { runEmbeddingBenchmark } from '$lib/gpu/gpu-benchmark';
  import { telemetryBus } from '$lib/services/telemetry-bus';
  
  let benchmarkResults = $state(null);
  let isRunning = $state(false);
  let selectedMode = $state('both');
  let segments = $state(8);
  let dimension = $state(768);
  let runs = $state(8);
  
  onMount(() => {
    // Subscribe to benchmark events
    const unsubscribe = telemetryBus.on('gpu.benchmark.summary', (summary) => {
      benchmarkResults = summary;
    });
    
    return unsubscribe;
  });
  
  async function runBenchmark() {
    isRunning = true;
    benchmarkResults = null;
    
    const modes = selectedMode === 'both' ? ['gpu', 'cpu'] : [selectedMode];
    
    try {
      await runEmbeddingBenchmark({
        segments,
        size: dimension,
        runs,
        warmup: 2,
        modes
      });
    } catch (error) {
      console.error('Benchmark failed:', error);
    } finally {
      isRunning = false;
    }
  }
</script>

<div class="container mx-auto p-6 max-w-4xl">
  <h1 class="text-3xl font-bold mb-6">GPU Embedding Benchmark</h1>
  
  <div class="bg-white rounded-lg shadow-md p-6 mb-6">
    <h2 class="text-xl font-semibold mb-4">Configuration</h2>
    
    <div class="grid grid-cols-2 gap-4 mb-6">
      <div>
        <label class="block text-sm font-medium mb-1">Mode</label>
        <select 
          bind:value={selectedMode}
          class="w-full px-3 py-2 border rounded-md"
          disabled={isRunning}
        >
          <option value="both">GPU vs CPU</option>
          <option value="gpu">GPU Only</option>
          <option value="cpu">CPU Only</option>
        </select>
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-1">Segments</label>
        <input 
          type="number" 
          bind:value={segments}
          min="1"
          max="100"
          class="w-full px-3 py-2 border rounded-md"
          disabled={isRunning}
        />
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-1">Dimension</label>
        <input 
          type="number" 
          bind:value={dimension}
          min="64"
          max="4096"
          step="64"
          class="w-full px-3 py-2 border rounded-md"
          disabled={isRunning}
        />
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-1">Runs</label>
        <input 
          type="number" 
          bind:value={runs}
          min="1"
          max="50"
          class="w-full px-3 py-2 border rounded-md"
          disabled={isRunning}
        />
      </div>
    </div>
    
    <button 
      onclick={runBenchmark}
      disabled={isRunning}
      class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
    >
      {isRunning ? 'Running...' : 'Run Benchmark'}
    </button>
  </div>
  
  {#if benchmarkResults}
    <div class="bg-white rounded-lg shadow-md p-6">
      <h2 class="text-xl font-semibold mb-4">Results</h2>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        {#if benchmarkResults.gpu}
          <div class="border rounded-lg p-4">
            <h3 class="font-semibold text-lg mb-3 text-green-600">GPU Mode</h3>
            <dl class="space-y-2">
              <div class="flex justify-between">
                <dt class="text-gray-600">Mean Time:</dt>
                <dd class="font-mono">{benchmarkResults.gpu.meanMs.toFixed(2)}ms</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-600">P95 Time:</dt>
                <dd class="font-mono">{benchmarkResults.gpu.p95Ms.toFixed(2)}ms</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-600">Best Time:</dt>
                <dd class="font-mono">{benchmarkResults.gpu.bestMs.toFixed(2)}ms</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-600">Worst Time:</dt>
                <dd class="font-mono">{benchmarkResults.gpu.worstMs.toFixed(2)}ms</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-600">GPU Stats:</dt>
                <dd class="font-mono">{benchmarkResults.gpu.statsUsed ? '✓' : '✗'}</dd>
              </div>
            </dl>
          </div>
        {/if}
        
        {#if benchmarkResults.cpu}
          <div class="border rounded-lg p-4">
            <h3 class="font-semibold text-lg mb-3 text-blue-600">CPU Mode</h3>
            <dl class="space-y-2">
              <div class="flex justify-between">
                <dt class="text-gray-600">Mean Time:</dt>
                <dd class="font-mono">{benchmarkResults.cpu.meanMs.toFixed(2)}ms</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-600">P95 Time:</dt>
                <dd class="font-mono">{benchmarkResults.cpu.p95Ms.toFixed(2)}ms</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-600">Best Time:</dt>
                <dd class="font-mono">{benchmarkResults.cpu.bestMs.toFixed(2)}ms</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-600">Worst Time:</dt>
                <dd class="font-mono">{benchmarkResults.cpu.worstMs.toFixed(2)}ms</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-600">GPU Stats:</dt>
                <dd class="font-mono">{benchmarkResults.cpu.statsUsed ? '✓' : '✗'}</dd>
              </div>
            </dl>
          </div>
        {/if}
      </div>
      
      {#if benchmarkResults.speedup}
        <div class="mt-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg">
          <div class="text-center">
            <p class="text-lg font-semibold">GPU Speedup</p>
            <p class="text-3xl font-bold text-green-600">
              {benchmarkResults.speedup.toFixed(2)}x
            </p>
            <p class="text-sm text-gray-600 mt-1">
              Samples: {benchmarkResults.gpu?.samples.toLocaleString() || 0} 
              ({benchmarkResults.gpu?.segments || 0} segments × {benchmarkResults.gpu?.dimension || 0} dims)
            </p>
          </div>
        </div>
      {/if}
    </div>
  {/if}
  
  <div class="mt-6 p-4 bg-gray-100 rounded-lg">
    <h3 class="font-semibold mb-2">Console Usage</h3>
    <pre class="text-sm bg-gray-800 text-green-400 p-3 rounded overflow-x-auto">
// Quick default benchmark
runEmbeddingBenchmark()

// Custom parameters
runEmbeddingBenchmark(&#123;
  segments: 12,
  size: 512,
  runs: 10,
  modes: ['gpu']
&#125;)

// View last results
window.__LAST_GPU_BENCHMARK__</pre>
  </div>
</div>


