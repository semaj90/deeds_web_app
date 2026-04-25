<script lang="ts">
  import * as Button from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import * as Input from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import { aiPipeline } from "$lib/services/ai-pipeline";
  import type { LegalDocument } from "$lib/types/legal";
  import Loader2 from 'lucide-svelte/icons/loader-2';
  import Search from 'lucide-svelte/icons/search';
  import X from 'lucide-svelte/icons/x';
  import { createEventDispatcher } from "svelte";
  import { fade, fly } from "svelte/transition";

  // Props
  export let placeholder = "Search legal documents...";
  export let maxResults = 20;
  export let showFilters = true;

  // State
  let searchQuery = "";
  let searchResults: (LegalDocument & { similarity: number })[] = [];
  let selectedDocument: (LegalDocument & { similarity: number }) | null = null;
  let isSearching = false;
  let totalSearchTime = 0;
  let searchHistory: string[] = [];

  // Filter state
  let filters = {
    documentType: "all",
    practiceArea: "all",
    jurisdiction: "all",
    dateRange: "all",
    minSimilarity: 0.6,
  };

  // Options
  const documentTypes = [
    { value: "all", label: "All Document Types" },
    { value: "contract", label: "Contract" },
    { value: "motion", label: "Motion" },
    { value: "evidence", label: "Evidence" },
    { value: "correspondence", label: "Correspondence" },
    { value: "brief", label: "Brief" },
    { value: "regulation", label: "Regulation" },
    { value: "case_law", label: "Case Law" },
  ];

  const practiceAreas = [
    { value: "all", label: "All Practice Areas" },
    { value: "corporate", label: "Corporate" },
    { value: "litigation", label: "Litigation" },
    { value: "intellectual_property", label: "Intellectual Property" },
    { value: "employment", label: "Employment" },
    { value: "real_estate", label: "Real Estate" },
    { value: "criminal", label: "Criminal" },
    { value: "family", label: "Family" },
    { value: "tax", label: "Tax" },
    { value: "immigration", label: "Immigration" },
    { value: "environmental", label: "Environmental" },
  ];

  const jurisdictions = [
    { value: "all", label: "All Jurisdictions" },
    { value: "federal", label: "Federal" },
    { value: "state", label: "State" },
    { value: "local", label: "Local" },
  ];

  // Event dispatcher
  const dispatch = createEventDispatcher();

  async function performSearch() {
    if (!searchQuery.trim() || isSearching) return;

    isSearching = true;
    const startTime = Date.now();

    try {
      const searchOptions = {
        limit: maxResults,
        documentType:
          filters.documentType !== "all" ? filters.documentType : undefined,
        practiceArea:
          filters.practiceArea !== "all" ? filters.practiceArea : undefined,
        jurisdiction:
          filters.jurisdiction !== "all" ? filters.jurisdiction : undefined,
        useCache: true,
      };

      const results = await aiPipeline.semanticSearch(
        searchQuery,
        searchOptions
      );
      const filteredResults = results.filter(
        (result) => result.similarity >= filters.minSimilarity
      );

      searchResults = filteredResults;
      totalSearchTime = Date.now() - startTime;

      if (!searchHistory.includes(searchQuery)) {
        searchHistory = [searchQuery, ...searchHistory.slice(0, 9)];
      }

      dispatch("search", { query: searchQuery, results: filteredResults });
    } catch (error) {
      console.error("Search failed:", error);
      searchResults = [];
    } finally {
      isSearching = false;
    }
  }

  function handleSearchInput(event: Event) {
    const target = event.target as HTMLInputElement;
    searchQuery = target.value;
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      performSearch();
    }
  }

  function selectDocument(document: LegalDocument & { similarity: number }) {
    selectedDocument = document;
    dispatch("select", { document });
  }

  function useHistoryItem(query: string) {
    searchQuery = query;
    performSearch();
  }

  function clearSearch() {
    searchQuery = "";
    searchResults = [];
    selectedDocument = null;
  }

  function resetFilters() {
    filters = {
      documentType: "all",
      practiceArea: "all",
      jurisdiction: "all",
      dateRange: "all",
      minSimilarity: 0.6,
    };
    dispatch("filter", { filters });
  }

  function handleFilterChange() {
    dispatch("filter", { filters });
    if (searchQuery) {
      performSearch();
    }
  }

  function formatSimilarity(similarity: number): string {
    return `${Math.round(similarity * 100)}%`;
  }

  function formatDate(date: string | Date): string {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function getDocumentTypeColor(type: string): string {
    const colors: Record<string, string> = {
      contract: "bg-blue-100 text-blue-800",
      motion: "bg-green-100 text-green-800",
      evidence: "bg-yellow-100 text-yellow-800",
      correspondence: "bg-purple-100 text-purple-800",
      brief: "bg-red-100 text-red-800",
      regulation: "bg-indigo-100 text-indigo-800",
      case_law: "bg-gray-100 text-gray-800",
    };
    return colors[type] || "bg-gray-100 text-gray-800";
  }

  function getSimilarityColor(similarity: number): string {
    if (similarity >= 0.9) return "text-green-600";
    if (similarity >= 0.8) return "text-blue-600";
    if (similarity >= 0.7) return "text-yellow-600";
    return "text-gray-600";
  }

  function truncateText(text: string, maxLength: number): string {
    return text.length > maxLength
      ? text.substring(0, maxLength) + "..."
      : text;
  }
</script>

<div class="vector-search-interface space-y-6">
  <!-- Header -->
  <div class="text-center">
    <h2 class="text-2xl font-bold text-gray-900 mb-2">
      Semantic Document Search
    </h2>
    <p class="text-gray-600">
      Find relevant legal documents using AI-powered search
    </p>
  </div>

  <!-- Search Input -->
  <div class="flex gap-3">
    <div class="flex-1 relative">
      <Input.Root
        type="text"
        {placeholder}
        value={searchQuery}
        on:input={handleSearchInput}
        on:keydown={handleKeyDown}
        disabled={isSearching}
        class="w-full pr-12"
      />
      <div class="absolute right-3 top-1/2 transform -translate-y-1/2">
        {#if isSearching}
          <Loader2 class="w-4 h-4 animate-spin text-gray-400" />
        {:else}
          <Search class="w-4 h-4 text-gray-400" />
        {/if}
      </div>
    </div>

    <Button.Root
      on:click={performSearch}
      disabled={!searchQuery.trim() || isSearching}
      class="px-6"
    >
      {isSearching ? "Searching..." : "Search"}
    </Button.Root>

    {#if searchQuery || searchResults.length > 0}
      <Button.Root variant="outline" on:click={clearSearch} class="px-4">
        Clear
      </Button.Root>
    {/if}
  </div>

  <!-- Search History -->
  {#if searchHistory.length > 0}
    <div class="mb-4">
      <p class="text-sm text-gray-600 mb-2">Recent searches:</p>
      <div class="flex flex-wrap gap-2">
        {#each searchHistory as historyItem}
          <button
            type="button"
            class="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
            on:click={() => useHistoryItem(historyItem)}
          >
            {historyItem}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Filters Section -->
  {#if showFilters}
    <Card.Root class="mb-6">
      <Card.Header>
        <div class="flex items-center justify-between">
          <Card.Title>Filters</Card.Title>
          <Button.Root
            variant="ghost"
            size="sm"
            on:click={resetFilters}
            class="text-sm"
          >
            Reset
          </Button.Root>
        </div>
      </Card.Header>
      <Card.Content>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <!-- Document Type -->
          <div class="space-y-2">
            <label class="text-sm font-medium">Document Type</label>
            <Select.Root
              bind:selected={filters.documentType}
              onSelectedChange={handleFilterChange}
            >
              <Select.Trigger class="w-full">
                <Select.Value placeholder="Select document type" />
              </Select.Trigger>
              <Select.Content>
                {#each documentTypes as type}
                  <Select.Item value={type.value}>
                    {type.label}
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>

          <!-- Practice Area -->
          <div class="space-y-2">
            <label class="text-sm font-medium">Practice Area</label>
            <Select.Root
              bind:selected={filters.practiceArea}
              onSelectedChange={handleFilterChange}
            >
              <Select.Trigger class="w-full">
                <Select.Value placeholder="Select practice area" />
              </Select.Trigger>
              <Select.Content>
                {#each practiceAreas as area}
                  <Select.Item value={area.value}>
                    {area.label}
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>

          <!-- Jurisdiction -->
          <div class="space-y-2">
            <label class="text-sm font-medium">Jurisdiction</label>
            <Select.Root
              bind:selected={filters.jurisdiction}
              onSelectedChange={handleFilterChange}
            >
              <Select.Trigger class="w-full">
                <Select.Value placeholder="Select jurisdiction" />
              </Select.Trigger>
              <Select.Content>
                {#each jurisdictions as jurisdiction}
                  <Select.Item value={jurisdiction.value}>
                    {jurisdiction.label}
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>

          <!-- Minimum Similarity -->
          <div class="space-y-2 md:col-span-2 lg:col-span-3">
            <label class="text-sm font-medium">
              Minimum Similarity: {formatSimilarity(filters.minSimilarity)}
            </label>
            <input
              type="range"
              min="0.5"
              max="1"
              step="0.05"
              bind:value={filters.minSimilarity}
              on:change={handleFilterChange}
              class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div class="flex justify-between text-xs text-gray-500">
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </div>
      </Card.Content>
    </Card.Root>
  {/if}

  <!-- Search Results -->
  <div class="space-y-4">
    {#if searchResults.length > 0}
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center space-x-4">
          <div class="text-sm font-medium text-gray-900">
            {searchResults.length} results found
          </div>
          <div class="text-sm text-gray-500">
            Search completed in {totalSearchTime}ms
          </div>
        </div>
        <div class="text-sm text-gray-600">
          Query: "{searchQuery}"
        </div>
      </div>
    {/if}

    <!-- Results List -->
    <div class="space-y-4">
      {#each searchResults as result, index}
        <div
          transition:fly={{ y: 20, delay: index * 50 }}
          class="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow cursor-pointer"
          on:click={() => selectDocument(result)}
          role="button"
          tabindex="0"
          on:keydown={(e) => e.key === "Enter" && selectDocument(result)}
        >
          <div class="p-6">
            <div class="flex items-start justify-between mb-3">
              <div class="flex-1">
                <h3 class="text-lg font-semibold text-gray-900 mb-2">
                  {result.title}
                </h3>
                <div class="flex flex-wrap gap-2 mb-2">
                  <span
                    class="px-2 py-1 text-xs font-medium rounded-full {getDocumentTypeColor(
                      result.documentType
                    )}"
                  >
                    {result.documentType.replace("_", " ")}
                  </span>
                  {#if result.practiceArea}
                    <span
                      class="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800"
                    >
                      {result.practiceArea.replace("_", " ")}
                    </span>
                  {/if}
                  <span
                    class="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800"
                  >
                    {result.jurisdiction}
                  </span>
                </div>
              </div>
              <div class="text-right">
                <div
                  class="text-lg font-bold {getSimilarityColor(
                    result.similarity
                  )}"
                >
                  {formatSimilarity(result.similarity)}
                </div>
                <div class="text-xs text-gray-500">similarity</div>
              </div>
            </div>

            <p class="text-gray-600 text-sm mb-4 leading-relaxed">
              {truncateText(result.content, 300)}
            </p>

            <div
              class="flex items-center justify-between text-xs text-gray-500"
            >
              <div class="flex items-center space-x-4">
                <span>Created: {formatDate(result.createdAt)}</span>
                {#if result.fileSize}
                  <span>Size: {Math.round(result.fileSize / 1024)} KB</span>
                {/if}
                {#if result.analysisResults?.confidenceLevel}
                  <span
                    >Confidence: {Math.round(
                      result.analysisResults.confidenceLevel * 100
                    )}%</span
                  >
                {/if}
              </div>
              <div class="flex items-center space-x-2">
                {#if result.analysisResults?.risks?.length}
                  <span class="px-2 py-1 bg-red-100 text-red-800 rounded-full">
                    {result.analysisResults.risks.length} risks
                  </span>
                {/if}
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- No Results -->
    {#if !isSearching && searchQuery && searchResults.length === 0}
      <div class="text-center py-12 text-gray-500">
        <div class="mb-4">
          <Search class="w-12 h-12 mx-auto opacity-30" />
        </div>
        <h3 class="text-lg font-medium mb-2">No results found</h3>
        <p class="text-sm">
          Try adjusting your search query or filters to find more documents
        </p>
      </div>
    {/if}

    <!-- Empty State -->
    {#if !isSearching && !searchQuery}
      <div class="text-center py-12 text-gray-500">
        <div class="mb-4">
          <Search class="w-12 h-12 mx-auto" />
        </div>
        <h3 class="text-lg font-medium mb-2">Start searching</h3>
        <p class="text-sm">
          Enter a search query to find relevant legal documents using AI-powered
          semantic search
        </p>
      </div>
    {/if}
  </div>
</div>

<!-- Document Preview Modal -->
{#if selectedDocument}
  <div
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
    on:click={() => (selectedDocument = null)}
    transition:fade
  >
    <div
      class="bg-white rounded-lg max-w-4xl max-h-[90vh] overflow-hidden"
      on:click|stopPropagation
    >
      <div class="p-6 border-b flex items-center justify-between">
        <h3 class="text-xl font-semibold text-gray-900">
          {selectedDocument.title}
        </h3>
        <button
          type="button"
          class="text-gray-400 hover:text-gray-600"
          on:click={() => (selectedDocument = null)}
        >
          <X class="w-6 h-6" />
        </button>
      </div>
      <div class="p-6 overflow-y-auto max-h-[70vh]">
        <div class="prose max-w-none">
          {selectedDocument.content}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .vector-search-interface {
    @apply max-w-7xl mx-auto;
  }
</style>
