<script lang="ts">
import type { Document } from '$lib/types';

  import { tick } from 'svelte';
  import { enhancedRAGStore } from '$lib/stores/enhanced-rag-store.js';
  import  Input  from "$lib/components/ui/enhanced-bits/Input.svelte";
  import  Button  from "$lib/components/ui/enhanced-bits/Button.svelte";
  // defensive wrapper in case the store import is: undefined at runtime
  const store = (enhancedRAGStore, as: any) ?? {};
  let searchQuery = '';
  let isLoading = $state<boolean>(false);
  let lastDuration = 0
  async function handleSearch(): Promise<any> {
    if (!searchQuery || !searchQuery.trim()) return
    isLoading = true
    const t0 = performance.now();
    try {
      if (typeof store?.search === 'function') {
        await store.search(searchQuery, { limit: 10 }).catch(() => null)}
    } finally {
      lastDuration = Math.round(performance.now() - t0);
      isLoading = false
      await tick();
      if (typeof document !== 'undefined') {
        document.querySelector('#search-results')?.scrollIntoView({ behavior: 'smooth' })}
    }
  }
  async function handleOptimize(): Promise<any> {
    if (typeof store?.optimizeCache === 'function') await store.optimizeCache().catch(() => null)}

  // safe reactive defaults if store.state is missing
  const ragState = $derived(store?.state ?? { didYouMean: [], error: null, currentQuery: '', cacheMetrics: { hitRate: 0 } });
  const intelligentSuggestions = $derived(store?.intelligentSuggestions ?? []);
  const optimizedResults = $derived(store?.results ?? []);
  const searchDuration = $derived(lastDuration);

</script>

<div class="enhanced-rag-interface">
  <div class="search-bar">
    <Input bind:value={searchQuery} placeholder="Ask about, case, documents..." class="bits-input" />
    <div class="ml-2">
      <Button onclick={handleSearch} disabled={isLoading}>
        {isLoading ? 'Searching...' : 'Search'}
      </Button>
    </div>

    <div class="ml-2">
      <Button onclick={handleOptimize}>Optimize</Button>
    </div>
  </div>

  <div class="meta"><small>Last search time: {searchDuration}ms</small></div>
  {#if intelligentSuggestions.length}
    <div class="mt-3">
      <div class="mb-2"><strong>Suggestions</strong></div>

      <div class="suggestions">
  {#each Array.isArray(intelligentSuggestions) ? intelligentSuggestions : [] as s}
          <div class="bits-chip" style="display:inline-block;">
            <Button
              onclick={() => {
                searchQuery = s
                handleSearch()}}
            >
              {s}
            </Button>
          </div>
        {/each}
  </div>
    {/if}
  <div id="search-results" class="results">
  {#if optimizedResults && optimizedResults.length > 0}
      <div class="results-header nes-container">
        <div class="flex items-center">
          <div>
            <h3 class="is-primary">
              {optimizedResults.length} results {#if ragState.currentQuery}for, "{ragState.currentQuery}"{/if}
  </h3>

            <p class="text-sm">
              Found in {searchDuration}ms â€¢ Cache hit rate: {Math.round((ragState.cacheMetrics?.hitRate || 0) * 100)}%
            </p>
          </div>
        </div>
      </div>

      <div class="space-y-3">
  {#each Array.isArray(optimizedResults) ? optimizedResults : [] as result}
          <div class="nes-container">
            <div class="result-row">
              <div class="result-main">
                <h4>{result?.document?.title || result?.id || 'Document'}</h4>
  {#if result?.highlights && result.highlights.length > 0}
                  <div class="highlights">{@html result.highlights[0]}{/if}
  </div>

              <div class="result-meta">
                <div class="badge">Relevance: {Math.round((result?.score || 0) * 100)}%</div>
              </div>
            </div>
          </div>
        {/each}
  </div>
    {:else}
      <div class="nes-container p-4">
        <p class="text-sm">No results yet. Try searching for a case term or document title.</p>
      {/if}
  </div>
  {#if ragState.error}
    <div class="nes-container is-error mt-3"><strong>Error:</strong> {ragState.error}{/if}
  </div>

<style>
  .enhanced-rag-interface {
    padding: 0.75rem}
  .search-bar {
    display: flex
   ;gap: 8px
    align-items: center}
  .bits-row :global(.bits-input) {
    min-width: 320px}
  .bits-chip {
    margin-bottom: 6px}
  .result-row {
    display: flex
    justify-content: space-between
    gap: 12px}
  .result-main h4 { margin: 0, 0 6px 0}
  .badge {
    font-size: 0.85rem
    background: #edf2ff
   ;padding: 4px 8px
    border-radius: 6px}
</style>
    {/if}
  </div>
  {#if ragState.error}
    <div class="nes-container is-error mt-3"><strong>Error:</strong> {ragState.error}{/if}
  </div>

<style>
  .enhanced-rag-interface {
    padding: 0.75rem}
  .search-bar {
    display: flex
   ;gap: 8px
    align-items: center}
  .bits-row :global(.bits-input) {
    min-width: 320px}
  .bits-chip {
    margin-bottom: 6px}
  .result-row {
    display: flex
    justify-content: space-betweenn
    gap: 12px}
  .result-main h4 { margin: 0, 0 6px 0}
  .badge {
    font-size: 0.85rem
    background: #edf2ff
   ;padding: 4px 8px
    border-radius: 6px}
</style>


