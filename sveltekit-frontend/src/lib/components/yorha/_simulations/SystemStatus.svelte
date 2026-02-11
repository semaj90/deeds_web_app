<script lang="ts">
  // Migrated to $effect

  let { webgpuReady = false, cpuFallbackReady = false } = $props();

  let systemMetrics = $state({
    memory: 0,
    cpu: 0,
    gpu: 0,
    network: 0
  });

  let updateInterval: number | undefined;

  $effect(() => {

    // Update system metrics every 5 seconds
    updateInterval = window.setInterval(async () => {
      try {
        // Get memory usage
        if (typeof performance !== 'undefined' && 'memory' in performance) {
          const memInfo = (performance as any).memory;
          if (memInfo && memInfo.totalJSHeapSize > 0) {
              systemMetrics.memory = Math.round((memInfo.usedJSHeapSize / memInfo.totalJSHeapSize) * 100);
          }
        } else {
            // Simulate memory fluctuation
            systemMetrics.memory = 40 + Math.floor(Math.random() * 20);
        }

        // Simulate CPU usage (in real app, would use Performance API more deeply)
        systemMetrics.cpu = Math.floor(Math.random() * 30) + 20;

        // GPU status simulation based on readiness
        systemMetrics.gpu = webgpuReady ? (10 + Math.floor(Math.random() * 30)) : (cpuFallbackReady ? 90 : 0);

        // Network status (simplified)
        systemMetrics.network = typeof navigator !== 'undefined' && navigator.onLine ? 98 : 0;

      } catch (error) {
        console.warn('Failed to update system metrics:', error);
      }
    },
	5000);

    return () => {
      if (updateInterval) {
        clearInterval(updateInterval);
      }
    };
  
});

  function getStatusColor(value: number, inverse = false): string {
    if (inverse) {
        if (value < 50) return 'text-red-400';
        if (value < 80) return 'text-yellow-400';
        return 'text-green-400';
    }
    if (value >= 80) return 'text-red-400';
    if (value >= 60) return 'text-yellow-400';
    return 'text-green-400';
  }

  function getStatusIcon(value: number): string {
    if (value >= 80) return '🔴';
    if (value >= 60) return '🟡';
    return '🟢';
  }
</script>

<div class="system-status p-4 rounded-lg bg-black/40 border border-slate-700 backdrop-blur-sm">
  <div class="grid grid-cols-2 gap-4">

    <!-- CPU -->
    <div class="metric-item flex flex-col">
      <span class="text-xs text-slate-400 uppercase tracking-wider">CPU Load</span>
      <div class="flex items-baseline gap-2">
        <span class="text-xl font-mono {getStatusColor(systemMetrics.cpu)}">{systemMetrics.cpu}%</span>
        <div class="h-1.5 flex-1 bg-slate-800 rounded-full overflow-hidden self-center">
            <div class="h-full bg-current transition-all duration-500" style="width: {systemMetrics.cpu}%"></div>
        </div>
      </div>
    </div>

    <!-- Memory -->
    <div class="metric-item flex flex-col">
      <span class="text-xs text-slate-400 uppercase tracking-wider">Memory</span>
      <div class="flex items-baseline gap-2">
        <span class="text-xl font-mono {getStatusColor(systemMetrics.memory)}">{systemMetrics.memory}%</span>
        <div class="h-1.5 flex-1 bg-slate-800 rounded-full overflow-hidden self-center">
            <div class="h-full bg-current transition-all duration-500" style="width: {systemMetrics.memory}%"></div>
        </div>
      </div>
    </div>

    <!-- GPU -->
    <div class="metric-item flex flex-col">
      <span class="text-xs text-slate-400 uppercase tracking-wider">GPU Core</span>
      <div class="flex items-baseline gap-2">
        <span class="text-xl font-mono {webgpuReady ? 'text-blue-400' : 'text-orange-400'}">{systemMetrics.gpu}%</span>
        <div class="h-1.5 flex-1 bg-slate-800 rounded-full overflow-hidden self-center">
            <div class="h-full {webgpuReady ? 'bg-blue-400' : 'bg-orange-400'} transition-all duration-500" style="width: {systemMetrics.gpu}%"></div>
        </div>
      </div>
       <span class="text-[0.65rem] {webgpuReady ? 'text-green-400' : 'text-yellow-500'}">
          {webgpuReady ? 'ACCELERATED' : (cpuFallbackReady ? 'SOFTWARE FALLBACK' : 'OFFLINE')}
       </span>
    </div>

    <!-- Network -->
    <div class="metric-item flex flex-col">
      <span class="text-xs text-slate-400 uppercase tracking-wider">Network</span>
      <div class="flex items-baseline gap-2">
        <span class="text-xl font-mono {getStatusColor(systemMetrics.network, true)}">{systemMetrics.network}%</span>
        <div class="h-1.5 flex-1 bg-slate-800 rounded-full overflow-hidden self-center">
            <div class="h-full bg-current transition-all duration-500" style="width: {systemMetrics.network}%"></div>
        </div>
      </div>
    </div>

  </div>
</div>

<style>
    /* Scoped styles if needed, mostly using tailwind classes */
    .metric-item {
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
    }
</style>

