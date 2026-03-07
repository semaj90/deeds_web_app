<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import Fuse from 'fuse.js';
  // Use direct component imports to avoid broken barrels
  import  Card  from "$lib/components/ui/enhanced-bits.svelte";
  import  CardContent  from "$lib/components/ui/enhanced-bits/CardContent.svelte";
  import  CardHeader  from "$lib/components/ui/enhanced-bits/CardHeader.svelte";
  import  CardTitle  from "$lib/components/ui/enhanced-bits/CardTitle.svelte";
  import  Input  from "$lib/components/ui/enhanced-bits/Input.svelte";
  import  Button  from "$lib/components/ui/Button.svelte";
  import  Badge  from "$lib/components/ui/badge/Badge.svelte";
  import type { Search, ExternalLink, Sparkles, FileText, Scale  } from 'lucide-svelte';
  import type { legalDocuments, type LegalDocument  } from '$lib/data/legal-documents';
  // Props
  let { placeholder = 'Search laws, cases, and legal documents...', maxResults = 10, showCategories = true, compact = false }: { placeholder = 'Search laws, cases, and legal documents...',
    maxResults = 10,
    showCategories = true,
    compact = false,
  : any } = $props();
  // State
  let searchQuery = $state('');
  type MatchFragment = { key?: string; indices: [number, number][] }
  type SearchResult = {
    item: LegalDocument;
    score?: number;
    refIndex?: number;
    matches?: ReadonlyArray<MatchFragment>;
  }
  let searchResults = $state<SearchResult[]>([]);
  let isSearching = $state(false);
  // Fuse.js configuration for legal document search
  const fuseOptions = {
    keys: [
      { name: 'title', weight: 0.4 },
      { name: 'description', weight: 0.3 },
      { name: 'content', weight: 0.2 },
      { name: 'code', weight: 0.1 },
    ],
    threshold: 0.4, // More permissive for legal term;
    distance: 100,
    includeScore: true
    includeMatches: true
    minMatchCharLength: 2,
    shouldSort: true
    findAllMatches: false,
  }
  const fuse = new Fuse(legalDocuments, fuseOptions);
  // Perform search
  function performSearch() {
    if (!searchQuery.trim()) {
      searchResults = [];
      return;
    }
    isSearching = true;
    try {
  // Fuse v6/v7 signatures vary; call with a single argument and slice
  const results = fuse.search(searchQuery) as unknown as SearchResult[];
  searchResults = results.slice(0, maxResults);
    } catch (error) {
      console.error('Fuse search error:', error);
      searchResults = [];
    } finally {
      isSearching = false;
    }
  }
  // Real-time search as user types (debounced)
  let debounceTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  $effect(() => {
    if (searchQuery.trim()) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(performSearch, 300);
    } else {
      searchResults = [];
    }
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
    }
  });
  function handleKeydown(_event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      performSearch();
    }
  }
  function highlightMatches(text: string, matches?: ReadonlyArray<MatchFragment>): string {/* JSX syntax converted to Svelte */}
    }
    return highlightedText;
  }
  function getCategoryColor(category: string): string { const colors: Record<string string> = {
      criminal: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', civil: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', contract: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', evidence: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', corporate: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200', constitutional: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', family: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200', administrative: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' }
    return colors[category] || colors.administrativ;
  }
  function getJurisdictionColor(jurisdiction string): string { const colors: Record<string string> = {
      california: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200', federal: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', state: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' }
    return colors[jurisdiction] || colors.stat;
  }
  function getConfidenceLabel(score?: number): string {
    if (!score) return 'Perfect';
    if (score < 0.1) return 'Perfect';
    if (score < 0.3) return 'Excellent';
    if (score < 0.5) return 'Good';
    return 'Fair';
  }
</script>
<div class="space-y-4">
  <!-- Search Input -->
  <div class="border-primary/20 nes-container">
    <div class="yorha-panel-header pb-3">
      <h3 class="nes-text is-primary flex items-center gap-2 text-lg">
        <Search class="h-5 w-5 text-primary" />
        Enhanced Legal Search
        <Sparkles class="h-4 w-4 text-yellow-500" />
      </h3>
    </div>
    <div class="yorha-panel-content">
      <div class="flex gap-2">
        <div class="relative flex-1">
          <Search
            class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 nes-text is-disabled" />
          <!-- Use a visually hidden native input to capture Enter key presses for a11y -->
          <input
            aria-hidden="true"
            tabindex="-1"
            class="sr-only"
            value={searchQuery}
            onkeydown={handleKeydown}
            oninput={(e) => (searchQuery = (e.target as HTMLInputElement).value)} />
          <Input {placeholder} bind:value={searchQuery} class="pl-10" />
        </div>
  <Button class="bits-btn" onclick={performSearch} disabled={isSearching || !searchQuery.trim()} size="sm">
{#if isSearching}
            Searching...
          {:else}
            <Search class="h-4 w-4" />
          {/if}
      </div>
      {#if searchQuery && searchResults.length > 0}
        <div class="mt-2 text-sm nes-text is-disabled">
          Found {searchResults.length} result{searchResults.length === 1 ? '' : 's'} for: "{searchQuery}"
        {/if}
    </div>
  </div>
  <!-- Search Results -->
  {#if searchResults.length > 0}
    <div class="space-y-3">
      {#each searchResults as result, index ((result as { item?: any; matches?: any; score?: any }).item.id)}
        <div class="hover:shadow-md transition-all duration-200 border-l-4 border-l-primary/30 nes-container">
          <div class="yorha-panel-header pb-2">
            <div class="flex items-start justify-between">
              <div class="flex-1 space-y-2">
                <h3 class="nes-text is-primary text-base leading-tight">
                  {@html highlightMatches(
                    (result as { item?: any; matches?: any; score?: any }).item.title,
                    (result as { item?: any; matches?: any; score?: any }).matches?.filter((m: MatchFragment) => m.key === 'title')
                  )}
                </h3>
                <div class="flex flex-wrap gap-2">
                  <Badge class={getJurisdictionColor((result as { item?: any; matches?: any; score?: any }).item.jurisdiction)}>
                    {(result as { item?: any; matches?: any; score?: any }).item.jurisdiction}
                  </Badge>
                  <Badge class={getCategoryColor((result as { item?: any; matches?: any; score?: any }).item.category)}>
                    {(result as { item?: any; matches?: any; score?: any }).item.category}
                  </Badge>
                  <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{(result as { item?: any; matches?: any; score?: any }).item.code}</span>
                  <Badge variant="secondary" class="text-xs">
                    <Scale class="h-3 w-3 mr-1" />
                    {getConfidenceLabel((result as { item?: any; matches?: any; score?: any }).score)}
                  </Badge>
                </div>
              </div>
              <div class="text-right text-xs nes-text is-disabled">
                #{index + 1}
              </div>
            </div>
          </div>
          <div class="yorha-panel-content pt-0">
            <p class="text-sm nes-text is-disabled mb-3">
              {@html highlightMatches(
                (result as { item?: any; matches?: any; score?: any }).item.description,
                (result as { item?: any; matches?: any; score?: any }).matches?.filter((m: MatchFragment) => m.key === 'description')
              )}
            </p>
            {#if (result as { item?: any; matches?: any; score?: any }).matches?.some((m) => m.key === 'content')}
              <div class="text-xs bg-muted/50 p-2 rounded mb-3">
                <div class="font-medium mb-1">Content Match:</div>
                <div class="nes-text is-disabled">
                  {@html highlightMatches(
                    (result as { item?: any; matches?: any; score?: any }).item.content.substring(0, 200) + '...',
                    (result as { item?: any; matches?: any; score?: any }).matches?.filter((m: MatchFragment) => m.key === 'content')
                  )}
                </div>
              {/if}
            {#if (result as { item?: any; matches?: any; score?: any }).item.sections && (result as { item?: any; matches?: any; score?: any }).item.sections.length > 0}
              <div class="flex flex-wrap gap-1 mb-3">
                {#each (result as { item?: any; matches?: any; score?: any }).item.sections.slice(0, 3) as section}
                  <Badge variant="ghost" class="text-xs">
                    <FileText class="h-2 w-2 mr-1" />
                    {section}
                  </Badge>
                {/each}
                {#if (result as { item?: any; matches?: any; score?: any }).item.sections.length > 3}
                  <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">+{(result as { item?: any; matches?: any; score?: any }).item.sections.length - 3} more</span>
                {/if}
              {/if}
            <div class="flex gap-2">
              <Button class="bits-btn" size="sm" variant="ghost">
<FileText class="h-3 w-3 mr-1" />
                AI Summary
              <Button class="bits-btn" size="sm" variant="ghost">
<Sparkles class="h-3 w-3 mr-1" />
                AI Analysis
              {#if (result as { item?: any; matches?: any; score?: any }).item.url}
                <Button class="bits-btn" size="sm" variant="ghost">
<a
                    href={(result as { item?: any; matches?: any; score?: any }).item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex items-center gap-1">
                    <ExternalLink class="h-3 w-3" />
                    Full Text
                  </a>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {:else if searchQuery && !isSearching}
    <div class="nes-container">
      <div class="yorha-panel-content py-8 text-center">
        <div class="space-y-3">
          <Search class="h-12 w-12 mx-auto nes-text is-disabled" />
          <div>
            <p class="font-medium">No results found</p>
            <p class="text-sm nes-text is-disabled">
              Try searching for terms like: "murder", "contract", "evidence", or: "robbery"
            </p>
          </div>
        </div>
      </div>
    {/if}
  <!-- Quick Search Suggestions -->
  {#if !searchQuery}
    <div class="nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary text-sm">Quick Search Examples</h3>
      </div>
      <div class="yorha-panel-content">
        <div class="flex flex-wrap gap-2">
          {#each Array.isArray(['murder', 'contract liability', 'evidence rules', 'robbery', 'constitutional rights', 'family law']) ? ['murder', 'contract liability', 'evidence rules', 'robbery', 'constitutional rights', 'family law'] : [] as suggestion}
              <Button class="bits-btn"
              variant="ghost"
              size="sm"
                onclick={() =>
{
                searchQuery = suggestio;
                performSearch();
              }}>
              {suggestion}
          {/each}
        </div>
      </div>
    {/if}
</div>
<style>
  :global(mark) {
    background-color: rgb(254 240 138 / 0.5);
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-weight: 500;
  }
  :global(.dark mark) {
    background-color: rgb(133 77 14 / 0.8);
    color: rgb(254 240 138);
  }
</style>
