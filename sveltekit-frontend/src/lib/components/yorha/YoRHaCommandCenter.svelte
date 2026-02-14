<script lang="ts">
  import type { DBCase } from '$lib/types/database';
  import type { YoRHaSystemMetrics } from '$lib/types/yorha-interface';
  // Migrated to $effect

  interface ClusterHealth {
    timestamp: string;
	metrics: YoRHaSystemMetrics;
    thresholds: {
	cpu_warning: number;
      cpu_critical: number;
	memory_warning: number;
      memory_critical: number;
	gpu_warning: number;
      gpu_critical: number;
    };
  }

  let cases = $state<DBCase[]>([]);
  let clusterHealth = $state<ClusterHealth | null>(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  /**
   * Fetch cluster health metrics
   */
  async function fetchClusterHealth() {
    try {
      const response = await fetch('/api/yorha/cluster-health');
      if (!response.ok) throw new Error('Failed to fetch cluster health');
      clusterHealth = await response.json();
    } catch (err) {
      console.error('Error fetching cluster health:', err);
      if (!clusterHealth) error = 'Failed to load system metrics';
    }
  }

  /**
   * Fetch active cases
   */
  async function fetchCases() {
    try {
      const response = await fetch('/api/yorha/cases?limit=10&status=active');
      if (!response.ok) throw new Error('Failed to fetch cases');
      const data = await response.json();
      cases = data.data ?? [];
    } catch (err) {
      console.error('Error fetching cases:', err);
    }
  }

  /**
   * Load initial data
   */
  async function loadData() {
    isLoading = true;
    error = null;
    await Promise.all([fetchClusterHealth(), fetchCases()]);
    isLoading = false;
  }

  /**
   * Get health status color
   */
  function getHealthColor(value: number, warning: number, critical: number): string {
    if (value >= critical) return 'text-danger';
    if (value >= warning) return 'text-warning';
    return 'text-info';
  }

  /**
   * Get metric status badge
   */
  function getBarColor(value: number, warning: number, critical: number): string {
    if (value >= critical) return 'bg-danger';
    if (value >= warning) return 'bg-warning';
    return 'bg-info';
  }

  $effect(() => {

    loadData();
    const refreshInterval = setInterval(fetchClusterHealth, 10000);
    return () => clearInterval(refreshInterval);
  
});
</script>

<div class="p-6 space-y-6 bg-panel min-h-screen text-sand/40 font-mono">
  <!-- Header -->
  <div class="flex items-center justify-between border-b border-info/20/50 pb-4">
    <div>
      <h1 class="text-2xl font-bold text-white tracking-[0.2em] uppercase">COMMAND CENTER</h1>
      <p class="text-info/60 text-xs mt-1">YoRHa Unit Monitoring & Neural Network Relay [v1.0.4]</p>
    </div>
    <div class="flex items-center gap-4">
      <button
        onclick={loadData}
        disabled={isLoading}
        class="px-4 py-2 bg-panel hover:bg-info/10 border border-info/30/50 text-info text-[10px] uppercase transition-all disabled:opacity-50"
      >
        {isLoading ? 'SYNCING...' : 'FORCE SYNC'}
      </button>
      <div class="h-2 w-2 bg-info rounded-full animate-pulse shadow-[0_0_8px_rgba(6 182 212 0.5)]"></div>
    </div>
  </div>

  {#if error}
    <div class="bg-danger/10 border border-danger/30 p-4 rounded text-danger/80 text-xs">
      [SYSTEM_FAILURE]: {error}
    </div>
  {/if}

  <!-- Stats Grid -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    {#if clusterHealth}
      {@const m = clusterHealth.metrics}
      {@const t = clusterHealth.thresholds}

      <!-- CPU -->
      <div class="bg-panel/50 border border-sand/20 p-6 rounded relative overflow-hidden group hover:border-info/30/50 transition-colors">
        <div class="absolute top-0 left-0 w-1 h-full bg-info"></div>
        <div class="flex justify-between items-start mb-4">
          <span class="text-[10px] text-sand/60 uppercase tracking-wider">Processor Load</span>
          <span class="text-xl font-bold {getHealthColor(m.cpu_usage, t.cpu_warning, t.cpu_critical)}">
            {Math.round(m.cpu_usage)}%
          </span>
        </div>
        <div class="w-full bg-panelSoft h-1.5 rounded-full overflow-hidden">
          <div
            class="h-full transition-all duration-500 {getBarColor(m.cpu_usage, t.cpu_warning, t.cpu_critical)}"
            style="width: {m.cpu_usage}%">
          </div>
        </div>
      </div>

      <!-- Memory -->
      <div class="bg-panel/50 border border-sand/20 p-6 rounded relative overflow-hidden group hover:border-info/30/50 transition-colors">
        <div class="absolute top-0 left-0 w-1 h-full bg-info"></div>
        <div class="flex justify-between items-start mb-4">
          <span class="text-[10px] text-sand/60 uppercase tracking-wider">Memory Allocation</span>
          <span class="text-xl font-bold {getHealthColor(m.memory_usage, t.memory_warning, t.memory_critical)}">
            {Math.round(m.memory_usage)}%
          </span>
        </div>
        <div class="w-full bg-panelSoft h-1.5 rounded-full overflow-hidden">
          <div
            class="h-full bg-info transition-all duration-500"
            style="width: {m.memory_usage}%">
          </div>
        </div>
      </div>

      <!-- GPU -->
      <div class="bg-panel/50 border border-sand/20 p-6 rounded relative overflow-hidden group hover:border-accent/30 transition-colors">
        <div class="absolute top-0 left-0 w-1 h-full bg-accent"></div>
        <div class="flex justify-between items-start mb-4">
          <span class="text-[10px] text-sand/60 uppercase tracking-wider">Neural Engine</span>
          <span class="text-xl font-bold {getHealthColor(m.gpu_utilization, t.gpu_warning, t.gpu_critical)}">
            {Math.round(m.gpu_utilization)}%
          </span>
        </div>
        <div class="w-full bg-panelSoft h-1.5 rounded-full overflow-hidden">
          <div
            class="h-full bg-accent transition-all duration-500"
            style="width: {m.gpu_utilization}%">
          </div>
        </div>
      </div>
    {:else if isLoading}
      <div class="col-span-3 h-24 flex items-center justify-center text-info/40 text-[10px] uppercase animate-pulse border border-sand/20/50 rounded">
        CALIBRATING SYSTEM LINK...
      </div>
    {/if}
  </div>

  <!-- Content Grid -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Active Cases -->
    <div class="bg-panel/50 border border-sand/20 rounded flex flex-col min-h-[400px]">
      <div class="p-4 border-b border-sand/20 flex justify-between items-center bg-panel">
        <span class="text-xs font-bold text-sand/40 tracking-widest uppercase">PRIORITY OPERATIONS</span>
        <a href="/cases" class="text-[9px] text-info hover:text-info font-bold transition-colors">VIEW ALL ARCHIVES</a>
      </div>
      <div class="p-4 space-y-3 flex-1">
        {#each cases as c}
          <div class="flex items-center justify-between p-3 bg-panel/80 border border-sand/20 hover:border-info/20/50 transition-all cursor-pointer group rounded-sm">
            <div class="flex items-center gap-3">
              <div class="w-1.5 h-1.5 {c.status === 'active' ? 'bg-info' : 'bg-panelSoft'} rounded-full"></div>
              <div>
                <p class="text-xs font-bold text-white group-hover:text-info transition-colors uppercase">{c.title}</p>
                <p class="text-[9px] text-sand/60 font-mono mt-0.5 tracking-tighter">CASE_ID: {c.id.substring(0,8)}</p>
              </div>
            </div>
            <div class="text-right">
              <span class="text-[9px] px-2 py-0.5 bg-panelSoft border border-sand/20 text-sand/40 uppercase">{c.status}</span>
            </div>
          </div>
        {:else}
          <div class="h-full flex items-center justify-center text-sand/60 text-[10px] italic">
            NO ACTIVE OPERATIONS DETECTED.
          </div>
        {/each}
      </div>
    </div>

    <!-- System Log -->
    <div class="bg-panel/50 border border-sand/20 rounded flex flex-col min-h-[400px]">
       <div class="p-4 border-b border-sand/20 bg-panel">
        <span class="text-xs font-bold text-sand/40 tracking-widest uppercase">NEURAL LOG CONSOLE</span>
      </div>
      <div class="p-4 flex-1 text-[9px] leading-relaxed space-y-1.5 overflow-y-auto font-mono text-sand/60">
        <p>[INFO] INITIALIZING SYSTEM CORE...</p>
        <p>[INFO] ESTABLISHING SECURE RELAY LINK...</p>
        <p class="text-info/80">[OK] NEURAL WEIGHTS LOADED: GEMMA-3-LEGAL-7B</p>
        <p class="text-accent/80">[OK] DATABASE SYNC: 100% COMPLETE</p>
        <p>[INFO] MONITORING AGENT CLUSTER 'EPSILON-9'</p>
        <p class="text-warning/80">[WARN] LATENCY SPIKE DETECTED IN RAG-SERVICE</p>
        <p>[INFO] SCANNING EVIDENCE CLUSTER: {cases[0]?.id || 'NONE'}</p>
        <div class="flex items-center gap-1.5 pt-2">
          <span class="text-info animate-pulse">_</span>
          <div class="h-3 w-1.5 bg-info animate-pulse"></div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  :global(body) {
    background-color: #020617;
  }
</style>




