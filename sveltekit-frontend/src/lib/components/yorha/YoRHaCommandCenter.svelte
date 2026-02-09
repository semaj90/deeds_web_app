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
    if (value >= critical) return 'text-red-500';
    if (value >= warning) return 'text-yellow-500';
    return 'text-cyan-500';
  }

  /**
   * Get metric status badge
   */
  function getBarColor(value: number, warning: number, critical: number): string {
    if (value >= critical) return 'bg-red-500';
    if (value >= warning) return 'bg-yellow-500';
    return 'bg-cyan-500';
  }

  $effect(() => {

    loadData();
    const refreshInterval = setInterval(fetchClusterHealth, 10000);
    return () => clearInterval(refreshInterval);
  
});
</script>

<div class="p-6 space-y-6 bg-slate-950 min-h-screen text-slate-200 font-mono">
  <!-- Header -->
  <div class="flex items-center justify-between border-b border-cyan-900/50 pb-4">
    <div>
      <h1 class="text-2xl font-bold text-white tracking-[0.2em] uppercase">COMMAND CENTER</h1>
      <p class="text-cyan-500/60 text-xs mt-1">YoRHa Unit Monitoring & Neural Network Relay [v1.0.4]</p>
    </div>
    <div class="flex items-center gap-4">
      <button
        onclick={loadData}
        disabled={isLoading}
        class="px-4 py-2 bg-slate-900 hover:bg-cyan-900/30 border border-cyan-800/50 text-cyan-400 text-[10px] uppercase transition-all disabled:opacity-50"
      >
        {isLoading ? 'SYNCING...' : 'FORCE SYNC'}
      </button>
      <div class="h-2 w-2 bg-cyan-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(6 182 212 0.5)]"></div>
    </div>
  </div>

  {#if error}
    <div class="bg-red-900/20 border border-red-900/50 p-4 rounded text-red-400 text-xs">
      [SYSTEM_FAILURE]: {error}
    </div>
  {/if}

  <!-- Stats Grid -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    {#if clusterHealth}
      {@const m = clusterHealth.metrics}
      {@const t = clusterHealth.thresholds}

      <!-- CPU -->
      <div class="bg-slate-900/50 border border-slate-800 p-6 rounded relative overflow-hidden group hover:border-cyan-800/50 transition-colors">
        <div class="absolute top-0 left-0 w-1 h-full bg-cyan-500"></div>
        <div class="flex justify-between items-start mb-4">
          <span class="text-[10px] text-slate-500 uppercase tracking-wider">Processor Load</span>
          <span class="text-xl font-bold {getHealthColor(m.cpu_usage t.cpu_warning t.cpu_critical)}">
            {Math.round(m.cpu_usage)}%
          </span>
        </div>
        <div class="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
          <div
            class="h-full transition-all duration-500 {getBarColor(m.cpu_usage t.cpu_warning t.cpu_critical)}"
            style="width: {m.cpu_usage}%">
          </div>
        </div>
      </div>

      <!-- Memory -->
      <div class="bg-slate-900/50 border border-slate-800 p-6 rounded relative overflow-hidden group hover:border-purple-800/50 transition-colors">
        <div class="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>
        <div class="flex justify-between items-start mb-4">
          <span class="text-[10px] text-slate-500 uppercase tracking-wider">Memory Allocation</span>
          <span class="text-xl font-bold {getHealthColor(m.memory_usage t.memory_warning t.memory_critical)}">
            {Math.round(m.memory_usage)}%
          </span>
        </div>
        <div class="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
          <div
            class="h-full bg-purple-500 transition-all duration-500"
            style="width: {m.memory_usage}%">
          </div>
        </div>
      </div>

      <!-- GPU -->
      <div class="bg-slate-900/50 border border-slate-800 p-6 rounded relative overflow-hidden group hover:border-emerald-800/50 transition-colors">
        <div class="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
        <div class="flex justify-between items-start mb-4">
          <span class="text-[10px] text-slate-500 uppercase tracking-wider">Neural Engine</span>
          <span class="text-xl font-bold {getHealthColor(m.gpu_utilization t.gpu_warning t.gpu_critical)}">
            {Math.round(m.gpu_utilization)}%
          </span>
        </div>
        <div class="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
          <div
            class="h-full bg-emerald-500 transition-all duration-500"
            style="width: {m.gpu_utilization}%">
          </div>
        </div>
      </div>
    {:else if isLoading}
      <div class="col-span-3 h-24 flex items-center justify-center text-cyan-500/40 text-[10px] uppercase animate-pulse border border-slate-800/50 rounded">
        CALIBRATING SYSTEM LINK...
      </div>
    {/if}
  </div>

  <!-- Content Grid -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Active Cases -->
    <div class="bg-slate-900/50 border border-slate-800 rounded flex flex-col min-h-[400px]">
      <div class="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
        <span class="text-xs font-bold text-slate-400 tracking-widest uppercase">PRIORITY OPERATIONS</span>
        <a href="/cases" class="text-[9px] text-cyan-500 hover:text-cyan-400 font-bold transition-colors">VIEW ALL ARCHIVES</a>
      </div>
      <div class="p-4 space-y-3 flex-1">
        {#each cases as c}
          <div class="flex items-center justify-between p-3 bg-slate-900/80 border border-slate-800 hover:border-cyan-900/50 transition-all cursor-pointer group rounded-sm">
            <div class="flex items-center gap-3">
              <div class="w-1.5 h-1.5 {c.status === 'active' ? 'bg-cyan-500' : 'bg-slate-600'} rounded-full"></div>
              <div>
                <p class="text-xs font-bold text-white group-hover:text-cyan-400 transition-colors uppercase">{c.title}</p>
                <p class="text-[9px] text-slate-500 font-mono mt-0.5 tracking-tighter">CASE_ID: {c.id.substring(0,8)}</p>
              </div>
            </div>
            <div class="text-right">
              <span class="text-[9px] px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-400 uppercase">{c.status}</span>
            </div>
          </div>
        {:else}
          <div class="h-full flex items-center justify-center text-slate-600 text-[10px] italic">
            NO ACTIVE OPERATIONS DETECTED.
          </div>
        {/each}
      </div>
    </div>

    <!-- System Log -->
    <div class="bg-slate-900/50 border border-slate-800 rounded flex flex-col min-h-[400px]">
       <div class="p-4 border-b border-slate-800 bg-slate-900">
        <span class="text-xs font-bold text-slate-400 tracking-widest uppercase">NEURAL LOG CONSOLE</span>
      </div>
      <div class="p-4 flex-1 text-[9px] leading-relaxed space-y-1.5 overflow-y-auto font-mono text-slate-500">
        <p>[INFO] INITIALIZING SYSTEM CORE...</p>
        <p>[INFO] ESTABLISHING SECURE RELAY LINK...</p>
        <p class="text-cyan-500/80">[OK] NEURAL WEIGHTS LOADED: GEMMA-3-LEGAL-7B</p>
        <p class="text-emerald-500/80">[OK] DATABASE SYNC: 100% COMPLETE</p>
        <p>[INFO] MONITORING AGENT CLUSTER 'EPSILON-9'</p>
        <p class="text-amber-500/80">[WARN] LATENCY SPIKE DETECTED IN RAG-SERVICE</p>
        <p>[INFO] SCANNING EVIDENCE CLUSTER: {cases[0]?.id || 'NONE'}</p>
        <div class="flex items-center gap-1.5 pt-2">
          <span class="text-cyan-500 animate-pulse">_</span>
          <div class="h-3 w-1.5 bg-cyan-500 animate-pulse"></div>
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




