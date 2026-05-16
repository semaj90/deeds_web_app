<script lang="ts">
  import { slide } from 'svelte/transition';
  
  let { hits = [], graphPaths = [] } = $props();

  const localHits = $derived(hits.filter(h => !h.signals?.isExternal));
  const externalHits = $derived(hits.filter(h => h.signals?.isExternal));
</script>

<div class="space-y-2 font-sans">
  {#if localHits.length > 0}
    <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-2 overflow-hidden">
      <h4 class="text-[10px] text-zinc-500 uppercase tracking-tighter mb-1 px-1">Local Codebase Truth</h4>
      <div class="space-y-1">
        {#each localHits.slice(0, 3) as hit}
          <div class="flex items-center justify-between text-[11px] hover:bg-zinc-800 p-1 rounded transition-colors group cursor-default">
            <span class="text-emerald-400 font-mono truncate max-w-[70%]">{hit.sourcePath || '—'}</span>
            <div class="flex gap-1 items-center">
              <span class="text-[9px] text-zinc-600 bg-zinc-950 px-1 rounded border border-zinc-800">TRUST: CANONICAL</span>
              <span class="text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
              </span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if externalHits.length > 0}
    <div class="bg-blue-500/5 border border-blue-500/10 rounded-lg p-2 overflow-hidden">
      <h4 class="text-[10px] text-blue-400/60 uppercase tracking-tighter mb-1 px-1">External Documentation Lane</h4>
      <div class="space-y-1">
        {#each externalHits.slice(0, 3) as hit}
          <div class="flex items-center justify-between text-[11px] hover:bg-blue-500/10 p-1 rounded transition-colors group cursor-default">
            <div class="flex flex-col">
              <span class="text-blue-300 font-medium truncate">{hit.title || '—'}</span>
              <span class="text-[9px] text-blue-500/60 font-mono uppercase">{hit.payload?.sourceId || 'official_docs'} · {hit.payload?.version || 'latest'}</span>
            </div>
            <div class="flex gap-1 items-center">
              <span class="text-[9px] text-blue-500/60 bg-blue-950/20 px-1 rounded border border-blue-500/20">TRUST: {hit.signals?.trustTier?.replace('_', ' ') || 'HIGH'}</span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if graphPaths.length > 0}
    <div class="bg-purple-500/5 border border-purple-500/10 rounded-lg p-2 overflow-hidden">
      <h4 class="text-[10px] text-purple-400/60 uppercase tracking-tighter mb-1 px-1 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        Topological Impact Path
      </h4>
      <div class="flex items-center gap-1 text-[9px] text-purple-400/80 font-mono italic px-1">
        <span>{graphPaths[0].nodes?.length || 0} nodes</span>
        <span class="text-zinc-700">/</span>
        <span>{graphPaths[0].rels?.length || 0} relationships</span>
      </div>
    </div>
  {/if}
</div>
