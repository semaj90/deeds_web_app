<script lang="ts">
  /**
   * AdminMonitoringDashboard.svelte
   * 
   * A premium, real-time observability panel for the Admin Copilot.
   * Surfaces inference latency, model weight status, and memory compression events.
   */
  import { onMount } from 'svelte';
  import { fade, slide } from 'svelte/transition';
  import Icon from '$lib/components/ui/Icon.svelte';

  let stats: any = $state(null);
  let raptorSummaries: any[] = $state([]);
  let loading = $state(true);
  let error: string | null = $state(null);
  let activeJobs: any[] = $state([]);
  let recommendations: any[] = $state([]);
  let inferenceLane: any = $state(null);
  let currentRepair: any = $state(null);
  let strategyQuery = $state('');
  let currentStrategy: any = $state(null);
  let promoting: string | null = $state(null);





  let rebuildingRaptor = $state(false);
  let discoveringCitations = $state(false);



  async function fetchStats() {
    try {
      const [sRes, rRes, jRes, recRes, infRes] = await Promise.all([
        fetch('/api/admin/inference-stats'),
        fetch('/api/admin/raptor-atlas'),
        fetch('/api/admin/jobs'),
        fetch('/api/admin/recommendations'),
        fetch('/api/admin/inference-lane')
      ]);
      if (!sRes.ok) throw new Error('Failed to fetch telemetry');
      stats = await sRes.json();
      if (rRes.ok) raptorSummaries = (await rRes.json()).summaries;
      if (jRes.ok) activeJobs = (await jRes.json()).jobs;
      if (recRes.ok) recommendations = (await recRes.json()).recommendations;
      if (infRes.ok) inferenceLane = await infRes.json();



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

  async function rebuildRaptor() {
    if (!confirm('This will re-cluster all evidence and generate new thematic summaries. Continue?')) return;
    rebuildingRaptor = true;
    try {
      const res = await fetch('/api/admin/raptor/build', { method: 'POST' });
      if (!res.ok) throw new Error('Build failed');
      await fetchStats();
    } catch (e: any) {
      alert(e.message);
    } finally {
      rebuildingRaptor = false;
    }
  }

  async function discoverCitations() {
    if (!confirm('This will scan all legal nodes for cross-references. This may take a while. Continue?')) return;
    discoveringCitations = true;
    try {
      const res = await fetch('/api/admin/citations/discover', { method: 'POST' });
      if (!res.ok) throw new Error('Discovery failed');
      await fetchStats();
    } catch (e: any) {
      alert(e.message);
    } finally {
      discoveringCitations = false;
    }
  }

  async function repairError(errorId: string) {
    currentRepair = { loading: true };
    try {
      const res = await fetch('/api/admin/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errorId })
      });
      if (!res.ok) throw new Error('Repair analysis failed');
      currentRepair = await res.json();
    } catch (e: any) {
      alert(e.message);
      currentRepair = null;
    }
  }

  async function generateStrategy() {
    if (!strategyQuery) return;
    currentStrategy = { loading: true };
    try {
      const res = await fetch('/api/admin/legal-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: strategyQuery })
      });
      if (!res.ok) throw new Error('Strategy generation failed');
      const data = await res.json();
      currentStrategy = data.strategy;
    } catch (e: any) {
      alert(e.message);
      currentStrategy = null;
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
        <button 
          onclick={discoverCitations}
          disabled={discoveringCitations}
          class="mt-1 text-[8px] text-zinc-500 hover:text-zinc-300 transition-colors uppercase tracking-widest disabled:opacity-50"
        >
          {discoveringCitations ? 'Scanning...' : '[ Discover Citations ]'}
        </button>
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

    <!-- Inference Lane Section -->
    {#if inferenceLane}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/50 flex flex-col gap-1">
          <span class="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Tier 0: VRAM</span>
          <div class="flex items-center justify-between">
            <span class="text-xl font-bold text-zinc-200">{inferenceLane.vramUsed ?? '5.8'} GB</span>
            <span class="text-[10px] text-emerald-500 font-bold uppercase">TurboQuant</span>
          </div>
          <div class="w-full h-1 bg-zinc-800 rounded-full mt-2">
            <div class="h-full bg-emerald-500 rounded-full" style="width: 72%"></div>
          </div>
        </div>
        <div class="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/50 flex flex-col gap-1">
          <span class="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Tier 1: KV Cache</span>
          <div class="flex items-center justify-between">
            <span class="text-xl font-bold text-zinc-200">{inferenceLane.ctxUsed ?? '1024'} / {inferenceLane.ctxMax ?? '4096'}</span>
            <span class="text-[10px] text-zinc-400">Tokens</span>
          </div>
          <div class="w-full h-1 bg-zinc-800 rounded-full mt-2">
            <div class="h-full bg-blue-500 rounded-full" style="width: {(inferenceLane.ctxUsed / inferenceLane.ctxMax) * 100 || 25}%"></div>
          </div>
        </div>
        <div class="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/50 flex flex-col gap-1">
          <span class="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Inference Strategy</span>
          <div class="flex items-center justify-between">
            <span class="text-sm font-bold text-zinc-300">RotorQuant Q8_0</span>
            <div class="flex gap-1">
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            </div>
          </div>
          <p class="text-[9px] text-zinc-500 mt-2 italic leading-tight">Quantized K/V tensors active. Flash attention enabled.</p>
        </div>
      </div>
    {/if}

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">

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
        <h3 class="text-[11px] font-bold text-zinc-400 mb-3 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="h-1.5 w-1.5 rounded-full bg-purple-500"></span>
            Thematic Knowledge Atlas
          </div>
          <button
            onclick={rebuildRaptor}
            disabled={rebuildingRaptor}
            class="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-purple-600/20 text-purple-400 border border-purple-500/30 hover:bg-purple-600/30 transition-all disabled:opacity-50"
          >
            {rebuildingRaptor ? 'Rebuilding...' : 'Rebuild Tree'}
          </button>
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

      <!-- RL Feedback Timeline -->
      <div class="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/50">
        <h3 class="text-[11px] font-bold text-zinc-400 mb-3 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            RL Feedback Loop (Context Timeline)
          </div>
        </h3>
        <div class="space-y-2 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
          {#if stats.timelineEvents}
            {#each stats.timelineEvents as event}
              <div class="p-2 rounded-lg bg-zinc-950/40 border border-zinc-800/30 text-[10px] flex items-center justify-between">
                <div class="flex flex-col gap-1">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-zinc-300 uppercase tracking-tighter">{event.signal?.replace('_', ' ') ?? 'EVENT'}</span>
                    <span class="px-1 py-0.5 rounded-[4px] text-[8px] bg-zinc-800 text-zinc-500 font-mono">{event.pipeline}</span>
                  </div>
                  <span class="text-zinc-600 font-mono text-[8px]">{new Date(event.created_at).toLocaleTimeString()}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="font-mono {event.grpo_reward > 0 ? 'text-emerald-400' : event.grpo_reward < 0 ? 'text-red-400' : 'text-zinc-500'}">
                    {event.grpo_reward > 0 ? '+' : ''}{parseFloat(event.grpo_reward).toFixed(2)}
                  </span>
                </div>
              </div>
            {:else}
              <div class="text-center py-8 text-zinc-600 italic text-xs">No feedback signals recorded yet</div>
            {/each}
          {:else}
            <div class="text-center py-8 text-zinc-600 italic text-xs">Awaiting timeline signals...</div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Active Jobs Section -->
    {#if activeJobs.length > 0}
      <div class="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/50" in:slide>
        <h3 class="text-[11px] font-bold text-zinc-400 mb-3 flex items-center gap-2">
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          Active Intelligence Jobs
        </h3>
        <div class="space-y-2">
          {#each activeJobs as job}
            <div class="flex items-center justify-between p-2 rounded-lg bg-zinc-950/40 border border-zinc-800/30 text-[10px]">
              <div class="flex flex-col">
                <span class="font-bold text-zinc-200 capitalize">{job.type.replace('_', ' ')}</span>
                <span class="text-zinc-500 font-mono">{job.id.slice(0, 8)}...</span>
              </div>
              <div class="flex items-center gap-3">
                <button 
                  onclick={() => repairError(job.id)}
                  class="text-[9px] text-blue-400 hover:text-blue-300 uppercase font-bold"
                >
                  Diagnose & Repair
                </button>
                <span class="px-1.5 py-0.5 rounded text-[8px] uppercase font-bold
                  {job.status === 'completed' ? 'bg-green-500/10 text-green-500' : job.status === 'failed' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'}">
                  {job.status}
                </span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Repair Proposal Section -->
    {#if currentRepair}
      <div class="p-4 rounded-xl bg-blue-950/20 border border-blue-500/30 mb-6" in:slide>
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-[11px] font-bold text-blue-300 flex items-center gap-2">
            <Icon name="wrench" size={14} />
            Agentic Repair Proposal
          </h3>
          <button onclick={() => currentRepair = null} class="text-zinc-500 hover:text-white">
            <Icon name="x" size={14} />
          </button>
        </div>

        {#if currentRepair.loading}
          <div class="flex items-center justify-center py-10 gap-3 text-zinc-400 animate-pulse">
            <Icon name="loader" size={20} class="animate-spin" />
            <span class="text-xs font-mono uppercase tracking-widest">Gemma 4 Analyzing Codebase...</span>
          </div>
        {:else}
          <div class="space-y-4">
            <div class="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/50">
              <span class="text-[9px] text-zinc-500 uppercase font-bold">Analysis</span>
              <p class="text-xs text-zinc-300 mt-1">{currentRepair.proposal.explanation}</p>
            </div>

            <div class="p-3 rounded-lg bg-zinc-950/80 border border-zinc-800/50 font-mono text-[10px] overflow-x-auto">
              <span class="text-[9px] text-zinc-500 uppercase font-bold mb-2 block">Proposed Diff</span>
              <pre class="text-emerald-400">{currentRepair.proposal.diff}</pre>
            </div>

            <div class="flex gap-3">
              <button class="flex-1 py-2 rounded bg-emerald-600 text-white text-[10px] font-bold uppercase hover:bg-emerald-500 transition-all">
                Apply Fix & Verify
              </button>
              <div class="px-3 flex items-center justify-center rounded border border-zinc-800 text-[10px] font-bold text-zinc-400">
                Confidence: {Math.round(currentRepair.proposal.confidence * 100)}%
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}


    <!-- Legal Strategy Lab Section -->
    <div class="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/50 mb-6">
      <h3 class="text-[11px] font-bold text-zinc-400 mb-4 flex items-center gap-2">
        <Icon name="award" size={14} />
        Legal Strategy Lab (Agentic Chain-of-Reasoning)
      </h3>
      
      <div class="flex gap-2 mb-4">
        <input 
          type="text" 
          bind:value={strategyQuery}
          placeholder="Enter a complex legal research query..."
          class="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
        />
        <button 
          onclick={generateStrategy}
          class="px-4 py-2 bg-blue-600 text-white rounded text-[10px] font-bold uppercase hover:bg-blue-500 transition-all disabled:opacity-50"
          disabled={currentStrategy?.loading}
        >
          {currentStrategy?.loading ? 'Synthesizing...' : 'Generate Strategy'}
        </button>
      </div>

      {#if currentStrategy && !currentStrategy.loading}
        <div class="space-y-4 p-4 rounded-lg bg-zinc-950/60 border border-zinc-800/30" in:slide>
          <div>
            <span class="text-[9px] text-zinc-500 uppercase font-bold">Core Legal Proposition</span>
            <p class="text-sm font-bold text-zinc-200 mt-1">{currentStrategy.claim}</p>
          </div>

          <div>
            <span class="text-[9px] text-zinc-500 uppercase font-bold mb-2 block">Reasoning Chain</span>
            <div class="space-y-2">
              {#each currentStrategy.reasoningChain as step, i}
                <div class="flex gap-3 text-xs">
                  <span class="text-blue-500 font-mono font-bold">{i + 1}.</span>
                  <span class="text-zinc-400">{step}</span>
                </div>
              {/each}
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <span class="text-[9px] text-zinc-500 uppercase font-bold block mb-1">Primary Authorities</span>
              <div class="flex flex-wrap gap-2">
                {#each currentStrategy.authorities as auth}
                  <span class="px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20 text-[9px] text-blue-300 font-mono">
                    {auth}
                  </span>
                {/each}
              </div>
            </div>
            <div>
              <span class="text-[9px] text-zinc-500 uppercase font-bold block mb-1">Conclusion</span>
              <p class="text-[10px] text-zinc-500 italic">{currentStrategy.conclusion}</p>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Recommendations Section -->
    {#if recommendations.length > 0}
      <div class="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/50">
        <h3 class="text-[11px] font-bold text-zinc-400 mb-3 flex items-center gap-2">
          <span class="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
          Next Best Actions (Autonomous Research Loop)
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          {#each recommendations as rec}
            <div class="p-3 rounded-lg bg-blue-500/5 border border-blue-500/10 flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-bold text-zinc-200">{rec.title}</span>
                <span class="px-1.5 py-0.5 rounded text-[8px] uppercase font-bold
                  {rec.priority === 'high' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}">
                  {rec.priority}
                </span>
              </div>
              <p class="text-[10px] text-zinc-500 leading-tight">{rec.description}</p>
              {#if rec.actionUrl}
                <button 
                  onclick={() => fetch(rec.actionUrl, { method: 'POST' }).then(() => fetchStats())}
                  class="mt-1 w-full py-1 rounded bg-blue-600/20 text-blue-400 text-[9px] font-bold uppercase hover:bg-blue-600/30 transition-all"
                >
                  Execute Action
                </button>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>


<style>
  .monitoring-dashboard {
    background: radial-gradient(circle at top left, rgba(63, 63, 70, 0.15), transparent);
  }
  :global(.scrollbar-thin::-webkit-scrollbar) { width: 3px; }
  :global(.scrollbar-thin::-webkit-scrollbar-thumb) { background: rgba(255,255,255,0.1); border-radius: 10px; }
</style>
