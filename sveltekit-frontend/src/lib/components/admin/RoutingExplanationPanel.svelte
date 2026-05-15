<script lang="ts">
  import type { RoutingExplanation } from '$lib/server/retrieval/routing-explanation';
  import { slide, fade } from 'svelte/transition';

  let { explanation }: { explanation: RoutingExplanation | undefined } = $props();

  function getLaneColor(lane: string) {
    switch (lane) {
      case 'lexical': return 'text-amber-400';
      case 'topology': return 'text-cyan-400';
      case 'task': return 'text-emerald-400';
      case 'profile': return 'text-purple-400';
      default: return 'text-zinc-400';
    }
  }
</script>

{#if explanation}
  <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-[11px] font-mono space-y-3" transition:slide>
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-zinc-800 pb-2 mb-2">
      <span class="text-zinc-500 uppercase tracking-tighter">Manifold4 Routing</span>
      <span class="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 uppercase">{explanation.profile}</span>
    </div>

    <!-- Cluster Lanes -->
    <div class="grid grid-cols-2 gap-2">
      <div class="space-y-1">
        <span class="text-zinc-600 block">LEXICAL Discovery</span>
        <div class="flex flex-wrap gap-1">
          {#each explanation.lexicalClusters as id}
            <span class="px-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded">{id}</span>
          {/each}
          {#if explanation.lexicalClusters.length === 0}
            <span class="text-zinc-700 italic">none</span>
          {/if}
        </div>
      </div>
      <div class="space-y-1">
        <span class="text-zinc-600 block">TOPOLOGY Routing</span>
        <div class="flex flex-wrap gap-1">
          {#each explanation.topologyClusters as id}
            <span class="px-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded">{id}</span>
          {/each}
        </div>
      </div>
    </div>

    <!-- Final Strategy -->
    <div class="space-y-1">
      <span class="text-zinc-600 block">FINAL Routed Clusters</span>
      <div class="flex flex-wrap gap-1">
        {#each explanation.finalClusters as id}
          <span class="px-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded" title={explanation.clusterAliases.find(a => a.includes(id)) || id}>
            {id}
          </span>
        {/each}
      </div>
    </div>

    <!-- Aliases -->
    {#if explanation.clusterAliases.length > 0}
      <div class="space-y-1">
        <span class="text-zinc-600 block">ARCHITECTURAL Aliases</span>
        <div class="flex flex-wrap gap-1">
          {#each explanation.clusterAliases as alias}
            <span class="text-zinc-400 underline decoration-zinc-800 underline-offset-2">{alias}</span>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Task -->
    {#if explanation.taskDistillate}
      <div class="pt-2 border-t border-zinc-800">
        <span class="text-emerald-500 block">PLAYBOOK: {explanation.taskDistillate}</span>
      </div>
    {/if}

    <!-- Fallbacks -->
    {#if explanation.fallbacks.length > 0}
      <div class="pt-2 border-t border-zinc-800 space-y-1">
        {#each explanation.fallbacks as fb}
          <div class="flex items-center gap-1 text-red-400/80 italic">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            <span>{fb}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
