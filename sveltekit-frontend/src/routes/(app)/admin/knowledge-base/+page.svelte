<script lang="ts">
  import type { PageData } from './$types';
  import { onMount } from 'svelte';
  import { fade, slide, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  
  let { data }: { data: PageData } = $props();
  let mounted = $state(false);
  let status = $state(data.status);
  let searchQuery = $state('');
  let searchResults = $state([]);
  let searching = $state(false);
  let refreshing = $state(false);

  onMount(() => {
    mounted = true;
  });

  async function refreshStatus() {
    refreshing = true;
    try {
      const res = await fetch('/api/wiki/status');
      const data = await res.json();
      if (data.success) {
        status = data.status;
      }
    } finally {
      refreshing = false;
    }
  }

  async function performSearch() {
    if (!searchQuery) {
      searchResults = [];
      return;
    }
    searching = true;
    try {
      const res = await fetch(`/api/wiki/search?query=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data.success) {
        searchResults = data.results;
      }
    } finally {
      searching = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') performSearch();
  }
</script>

<div class="kb-container p-6 lg:p-10">
  <header class="mb-12" in:fly={{ y: -20, duration: 800, easing: cubicOut }}>
    <div class="flex items-center gap-4 mb-2">
      <div class="w-12 h-1 text-accent bg-accent rounded-full animate-pulse"></div>
      <span class="text-xs font-mono tracking-widest uppercase opacity-60">Knowledge Core / AGENTS</span>
    </div>
    <div class="flex justify-between items-end">
      <div>
        <h1 class="text-4xl font-bold tracking-tight text-white mb-4">
          Knowledge Base <span class="text-accent italic">Manager</span>
        </h1>
        <p class="text-lg text-white/50 max-w-2xl leading-relaxed">
          Centralized administration for the Deeds Web App codebase synthesis.
          Monitor Karpathy cards, AGENTS directory parity, and FeatureMap compilation health.
        </p>
      </div>
      <button 
        onclick={refreshStatus}
        disabled={refreshing}
        class="px-6 py-3 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent text-sm font-bold flex items-center gap-2 transition-all active:scale-95 border border-accent/20"
      >
        <span class="i-carbon-renew {refreshing ? 'animate-spin' : ''}"></span>
        Refresh Status
      </button>
    </div>
  </header>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
    <!-- Page Count -->
    <div class="stat-card" in:fly={{ y: 20, delay: 100, duration: 600 }}>
      <div class="stat-icon i-carbon-document text-blue-400"></div>
      <div class="stat-label">Synthesis Pages</div>
      <div class="stat-value">{status.pageCount.toLocaleString()}</div>
      <div class="stat-sub">Enhanced Graph Mappings</div>
      <div class="stat-glow bg-blue-500/10"></div>
    </div>

    <!-- Directory Count -->
    <div class="stat-card" in:fly={{ y: 20, delay: 200, duration: 600 }}>
      <div class="stat-icon i-carbon-folder text-magenta-400"></div>
      <div class="stat-label">Directory Nodes</div>
      <div class="stat-value">{status.directoryCount.toLocaleString()}</div>
      <div class="stat-sub">Tracked in codebase-graph.json</div>
      <div class="stat-glow bg-magenta-500/10"></div>
    </div>

    <!-- Redis Cards -->
    <div class="stat-card" in:fly={{ y: 20, delay: 300, duration: 600 }}>
      <div class="stat-icon i-carbon-flash text-amber-400"></div>
      <div class="stat-label">Active Cards</div>
      <div class="stat-value">{status.redis.agentsCards + status.redis.karpathyCards}</div>
      <div class="stat-sub">{status.redis.agentsCards} Agents / {status.redis.karpathyCards} Karpathy</div>
      <div class="stat-glow bg-amber-500/10"></div>
    </div>

    <!-- Last Graphify -->
    <div class="stat-card" in:fly={{ y: 20, delay: 400, duration: 600 }}>
      <div class="stat-icon i-carbon-time text-emerald-400"></div>
      <div class="stat-label">Last Graphify</div>
      <div class="stat-value text-xl!">{status.lastGraphify ? new Date(status.lastGraphify).toLocaleDateString() : 'N/A'}</div>
      <div class="stat-sub">{status.lastGraphify ? new Date(status.lastGraphify).toLocaleTimeString() : 'Never'}</div>
      <div class="stat-glow bg-emerald-500/10"></div>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-10">
    <!-- Left: Search & Results -->
    <div class="lg:col-span-2 space-y-8">
      <section class="space-y-4">
        <h2 class="text-xl font-bold text-white flex items-center gap-2">
          <span class="i-carbon-search opacity-50"></span>
          Knowledge Search
        </h2>
        <div class="relative group">
          <input 
            type="text" 
            bind:value={searchQuery}
            onkeydown={handleKeydown}
            placeholder="Search summaries, paths, or labels..."
            class="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-accent/40 transition-all placeholder:opacity-30"
          />
          <button 
            onclick={performSearch}
            class="absolute right-3 top-3 p-2 rounded-xl bg-accent text-black hover:bg-accent/80 transition-all active:scale-90"
          >
            <span class={searching ? 'i-carbon-renew animate-spin' : 'i-carbon-arrow-right'}></span>
          </button>
        </div>
      </section>

      {#if searchResults.length > 0}
        <section class="space-y-4" in:fade>
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold uppercase tracking-widest opacity-40">Search Results ({searchResults.length})</h3>
          </div>
          <div class="grid grid-cols-1 gap-4">
            {#each searchResults as res, i}
              <div class="result-row group" in:fly={{ y: 10, delay: i * 50 }}>
                <div class="flex justify-between items-start mb-2">
                  <div>
                    <span class="text-xs font-mono text-accent/60 uppercase mb-1 block">{res.kind}</span>
                    <h4 class="text-lg font-bold text-white/90 group-hover:text-accent transition-colors">{res.label}</h4>
                  </div>
                  <span class="text-[10px] font-mono opacity-30">{res.id}</span>
                </div>
                <p class="text-sm text-white/50 line-clamp-2 mb-4 leading-relaxed">{res.summary}</p>
                <div class="flex items-center justify-between pt-4 border-t border-white/5">
                  <div class="text-[10px] font-mono opacity-40 truncate max-w-sm">{res.path}</div>
                  <button class="text-xs font-bold text-accent/80 hover:text-accent flex items-center gap-1">
                    Details <span class="i-carbon-chevron-right"></span>
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {:else if searchQuery && !searching}
        <div class="text-center py-20 opacity-30">
          <div class="i-carbon-search-locate text-4xl mx-auto mb-4"></div>
          <p>No matching knowledge cards found.</p>
        </div>
      {/if}
    </div>

    <!-- Right: Sidebar -->
    <div class="space-y-8">
      <!-- Stale Directories -->
      <section class="space-y-4">
        <h2 class="text-xl font-bold text-white flex items-center gap-2">
          <span class="i-carbon-warning-alt opacity-50"></span>
          Stale Nodes
        </h2>
        <div class="glass-panel p-6 space-y-4">
          <p class="text-xs text-white/40 leading-relaxed">
            Nodes present in the codebase graph but missing from the hot-cache. 
            Regenerate to restore parity.
          </p>
          <div class="space-y-2">
            {#each status.staleDirectories as dir}
              <div class="flex items-center justify-between text-xs p-2 rounded bg-white/5 hover:bg-white/10 transition-colors">
                <span class="font-mono truncate max-w-[12rem] opacity-70">{dir}</span>
                <button class="text-accent hover:underline">Sync</button>
              </div>
            {/each}
            {#if status.staleDirectories.length === 0}
              <div class="text-emerald-400 text-xs flex items-center gap-2 py-2">
                <span class="i-carbon-checkmark-filled"></span>
                All nodes hydrated
              </div>
            {/if}
          </div>
          <button class="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] font-bold tracking-widest uppercase transition-all border border-white/10 mt-4">
            Rebuild All Stale
          </button>
        </div>
      </section>

      <!-- Pipeline Actions -->
      <section class="space-y-4">
        <h2 class="text-xl font-bold text-white flex items-center gap-2">
          <span class="i-carbon-assembly-cluster opacity-50"></span>
          Synthesis Pipeline
        </h2>
        <div class="glass-panel p-6 space-y-3">
          <button class="action-btn">
            <span class="i-carbon-graph-3"></span>
            Regenerate Graphify
          </button>
          <button class="action-btn">
            <span class="i-carbon-cube"></span>
            Compile FeatureMaps
          </button>
          <button class="action-btn">
            <span class="i-carbon-chemistry"></span>
            Sync Neo4j / AST
          </button>
          <button class="action-btn text-red-400! border-red-500/20! hover:bg-red-500/10!">
            <span class="i-carbon-trash-can"></span>
            Flush Cache Bus
          </button>
        </div>
      </section>
    </div>
  </div>
</div>

<style>
  :global(body) {
    background-color: #05070a;
    background-image: 
      radial-gradient(circle at 0% 0%, rgba(31, 58, 138, 0.15) 0%, transparent 50%),
      radial-gradient(circle at 100% 100%, rgba(139, 92, 246, 0.1) 0%, transparent 50%);
  }

  .kb-container {
    font-family: 'Outfit', sans-serif;
  }

  .text-accent {
    color: #8adfff;
  }

  .bg-accent {
    background-color: #8adfff;
  }

  .stat-card {
    position: relative;
    padding: 2rem;
    background: rgba(14, 21, 35, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 2rem;
    overflow: hidden;
    backdrop-filter: blur(20px);
    transition: transform 0.3s cubic-bezier(0.2, 1, 0.3, 1), border-color 0.3s ease;
  }

  .stat-card:hover {
    transform: translateY(-4px) scale(1.02);
    border-color: rgba(138, 223, 255, 0.3);
  }

  .stat-icon {
    font-size: 2.5rem;
    margin-bottom: 1.5rem;
    opacity: 0.8;
  }

  .stat-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(255, 255, 255, 0.4);
    margin-bottom: 0.5rem;
  }

  .stat-value {
    font-size: 2.5rem;
    font-weight: 800;
    color: white;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: -0.05em;
  }

  .stat-sub {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.3);
    margin-top: 0.25rem;
  }

  .stat-glow {
    position: absolute;
    top: -50%;
    right: -50%;
    width: 200%;
    height: 200%;
    pointer-events: none;
    z-index: -1;
  }

  .result-row {
    padding: 1.5rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 1.5rem;
    transition: all 0.2s ease;
  }

  .result-row:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(138, 223, 255, 0.2);
    transform: translateX(4px);
  }

  .glass-panel {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 1.5rem;
    backdrop-filter: blur(10px);
  }

  .action-btn {
    width: 100%;
    padding: 1rem;
    display: flex;
    items-center;
    gap: 3;
    font-size: 0.75rem;
    font-weight: 600;
    color: white/80;
    background: white/5;
    border: 1px solid white/5;
    border-radius: 1rem;
    transition: all 0.2s ease;
  }

  .action-btn:hover {
    background: white/10;
    border-color: white/10;
    color: white;
    transform: translateY(-2px);
  }

  .action-btn span {
    font-size: 1.25rem;
    opacity: 0.6;
  }
</style>
