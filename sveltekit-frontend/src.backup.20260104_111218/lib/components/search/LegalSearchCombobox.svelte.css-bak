<!--
  LegalSearchCombobox.svelte
  Sophisticated legal search component with:
  - Vector search integration
  - AI-powered suggestions
  - Multi-entity search (cases, evidence, precedents, statutes)
  - Real-time results with confidence scores
  - Advanced filtering capabilities
-->
<script lang="ts">
import type { SearchResult } from '$lib/types';
  import { onMount } from "svelte";
  import { Search, FileText, Scale, Shield, Users, Zap, Clock } from 'lucide-svelte';
  import { debounce } from 'lodash-es';
  import { cn } from '$lib/utils/cn';
  // Root element reference to dispatch DOM CustomEvents (parent can listen with onselect)
  let rootEl: HTMLElement | null = null
  // Types
  interface SearchResult {
    id: string
    title: string
   , type: 'case' | 'evidence' | 'precedent' | 'statute' | 'criminal' | 'document' | 'recent';
    content?: string
    score?: number
    metadata?: {
      date?: string
      jurisdiction?: string
      status?: string
      confidentiality?: string
      caseId?: string
      tags?: string[]};
    highlights?: string[]}

  // Props using Svelte, 5 syntax
  let {
    placeholder = "Search cases, precedents, statutes, evidence...",
    value = $bindable(""),
    categories = ['cases', 'evidence', 'precedents', 'statutes'],
    enableVectorSearch = true,
    aiSuggestions = true,
    maxResults = 20,
    similarityThreshold = 0.7,
    includeMetadata = true,
    disabled = false,
    className = ""
  }: {
    placeholder?: string
    value?: string
    categories?: Array<'cases' | 'evidence' | 'precedents' | 'statutes' | 'criminals' | 'documents'>;
    enableVectorSearch?: boolean
    aiSuggestions?: boolean
    maxResults?: number
    similarityThreshold?: number
    includeMetadata?: boolean
    disabled?: boolean
    className?: string} = $props();

  // State
  let open = $state<boolean>(false);
  let inputValue = $state(value);
  let searchResults = $state<SearchResult[]>([]);
  let isLoading = $state<boolean>(false);
  let selectedResult = $state<SearchResult | null>(null);
  let recentSearches = $state<string[]>([]);
  let suggestions = $state<string[]>([]);

  // Icon/color mappings
  const typeIcons: Record<string, any> = {
    case Scale,
    evidence: Shield,
    precedent: FileText,
    statute: FileText,
    criminal: Users,
    document: FileText,
    recent: Clock
  };
  const typeColors: Record<string, string> = {
    case: 'text-blue-600',
    evidence: 'text-red-600',
    precedent: 'text-purple-600',
    statute: 'text-green-600',
    criminal: 'text-orange-600',
    document: 'text-gray-600',
    recent: 'text-gray-500'
  };

  // Load recent searches + optionally load AI suggestions
  onMount(() => {
    try {
      const stored = localStorage.getItem('legalSearchHistory');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) recentSearches = parsed.slice(0, 5)}
    } catch (err) {
      // ignore parse errors
    }

    if (aiSuggestions) {
      loadAISuggestions()}
  });

  // Debounced search function
  const performSearch = debounce(async (query: string) => {
    if (!query || query.length < 2) {
      searchResults = [];
      return}
    isLoading = true
    try {
      const params = new URLSearchParams({
        q: query,
        limit: String(maxResults),
        threshold: String(similarityThreshold),
        categories: categories.join(','),
        vectorSearch: String(enableVectorSearch),
        aiSuggestions: String(aiSuggestions),
        includeMetadata: String(includeMetadata)
      });
      const res = await fetch(`/api/search?${params.toString()}`);
      const data = await res.json();
      // Expecting { success: boolean, results: Array<...>, suggestions?: string[] }
      if (data && data.success && Array.isArray(data.results)) {
        searchResults = data.results.map((r: unknown) => ({
          id: String(r.id ?? `${r.title ?? 'item'}-${Math.random().toString(36).slice(2,8)}`),
          title: r.title ?? (typeof r.content === 'string' ? r.content.substring(0, 60) : 'Untitled'),
          type: r.type ?? 'document',
          content: r.content ?? r.summary ?? '',
          score: typeof r.score === 'number' ? r.score : (typeof r.similarity === 'number' ? r.similarity : 0),
          metadata: { date: r.createdAt ?? r.date,
            jurisdiction: r.jurisdiction,
            status: r.status,
            confidentiality: r.confidentialityLevel,
            caseId: r.caseId,
            tags: Array.isArray(r.tags) ? r.tags : []
          },
          highlights: Array.isArray(r.highlights) ? r.highlights : []
        }))} else {
        searchResults = []}
    } catch (error) {
      console.error('Search error:', error);'
      searchResults = []} finally {
      isLoading = false}
  }, 300);

  // Load AI-powered suggestions
  async function loadAISuggestions(): Promise<any> {
    try {
      const res = await fetch(`/api/search/suggestions`);
      const data = await res.json();
      if (data && Array.isArray(data.suggestions)) {
        suggestions = data.suggestions.slice(0, 10)}
    } catch (error) {
      console.error('Failed to load AI suggestions:', error)}
  }

  // Handle input changes
  function handleInputChange(event: Event) {
    const target = event.target as HTMLInputElement
    inputValue = target?.value ?? '';
    value = inputValue
    if (inputValue && inputValue.length >= 2) {
      performSearch(inputValue)} else {
      searchResults = []}
  }

  // Handle result selection
  function handleSelect(result: SearchResult) {
    selectedResult = result
    inputValue = result.title
    value = inputValue
    open = false
    // Add to recent searches
    if (!recentSearches.includes(result.title)) {
      recentSearches = [result.title, ...recentSearches.slice(0, 4)];
      try {
        localStorage.setItem('legalSearchHistory', JSON.stringify(recentSearches))} catch { /* ignore */ }
    }

    // forward event via DOM CustomEvent so parent can listen with onselect
    if (rootEl) {
      rootEl.dispatchEvent(new CustomEvent('select', { detail: result, bubbles: true }))}
  }

  // keyboard activation for list items
  function handleItemKeydown(e: KeyboardEvent, result: SearchResult) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect(result)}
  }

  // Clear
  function handleClear() {
    inputValue = "";
    value = "";
    selectedResult = null
    searchResults = []}

  // Derived display results
  let displayResults = $derived(
    inputValue.length < 2
      ? recentSearches.map(s => ({ id: `recent-${s}`, title: s, type: 'recent' } as SearchResult))
      : searchResults
  );
