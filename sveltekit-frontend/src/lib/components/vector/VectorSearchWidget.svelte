<script lang="ts">
import Badge from "$lib/components/ui/Badge.svelte";
import { vectorIntelligenceService, type VectorSearchResult } from '$lib/services/vector-intelligence-service.js';
import Calendar from 'lucide-svelte/icons/calendar';
import FileText from 'lucide-svelte/icons/file-text';
import Loader2 from 'lucide-svelte/icons/loader-2';
import MapPin from 'lucide-svelte/icons/map-pin';
import Scale from 'lucide-svelte/icons/scale';
import Search from 'lucide-svelte/icons/search';
import Users from 'lucide-svelte/icons/users';
import X from 'lucide-svelte/icons/x';

interface Props {
  placeholder?: string;
  maxResults?: number;
  threshold?: number;
  contextFilter?: { caseId?: string; evidenceType?: string };
  onResultSelect?: (result: VectorSearchResult) => void;
  compact?: boolean;
}

let {
  placeholder = 'Search documents, cases, evidence...',
  maxResults = 5,
  threshold = 0.7,
  contextFilter = {},
  onResultSelect = () => {},
  compact = false
}: Props = $props();

let searchQuery = $state<string>('');
let searchResults = $state<VectorSearchResult[]>([]);
let isSearching = $state<boolean>(false);
let isOpen = $state<boolean>(false);
let searchTimeout = $state<number | null>(null);
let inputElement = $state<HTMLInputElement | null>(null);

// Debounced search
$effect(() => {
  if (searchQuery.length >= 2) {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = window.setTimeout(performSearch, 300);
  } else {
    searchResults = [];
    isOpen = false;
  }
});

async function performSearch(): Promise<void> {
  if (!searchQuery.trim() || isSearching) return;
  isSearching = true;
  try {
    const results = await vectorIntelligenceService.semanticSearch({
      query: searchQuery,
      threshold,
      limit: maxResults,
      includeMetadata: true,
      contextFilter
    });
    searchResults = results;
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
  isOpen = false;
  inputElement?.blur();
}

function clearSearch() {
  searchQuery = '';
  searchResults = [];
  isOpen = false;
  inputElement?.focus();
}

function getEntityIcon(type: string) {
  switch (type) {
    case 'person': return Users;
    case 'organization': return Users;
    case 'location': return MapPin;
    case 'date': return Calendar;
    case 'legal_concept': return Scale;
    default:return FileText;
  }
}

function getConfidenceColor(confidence: number) {
  if (confidence >= 0.8) return 'vector-confidence-high';
  if (confidence >= 0.6) return 'vector-confidence-medium';
  return 'vector-confidence-low';
}

$effect(() => {
  // Close dropdown when clicking outside
  function handleClickOutside(event: MouseEvent) {
    if (inputElement && !inputElement.contains(event.target as Node) && !((event.target as Element).closest('.vector-search-widget'))) {
      isOpen = false;
    }
  }
  document.addEventListener('click', handleClickOutside);
  return () => document.removeEventListener('click', handleClickOutside);
});
</script>

<div class="vector-search-widget relative w-full">
  <!-- Search Input -->
  <div class="relative">
    <div class="absolute inset-y-0 left-0 pl-3 flex items-center">
      {#if isSearching}
        <Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
      {:else}
        <Search class="h-4 w-4 text-muted-foreground" />
      {/if}
    </div>
    <input
      bind:this={inputElement}
      bind:value={searchQuery}
      type="text"
      {placeholder}
      class="vector-search-input pl-10 {searchQuery ? 'pr-10' : 'pr-3'} {compact ? 'h-8 text-sm' : 'h-10'} w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      onfocus={() => { if (searchResults.length > 0) isOpen = true }}
    />
    {#if searchQuery}
      <button
        type="button"
        class="absolute inset-y-0 right-0 pr-3 flex items-center"
        onclick={clearSearch}
      >
        <X class="h-4 w-4 text-muted-foreground hover:text-foreground" />
      </button>
    {/if}
  </div>

  <!-- Search Results Dropdown -->
  {#if isOpen && searchResults.length > 0}
    <div class="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-96 overflow-y-auto">
      <div class="p-2">
        <div class="text-xs text-muted-foreground mb-2">
          Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
        </div>
        <div class="space-y-1">
          {#each searchResults as result}
            {@const SvelteComponent = getEntityIcon(result?.source ?? 'unknown')}
            <button
              type="button"
              class="w-full text-left p-3 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
              onclick={() => selectResult(result)}
            >
              <div class="flex items-start justify-between">
                <div class="flex items-center gap-2">
                  <div class="h-4 w-4 text-muted-foreground">
                    <SvelteComponent />
                  </div>
                  <span class="text-sm font-medium truncate">{result?.id ?? 'Unknown'}</span>
                </div>
                <div class="flex items-center gap-2">
                  <Badge variant="outline" class={getConfidenceColor(result?.similarity ?? 0)}>
                    {Math.round((result?.similarity ?? 0) * 100)}%
                  </Badge>
                  <span class="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium border border-border text-muted-foreground">
                    {result?.source ?? 'unknown'}
                  </span>
                </div>
              </div>

              <p class="text-xs text-muted-foreground line-clamp-2 mt-1">
                {result?.content?.substring(0, 120)}{result?.content?.length > 120 ? '...' : ''}
              </p>

              {#if result.highlights && result.highlights.length > 0}
                <div class="text-xs mt-1">
                  <span class="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-1 rounded">
                    {result.highlights[0]}
                  </span>
                </div>
              {/if}

              {#if !compact}
                <div class="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                  <span>Relevance: {result.relevanceScore?.toFixed(2) ?? 'N/A'}</span>
                  <span>•</span>
                  <span>Similarity: {result.similarity?.toFixed(3) ?? 'N/A'}</span>
                </div>
              {/if}
            </button>
          {/each}
        </div>
      </div>

      {#if searchResults.length === maxResults}
        <div class="border-t border-border p-2 bg-muted/20">
          <div class="text-xs text-center text-muted-foreground">
            Showing top {maxResults} results
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- No Results Message -->
  {#if isOpen && searchResults.length === 0 && !isSearching && searchQuery.length >= 2}
    <div class="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border border-border rounded-md shadow-lg">
      <div class="p-6 text-center">
        <Search class="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
        <p class="text-sm font-medium">No results found for "{searchQuery}"</p>
        <p class="text-xs text-muted-foreground mt-1">Try adjusting your search terms</p>
      </div>
    </div>
  {/if}
</div>

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  :global(.vector-confidence-high) {
    @apply text-green-600 border-green-200 bg-green-50;
  }

  :global(.dark .vector-confidence-high) {
    @apply text-green-400 border-green-800 bg-green-950/30;
  }

  :global(.vector-confidence-medium) {
    @apply text-yellow-600 border-yellow-200 bg-yellow-50;
  }

  :global(.dark .vector-confidence-medium) {
    @apply text-yellow-400 border-yellow-800 bg-yellow-950/30;
  }

  :global(.vector-confidence-low) {
    @apply text-slate-600 border-slate-200 bg-slate-50;
  }

  :global(.dark .vector-confidence-low) {
    @apply text-slate-400 border-slate-800 bg-slate-950/30;
  }
</style>
