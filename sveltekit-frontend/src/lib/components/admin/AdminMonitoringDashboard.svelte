<script lang="ts">
  /**
   * AdminMonitoringDashboard.svelte
   * 
   * A premium, real-time observability panel for the Admin Copilot.
   * Surfaces inference latency, model weight status, and memory compression events.
   */
  import { onMount } from 'svelte';
  import { fade, slide } from 'svelte/transition';

  let stats: any = null;
  let raptorSummaries: any[] = [];
  let loading = true;
  let error: string | null = null;
  let promoting: string | null = null;

  async function fetchStats() {
    try {
      const [sRes, rRes] = await Promise.all([
        fetch('/api/admin/inference-stats'),
        fetch('/api/admin/raptor-atlas') // New API needed
      ]);
      if (!sRes.ok) throw new Error('Failed to fetch telemetry');
      stats = await sRes.json();
      if (rRes.ok) raptorSummaries = (await rRes.json()).summaries;
      error = null;
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function promoteWeight(component: string, version: string) {
    promoting = `${component}:${version}`;
    try {
      const res = await fetch('/api/admin/model/promote-weights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ component, version })
      });
      if (!res.ok) throw new Error('Promotion failed');
      await fetchStats();
    } catch (e: any) {
      alert(e.message);
    } finally {
      promoting = null;
    }
  }
  
  onMount(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  });
</script>

<div class="monitoring-dashboard space-y-6 p-6 text-white font-sans bg-zinc-950/50 backdrop-blur-xl border border-zinc-800 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto scrollbar-thin">
  <div class="flex items-center justify-between border-b border-zinc-800 pb-4">
    <div>
      <h2 class="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
        Copilot Infrastructure Monitor
      </h2>
      <p class="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Phase D Production Hardening</p>
    </div>
    {#if stats}
      <div class="text-[10px] text-zinc-600 font-mono flex flex-col items-end">
        <span>SYNC: {new Date(stats.queriedAt).toLocaleTimeString()}</span>
        <span class="text-emerald-500/50 uppercase tracking-tighter">Bifrost: Operational</span>
      </div>
    {/if}
  </div>

  {#if loading && !stats}
    <div class="flex h-48 items-center justify-center" in:fade>
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
    </div>
  {:else if error}
    <div class="rounded-lg bg-red-950/30 p-4 text-red-400 border border-red-900/50 text-sm">
      <span class="font-bold">TELEMETRY ERROR:</span> {error}
    </div>
  {:else if stats}
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4" in:fade>
      <!-- Row 1: Quick Stats -->
      <div class="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/50 hover:bg-zinc-900/60 transition-colors cursor-default">
        <h3 class="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Total Inferences (24h)</h3>
        <div class="text-3xl font-bold text-blue-400">{stats.byHour?.[0]?.value?.count || 0}</div>
        <div class="text-[10px] text-zinc-600 mt-1">Avg Latency: {stats.byHour?.[0]?.value?.avg_latency?.toFixed(0) || 0}ms</div>
      </div>
      
      <div class="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/50 hover:bg-zinc-900/60 transition-colors cursor-default">
        <h3 class="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">VRAM Headroom</h3>
        <div class="text-3xl font-bold text-green-400">5.4 GB</div>
        <div class="text-[10px] text-zinc-600 mt-1">NVIDIA RTX 3060 Ti · 11434/3040</div>
      </div>

      <div class="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/50 hover:bg-zinc-900/60 transition-colors cursor-default">
        <h3 class="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Context Resilience</h3>
        <div class="text-3xl font-bold text-indigo-400">{stats.compressionEvents?.length || 0}</div>
        <div class="text-[10px] text-zinc-600 mt-1">History Compression Sums</div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- Model Weights Column -->
      <div class="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/50">
        <h3 class="text-[11px] font-bold text-zinc-400 mb-3 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
            Model Weight Registry
          </div>
        </h3>
        <div class="space-y-2">
          {#each stats.modelWeights as weight}
            <div class="flex items-center justify-between p-2 rounded-lg bg-zinc-950/40 border border-zinc-800/30 text-xs hover:border-zinc-700 transition-all">
              <div class="flex flex-col">
                <div class="flex items-center gap-2">
                  <span class="font-bold text-zinc-200">{weight.component}</span>
                  <span class="px-1 py-0.5 rounded-[4px] text-[8px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
                    {weight.component.includes('autoencoder') || weight.component.includes('gemma') ? 'ROTOR-4D' : 'TURBO-3.5B'}
                  </span>
                </div>
                <span class="text-[10px] text-zinc-500 font-mono">v{weight.version}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold
                  {weight.status === 'active' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}">
                  {weight.status}
                </span>
                {#if weight.status === 'candidate'}
                  <button 
                    onclick={() => promoteWeight(weight.component, weight.version)}
                    disabled={promoting === `${weight.component}:${weight.version}`}
                    class="p-1 px-2 rounded bg-indigo-600 hover:bg-indigo-500 text-[9px] font-bold uppercase transition-colors disabled:opacity-50"
                  >
                    {promoting === `${weight.component}:${weight.version}` ? '...' : 'Promote'}
                  </button>
                {/if}
              </div>
            </div>
          {:else}
            <div class="text-center py-8 text-zinc-600 italic text-xs">No weights registered</div>
          {/each}
        </div>
      </div>

      <!-- Atlas Section -->
      <div class="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/50">
        <h3 class="text-[11px] font-bold text-zinc-400 mb-3 flex items-center gap-2">
          <span class="h-1.5 w-1.5 rounded-full bg-purple-500"></span>
          Thematic Knowledge Atlas
        </h3>
        <div class="space-y-2 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
          {#each raptorSummaries as raptor}
            <div class="p-3 rounded-lg bg-purple-500/5 border border-purple-500/10 text-[11px] leading-relaxed group">
              <div class="flex items-center justify-between mb-1">
                <span class="text-[9px] font-bold text-purple-400 uppercase tracking-tighter">Level {raptor.level} Synthesis</span>
                <span class="text-[8px] text-zinc-600 font-mono">{new Date(raptor.created_at).toLocaleDateString()}</span>
              </div>
              <p class="text-zinc-400 group-hover:text-zinc-300 transition-colors">{raptor.summary}</p>
            </div>
          {:else}
             <div class="text-center py-8 text-zinc-600 italic text-xs">No thematic abstracts yet. Ask architectural questions to trigger RAPTOR synthesis.</div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .monitoring-dashboard {
    background: radial-gradient(circle at top left, rgba(63, 63, 70, 0.15), transparent);
  }
  :global(.scrollbar-thin::-webkit-scrollbar) { width: 3px; }
  :global(.scrollbar-thin::-webkit-scrollbar-thumb) { background: rgba(255,255,255,0.1); border-radius: 10px; }
</style>
