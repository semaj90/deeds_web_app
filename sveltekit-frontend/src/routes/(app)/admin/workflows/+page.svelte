<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, slide } from 'svelte/transition';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let runs = $state(data.runs ?? []);
  
  async function pollWorkflows() {
    try {
      const res = await fetch('/api/workflow/status');
      const json = await res.json();
      runs = json.runs ?? [];
    } catch (err) {
      console.warn("Workflow poll failed", err);
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'completed': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'failed': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'running': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  }

  onMount(() => {
    const interval = setInterval(pollWorkflows, 2000);
    return () => clearInterval(interval);
  });
</script>

<div class="p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
  <header class="flex flex-wrap items-end justify-between gap-6">
    <div>
      <p class="text-xs font-black uppercase tracking-[0.3em] text-white/30 mb-2">System Diagnostics</p>
      <h1 class="text-4xl font-black text-white tracking-tight">Workflow Fabric</h1>
      <p class="text-sm text-white/50 mt-1 font-medium">Monitoring RabbitMQ `ingest.pdf.ocr` lane and local-fallback events.</p>
    </div>
    
    <div class="flex gap-3">
      <div class="px-4 py-2 bg-white/5 border border-white/10 rounded-full flex items-center gap-3">
        <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
        <span class="text-[10px] font-black uppercase tracking-widest text-white/60">Live Monitor</span>
      </div>
    </div>
  </header>

  <div class="grid gap-4 md:grid-cols-3">
    <div class="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-sm">
      <div class="text-[10px] font-black uppercase tracking-[0.25em] text-white/30 mb-1">Total Cycles</div>
      <div class="text-4xl font-black text-white tabular-nums">{runs.length}</div>
    </div>
    <div class="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-sm">
      <div class="text-[10px] font-black uppercase tracking-[0.25em] text-white/30 mb-1">Active Pipeline</div>
      <div class="text-2xl font-black text-blue-400">ingest.pdf.ocr</div>
    </div>
    <div class="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-sm">
      <div class="text-[10px] font-black uppercase tracking-[0.25em] text-white/30 mb-1">Queue Fabric</div>
      <div class="text-2xl font-black text-emerald-400">RabbitMQ / AMQP</div>
    </div>
  </div>

  <div class="space-y-4">
    {#if runs.length === 0}
      <div class="py-24 text-center border border-white/10 border-dashed rounded-3xl bg-white/5">
        <div class="text-4xl mb-4 opacity-20">📭</div>
        <p class="text-white/40 font-medium">No active workflow records in current session.</p>
      </div>
    {:else}
      {#each runs as run (run.workflowRunId)}
        <div 
          transition:slide
          class="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 hover:bg-white/[0.08] transition-all shadow-xl"
        >
          <div class="flex flex-wrap items-start justify-between gap-6 relative z-10">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-3 mb-3">
                <span class="text-xl">{run.transport === 'rabbitmq' ? '🐇' : '🏠'}</span>
                <h3 class="text-lg font-black text-white truncate max-w-md">{run.fileName}</h3>
                <span class={`px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${getStatusColor(run.status)}`}>
                  {run.status}
                </span>
              </div>
              
              <p class="text-white/50 text-sm mb-4 italic font-medium line-clamp-1">
                {run.message}
              </p>

              <div class="flex flex-wrap items-center gap-6 text-[10px] font-bold text-white/30 uppercase tracking-widest">
                <div class="flex items-center gap-2">
                  <span class="opacity-50">Run ID:</span>
                  <span class="text-blue-400/80 font-mono text-[11px] lowercase tracking-normal">
                    {run.workflowRunId.slice(0, 12)}...
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="opacity-50">Transport:</span>
                  <span class="text-white/60">{run.transport}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="opacity-50">Updated:</span>
                  <span class="text-white/60">{new Date(run.updatedAt).toLocaleTimeString()}</span>
                </div>
              </div>
            </div>

            <div class="flex flex-col items-end gap-3 min-w-[140px]">
              <div class="text-3xl font-black text-white/40 tabular-nums">
                {run.progress}%
              </div>
              <div class="w-full bg-white/10 h-1.5 rounded-full overflow-hidden border border-white/5">
                <div 
                  class="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-700 ease-out shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                  style={`width: ${run.progress}%`}
                ></div>
              </div>
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

