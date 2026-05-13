<script lang="ts">
  import type { PageData } from './$types';
  import { onMount } from 'svelte';
  import { fade, slide, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  let { data }: { data: PageData } = $props();
  let mounted = $state(false);
  let status = $state<PageData['status'] | null>(null);
  let currentStatus = $derived(status ?? data.status);
  let searchQuery = $state('');
  let searchResults = $state([]);
  let searching = $state(false);
  let refreshing = $state(false);
  let selectedId = $state<string | null>(null);
  let cardDetails = $state<any>(null);
  let loadingDetails = $state(false);
  let degradedLaneMessages = $derived([
    currentStatus.qdrant.pointCount === 0 ? 'Qdrant vector lane unavailable' : null,
    currentStatus.neo4j.agentsCardCount === 0 ? 'Neo4j graph lane unavailable' : null,
    currentStatus.featureMap?.dryRunOnly ? 'FeatureMap dry-run only' : null,
  ].filter(Boolean) as string[]);

  $effect(() => {
    status = data.status;
  });

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
      const res = await fetch('/api/wiki/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, limit: 10 })
      });
      const data = await res.json();
      if (data.success) {
        searchResults = data.results;
      }
    } finally {
      searching = false;
    }
  }

  async function inspectCard(id: string) {
    selectedId = id;
    loadingDetails = true;
    cardDetails = null;
    try {
      const res = await fetch(`/api/wiki/page/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (data.success) {
        cardDetails = data.page;
      }
    } finally {
      loadingDetails = false;
    }
  }

  async function syncNode(path: string) {
    try {
      const res = await fetch('/api/wiki/refresh-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, dryRun: true })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Refresh preview ready for ${path}`);
        refreshStatus();
      }
    } catch (e) {
      alert('Sync failed');
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') performSearch();
  }

  // Helper for NES glyph rendering
  function getGlyphColor(bit: number, mask: number) {
    return (mask & bit) ? 'bg-accent' : 'bg-white/5';
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

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6 mb-12">
    <!-- Page Count -->
    <div class="stat-card" in:fly={{ y: 20, delay: 100, duration: 600 }}>
      <div class="stat-icon i-carbon-document text-blue-400"></div>
      <div class="stat-label">Synthesis Pages</div>
      <div class="stat-value">{currentStatus.pageCount.toLocaleString()}</div>
      <div class="stat-sub">Enhanced Mappings</div>
      <div class="stat-glow bg-blue-500/10"></div>
    </div>

    <!-- Qdrant -->
    <div class="stat-card" in:fly={{ y: 20, delay: 200, duration: 600 }}>
      <div class="stat-icon i-carbon-vector text-emerald-400"></div>
      <div class="stat-label">Qdrant Points</div>
      <div class="stat-value">{currentStatus.qdrant.pointCount.toLocaleString()}</div>
      <div class="stat-sub">{currentStatus.qdrant.collection ?? 'codebase_chunks_768'}</div>
      <div class="stat-glow bg-emerald-500/10"></div>
    </div>

    <!-- CouchDB -->
    <div class="stat-card" in:fly={{ y: 20, delay: 250, duration: 600 }}>
      <div class="stat-icon i-carbon-data-base text-cyan-400"></div>
      <div class="stat-label">CouchDB Wiki Docs</div>
      <div class="stat-value">{(currentStatus.couchdb?.docCount ?? currentStatus.couchdbWikiDocCount ?? 0).toLocaleString()}</div>
      <div class="stat-sub">Durable wiki layer</div>
      <div class="stat-glow bg-cyan-500/10"></div>
    </div>

    <!-- Neo4j -->
    <div class="stat-card" in:fly={{ y: 20, delay: 300, duration: 600 }}>
      <div class="stat-icon i-carbon-network-4 text-magenta-400"></div>
      <div class="stat-label">Graph Nodes</div>
      <div class="stat-value">{currentStatus.neo4j.agentsCardCount.toLocaleString()}</div>
      <div class="stat-sub">Neo4j AgentsCards</div>
      <div class="stat-glow bg-magenta-500/10"></div>
    </div>

    <!-- Redis Cards -->
    <div class="stat-card" in:fly={{ y: 20, delay: 400, duration: 600 }}>
      <div class="stat-icon i-carbon-flash text-amber-400"></div>
      <div class="stat-label">Active Cards</div>
      <div class="stat-value">{currentStatus.redis.agentsCards + currentStatus.redis.wikiPages}</div>
      <div class="stat-sub">{currentStatus.redis.agentsCards} Dir / {currentStatus.redis.wikiPages} Page</div>
      <div class="stat-glow bg-amber-500/10"></div>
    </div>

    <!-- Last Graphify -->
    <div class="stat-card" in:fly={{ y: 20, delay: 500, duration: 600 }}>
      <div class="stat-icon i-carbon-time text-emerald-400"></div>
      <div class="stat-label">Last Graphify</div>
      <div class="stat-value text-xl!">{currentStatus.lastGraphify ? new Date(currentStatus.lastGraphify).toLocaleDateString() : 'N/A'}</div>
      <div class="stat-sub">{currentStatus.lastGraphify ? new Date(currentStatus.lastGraphify).toLocaleTimeString() : 'Never'}</div>
      <div class="stat-glow bg-emerald-500/10"></div>
    </div>
  </div>

  {#if degradedLaneMessages.length > 0}
    <section class="mb-10 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-5 text-amber-100" in:fade>
      <div class="flex items-start gap-3">
        <span class="i-carbon-warning-alt text-xl mt-0.5"></span>
        <div class="space-y-2">
          <p class="font-semibold">Operational with degraded lane:</p>
          <ul class="space-y-1 text-sm text-amber-100/90">
            {#each degradedLaneMessages as message}
              <li>- {message}</li>
            {/each}
          </ul>
        </div>
      </div>
    </section>
  {/if}

  <div class="grid grid-cols-1 lg:grid-cols-4 gap-10">
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
            class="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-accent/40 transition-all placeholder:opacity-30 shadow-2xl"
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
              <button
                class="result-row group text-left w-full"
                onclick={() => inspectCard(res.id)}
                in:fly={{ y: 10, delay: i * 50 }}
              >
                <div class="flex justify-between items-start mb-2">
                  <div>
                    <span class="text-xs font-mono text-accent/60 uppercase mb-1 block">{res.kind}</span>
                    <h4 class="text-lg font-bold text-white/90 group-hover:text-accent transition-colors">{res.label}</h4>
                  </div>
                  <span class="text-[10px] font-mono opacity-30">{res.id}</span>
                </div>
                <p class="text-sm text-white/50 line-clamp-2 mb-4 leading-relaxed">{res.summary}</p>
                <div class="flex items-center justify-between pt-4 border-t border-white/5">
                  <div class="text-[10px] font-mono opacity-40 truncate max-w-[250px]">{res.path}</div>
                  <div class="text-xs font-bold text-accent/80 flex items-center gap-1">
                    Inspect <span class="i-carbon-chevron-right"></span>
                  </div>
                </div>
              </button>
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

    <!-- Center: Card Inspector -->
    <div class="lg:col-span-1">
      <section class="space-y-4 sticky top-6">
        <h2 class="text-xl font-bold text-white flex items-center gap-2">
          <span class="i-carbon-document-view opacity-50"></span>
          Card Inspector
        </h2>

        {#if loadingDetails}
          <div class="glass-panel p-10 text-center space-y-4">
            <div class="i-carbon-renew animate-spin text-3xl text-accent mx-auto"></div>
            <p class="text-sm opacity-40">Loading details...</p>
          </div>
        {:else if cardDetails}
          <div class="glass-panel overflow-hidden" in:fade>
            <!-- Header with Glyph -->
            <div class="p-6 bg-accent/5 border-b border-white/5 flex items-center gap-4">
              {#if cardDetails.feature?.glyph}
                <div class="grid grid-cols-8 gap-0.5 w-12 h-12 bg-black/40 p-1 rounded border border-white/10">
                  {#each Array.from({ length: 64 }) as _, i}
                    <div class="w-1 h-1 {getGlyphColor(1 << (i % 8), cardDetails.feature.glyph.mask)}"></div>
                  {/each}
                </div>
              {/if}
              <div>
                <h3 class="text-lg font-bold text-white">{cardDetails.mapping.label}</h3>
                <p class="text-[10px] font-mono opacity-40">{cardDetails.mapping.id}</p>
              </div>
            </div>

            <div class="p-6 space-y-6">
              <!-- Summary -->
              <div class="space-y-2">
                <span class="text-[10px] font-bold uppercase tracking-widest opacity-30">Summary</span>
                <p class="text-sm text-white/70 leading-relaxed">{cardDetails.mapping.summary}</p>
              </div>

              <!-- Feature Info -->
              {#if cardDetails.feature}
                <div class="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-bold text-accent uppercase">Feature Map</span>
                    <span class="px-2 py-0.5 rounded-full bg-accent/20 text-[9px] font-bold text-accent uppercase">
                      {cardDetails.feature.status}
                    </span>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <div class="badge {cardDetails.feature.glyph.mask & 1 ? 'active' : ''}">Types</div>
                    <div class="badge {cardDetails.feature.glyph.mask & 2 ? 'active' : ''}">Service</div>
                    <div class="badge {cardDetails.feature.glyph.mask & 4 ? 'active' : ''}">Route</div>
                    <div class="badge {cardDetails.feature.glyph.mask & 16 ? 'active' : ''}">Test</div>
                    <div class="badge {cardDetails.feature.glyph.mask & 32 ? 'active' : ''}">Docs</div>
                  </div>
                </div>
              {/if}

              <!-- Memory Sticks -->
              {#if cardDetails.memorySticks?.length > 0}
                <div class="space-y-2">
                  <span class="text-[10px] font-bold uppercase tracking-widest opacity-30">Memory Sticks</span>
                  <div class="space-y-2">
                    {#each cardDetails.memorySticks as stick}
                      <div class="text-[10px] p-2 rounded bg-black/20 font-mono flex justify-between items-center group">
                        <span class="opacity-50 truncate max-w-[100px]">{stick.queryHash}</span>
                        <div class="flex gap-1">
                          {#each Object.entries(stick.rewardSignals) as [key, val]}
                            <span class="px-1 bg-accent/10 rounded text-accent" title={key}>{val}</span>
                          {/each}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Retrieval Trace -->
              {#if cardDetails.mapping.trace || (cardDetails.wikiCard && cardDetails.wikiCard.trace)}
                {@const trace = cardDetails.mapping.trace || cardDetails.wikiCard.trace}
                <div class="space-y-2">
                  <span class="text-[10px] font-bold uppercase tracking-widest opacity-30">Retrieval Trace (Pentagon)</span>
                  <div class="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 space-y-3">
                    <div class="grid grid-cols-2 gap-3">
                      <div class="trace-pill">
                        <span class="i-carbon-query text-blue-400"></span>
                        <span class="label">Seed</span>
                        <span class="val">{trace.seedHits}</span>
                      </div>
                      <div class="trace-pill">
                        <span class="i-carbon-code text-emerald-400"></span>
                        <span class="label">Impl</span>
                        <span class="val">{trace.implementationNodes}</span>
                      </div>
                      <div class="trace-pill">
                        <span class="i-carbon-tree-view text-amber-400"></span>
                        <span class="label">Deps</span>
                        <span class="val">{trace.dependencyNodes}</span>
                      </div>
                      <div class="trace-pill">
                        <span class="i-carbon-connect text-magenta-400"></span>
                        <span class="label">Interface</span>
                        <span class="val">{trace.interfaceNodes}</span>
                      </div>
                      <div class="trace-pill">
                        <span class="i-carbon-database text-blue-300"></span>
                        <span class="label">Storage</span>
                        <span class="val">{trace.storageNodes}</span>
                      </div>
                    </div>
                    {#if trace.agentsContextUsed}
                      <div class="text-[9px] font-bold text-blue-300 flex items-center gap-1">
                        <span class="i-carbon-checkmark-filled"></span>
                        AGENTS Context Integrated
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}

              <!-- Recommendations -->
              <div class="space-y-2">
                <span class="text-[10px] font-bold uppercase tracking-widest opacity-30">Recommendations</span>
                <ul class="space-y-1">
                  {#each cardDetails.recommendations as rec}
                    <li class="text-[11px] text-white/50 flex gap-2">
                      <span class="text-accent">•</span> {rec}
                    </li>
                  {/each}
                </ul>
              </div>
            </div>
          </div>
        {:else}
          <div class="glass-panel p-10 text-center opacity-20 border-dashed">
            <div class="i-carbon-intent-request-scale-in text-4xl mx-auto mb-4"></div>
            <p class="text-sm">Select a card to inspect metadata</p>
          </div>
        {/if}
      </section>
    </div>

    <!-- Right: Sidebar -->
    <div class="space-y-8 lg:col-span-1">
      <!-- Stale Directories -->
      <section class="space-y-4">
        <h2 class="text-xl font-bold text-white flex items-center gap-2">
          <span class="i-carbon-warning-alt opacity-50"></span>
          Stale Nodes
        </h2>
        <div class="glass-panel p-6 space-y-4">
          <p class="text-xs text-white/40 leading-relaxed">
            Nodes present in the codebase graph but missing from the hot-cache.
          </p>
          <div class="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {#each currentStatus.staleDirectories as dir}
              <div class="flex items-center justify-between text-xs p-2 rounded bg-white/5 hover:bg-white/10 transition-colors group">
                <span class="font-mono truncate max-w-[150px] opacity-70">{dir}</span>
                <button
                  onclick={() => syncNode(dir)}
                  class="text-accent hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                >Preview</button>
              </div>
            {/each}
            {#if currentStatus.staleDirectories.length === 0}
              <div class="text-emerald-400 text-xs flex items-center gap-2 py-2">
                <span class="i-carbon-checkmark-filled"></span>
                All nodes hydrated
              </div>
            {/if}
          </div>
          <button class="w-full py-3 rounded-xl bg-accent/5 hover:bg-accent/10 text-[10px] font-bold tracking-widest uppercase transition-all border border-accent/10 mt-4">
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
    padding: 1.5rem;
    background: rgba(14, 21, 35, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 1.5rem;
    overflow: hidden;
    backdrop-filter: blur(20px);
    transition: all 0.3s cubic-bezier(0.2, 1, 0.3, 1);
  }

  .stat-card:hover {
    transform: translateY(-4px);
    border-color: rgba(138, 223, 255, 0.3);
    background: rgba(14, 21, 35, 0.8);
  }

  .stat-icon {
    font-size: 2rem;
    margin-bottom: 1rem;
    opacity: 0.8;
  }

  .stat-label {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(255, 255, 255, 0.4);
    margin-bottom: 0.25rem;
  }

  .stat-value {
    font-size: 2rem;
    font-weight: 800;
    color: white;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: -0.05em;
  }

  .stat-sub {
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.2);
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
    background: rgba(14, 21, 35, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 1.5rem;
    backdrop-filter: blur(20px);
  }

  .action-btn {
    width: 100%;
    padding: 1rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.8);
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 1rem;
    transition: all 0.2s ease;
  }

  .action-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.1);
    color: white;
    transform: translateY(-2px);
  }

  .action-btn span {
    font-size: 1.25rem;
    opacity: 0.6;
  }

  .badge {
    padding: 2px 8px;
    border-radius: 99px;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.3);
    border: 1px solid transparent;
  }

  .badge.active {
    background: rgba(138, 223, 255, 0.1);
    color: #8adfff;
    border-color: rgba(138, 223, 255, 0.3);
  }

  .trace-pill {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 0.75rem;
  }

  .trace-pill span {
    font-size: 1rem;
  }

  .trace-pill .label {
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    opacity: 0.4;
    flex-grow: 1;
  }

  .trace-pill .val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    font-weight: 700;
    color: white;
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
  }
</style>
