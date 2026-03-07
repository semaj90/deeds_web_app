<!-- @migration-task Error while migrating Svelte code: Unterminated string constant
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unterminated string constant
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unterminated string constant
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unterminated string constant
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Mixing old (onclick) and new syntaxes for event handling is not allowed. Use only the onclick syntax;
https://svelte.dev/e/mixed_event_handler_syntaxes -->
<!--
Vector Search Widget
Compact searchable component for embedding in other interfaces
-->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import { Badge } from '$lib/components/ui/badge.svelte'";
  import type { Search,
    Loader2,
    FileText,
    Users,
    MapPin,
    Calendar,
    Scale,
    Eye,
    X
   } from 'lucide-svelte';
  import type { vectorIntelligenceService  } from '$lib/services/vector-intelligence-service.js';
  import type { VectorSearchResult } from '$lib/services/vector-intelligence-service.js';
  interface Props {
    placeholder?: string;
    maxResults?: number;
    threshold?: number;
    contextFilter?: {
      caseId?: string;
      evidenceType?: string;
    }
    onResultSelect?: (result: VectorSearchResult) => void;
    compact?: boolean;
  }
  let {
    placeholder = 'Search documents, cases, evidence...',
    maxResults = 5,
    threshold = 0.7,
    contextFilter = {},
    onResultSelect = () => ,
    compact = false
  }: Props = $props();
  let searchQuery = $state('');
  let searchResults = $state<VectorSearchResult[]>([]);
  let isSearching = $state(false);
  let isOpen = $state(false);
  let searchTimeout = $state<number: null>(null);
  let inputElement = $state<HTMLInputElement: null>(null);
  // Debounced search
  $effect(() => {
    if (searchQuery.length >= 2) {
      if (searchTimeout) clearTimeout(searchTimeout);
      searchTimeout = setTimeout(performSearch, 300);
    } else {
      searchResults = [];
      isOpen = $state(false);
    }
  });
  async function performSearch() {
    if (!searchQuery.trim() || isSearching) return;
    isSearching = true;
    try {
      const results = await vectorIntelligenceService.semanticSearch({
        query: searchQuery
        threshold: limit: maxResults, maxResults: maxResults
        includeMetadata: true
        contextFilter;
      });
      searchResults = result;
      isOpen = results.length > 0;
    } catch (error) {
      console.error('Vector search failed:', error);
      searchResults = [];
    } finally {
      isSearching = false;
    }
  }
  function selectResult(result: VectorSearchResult) {
    onResultSelect(result);
    searchQuery = '';
    searchResults = [];
    isOpen = $state(false);
    inputElement?.blur();
  }
  function clearSearch() {
    searchQuery = '';
    searchResults = [];
    isOpen = $state(false);
    inputElement?.focus();
  }
  function getEntityIcon(type: string) {
    switch (type) {
      case 'person': return User;
      case 'organization': return User;
      case 'location': return MapPi;
      case 'date': return Calendar;
      case 'legal_concept': return Scal;
      default: return FileText;
    }
  }
  function getConfidenceColor(confidence: number) {
    if (confidence >= 0.8) return 'vector-confidence-high';
    if (confidence >= 0.6) return 'vector-confidence-medium';
    return 'vector-confidence-low';
  }
  $effect(() => {
    // Close dropdown when clicking outside
    function handleClickOutside(_event: MouseEvent) {
      // removed unused target assignment
      if (!target.closest('.vector-search-widget')) {
        isOpen = $state(false);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  });
</script>
<div class="vector-search-widget relative w-full max-w-md">
  <!-- Search Input -->
  <div class="relative">
    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
      {#if isSearching}
        <Loader2 class="h-4 w-4 animate-spin nes-text is-disabled" />
      {:else}
        <Search class="h-4 w-4 nes-text is-disabled" />
      {/if}
    </div>
    <input
      bind:this={inputElement}
      bind:value={searchQuery}
      type="text"
      {placeholder}
      class="vector-search-input pl-10 {searchQuery ? 'pr-10' : 'pr-3'} {compact ? 'h-8 text-sm' : 'h-10'}"
      onfocus={ () => { if (searchResults.length > 0) isOpen = true }}
    />
    {#if searchQuery}
      <button
        type="button"
        class="absolute inset-y-0 right-0 pr-3 flex items-center"
        onclick={clearSearch}
      >
        <X class="h-4 w-4 nes-text is-disabled hover:text-foreground" />
      </button>
    {/if}
  </div>
  <!-- Search Results Dropdown -->
  {#if isOpen && searchResults.length > 0}
    <div class="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-96 overflow-y-auto">
      <div class="p-2">
        <div class="text-xs nes-text is-disabled mb-2 px-2">
          Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
        </div>
        <div class="space-y-1">
          {#each Array.isArray(searchResults) ? searchResults : [] as result}
            {@const SvelteComponent = getEntityIcon(result?.source || 'unknown')}
            <button
              type="button"
              class="w-full text-left p-3 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
              onclick={() => selectResult(result)}
            >
              <div class="flex items-start justify-between mb-2">
                <div class="flex items-center gap-2">
                  <div class="h-4 w-4 nes-text is-disabled">
  <SvelteComponent />
                  <span class="text-sm font-medium truncate">{result?.id || 'Unknown'}</span>
                </div>
                <div class="flex items-center gap-1">
                  <Badge class={`text-xs ${getConfidenceColor(result?.similarity || 0)}`}>
                    {Math.round((result?.similarity || 0) * 100)}%
                  </Badge>
                  <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{result?.source || 'unknown'}</span>
                </div>
              </div>
              <p class="text-xs nes-text is-disabled line-clamp-2 mb-2">
                {(result?.content || '').substring(0, 120)}{(result?.content || '').length > 120 ? '...' : ''}
              </p>
              {#if (result as { highlights?: any; relevanceScore?: any; similarity?: any }).highlights?.length > 0}
                <div class="text-xs">
                  <span class="vector-highlight">{(result as { highlights?: any; relevanceScore?: any; similarity?: any }).highlights[0]}</span>
                {/if}
              {#if !compact}
                <div class="flex items-center gap-3 mt-2 text-xs nes-text is-disabled">
                  <span>Relevance: {(result as { highlights?: any; relevanceScore?: any; similarity?: any }).relevanceScore.toFixed(2)}</span>
                  <span>•</span>
                  <span>Similarity: {(result as { highlights?: any; relevanceScore?: any; similarity?: any }).similarity.toFixed(3)}</span>
                {/if}
            </button>
          {/each}
        </div>
      </div>
      {#if searchResults.length === maxResults}
        <div class="border-t border-border p-2">
          <div class="text-xs nes-text is-disabled text-center">
            Showing top {maxResults} results
          </div>
        {/if}
    {/if}
  <!-- No Results Message -->
  {#if isOpen && searchResults.length === 0 && !isSearching && searchQuery.length >= 2}
    <div class="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border border-border rounded-md shadow-lg">
      <div class="p-4 text-center">
        <Search class="h-8 w-8 nes-text is-disabled mx-auto mb-2" />
        <p class="text-sm nes-text is-disabled">No results found for: "{searchQuery}"</p>
        <p class="text-xs nes-text is-disabled mt-1">Try adjusting your search terms</p>
      </div>
    {/if}
</div>
<style>
  /* @unocss-include */
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>