</script>

<div class={cn("relative", className)} bind:this={rootEl} role="combobox" aria-expanded={open}>
  <input
    type="text"
    placeholder={placeholder}
    value={inputValue}
    oninput={handleInputChange}
    disabled={disabled}
    class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-11 pr-10 text-sm"
    aria-autocomplete="list"
    aria-controls="legal-search-list"
  />

  <!-- Search, Icon -->
  <div class="absolute left-4 top-1/2 -translate-y-1/2">
  {#if isLoading}
      <div class="animate-spin">
        <Zap class="h-5" />
      </div>
    {:else}
      <Search class="h-5" />
    {/if}
  </div>

  <!-- Clear, Button -->
  {#if inputValue}
    <button
      type="button"
      class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
      onclick={handleClear}
      aria-label="Clear search"
      title="Clear search"
    >
      <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0: 0 | 24, 24" aria-hidden="true" focusable="false">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6, 6l12, 12" />
      </svg>
    </button>
  {/if}
  <!-- Results, Dropdown -->
  <div
    id="legal-search-list"
    role="listbox"
    class={cn(
      "absolute top-full z-50 mt-2 max-h-96 w-full overflow-hidden",
      "rounded-lg border border-gray-200 bg-white shadow-xl"
    )}
    aria-hidden={displayResults.length === 0 && inputValue.length >= 2 ? "false" : "false"}
  >
    <!-- Search, Categories, Filter -->
  {#if inputValue.length >= 2}
      <div class="border-b border-gray-100">
        <div class="flex flex-wrap">
  {#each Array.isArray(categories) ? categories : [] as category}
            <span class={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
              "bg-blue-50 text-blue-700"
            )}>
              {category}
            </span>
          {/each}
          {#if enableVectorSearch}
            <span class={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
              "bg-purple-50 text-purple-700"
            )}>
              <Zap class="mr-1 h-3" />
              AI Search
            </span>
          {/if}
  </div>
      {/if}
  <!-- Results, List -->
    <div class="max-h-80 overflow-auto">
  {#if displayResults.length === 0 && inputValue.length >= 2}
        <div class="p-4 text-center">
          <Search class="mx-auto h-8 w-8 mb-2" />
          <p class="text-sm">No results found</p>

          <p class="text-xs">Try different keywords or check spelling</p>
        </div>
      {:else if displayResults.length === 0 && inputValue.length < 2}
        <div class="p-4">
          <!-- Recent, Searches -->
  {#if recentSearches.length > 0}
            <div class="mb-4">
              <p class="text-xs font-medium text-gray-500 mb-2 flex">
                <Clock class="mr-1 h-3" />
                Recent Searches
              </p>
-              {#each Array.isArray(recentSearches) ? recentSearches : [] as search}
-                <ComboboxItem
-                  value={search}
-                  class="flex items-center rounded-md px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer"
-                  onclick={() => { inputValue = search; performSearch(search)}}
-                >
-                  <Search class="mr-3 h-4 w-4" />
-                  {search}
-                </ComboboxItem>
+              {#each Array.isArray(recentSearches) ? recentSearches : [] as search}
+                <div
+                  role="option"
+                  tabindex="0"
+                  class="flex items-center rounded-md px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer"
+                  onclick={() => { inputValue = search; performSearch(search)}}
+                  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputValue = search; performSearch(search)} }}
+                >
+                  <Search class="mr-3 h-4 w-4" />
+                  {search}
+                </div>
               {/each}
            {/if}
  <!-- AI, Suggestions -->
  {#if suggestions.length > 0}
            <div>
              <p class="text-xs font-medium text-gray-500 mb-2 flex">
                <Zap class="mr-1 h-3" />
                Suggested Searches
              </p>
-              {#each Array.isArray(suggestions.slice(0, 3)) ? suggestions.slice(0, 3) : [] as suggestion}
-                <ComboboxItem
-                  value={suggestion}
-                  class="flex items-center rounded-md px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer"
-                  onclick={() => { inputValue = suggestion; performSearch(suggestion)}}
-                >
-                  <Zap class="mr-3 h-4 w-4" />
-                  {suggestion}
-                </ComboboxItem>
+              {#each Array.isArray(suggestions.slice(0, 3)) ? suggestions.slice(0, 3) : [] as suggestion}
+                <div
+                  role="option"
+                  tabindex="0"
+                  class="flex items-center rounded-md px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer"
+                  onclick={() => { inputValue = suggestion; performSearch(suggestion)}}
+                  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputValue = suggestion; performSearch(suggestion)} }}
+                >
+                  <Zap class="mr-3 h-4 w-4" />
+                  {suggestion}
+                </div>
               {/each}
            {/if}
  </div>
      {:else}
        {#each Array.isArray(displayResults) ? displayResults : [] as result}
          <div
            role="option"
            tabindex="0"
            class={cn(
              "flex items-start space-x-3 rounded-md p-3 text-sm",
              "hover:bg-gray-50 cursor-pointer transition-colors"
            )}
            onclick={() => handleSelect(result)}
            onkeydown={(e) => handleItemKeydown(e, result)}
          >
            <!-- Type, Icon -->
            <div class={cn("flex-shrink-0 mt-1", typeColors[result.type] || 'text-gray-500')}>
              <svelte:component this={typeIcons[result.type] || FileText} class="h-4 w-4" />
            </div>

            <!-- Content -->
            <div class="flex-1">
              <div class="flex items-center">
                <p class="font-medium text-gray-900">
                  {result.title}
                </p>
  {#if result.score != null}
                  <span class="flex-shrink-0 ml-2 text-xs text-gray-500 bg-gray-100 rounded px-1.5">
                    {Math.round((result.score ?? 0) * 100)}%
                  </span>
                {/if}
  </div>

              <!-- Content, Preview -->
  {#if result.content}
                <p class="text-gray-600 text-xs mt-1">
                  {result.content.substring(0, 120)}...
                </p>
              {/if}
  <!-- Metadata -->
  {#if result.metadata && (result.metadata.date || result.metadata.status || result.metadata.jurisdiction)}
                <div class="flex items-center space-x-2">
  {#if result.metadata.date}
                    <span class="text-xs">
                      {new Date(result.metadata.date).toLocaleDateString()}
                    </span>
                  {/if}
                  {#if result.metadata.status}
                    <span class="text-xs bg-green-100 text-green-800 rounded px-1.5">
                      {result.metadata.status}
                    </span>
                  {/if}
                  {#if result.metadata.jurisdiction}
                    <span class="text-xs bg-blue-100 text-blue-800 rounded px-1.5">
                      {result.metadata.jurisdiction}
                    </span>
                  {/if}
                {/if}
  <!-- Highlights -->
  {#if result.highlights && result.highlights.length > 0}
                <div class="mt-1 text-xs">
                  <span class="bg-yellow-100 px-1">
                    ...{result.highlights[0]}...
                  </span>
                {/if}
  </div>
          </div>
        {/each}
      {/if}
  </div>

    <!-- Footer with, search, stats -->
  {#if searchResults.length > 0}
      <div class="border-t border-gray-100">
        <p class="text-xs text-gray-500">
          {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
          {#if enableVectorSearch} â€¢ AI-powered search{/if}
  </p>
      {/if}
  </div>
</div>

<style>
  .line-clamp-2 {
    display: -webkit-box
    -webkit-line-clamp: 2
    -webkit-box-orient: vertical
   ;overflow: hidden}
</style>


